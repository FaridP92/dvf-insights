/**
 * Edge Function `ingest-dvf`
 * Reçoit un lot de mutations DVF depuis n8n (webhook signé), valide chaque ligne,
 * insère en lot dans dvf_mutations, journalise le run et l'événement webhook.
 *
 * Contrat d'entrée (JSON) :
 * {
 *   runId?: string,                 // pour rattacher plusieurs lots au même run
 *   workflowName: string,
 *   rows: DvfRow[],                 // max 5 000 lignes par appel
 *   final?: boolean                 // true sur le dernier lot : clôture le run et nettoie
 * }
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4';
import { json, verifyWebhook } from '../_shared/auth.ts';

const rowSchema = z.object({
  id_mutation: z.string().min(1),
  date_mutation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nature_mutation: z.string(),
  valeur_fonciere: z.coerce.number().nullable(),
  code_commune: z.string().min(5).max(5),
  nom_commune: z.string(),
  code_departement: z.string().min(2).max(3),
  type_local: z.string().nullable(),
  surface_reelle_bati: z.coerce.number().nullable(),
  nombre_pieces: z.coerce.number().int().nullable(),
  surface_terrain: z.coerce.number().nullable(),
  longitude: z.coerce.number().nullable(),
  latitude: z.coerce.number().nullable(),
});

const payloadSchema = z.object({
  runId: z.string().uuid().optional(),
  workflowName: z.string().min(1),
  rows: z.array(z.unknown()).max(5000),
  final: z.boolean().optional(),
  period: z.object({ from: z.string(), to: z.string() }).optional(),
  // Premier lot d'un département : purge (millésime, département) avant insertion, idempotence
  reset: z.object({ from: z.string(), to: z.string(), department: z.string() }).optional(),
  // Dernier lot d'un département : enfile le job de nettoyage/agrégation/purge de ce département
  departmentDone: z.object({ from: z.string(), to: z.string(), department: z.string() }).optional(),
});

Deno.serve(async (req) => {
  const startedAt = performance.now();
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });

  const secret = Deno.env.get('N8N_WEBHOOK_SECRET');
  if (!secret) return json(500, { error: 'N8N_WEBHOOK_SECRET manquant' });

  const rawBody = await req.text();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const logEvent = (statusCode: number, runId: string | null) =>
    supabase.from('webhook_events').insert({
      source: 'n8n/ingest',
      status_code: statusCode,
      latency_ms: Math.round(performance.now() - startedAt),
      payload_bytes: rawBody.length,
      run_id: runId,
    });

  if (!(await verifyWebhook(rawBody, req.headers, secret))) {
    await logEvent(401, null);
    return json(401, { error: 'Signature invalide' });
  }

  const parsed = payloadSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    await logEvent(400, null);
    return json(400, { error: 'Payload invalide', issues: parsed.error.issues.slice(0, 5) });
  }
  const { workflowName, rows, final, period, reset, departmentDone } = parsed.data;

  // Ouverture ou reprise du run
  let runId = parsed.data.runId ?? null;
  if (!runId) {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .insert({ workflow_name: workflowName, status: 'running' })
      .select('id')
      .single();
    if (error || !data) {
      await logEvent(500, null);
      return json(500, { error: error?.message ?? 'Création du run impossible' });
    }
    runId = data.id as string;
  }

  // Validation ligne à ligne : on ne rejette pas le lot pour une ligne fautive
  const valid: z.infer<typeof rowSchema>[] = [];
  let rejected = 0;
  for (const row of rows) {
    const result = rowSchema.safeParse(row);
    if (result.success) valid.push(result.data);
    else rejected += 1;
  }

  if (reset) {
    await supabase.rpc('purge_department', {
      p_from: reset.from,
      p_to: reset.to,
      p_department: reset.department,
    });
  }

  if (valid.length > 0) {
    const { error } = await supabase.from('dvf_mutations').insert(valid);
    if (error) {
      await supabase
        .from('pipeline_runs')
        .update({ status: 'failed', finished_at: new Date().toISOString(), error_message: error.message })
        .eq('id', runId);
      await logEvent(500, runId);
      return json(500, { error: error.message, runId });
    }
  }

  await supabase.rpc('increment_run_counters', {
    p_run_id: runId,
    p_ingested: valid.length,
    p_rejected: rejected,
  });

  let departmentJob: string | null = null;
  if (departmentDone) {
    const { data } = await supabase.rpc('enqueue_department_job', {
      p_run_id: runId,
      p_from: departmentDone.from,
      p_to: departmentDone.to,
      p_department: departmentDone.department,
    });
    departmentJob = typeof data === 'string' ? data : null;
  }

  // Dernier lot : le nettoyage et le rafraîchissement des vues sont asynchrones (pg_cron),
  // le run reste "running" avec stage = refresh jusqu'à ce que le job le clôture.
  let jobId: string | null = null;
  if (final) {
    if (period) {
      const { data } = await supabase.rpc('enqueue_maintenance', {
        p_run_id: runId,
        p_from: period.from,
        p_to: period.to,
      });
      jobId = typeof data === 'string' ? data : null;
      await supabase
        .from('pipeline_runs')
        .update({ metadata: { stage: 'refresh', maintenance_job: jobId } })
        .eq('id', runId);
    } else {
      await supabase
        .from('pipeline_runs')
        .update({ status: 'success', finished_at: new Date().toISOString() })
        .eq('id', runId);
    }
  }

  await logEvent(200, runId);
  return json(200, { runId, ingested: valid.length, rejected, departmentJob, maintenanceJob: jobId, final: final ?? false });
});
