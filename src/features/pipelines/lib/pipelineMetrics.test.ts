import { describe, expect, it } from 'vitest';
import type { DatabaseHealth, PipelineRun, WebhookEvent } from '@/shared/types/dvf';
import {
  architectureStatuses,
  httpTone,
  minutesSince,
  runSummary,
  statusLabel,
  statusTone,
  webhookSummary,
} from './pipelineMetrics';

const NOW = Date.parse('2026-03-31T12:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const iso = (ms: number): string => new Date(ms).toISOString();

function run(overrides: Partial<PipelineRun> & { readonly id: string }): PipelineRun {
  return {
    workflowName: 'dvf-ingest-monthly',
    status: 'success',
    startedAt: iso(NOW - HOUR),
    finishedAt: iso(NOW - HOUR + 1000),
    rowsIngested: 0,
    rowsRejected: 0,
    durationMs: 1000,
    errorMessage: null,
    ...overrides,
  };
}

function event(overrides: Partial<WebhookEvent> & { readonly id: string }): WebhookEvent {
  return {
    source: 'n8n/ingest',
    receivedAt: iso(NOW - HOUR),
    statusCode: 200,
    latencyMs: 100,
    payloadBytes: 1024,
    ...overrides,
  };
}

const health = (overrides: Partial<DatabaseHealth> = {}): DatabaseHealth => ({
  checkedAt: iso(NOW),
  activeConnections: 8,
  maxConnections: 60,
  cacheHitRatio: 0.98,
  dbSizeBytes: 4_000_000_000,
  rawRows: 10_000_000,
  cleanRows: 5_900_000,
  lastRefreshAt: iso(NOW - 2 * HOUR),
  replicationLagMs: 120,
  ...overrides,
});

describe('runSummary', () => {
  const runs: readonly PipelineRun[] = [
    run({ id: 'a', status: 'running', durationMs: null, finishedAt: null, startedAt: iso(NOW) }),
    run({
      id: 'b',
      startedAt: iso(NOW - HOUR),
      durationMs: 1000,
      rowsIngested: 900,
      rowsRejected: 100,
    }),
    run({
      id: 'c',
      startedAt: iso(NOW - 2 * HOUR),
      durationMs: 3000,
      rowsIngested: 500,
      rowsRejected: 0,
    }),
    run({
      id: 'd',
      status: 'failed',
      startedAt: iso(NOW - 3 * HOUR),
      durationMs: 5000,
      errorMessage: 'boom',
    }),
    // Hors fenêtre 7 jours : ne doit compter dans aucun agrégat de la période.
    run({ id: 'e', startedAt: iso(NOW - 9 * DAY), durationMs: 999_999, rowsIngested: 10_000 }),
  ];

  it('ne retient que les 7 derniers jours et compte les statuts', () => {
    const summary = runSummary(runs, NOW);
    expect(summary.total).toBe(4);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.running).toBe(1);
  });

  it('calcule le taux de succès sur les seules exécutions terminées', () => {
    expect(runSummary(runs, NOW).successRate).toBeCloseTo(2 / 3, 10);
  });

  it('prend la durée médiane des exécutions terminées, en ignorant celles en cours', () => {
    // Durées retenues : 1000, 3000, 5000 -> médiane 3000.
    expect(runSummary(runs, NOW).medianDurationMs).toBe(3000);
  });

  it('somme les lignes ingérées et rejetées et en déduit le taux de rejet', () => {
    const summary = runSummary(runs, NOW);
    expect(summary.rowsIngested).toBe(1400);
    expect(summary.rowsRejected).toBe(100);
    expect(summary.rejectionRate).toBeCloseTo(100 / 1500, 10);
  });

  it('retient le dernier succès de chaque workflow sur tout l historique', () => {
    const summary = runSummary(
      [
        run({ id: 'x1', workflowName: 'mv-refresh', startedAt: iso(NOW - 5 * HOUR) }),
        run({ id: 'x2', workflowName: 'mv-refresh', startedAt: iso(NOW - HOUR) }),
        run({ id: 'x3', workflowName: 'mv-refresh', status: 'failed', startedAt: iso(NOW) }),
        run({ id: 'y1', workflowName: 'health-check', startedAt: iso(NOW - 2 * HOUR) }),
      ],
      NOW,
    );
    expect(summary.lastSuccessByWorkflow.map((entry) => entry.workflowName)).toEqual([
      'health-check',
      'mv-refresh',
    ]);
    expect(summary.lastSuccessByWorkflow[1]?.run.id).toBe('x2');
  });

  it('se cale sur l exécution la plus récente quand aucun instant n est fourni', () => {
    expect(runSummary(runs).nowMs).toBe(NOW);
  });

  it('ne casse pas sur un historique vide', () => {
    const summary = runSummary([], NOW);
    expect(summary.total).toBe(0);
    expect(summary.successRate).toBeNaN();
    expect(summary.medianDurationMs).toBeNaN();
    expect(summary.rejectionRate).toBe(0);
    expect(summary.lastRunAt).toBeNull();
    expect(summary.lastSuccessByWorkflow).toEqual([]);
  });
});

describe('webhookSummary', () => {
  it('produit 48 tranches de 30 minutes couvrant 24 heures', () => {
    const summary = webhookSummary([event({ id: 'e1' })]);
    expect(summary.buckets).toHaveLength(48);
    const first = summary.buckets[0];
    const last = summary.buckets[47];
    expect(first && last && last.startMs - first.startMs).toBe(47 * 30 * MINUTE);
    expect(first?.label).toMatch(/^\d{2}:\d{2}$/);
  });

  it('range chaque événement dans sa tranche et sépare les erreurs', () => {
    const anchor = Date.parse('2026-03-31T12:00:00.000Z');
    const summary = webhookSummary(
      [
        event({ id: 'a', receivedAt: iso(anchor - 10 * MINUTE), latencyMs: 100 }),
        event({ id: 'b', receivedAt: iso(anchor - 20 * MINUTE), latencyMs: 300 }),
        event({ id: 'c', receivedAt: iso(anchor - 15 * MINUTE), statusCode: 500, latencyMs: 800 }),
      ],
      anchor,
    );
    const filled = summary.buckets.filter((bucket) => bucket.count > 0);
    expect(filled).toHaveLength(1);
    expect(filled[0]?.count).toBe(3);
    expect(filled[0]?.errors).toBe(1);
    expect(filled[0]?.ok).toBe(2);
  });

  it('laisse les latences à null sur les tranches vides', () => {
    const summary = webhookSummary([event({ id: 'a' })]);
    const empty = summary.buckets.find((bucket) => bucket.count === 0);
    expect(empty?.p50).toBeNull();
    expect(empty?.p95).toBeNull();
  });

  it('calcule P50, P95 et le taux d erreur globaux', () => {
    const events = Array.from({ length: 100 }, (_, index) =>
      event({
        id: `e${String(index)}`,
        receivedAt: iso(NOW - index * MINUTE),
        latencyMs: index + 1,
        statusCode: index < 10 ? 429 : 200,
      }),
    );
    const summary = webhookSummary(events, NOW + 1);
    expect(summary.total).toBe(100);
    expect(summary.errors).toBe(10);
    expect(summary.errorRate).toBeCloseTo(0.1, 10);
    expect(summary.p50).toBe(51);
    // Quantile R-7 sur 1..100 : position 99 x 0,95 = 94,05 -> 95,05, arrondi à 95.
    expect(summary.p95).toBe(95);
    expect(summary.p95).toBeGreaterThanOrEqual(summary.p50);
  });

  it('ignore les événements hors de la fenêtre de 24 heures', () => {
    const summary = webhookSummary(
      [event({ id: 'in' }), event({ id: 'out', receivedAt: iso(NOW - 3 * DAY) })],
      NOW,
    );
    expect(summary.total).toBe(1);
  });

  it('renvoie une synthèse vide sans événement', () => {
    const summary = webhookSummary([]);
    expect(summary.buckets).toEqual([]);
    expect(summary.total).toBe(0);
    expect(summary.p95).toBeNaN();
  });
});

describe('statusTone', () => {
  it('associe une tonalité de badge à chaque statut', () => {
    expect(statusTone('success')).toBe('accent');
    expect(statusTone('running')).toBe('info');
    expect(statusTone('failed')).toBe('danger');
    expect(statusTone('queued')).toBe('neutral');
    expect(statusLabel('failed')).toBe('Échec');
  });
});

describe('httpTone', () => {
  it('colore les codes HTTP par famille', () => {
    expect(httpTone(200)).toBe('accent');
    expect(httpTone(204)).toBe('accent');
    expect(httpTone(429)).toBe('warn');
    expect(httpTone(500)).toBe('danger');
    expect(httpTone(302)).toBe('neutral');
  });
});

describe('minutesSince', () => {
  it('mesure l ancienneté en minutes, jamais négative', () => {
    expect(minutesSince(iso(NOW - 90 * MINUTE), iso(NOW))).toBe(90);
    expect(minutesSince(iso(NOW + 5 * MINUTE), iso(NOW))).toBe(0);
    expect(minutesSince('pas une date', iso(NOW))).toBeNaN();
  });
});

describe('architectureStatuses', () => {
  it('reste neutre tant que la donnée n est pas arrivée', () => {
    const states = architectureStatuses(undefined, undefined, undefined);
    expect(states.source.tone).toBe('neutral');
    expect(states.n8n.tone).toBe('neutral');
    expect(states.edge.tone).toBe('neutral');
    expect(states.postgres.tone).toBe('neutral');
    expect(states.front.tone).toBe('accent');
  });

  it('marque n8n actif si une exécution date de moins de 24 h', () => {
    const fresh = runSummary([run({ id: 'a', startedAt: iso(NOW - 2 * HOUR) })], NOW);
    const stale = runSummary([run({ id: 'a', startedAt: iso(NOW - 3 * DAY) })], NOW);
    expect(architectureStatuses(fresh, undefined, undefined).n8n).toEqual({
      tone: 'accent',
      label: 'actif',
    });
    expect(architectureStatuses(stale, undefined, undefined).n8n.tone).toBe('warn');
  });

  it('gradue l Edge Function selon le taux d erreur webhook', () => {
    const rate = (errors: number): ReturnType<typeof webhookSummary> =>
      webhookSummary(
        Array.from({ length: 100 }, (_, index) =>
          event({
            id: `e${String(index)}`,
            receivedAt: iso(NOW - index * MINUTE),
            statusCode: index < errors ? 500 : 200,
          }),
        ),
        NOW + 1,
      );
    expect(architectureStatuses(undefined, rate(2), undefined).edge.tone).toBe('accent');
    expect(architectureStatuses(undefined, rate(8), undefined).edge.tone).toBe('warn');
    expect(architectureStatuses(undefined, rate(30), undefined).edge.tone).toBe('danger');
  });

  it('juge PostgreSQL sain au-delà de 95 % de cache hit', () => {
    expect(architectureStatuses(undefined, undefined, health()).postgres).toEqual({
      tone: 'accent',
      label: 'sain',
    });
    expect(
      architectureStatuses(undefined, undefined, health({ cacheHitRatio: 0.88 })).postgres.tone,
    ).toBe('warn');
  });
});
