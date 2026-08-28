import { describe, expect, it } from 'vitest';
import { appError, err, isAppError, mapResult, ok, toAppError, tryCatch } from './result';

describe('result', () => {
  it('construit ok et err', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('x')).toEqual({ ok: false, error: 'x' });
  });
  it('marque les erreurs réseau comme réessayables par défaut', () => {
    expect(appError('network', 'hs').retryable).toBe(true);
    expect(appError('validation', 'hs').retryable).toBe(false);
  });
  it('convertit une exception en AppError et préserve un AppError existant', () => {
    const converted = toAppError(new Error('boom'), 'supabase');
    expect(converted.kind).toBe('supabase');
    expect(converted.message).toBe('boom');
    expect(isAppError(converted)).toBe(true);
    expect(toAppError(converted)).toBe(converted);
  });
  it('tryCatch capture les rejets', async () => {
    const result = await tryCatch(() => Promise.reject(new Error('nope')), 'network');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.retryable).toBe(true);
  });
  it('mapResult transforme uniquement les succès', () => {
    expect(mapResult(ok(2), (v) => v * 2)).toEqual({ ok: true, value: 4 });
    const failure = err(appError('unknown', 'x'));
    expect(mapResult(failure, (v: number) => v * 2)).toBe(failure);
  });
});
