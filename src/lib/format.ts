const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const int = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

export const formatEur = (value: number): string => eur.format(value);
export const formatEurPerSqm = (value: number): string => `${int.format(Math.round(value))} €/m²`;
export const formatInt = (value: number): string => int.format(value);
export const formatPct = (fraction: number): string => pct.format(fraction);
export const formatCompact = (value: number): string => compact.format(value);

export function formatMonth(isoMonth: string): string {
  const [year, month] = isoMonth.split('-');
  if (year === undefined || month === undefined) return isoMonth;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export function formatBytes(bytes: number): string {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? 'o'}`;
}
