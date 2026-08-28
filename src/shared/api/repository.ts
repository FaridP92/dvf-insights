import { z } from 'zod';
import { appError, tryCatch, type Result } from '@/lib/result';
import { tensionIndex } from '@/lib/stats/tension';
import type {
  CommuneStat,
  DatabaseHealth,
  MonthlyStat,
  PipelineRun,
  Transaction,
  WebhookEvent,
} from '@/shared/types/dvf';
import { generateCommuneStats } from '@/shared/mocks/communeStats';
import { generateMonthlyStats } from '@/shared/mocks/monthlyStats';
import {
  generateDatabaseHealth,
  generatePipelineRuns,
  generateWebhookEvents,
} from '@/shared/mocks/pipelines';
import { generateTransactions } from '@/shared/mocks/transactions';
import { createRng } from '@/shared/mocks/seed';
import { getSupabase } from './supabase';

/**
 * Point d'entrée unique de la donnée. Les composants n'appellent jamais Supabase ni les
 * mocks directement : ils appellent ce module, qui choisit la source selon la configuration
 * et renvoie toujours la même forme, un Result typé.
 *
 * Côté Supabase, la réponse est validée par Zod avant d'entrer dans l'application : une vue
 * matérialisée qui change de colonne doit produire une erreur explicite, pas un NaN silencieux
 * trois écrans plus loin.
 */

const TRANSACTIONS_LIMIT = 2500;
const PIPELINE_RUNS_LIMIT = 50;
const WEBHOOK_EVENTS_LIMIT = 200;

/** Taux de rotation par défaut quand le parc communal n'est pas disponible côté SQL. */
const DEFAULT_TURNOVER_RATE = 0.02;

// ---------------------------------------------------------------------------
// Mocks mémoïsés : générés au plus une fois par session, jamais à chaque requête.
// ---------------------------------------------------------------------------
const memoize = <T>(factory: () => T): (() => T) => {
  let cached: { readonly value: T } | null = null;
  return () => {
    cached ??= { value: factory() };
    return cached.value;
  };
};

const mockMonthlyStats = memoize(generateMonthlyStats);
const mockCommuneStats = memoize(generateCommuneStats);
const mockTransactions = memoize(() => generateTransactions());
const mockPipelineRuns = memoize(generatePipelineRuns);
const mockWebhookEvents = memoize(generateWebhookEvents);
const mockDatabaseHealth = memoize(generateDatabaseHealth);

/** Latence simulée : une démo qui répond en 0 ms ne montre pas ses états de chargement. */
const latencyRng = createRng(58_231);
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const ABORT_MESSAGE = 'Requête annulée';

async function fromMock<T>(read: () => T, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw appError('network', ABORT_MESSAGE);
  await delay(120 + latencyRng.int(0, 90));
  if (signal?.aborted) throw appError('network', ABORT_MESSAGE);
  return read();
}

// ---------------------------------------------------------------------------
// Schémas Zod : forme brute renvoyée par PostgREST, en snake_case.
// Les colonnes numeric de PostgreSQL arrivent parfois en chaîne, d'où la coercition.
// ---------------------------------------------------------------------------
const propertyTypeSchema = z.enum(['appartement', 'maison']);
const num = z.coerce.number();

const monthlyStatRow = z.object({
  month: z.string(),
  department_code: z.string(),
  property_type: propertyTypeSchema,
  transactions: num,
  median_price_per_sqm: num,
  p10_price_per_sqm: num,
  p90_price_per_sqm: num,
  median_surface: num,
  total_value: num,
});

const communeStatRow = z.object({
  insee_code: z.string(),
  commune_name: z.string(),
  department_code: z.string(),
  property_type: propertyTypeSchema,
  transactions: num,
  median_price_per_sqm: num,
  yoy_change: num.nullable(),
  volume_change: num.nullable(),
  lat: num.nullable(),
  lng: num.nullable(),
});

const transactionRow = z.object({
  id: z.string(),
  date_mutation: z.string(),
  code_commune: z.string(),
  nom_commune: z.string(),
  code_departement: z.string(),
  property_type: propertyTypeSchema,
  price: num,
  surface: num,
  rooms: num,
  land_surface: num,
  price_per_sqm: num,
});

const pipelineRunRow = z.object({
  id: z.string(),
  workflow_name: z.string(),
  status: z.enum(['queued', 'running', 'success', 'failed']),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  rows_ingested: num,
  rows_rejected: num,
  duration_ms: num.nullable(),
  error_message: z.string().nullable(),
});

const webhookEventRow = z.object({
  id: z.string(),
  source: z.string(),
  received_at: z.string(),
  status_code: num,
  latency_ms: num,
  payload_bytes: num,
});

const databaseHealthRow = z.object({
  checked_at: z.string(),
  active_connections: num,
  max_connections: num,
  cache_hit_ratio: num,
  db_size_bytes: num,
  raw_rows: num,
  clean_rows: num,
  last_refresh_at: z.string().nullable(),
  replication_lag_ms: num.nullable().optional(),
});

/** Valide une réponse Supabase ou interrompt le flux avec une AppError 'validation'. */
function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, source: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const first = parsed.error.issues[0];
  const detail = first ? `${first.path.join('.')} : ${first.message}` : 'schéma non respecté';
  throw appError('validation', `Réponse ${source} invalide (${detail})`, { cause: parsed.error });
}

/** Convertit une erreur PostgREST en AppError 'supabase'. */
function throwSupabase(source: string, error: { readonly message: string } | null): void {
  if (error) throw appError('supabase', `${source} : ${error.message}`, { cause: error });
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

export function fetchMonthlyStats(signal?: AbortSignal): Promise<Result<readonly MonthlyStat[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) return await fromMock(mockMonthlyStats, signal);

    let query = supabase.from('mv_monthly_stats').select('*').order('month', { ascending: true });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    throwSupabase('mv_monthly_stats', error);

    return parseOrThrow(z.array(monthlyStatRow), data ?? [], 'mv_monthly_stats').map(
      (row): MonthlyStat => ({
        month: row.month,
        departmentCode: row.department_code,
        propertyType: row.property_type,
        transactions: row.transactions,
        medianPricePerSqm: row.median_price_per_sqm,
        p10PricePerSqm: row.p10_price_per_sqm,
        p90PricePerSqm: row.p90_price_per_sqm,
        medianSurface: row.median_surface,
        totalValue: row.total_value,
      }),
    );
  }, 'supabase');
}

export function fetchCommuneStats(signal?: AbortSignal): Promise<Result<readonly CommuneStat[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) return await fromMock(mockCommuneStats, signal);

    let query = supabase.from('mv_commune_stats').select('*');
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    throwSupabase('mv_commune_stats', error);

    return parseOrThrow(z.array(communeStatRow), data ?? [], 'mv_commune_stats').map(
      (row): CommuneStat => {
        const yoyChange = row.yoy_change ?? 0;
        // La vue ne porte pas le parc communal : à défaut, on retient le taux de rotation
        // national de référence, ce qui neutralise la composante liquidité de l'indice.
        return {
          inseeCode: row.insee_code,
          communeName: row.commune_name,
          departmentCode: row.department_code,
          propertyType: row.property_type,
          transactions: row.transactions,
          medianPricePerSqm: row.median_price_per_sqm,
          yoyChange,
          tensionIndex: tensionIndex({
            volumeChange: row.volume_change ?? 0,
            priceChange: yoyChange,
            turnoverRate: DEFAULT_TURNOVER_RATE,
          }),
          lat: row.lat ?? 0,
          lng: row.lng ?? 0,
        };
      },
    );
  }, 'supabase');
}

export function fetchTransactions(signal?: AbortSignal): Promise<Result<readonly Transaction[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) return await fromMock(mockTransactions, signal);

    let query = supabase
      .from('dvf_mutations_clean')
      .select('*')
      .order('date_mutation', { ascending: false })
      .limit(TRANSACTIONS_LIMIT);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    throwSupabase('dvf_mutations_clean', error);

    return parseOrThrow(z.array(transactionRow), data ?? [], 'dvf_mutations_clean').map(
      (row): Transaction => ({
        id: row.id,
        date: row.date_mutation,
        inseeCode: row.code_commune,
        communeName: row.nom_commune,
        departmentCode: row.code_departement,
        propertyType: row.property_type,
        price: row.price,
        surface: row.surface,
        rooms: row.rooms,
        landSurface: row.land_surface,
        pricePerSqm: row.price_per_sqm,
      }),
    );
  }, 'supabase');
}

export function fetchPipelineRuns(signal?: AbortSignal): Promise<Result<readonly PipelineRun[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) return await fromMock(mockPipelineRuns, signal);

    let query = supabase
      .from('pipeline_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(PIPELINE_RUNS_LIMIT);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    throwSupabase('pipeline_runs', error);

    return parseOrThrow(z.array(pipelineRunRow), data ?? [], 'pipeline_runs').map(
      (row): PipelineRun => ({
        id: row.id,
        workflowName: row.workflow_name,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        rowsIngested: row.rows_ingested,
        rowsRejected: row.rows_rejected,
        durationMs: row.duration_ms,
        errorMessage: row.error_message,
      }),
    );
  }, 'supabase');
}

export function fetchWebhookEvents(signal?: AbortSignal): Promise<Result<readonly WebhookEvent[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) return await fromMock(mockWebhookEvents, signal);

    let query = supabase
      .from('webhook_events')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(WEBHOOK_EVENTS_LIMIT);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    throwSupabase('webhook_events', error);

    return parseOrThrow(z.array(webhookEventRow), data ?? [], 'webhook_events').map(
      (row): WebhookEvent => ({
        id: row.id,
        source: row.source,
        receivedAt: row.received_at,
        statusCode: row.status_code,
        latencyMs: row.latency_ms,
        payloadBytes: row.payload_bytes,
      }),
    );
  }, 'supabase');
}

export function fetchDatabaseHealth(signal?: AbortSignal): Promise<Result<DatabaseHealth>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) return await fromMock(mockDatabaseHealth, signal);

    let query = supabase.rpc('get_database_health');
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    throwSupabase('get_database_health', error);

    const row = parseOrThrow(databaseHealthRow, data, 'get_database_health');
    return {
      checkedAt: row.checked_at,
      activeConnections: row.active_connections,
      maxConnections: row.max_connections,
      cacheHitRatio: row.cache_hit_ratio,
      dbSizeBytes: row.db_size_bytes,
      rawRows: row.raw_rows,
      cleanRows: row.clean_rows,
      lastRefreshAt: row.last_refresh_at ?? row.checked_at,
      replicationLagMs: row.replication_lag_ms ?? 0,
    } satisfies DatabaseHealth;
  }, 'supabase');
}
