import { describe, expect, it } from 'vitest';
import { dataSource } from './supabase';
import {
  fetchCommuneStats,
  fetchDatabaseHealth,
  fetchMonthlyStats,
  fetchPipelineRuns,
  fetchTransactions,
  fetchWebhookEvents,
} from './repository';

describe('repository en mode mock', () => {
  it('tourne bien sur les mocks quand Supabase n est pas configuré', () => {
    expect(dataSource).toBe('mock');
  });

  it('renvoie ok sur toutes les collections', async () => {
    const [monthly, communes, transactions, runs, events, health] = await Promise.all([
      fetchMonthlyStats(),
      fetchCommuneStats(),
      fetchTransactions(),
      fetchPipelineRuns(),
      fetchWebhookEvents(),
      fetchDatabaseHealth(),
    ]);

    expect(monthly.ok).toBe(true);
    expect(communes.ok).toBe(true);
    expect(transactions.ok).toBe(true);
    expect(runs.ok).toBe(true);
    expect(events.ok).toBe(true);
    expect(health.ok).toBe(true);

    if (monthly.ok) expect(monthly.value).toHaveLength(864);
    if (transactions.ok) expect(transactions.value).toHaveLength(2500);
    if (runs.ok) expect(runs.value).toHaveLength(40);
    if (events.ok) expect(events.value).toHaveLength(200);
    if (communes.ok) expect(communes.value.length).toBeGreaterThan(100);
    if (health.ok) expect(health.value.maxConnections).toBeGreaterThan(0);
  });

  it('mémoïse les mocks : deux appels renvoient la même référence', async () => {
    const first = await fetchMonthlyStats();
    const second = await fetchMonthlyStats();
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.value).toBe(second.value);
  });

  it('renvoie une erreur réseau quand le signal est déjà annulé', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await fetchMonthlyStats(controller.signal);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('network');
      expect(result.error.message).toBe('Requête annulée');
      expect(result.error.retryable).toBe(true);
    }
  });

  it('annule pendant la latence simulée', async () => {
    const controller = new AbortController();
    const pending = fetchTransactions(controller.signal);
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('network');
  });
});
