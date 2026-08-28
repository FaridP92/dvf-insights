import { describe, expect, it } from 'vitest';
import { dataSource } from './supabase';
import {
  fetchCommunes,
  fetchCommuneStats,
  fetchDatabaseHealth,
  fetchDepartments,
  fetchMonthlyStats,
  fetchPipelineRuns,
  fetchTopMovers,
  fetchTransactions,
  fetchWebhookEvents,
} from './repository';

describe('repository en mode mock', () => {
  it('tourne bien sur les mocks quand Supabase n est pas configuré', () => {
    expect(dataSource).toBe('mock');
  });

  it('renvoie ok sur toutes les collections', async () => {
    const [departments, monthly, communes, transactions, runs, events, health] = await Promise.all([
      fetchDepartments(),
      fetchMonthlyStats(),
      fetchCommuneStats(),
      fetchTransactions({ departmentCode: '75' }),
      fetchPipelineRuns(),
      fetchWebhookEvents(),
      fetchDatabaseHealth(),
    ]);

    expect(departments.ok).toBe(true);
    expect(monthly.ok).toBe(true);
    expect(communes.ok).toBe(true);
    expect(transactions.ok).toBe(true);
    expect(runs.ok).toBe(true);
    expect(events.ok).toBe(true);
    expect(health.ok).toBe(true);

    if (departments.ok) {
      expect(departments.value).toHaveLength(12);
      expect(departments.value[0]?.code).toBe('06');
      for (const department of departments.value) expect(department.region.length).toBeGreaterThan(2);
    }
    if (monthly.ok) expect(monthly.value).toHaveLength(864);
    if (runs.ok) expect(runs.value).toHaveLength(40);
    if (events.ok) expect(events.value).toHaveLength(200);
    if (communes.ok) expect(communes.value.length).toBeGreaterThan(100);
    if (health.ok) expect(health.value.maxConnections).toBeGreaterThan(0);
  });

  it('borne les mutations au département demandé, et à la commune si elle est fournie', async () => {
    const paris = await fetchTransactions({ departmentCode: '75' });
    expect(paris.ok).toBe(true);
    if (!paris.ok) return;
    expect(paris.value.length).toBeGreaterThan(0);
    expect(new Set(paris.value.map((row) => row.departmentCode))).toEqual(new Set(['75']));

    const commune = await fetchTransactions({ departmentCode: '75', inseeCode: '75111' });
    expect(commune.ok).toBe(true);
    if (!commune.ok) return;
    expect(commune.value.length).toBeGreaterThan(0);
    expect(commune.value.length).toBeLessThan(paris.value.length);
    expect(new Set(commune.value.map((row) => row.inseeCode))).toEqual(new Set(['75111']));

    const capped = await fetchTransactions({ departmentCode: '75', limit: 10 });
    if (capped.ok) expect(capped.value).toHaveLength(10);
  });

  it('filtre les agrégats communaux par département', async () => {
    const [all, lyon] = await Promise.all([
      fetchCommuneStats(),
      fetchCommuneStats({ departmentCode: '69' }),
    ]);
    expect(all.ok && lyon.ok).toBe(true);
    if (!all.ok || !lyon.ok) return;
    expect(lyon.value.length).toBeLessThan(all.value.length);
    expect(new Set(lyon.value.map((row) => row.departmentCode))).toEqual(new Set(['69']));
  });

  it('renvoie le référentiel communal d un département, trié par nom', async () => {
    const result = await fetchCommunes('69');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(5);
    expect(new Set(result.value.map((row) => row.departmentCode))).toEqual(new Set(['69']));
    const names = result.value.map((row) => row.name);
    expect(names).toEqual([...names].toSorted((a, b) => a.localeCompare(b, 'fr')));
  });

  it('ne remonte que les extrémités du classement des communes', async () => {
    const result = await fetchTopMovers({ limit: 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(10);
    for (const row of result.value) expect(row.transactions).toBeGreaterThanOrEqual(30);

    const parisOnly = await fetchTopMovers({ limit: 3, departmentCode: '75' });
    if (parisOnly.ok) {
      expect(new Set(parisOnly.value.map((row) => row.departmentCode))).toEqual(new Set(['75']));
    }

    const houses = await fetchTopMovers({ limit: 3, propertyType: 'maison' });
    if (houses.ok) {
      expect(new Set(houses.value.map((row) => row.propertyType))).toEqual(new Set(['maison']));
    }
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
    const pending = fetchTransactions({ departmentCode: '75' }, controller.signal);
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('network');
  });
});
