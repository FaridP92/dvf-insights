/**
 * Edge Function `pipeline-status`
 * Point d'entrée générique pour les workflows n8n secondaires (health-check, mv-refresh) :
 * ouvre, met à jour ou clôture un run. Même signature HMAC que ingest-dvf.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@4';
import { json, verifyWebhook } from '../_shared/auth.ts';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    workflowName: z.string().min(1),
    // Si une période est fournie, elle est purgée avant ré-ingestion (idempotence des runs)
    period: z.object({ from: z.string(), to: z.string() }).optional(),
  }),
  z.object({
    action: z.literal('finish'),
    runId: z.string().uuid(),
    status: z.enum(['success', 'failed']),
    errorMessage: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
]);

Deno.serve(async (req) => {
  const startedAt = performance.now();
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });
  const secret = Deno.env.get('N8N_WEBHOOK_SECRET');
  if (!secret) return json(500, { error: 'N8N_WEBHOOK_SECRET manquant' });

  const rawBody = await req.text();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const logEvent = (statusCode: number, runId: string | null) =>
    supabase.from('webhook_events').insert({
      source: 'n8n/health',
      status_code: statusCode,
      latency_ms: Math.round(performance.now() - startedAt),
      payload_bytes: rawBody.length,
      run_id: runId,
    });

  if (!(await verifyWebhook(rawBody, req.headers, secret))) {
    await logEvent(401, null);
    return json(401, { error: 'Signature invalide' });
  }
  const parsed = schema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    await logEvent(400, null);
    return json(400, { error: 'Payload invalide' });
  }

  if (parsed.data.action === 'start') {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .insert({ workflow_name: parsed.data.workflowName, status: 'running' })
      .select('id')
      .single();
    if (error || !data) {
      await logEvent(500, null);
      return json(500, { error: error?.message });
    }
    let purged: number | null = null;
    if (parsed.data.period) {
      const { data: removed } = await supabase.rpc('purge_period', {
        p_from: parsed.data.period.from,
        p_to: parsed.data.period.to,
      });
      purged = typeof removed === 'number' ? removed : null;
    }
    await logEvent(200, data.id as string);
    return json(200, { runId: data.id, purged });
  }

  const { runId, status, errorMessage, metadata } = parsed.data;
  const { error } = await supabase
    .from('pipeline_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      error_message: errorMessage ?? null,
      metadata: metadata ?? {},
    })
    .eq('id', runId);
  await logEvent(error ? 500 : 200, runId);
  return error ? json(500, { error: error.message }) : json(200, { runId, status });
});
