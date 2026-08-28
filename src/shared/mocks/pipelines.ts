import type { DatabaseHealth, PipelineRun, PipelineStatus, WebhookEvent } from '@/shared/types/dvf';
import { REFERENCE_DATE } from './monthlyStats';
import { createRng, round } from './seed';

const RUNS_SEED = 141_007;
const EVENTS_SEED = 902_244;

const RUNS_COUNT = 40;
const RUNS_WINDOW_DAYS = 14;
const EVENTS_COUNT = 200;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Les quatre workflows n8n du pipeline, avec leur volumétrie et leur durée typiques. */
const WORKFLOWS = [
  { name: 'dvf-ingest-monthly', rows: [180_000, 420_000], durationMs: [90_000, 260_000] },
  { name: 'dvf-clean-refresh', rows: [60_000, 190_000], durationMs: [35_000, 120_000] },
  { name: 'mv-refresh', rows: [0, 0], durationMs: [8000, 41_000] },
  { name: 'health-check', rows: [0, 0], durationMs: [400, 2600] },
] as const;

/** Messages d'échec réalistes : ce sont les trois pannes qu'on rencontre vraiment. */
const ERROR_MESSAGES: readonly string[] = [
  'HTTP 504 sur https://files.data.gouv.fr/geo-dvf/latest/csv/2026/ : délai dépassé après 120 s',
  'ERROR: duplicate key value violates unique constraint "dvf_mutations_clean_pkey" (id=2026-0421337)',
  'ERROR: could not extend file "base/16384/24610": No space left on device',
];

/** Indices des exécutions en échec : figés pour que la page de monitoring reste stable. */
const FAILED_INDEXES: readonly number[] = [4, 13, 27];
const RUNNING_INDEX = 0;

const isoAt = (ms: number): string => new Date(ms).toISOString();

/**
 * Exécutions n8n des quatorze derniers jours, de la plus récente à la plus ancienne.
 * Une exécution est en cours, trois ont échoué, le reste a réussi : c'est le profil d'un
 * pipeline sain, où l'échec existe mais reste l'exception.
 */
export function generatePipelineRuns(): readonly PipelineRun[] {
  const rng = createRng(RUNS_SEED);
  const end = REFERENCE_DATE.getTime();
  const step = (RUNS_WINDOW_DAYS * DAY_MS) / RUNS_COUNT;
  const runs: PipelineRun[] = [];

  for (let i = 0; i < RUNS_COUNT; i += 1) {
    const workflow = WORKFLOWS[i % WORKFLOWS.length] ?? WORKFLOWS[3];
    const startedAt = end - i * step - rng.int(0, Math.floor(step / 2));

    let status: PipelineStatus = 'success';
    if (i === RUNNING_INDEX) status = 'running';
    else if (FAILED_INDEXES.includes(i)) status = 'failed';

    // Une exécution en échec s'arrête tôt : durée courte et volume partiel.
    const nominalDuration = rng.int(workflow.durationMs[0], workflow.durationMs[1]);
    const durationMs =
      status === 'running' ? null : Math.round(nominalDuration * (status === 'failed' ? 0.4 : 1));
    const rowsIngested =
      status === 'failed'
        ? rng.int(0, Math.floor(workflow.rows[1] / 4))
        : rng.int(workflow.rows[0], workflow.rows[1]);
    const rowsRejected = Math.round(rowsIngested * rng.range(0.002, 0.031));

    const errorIndex = FAILED_INDEXES.indexOf(i);
    runs.push({
      id: `run-${String(RUNS_COUNT - i).padStart(4, '0')}`,
      workflowName: workflow.name,
      status,
      startedAt: isoAt(startedAt),
      finishedAt: durationMs === null ? null : isoAt(startedAt + durationMs),
      rowsIngested,
      rowsRejected,
      durationMs,
      errorMessage: errorIndex === -1 ? null : (ERROR_MESSAGES[errorIndex] ?? null),
    });
  }

  return runs;
}

const WEBHOOK_SOURCES: readonly string[] = ['n8n/ingest', 'n8n/health', 'datagouv/notify'];

/**
 * Trafic webhook des dernières 24 heures.
 * Quelques 429 (limitation de débit côté data.gouv) et 500 ponctuels : sans eux,
 * le graphique de codes de retour serait une bande verte sans information.
 */
export function generateWebhookEvents(): readonly WebhookEvent[] {
  const rng = createRng(EVENTS_SEED);
  const end = REFERENCE_DATE.getTime();
  const events: WebhookEvent[] = [];

  for (let i = 0; i < EVENTS_COUNT; i += 1) {
    const receivedAt = end - Math.floor((i * DAY_MS) / EVENTS_COUNT) - rng.int(0, 220_000);
    const roll = rng.next();
    let statusCode = 200;
    if (roll > 0.965) statusCode = 500;
    else if (roll > 0.92) statusCode = 429;

    // Un appel qui échoue coûte plus cher : timeout côté amont ou retry interne.
    const latencyBase = statusCode === 200 ? rng.int(40, 420) : rng.int(320, 900);

    events.push({
      id: `evt-${String(EVENTS_COUNT - i).padStart(4, '0')}`,
      source: rng.pick(WEBHOOK_SOURCES),
      receivedAt: isoAt(receivedAt),
      statusCode,
      latencyMs: latencyBase,
      payloadBytes: rng.int(320, 48_000),
    });
  }

  return events;
}

/**
 * Instantané de santé de la base, aligné sur les ordres de grandeur d'une instance
 * Supabase portant cinq années de DVF : environ 11,4 M de lignes brutes pour 6,8 M de
 * lignes nettoyées, soit un taux de rejet de 40 % cohérent avec les règles de nettoyage.
 */
export function generateDatabaseHealth(): DatabaseHealth {
  const rng = createRng(RUNS_SEED ^ EVENTS_SEED);
  const end = REFERENCE_DATE.getTime();

  return {
    checkedAt: isoAt(end),
    activeConnections: rng.int(4, 17),
    maxConnections: 60,
    cacheHitRatio: round(rng.range(0.972, 0.994), 4),
    dbSizeBytes: 4_812_000_000 + rng.int(0, 120_000_000),
    rawRows: 11_400_000 + rng.int(-45_000, 45_000),
    cleanRows: 6_800_000 + rng.int(-30_000, 30_000),
    lastRefreshAt: isoAt(end - rng.int(1, 6) * HOUR_MS),
    replicationLagMs: rng.int(35, 480),
  };
}
