import { describe, expect, it } from 'vitest';
import { generateDatabaseHealth, generatePipelineRuns, generateWebhookEvents } from './pipelines';
import { REFERENCE_DATE } from './monthlyStats';

const runs = generatePipelineRuns();
const events = generateWebhookEvents();
const health = generateDatabaseHealth();

const WORKFLOWS = ['dvf-ingest-monthly', 'dvf-clean-refresh', 'mv-refresh', 'health-check'];

describe('generatePipelineRuns', () => {
  it('est déterministe et produit 40 exécutions sur 14 jours', () => {
    expect(runs).toHaveLength(40);
    expect(generatePipelineRuns()).toEqual(runs);
    const oldest = Math.min(...runs.map((r) => Date.parse(r.startedAt)));
    const spanDays = (REFERENCE_DATE.getTime() - oldest) / 86_400_000;
    expect(spanDays).toBeGreaterThan(12);
    expect(spanDays).toBeLessThanOrEqual(14);
  });

  it('mélange 3 échecs, 1 exécution en cours et des succès', () => {
    expect(runs.filter((r) => r.status === 'failed')).toHaveLength(3);
    expect(runs.filter((r) => r.status === 'running')).toHaveLength(1);
    expect(runs.filter((r) => r.status === 'success')).toHaveLength(36);
  });

  it('associe un message d erreur aux seuls échecs', () => {
    for (const run of runs) {
      expect(WORKFLOWS).toContain(run.workflowName);
      if (run.status === 'failed') {
        expect(run.errorMessage).toBeTruthy();
      } else {
        expect(run.errorMessage).toBeNull();
      }
      if (run.status === 'running') {
        expect(run.durationMs).toBeNull();
        expect(run.finishedAt).toBeNull();
      } else {
        expect(run.durationMs).toBeGreaterThan(0);
        expect(run.finishedAt).not.toBeNull();
      }
      expect(run.rowsRejected).toBeLessThanOrEqual(run.rowsIngested);
    }
  });
});

describe('generateWebhookEvents', () => {
  it('est déterministe et produit 200 événements sur 24 heures', () => {
    expect(events).toHaveLength(200);
    expect(generateWebhookEvents()).toEqual(events);
    const oldest = Math.min(...events.map((e) => Date.parse(e.receivedAt)));
    expect(REFERENCE_DATE.getTime() - oldest).toBeLessThanOrEqual(25 * 3_600_000);
  });

  it('reste majoritairement en 200 avec quelques 429 et 500', () => {
    const codes = new Set(events.map((e) => e.statusCode));
    expect(codes).toEqual(new Set([200, 429, 500]));
    const okCount = events.filter((e) => e.statusCode === 200).length;
    expect(okCount / events.length).toBeGreaterThan(0.85);
  });

  it('garde des latences dans la plage 40-900 ms et des sources connues', () => {
    for (const event of events) {
      expect(event.latencyMs).toBeGreaterThanOrEqual(40);
      expect(event.latencyMs).toBeLessThanOrEqual(900);
      expect(['n8n/ingest', 'n8n/health', 'datagouv/notify']).toContain(event.source);
    }
  });
});

describe('generateDatabaseHealth', () => {
  it('est déterministe et réaliste', () => {
    expect(generateDatabaseHealth()).toEqual(health);
    expect(health.rawRows).toBeGreaterThan(11_000_000);
    expect(health.rawRows).toBeLessThan(12_000_000);
    expect(health.cleanRows).toBeLessThan(health.rawRows);
    expect(health.cacheHitRatio).toBeGreaterThan(0.95);
    expect(health.cacheHitRatio).toBeLessThanOrEqual(1);
    expect(health.activeConnections).toBeLessThan(health.maxConnections);
    expect(Date.parse(health.lastRefreshAt)).toBeLessThanOrEqual(Date.parse(health.checkedAt));
  });
});
