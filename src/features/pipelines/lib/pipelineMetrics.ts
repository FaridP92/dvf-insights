/**
 * Agrégations pures de la page "Data Pipelines".
 *
 * Toutes les fonctions sont déterministes et sans effet de bord : elles prennent la donnée
 * brute du repository et renvoient exactement ce que les composants affichent. L'instant de
 * référence est un paramètre optionnel, jamais `Date.now()` implicite, pour que la page reste
 * lisible avec un jeu de données figé (mocks) comme avec une base réelle.
 */
import { median, quantile } from '@/lib/stats';
import type { BadgeTone } from '@/shared/ui';
import type { DatabaseHealth, PipelineRun, PipelineStatus, WebhookEvent } from '@/shared/types/dvf';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/** Tranche d'agrégation du trafic webhook : 30 minutes sur 24 h, soit 48 points. */
const BUCKET_MS = 30 * MINUTE_MS;
const WEBHOOK_WINDOW_MS = DAY_MS;
const BUCKET_COUNT = WEBHOOK_WINDOW_MS / BUCKET_MS;

/** Un webhook est en erreur à partir de 400 : les 2xx et 3xx sont des livraisons réussies. */
const HTTP_ERROR_FLOOR = 400;

/** Seuils de bonne santé affichés dans le schéma d'architecture. */
export const HEALTHY_CACHE_HIT_RATIO = 0.95;
export const WEBHOOK_ERROR_WARN_RATE = 0.05;
export const WEBHOOK_ERROR_DANGER_RATE = 0.15;
const FRESH_RUN_MAX_MS = DAY_MS;

const timeLabel = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------------------
// Exécutions n8n
// ---------------------------------------------------------------------------

export interface WorkflowLastSuccess {
  readonly workflowName: string;
  readonly run: PipelineRun;
}

export interface RunSummary {
  /** Instant de référence retenu, réutilisé par les autres calculs de la page. */
  readonly nowMs: number;
  /** Exécutions démarrées dans les 7 derniers jours. */
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly running: number;
  /** Succès / exécutions terminées sur 7 jours. NaN si aucune exécution terminée. */
  readonly successRate: number;
  /** Durée médiane des exécutions terminées sur 7 jours. NaN si aucune. */
  readonly medianDurationMs: number;
  readonly rowsIngested: number;
  readonly rowsRejected: number;
  /** Rejetées / (ingérées + rejetées). 0 si aucune ligne traitée. */
  readonly rejectionRate: number;
  /** Dernière exécution démarrée, tous statuts confondus (fenêtre complète). */
  readonly lastRunAt: string | null;
  /** Dernier succès par workflow, sur l'historique complet, trié par nom. */
  readonly lastSuccessByWorkflow: readonly WorkflowLastSuccess[];
}

const startMs = (run: PipelineRun): number => Date.parse(run.startedAt);

function latestStartMs(runs: readonly PipelineRun[]): number | null {
  let latest: number | null = null;
  for (const run of runs) {
    const value = startMs(run);
    if (!Number.isFinite(value)) continue;
    if (latest === null || value > latest) latest = value;
  }
  return latest;
}

/**
 * Synthèse des exécutions sur 7 jours glissants.
 * Sans instant de référence explicite, on prend l'exécution la plus récente : le tableau
 * de bord décrit alors l'état du pipeline au moment du dernier signe de vie, ce qui est
 * la lecture utile quand la source est un jeu figé.
 */
export function runSummary(runs: readonly PipelineRun[], nowMs?: number): RunSummary {
  const lastRunMs = latestStartMs(runs);
  const now = nowMs ?? lastRunMs ?? Date.now();
  const since = now - WEEK_MS;

  const recent = runs.filter((run) => {
    const value = startMs(run);
    return Number.isFinite(value) && value >= since && value <= now;
  });

  const succeeded = recent.filter((run) => run.status === 'success').length;
  const failed = recent.filter((run) => run.status === 'failed').length;
  const running = recent.filter((run) => run.status === 'running').length;
  const finished = succeeded + failed;

  const durations = recent
    .filter((run) => run.status === 'success' || run.status === 'failed')
    .flatMap((run) => (run.durationMs === null ? [] : [run.durationMs]));

  let rowsIngested = 0;
  let rowsRejected = 0;
  for (const run of recent) {
    rowsIngested += run.rowsIngested;
    rowsRejected += run.rowsRejected;
  }
  const processed = rowsIngested + rowsRejected;

  const bestSuccess = new Map<string, PipelineRun>();
  for (const run of runs) {
    if (run.status !== 'success') continue;
    const current = bestSuccess.get(run.workflowName);
    if (current === undefined || startMs(run) > startMs(current)) {
      bestSuccess.set(run.workflowName, run);
    }
  }

  const lastSuccessByWorkflow = [...bestSuccess.entries()]
    .map(([workflowName, run]): WorkflowLastSuccess => ({ workflowName, run }))
    .toSorted((a, b) => a.workflowName.localeCompare(b.workflowName, 'fr'));

  return {
    nowMs: now,
    total: recent.length,
    succeeded,
    failed,
    running,
    successRate: finished === 0 ? Number.NaN : succeeded / finished,
    medianDurationMs: median(durations),
    rowsIngested,
    rowsRejected,
    rejectionRate: processed === 0 ? 0 : rowsRejected / processed,
    lastRunAt: lastRunMs === null ? null : new Date(lastRunMs).toISOString(),
    lastSuccessByWorkflow,
  };
}

// ---------------------------------------------------------------------------
// Trafic webhook
// ---------------------------------------------------------------------------

export interface WebhookBucket {
  readonly startMs: number;
  /** Heure de début de tranche, "14:30". */
  readonly label: string;
  readonly count: number;
  /** Livraisons réussies (statut < 400), part basse de la barre empilée. */
  readonly ok: number;
  readonly errors: number;
  /** Latences en ms ; null quand la tranche est vide, pour couper la courbe. */
  readonly p50: number | null;
  readonly p95: number | null;
}

export interface WebhookSummary {
  readonly buckets: readonly WebhookBucket[];
  readonly total: number;
  readonly errors: number;
  readonly errorRate: number;
  /** Latences globales sur la fenêtre ; NaN si aucun événement. */
  readonly p50: number;
  readonly p95: number;
}

const EMPTY_WEBHOOK_SUMMARY: WebhookSummary = {
  buckets: [],
  total: 0,
  errors: 0,
  errorRate: 0,
  p50: Number.NaN,
  p95: Number.NaN,
};

/**
 * Trafic webhook agrégé par tranche de 30 minutes sur les 24 dernières heures.
 * La fenêtre se cale sur l'événement le plus récent, arrondi à la tranche supérieure :
 * les 48 points existent toujours, y compris les tranches sans trafic.
 */
export function webhookSummary(events: readonly WebhookEvent[], nowMs?: number): WebhookSummary {
  const timestamps = events
    .map((event) => Date.parse(event.receivedAt))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return EMPTY_WEBHOOK_SUMMARY;

  const latest = nowMs ?? Math.max(...timestamps);
  const end = Math.ceil(latest / BUCKET_MS) * BUCKET_MS;
  const start = end - WEBHOOK_WINDOW_MS;

  const counts = Array.from({ length: BUCKET_COUNT }, () => 0);
  const errorCounts = Array.from({ length: BUCKET_COUNT }, () => 0);
  const latencies: number[][] = Array.from({ length: BUCKET_COUNT }, () => []);

  let total = 0;
  let errors = 0;
  const allLatencies: number[] = [];

  for (const event of events) {
    const receivedMs = Date.parse(event.receivedAt);
    if (!Number.isFinite(receivedMs) || receivedMs < start || receivedMs >= end) continue;
    const index = Math.floor((receivedMs - start) / BUCKET_MS);
    const bucketLatencies = latencies[index];
    if (bucketLatencies === undefined) continue;

    counts[index] = (counts[index] ?? 0) + 1;
    bucketLatencies.push(event.latencyMs);
    allLatencies.push(event.latencyMs);
    total += 1;
    if (event.statusCode >= HTTP_ERROR_FLOOR) {
      errorCounts[index] = (errorCounts[index] ?? 0) + 1;
      errors += 1;
    }
  }

  const buckets = Array.from({ length: BUCKET_COUNT }, (_, index): WebhookBucket => {
    const bucketStart = start + index * BUCKET_MS;
    const count = counts[index] ?? 0;
    const bucketErrors = errorCounts[index] ?? 0;
    const bucketLatencies = latencies[index] ?? [];
    return {
      startMs: bucketStart,
      label: timeLabel.format(new Date(bucketStart)),
      count,
      ok: count - bucketErrors,
      errors: bucketErrors,
      p50: bucketLatencies.length === 0 ? null : Math.round(quantile(bucketLatencies, 0.5)),
      p95: bucketLatencies.length === 0 ? null : Math.round(quantile(bucketLatencies, 0.95)),
    };
  });

  return {
    buckets,
    total,
    errors,
    errorRate: total === 0 ? 0 : errors / total,
    p50: total === 0 ? Number.NaN : Math.round(quantile(allLatencies, 0.5)),
    p95: total === 0 ? Number.NaN : Math.round(quantile(allLatencies, 0.95)),
  };
}

// ---------------------------------------------------------------------------
// Correspondances d'affichage
// ---------------------------------------------------------------------------

const STATUS_TONES: Readonly<Record<PipelineStatus, BadgeTone>> = {
  success: 'accent',
  running: 'info',
  failed: 'danger',
  queued: 'neutral',
};

const STATUS_LABELS: Readonly<Record<PipelineStatus, string>> = {
  success: 'Succès',
  running: 'En cours',
  failed: 'Échec',
  queued: 'En file',
};

export const statusTone = (status: PipelineStatus): BadgeTone => STATUS_TONES[status];
export const statusLabel = (status: PipelineStatus): string => STATUS_LABELS[status];

/** Code HTTP coloré : 2xx accent, 4xx alerte, 5xx erreur, le reste neutre. */
export function httpTone(statusCode: number): BadgeTone {
  if (statusCode >= 500) return 'danger';
  if (statusCode >= 400) return 'warn';
  if (statusCode >= 200 && statusCode < 300) return 'accent';
  return 'neutral';
}

/** Minutes écoulées entre deux instants ISO. NaN si l'une des dates est invalide. */
export function minutesSince(iso: string, nowIso: string): number {
  const from = Date.parse(iso);
  const to = Date.parse(nowIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.NaN;
  return Math.max(0, Math.round((to - from) / MINUTE_MS));
}

// ---------------------------------------------------------------------------
// État des cinq étapes du flux
// ---------------------------------------------------------------------------

export type StageId = 'source' | 'n8n' | 'edge' | 'postgres' | 'front';

export interface StageStatus {
  readonly tone: BadgeTone;
  readonly label: string;
}

export type ArchitectureStatuses = Readonly<Record<StageId, StageStatus>>;

const PENDING: StageStatus = { tone: 'neutral', label: 'en attente' };

/**
 * Traduit la donnée de monitoring en état affichable pour chaque étape du flux.
 * Une étape sans donnée reste neutre : on ne prétend pas qu'un maillon va bien
 * tant qu'on n'a pas la mesure qui le prouve.
 */
export function architectureStatuses(
  runs: RunSummary | undefined,
  webhooks: WebhookSummary | undefined,
  health: DatabaseHealth | undefined,
): ArchitectureStatuses {
  const source: StageStatus =
    runs === undefined || runs.lastSuccessByWorkflow.length === 0
      ? PENDING
      : { tone: 'accent', label: 'à jour' };

  let n8n: StageStatus = PENDING;
  if (runs?.lastRunAt != null) {
    const age = runs.nowMs - Date.parse(runs.lastRunAt);
    n8n =
      age <= FRESH_RUN_MAX_MS
        ? { tone: 'accent', label: 'actif' }
        : { tone: 'warn', label: 'silencieux' };
  }

  let edge: StageStatus = PENDING;
  if (webhooks !== undefined && webhooks.total > 0) {
    if (webhooks.errorRate < WEBHOOK_ERROR_WARN_RATE) edge = { tone: 'accent', label: 'ok' };
    else if (webhooks.errorRate < WEBHOOK_ERROR_DANGER_RATE)
      edge = { tone: 'warn', label: 'dégradée' };
    else edge = { tone: 'danger', label: 'en erreur' };
  }

  const postgres: StageStatus =
    health === undefined
      ? PENDING
      : health.cacheHitRatio > HEALTHY_CACHE_HIT_RATIO
        ? { tone: 'accent', label: 'sain' }
        : { tone: 'warn', label: 'sous tension' };

  return { source, n8n, edge, postgres, front: { tone: 'accent', label: 'déployé' } };
}
