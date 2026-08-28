import { z } from 'zod';
import { appError, tryCatch, type Result } from '@/lib/result';
import { tensionIndex } from '@/lib/stats/tension';
import type {
  Commune,
  CommuneStat,
  DatabaseHealth,
  Department,
  MonthlyStat,
  PipelineRun,
  PropertyType,
  Transaction,
  WebhookEvent,
} from '@/shared/types/dvf';
import { generateCommunes, generateCommuneStats } from '@/shared/mocks/communeStats';
import { DEPARTMENTS } from '@/shared/mocks/departments';
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
 * Côté Supabase, la réponse est validée par Zod avant d'entrer dans l'application : une table
 * d'agrégats qui change de colonne doit produire une erreur explicite, pas un NaN silencieux
 * trois écrans plus loin.
 *
 * Périmètre national : 97 départements, environ 35 000 communes et 2,3 millions de mutations
 * nettoyées. Deux règles en découlent. Le détail (`dvf_mutations_clean`) n'est jamais lu sans
 * filtre de département ou de commune. Et tout ce qui dépasse le millier de lignes est paginé,
 * PostgREST plafonnant chaque réponse à 1 000 lignes.
 */

const SUPABASE_PAGE_SIZE = 1000;
const TRANSACTIONS_LIMIT = 2500;
/** 36 mois x 97 départements x 2 types, avec une marge : environ 7 000 lignes. */
const MONTHLY_STATS_LIMIT = 10_000;
/** Plafond de sécurité de `commune_stats` : environ 40 000 lignes sur la France entière. */
const COMMUNE_STATS_LIMIT = 60_000;
/** Plafond de sécurité du référentiel communal d'un département. */
const COMMUNES_LIMIT = 5000;
const PIPELINE_RUNS_LIMIT = 50;
const WEBHOOK_EVENTS_LIMIT = 200;

/** En deçà de ce volume annuel, la variation d'une commune n'est que du bruit. */
const MIN_MOVER_TRANSACTIONS = 30;

/** Taux de rotation par défaut quand le parc communal n'est pas disponible côté SQL. */
const DEFAULT_TURNOVER_RATE = 0.02;

// ---------------------------------------------------------------------------
// Options de requête. Les champs optionnels acceptent explicitement `undefined` :
// avec exactOptionalPropertyTypes, c'est ce qui permet aux appelants de passer un
// filtre calculé sans construire l'objet par morceaux.
// ---------------------------------------------------------------------------

export interface CommuneStatsOptions {
  readonly departmentCode?: string | undefined;
}

export interface TopMoversOptions {
  /** Nombre de communes retenues de chaque côté du classement. */
  readonly limit: number;
  readonly departmentCode?: string | undefined;
  readonly propertyType?: PropertyType | undefined;
}

export interface TransactionsOptions {
  /** Obligatoire : le détail national ne se lit jamais en entier. */
  readonly departmentCode: string;
  readonly inseeCode?: string | undefined;
  readonly limit?: number | undefined;
}

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

const mockDepartments = memoize(
  (): readonly Department[] =>
    DEPARTMENTS.map(
      (profile): Department => ({
        code: profile.code,
        name: profile.name,
        region: profile.region,
      }),
    ).toSorted((a, b) => a.code.localeCompare(b.code)),
);
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

const departmentRow = z.object({
  code: z.string(),
  name: z.string(),
  region: z.string().nullable(),
});

const communeRow = z.object({
  insee: z.string(),
  name: z.string(),
  department_code: z.string(),
  lat: num.nullable(),
  lng: num.nullable(),
});

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
// Pagination
// ---------------------------------------------------------------------------

/** Réponse PostgREST, réduite à ce dont la pagination a besoin. */
type PageResponse = {
  readonly data: readonly unknown[] | null;
  readonly error: { readonly message: string } | null;
};

type PageReader = (from: number, to: number) => PromiseLike<PageResponse>;

const pageRanges = (cap: number): ReadonlyArray<readonly [number, number]> => {
  const ranges: Array<readonly [number, number]> = [];
  for (let from = 0; from < cap; from += SUPABASE_PAGE_SIZE) {
    ranges.push([from, Math.min(from + SUPABASE_PAGE_SIZE, cap) - 1]);
  }
  return ranges;
};

/**
 * Pagine en parallèle jusqu'à un plafond connu. À réserver aux volumes dont on sait
 * qu'ils remplissent leurs pages : sinon les requêtes vides sont du réseau gaspillé.
 */
async function fetchPagesInParallel(
  source: string,
  cap: number,
  read: PageReader,
): Promise<readonly unknown[]> {
  const pages = await Promise.all(
    pageRanges(cap).map(async ([from, to]) => {
      const { data, error } = await read(from, to);
      throwSupabase(source, error);
      return data ?? [];
    }),
  );
  return pages.flat();
}

/**
 * Pagine en série et s'arrête dès qu'une page revient incomplète. C'est la stratégie des
 * volumes très variables : un département de 400 communes tient en une requête, la France
 * entière en quarante, sans jamais en émettre une de trop.
 */
async function fetchPagesInSequence(
  source: string,
  cap: number,
  read: PageReader,
): Promise<readonly unknown[]> {
  const rows: unknown[] = [];
  for (const [from, to] of pageRanges(cap)) {
    // Séquentiel par nature : c'est la page précédente qui dit s'il faut en demander une autre.
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await read(from, to);
    throwSupabase(source, error);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

/** Référentiel des départements couverts, trié par code. */
export function fetchDepartments(signal?: AbortSignal): Promise<Result<readonly Department[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) return await fromMock(mockDepartments, signal);

    let query = supabase
      .from('departments')
      .select('code, name, region')
      .order('code', { ascending: true });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    throwSupabase('departments', error);

    return parseOrThrow(z.array(departmentRow), data ?? [], 'departments').map(
      (row): Department => ({
        code: row.code,
        name: row.name,
        region: row.region ?? 'Hors région',
      }),
    );
  }, 'supabase');
}

/** Communes d'un département, triées par nom. */
export function fetchCommunes(
  departmentCode: string,
  signal?: AbortSignal,
): Promise<Result<readonly Commune[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) return await fromMock(() => generateCommunes(departmentCode), signal);

    const rows = await fetchPagesInSequence('communes', COMMUNES_LIMIT, (from, to) => {
      let query = supabase
        .from('communes')
        .select('insee, name, department_code, lat, lng')
        .eq('department_code', departmentCode)
        .order('name', { ascending: true })
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      return query;
    });

    return parseOrThrow(z.array(communeRow), rows, 'communes').map(
      (row): Commune => ({
        inseeCode: row.insee,
        name: row.name,
        departmentCode: row.department_code,
        lat: row.lat ?? 0,
        lng: row.lng ?? 0,
      }),
    );
  }, 'supabase');
}

/** Agrégats mensuels sur 36 mois, tous départements. */
export function fetchMonthlyStats(signal?: AbortSignal): Promise<Result<readonly MonthlyStat[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) return await fromMock(mockMonthlyStats, signal);

    const rows = await fetchPagesInParallel('monthly_stats', MONTHLY_STATS_LIMIT, (from, to) => {
      let query = supabase
        .from('monthly_stats')
        .select('*')
        .order('month', { ascending: true })
        .order('department_code', { ascending: true })
        .order('property_type', { ascending: true })
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      return query;
    });

    return parseOrThrow(z.array(monthlyStatRow), rows, 'monthly_stats').map(
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

/**
 * Convertit une ligne `commune_stats` en agrégat communal.
 * La table ne porte pas le parc communal : à défaut, on retient le taux de rotation
 * national de référence, ce qui neutralise la composante liquidité de l'indice de tension.
 */
function toCommuneStat(row: z.infer<typeof communeStatRow>): CommuneStat {
  const yoyChange = row.yoy_change ?? 0;
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
}

/**
 * Agrégats communaux sur 12 mois glissants. Sans filtre de département, la table pèse
 * environ 40 000 lignes : réservé aux usages qui en ont réellement besoin.
 */
export function fetchCommuneStats(
  options: CommuneStatsOptions = {},
  signal?: AbortSignal,
): Promise<Result<readonly CommuneStat[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      return await fromMock(() => {
        const rows = mockCommuneStats();
        return options.departmentCode === undefined
          ? rows
          : rows.filter((row) => row.departmentCode === options.departmentCode);
      }, signal);
    }

    const rows = await fetchPagesInSequence('commune_stats', COMMUNE_STATS_LIMIT, (from, to) => {
      let query = supabase.from('commune_stats').select('*');
      if (options.departmentCode !== undefined) {
        query = query.eq('department_code', options.departmentCode);
      }
      query = query
        .order('insee_code', { ascending: true })
        .order('property_type', { ascending: true })
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      return query;
    });

    return parseOrThrow(z.array(communeStatRow), rows, 'commune_stats').map(toCommuneStat);
  }, 'supabase');
}

/**
 * Communes en plus forte hausse et en plus forte baisse, triées côté serveur.
 *
 * Charger les 40 000 lignes de `commune_stats` pour n'en afficher dix serait absurde :
 * deux requêtes ordonnées suffisent, une par sens de variation. Le résultat est l'union
 * des deux extrémités, que `topMovers` réordonne ensuite pour l'affichage.
 */
export function fetchTopMovers(
  options: TopMoversOptions,
  signal?: AbortSignal,
): Promise<Result<readonly CommuneStat[]>> {
  return tryCatch(async () => {
    const supabase = getSupabase();
    const matches = (row: CommuneStat): boolean =>
      row.transactions >= MIN_MOVER_TRANSACTIONS &&
      (options.departmentCode === undefined || row.departmentCode === options.departmentCode) &&
      (options.propertyType === undefined || row.propertyType === options.propertyType);

    if (!supabase) {
      return await fromMock(() => {
        const eligible = mockCommuneStats()
          .filter(matches)
          .toSorted((a, b) => b.yoyChange - a.yoyChange);
        return [...eligible.slice(0, options.limit), ...eligible.slice(-options.limit)];
      }, signal);
    }

    const read = (ascending: boolean): PromiseLike<PageResponse> => {
      let query = supabase
        .from('commune_stats')
        .select('*')
        .gte('transactions', MIN_MOVER_TRANSACTIONS);
      if (options.departmentCode !== undefined) {
        query = query.eq('department_code', options.departmentCode);
      }
      if (options.propertyType !== undefined) {
        query = query.eq('property_type', options.propertyType);
      }
      query = query.order('yoy_change', { ascending, nullsFirst: false }).limit(options.limit);
      if (signal) query = query.abortSignal(signal);
      return query;
    };

    const [risers, fallers] = await Promise.all([read(false), read(true)]);
    throwSupabase('commune_stats', risers.error ?? fallers.error);

    return parseOrThrow(
      z.array(communeStatRow),
      [...(risers.data ?? []), ...(fallers.data ?? [])],
      'commune_stats',
    ).map(toCommuneStat);
  }, 'supabase');
}

/**
 * Échantillon de mutations nettoyées. Le département est obligatoire : `dvf_mutations_clean`
 * porte 2,3 millions de lignes et ne se lit jamais sans borne territoriale.
 */
export function fetchTransactions(
  options: TransactionsOptions,
  signal?: AbortSignal,
): Promise<Result<readonly Transaction[]>> {
  return tryCatch(async () => {
    const limit = options.limit ?? TRANSACTIONS_LIMIT;
    const supabase = getSupabase();
    if (!supabase) {
      return await fromMock(
        () =>
          mockTransactions()
            .filter(
              (row) =>
                row.departmentCode === options.departmentCode &&
                (options.inseeCode === undefined || row.inseeCode === options.inseeCode),
            )
            .slice(0, limit),
        signal,
      );
    }

    const rows = await fetchPagesInParallel('dvf_mutations_clean', limit, (from, to) => {
      let query = supabase
        .from('dvf_mutations_clean')
        .select('*')
        .eq('code_departement', options.departmentCode);
      if (options.inseeCode !== undefined) query = query.eq('code_commune', options.inseeCode);
      query = query
        .order('date_mutation', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to);
      if (signal) query = query.abortSignal(signal);
      return query;
    });

    return parseOrThrow(z.array(transactionRow), rows, 'dvf_mutations_clean').map(
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
