/**
 * Formats propres à la page Prédictions : les formats globaux imposent un signe
 * (formatPct) ou une précision entière (formatEurPerSqm) qui ne conviennent ni à une
 * incertitude symétrique, ni à une pente de quelques euros par mois.
 */

const decimal = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const signedDecimal = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const shortDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: '2-digit',
});

/** Incertitude symétrique : "± 3,2 %". */
export function formatPlusMinus(fraction: number): string {
  if (!Number.isFinite(fraction)) return 'n/d';
  return `± ${decimal.format(Math.abs(fraction) * 100)} %`;
}

/** Pente du modèle : "+12,4 €/m²/mois". */
export function formatTrendPerMonth(value: number): string {
  if (!Number.isFinite(value)) return 'n/d';
  return `${signedDecimal.format(value)} €/m²/mois`;
}

/** Score z robuste, une décimale : "-4,7". */
export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return 'n/d';
  return decimal.format(value);
}

/** Élasticité prix/surface : "0,88". */
export function formatElasticity(value: number): string {
  if (!Number.isFinite(value)) return 'n/d';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

/** Date de mutation, sans heure : "12 mars 26". */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return shortDate.format(date);
}
