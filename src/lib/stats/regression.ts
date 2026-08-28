export interface LinearFit {
  readonly slope: number;
  readonly intercept: number;
  readonly r2: number;
  readonly n: number;
  /** Erreur type des résidus, base de l'intervalle de confiance. */
  readonly residualStdError: number;
}

/** Régression linéaire simple par moindres carrés ordinaires. */
export function linearRegression(x: readonly number[], y: readonly number[]): LinearFit {
  const n = Math.min(x.length, y.length);
  if (n < 2) {
    return { slope: Number.NaN, intercept: Number.NaN, r2: Number.NaN, n, residualStdError: Number.NaN };
  }
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += x[i] ?? 0;
    sy += y[i] ?? 0;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (x[i] ?? 0) - mx;
    const dy = (y[i] ?? 0) - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) {
    return { slope: Number.NaN, intercept: Number.NaN, r2: Number.NaN, n, residualStdError: Number.NaN };
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = intercept + slope * (x[i] ?? 0);
    sse += ((y[i] ?? 0) - predicted) ** 2;
  }
  const r2 = syy === 0 ? 1 : 1 - sse / syy;
  const residualStdError = n > 2 ? Math.sqrt(sse / (n - 2)) : Number.NaN;
  return { slope, intercept, r2, n, residualStdError };
}

/**
 * Élasticité prix/surface : pente de log(prix) sur log(surface).
 * Une élasticité < 1 signifie que le prix croît moins vite que la surface
 * (décote des grandes surfaces, typique des marchés locatifs tendus).
 */
export function priceSurfaceElasticity(
  points: ReadonlyArray<{ readonly price: number; readonly surface: number }>,
): LinearFit {
  const valid = points.filter((p) => p.price > 0 && p.surface > 0);
  return linearRegression(
    valid.map((p) => Math.log(p.surface)),
    valid.map((p) => Math.log(p.price)),
  );
}

export interface Estimate {
  readonly value: number;
  readonly low: number;
  readonly high: number;
}

/**
 * Estimation hédonique simplifiée : prix médian au m² local, ajusté par
 * l'élasticité de surface et une prime par pièce, avec bande de confiance à ~80 %.
 */
export function estimatePrice(input: {
  readonly surface: number;
  readonly rooms: number;
  readonly medianPricePerSqm: number;
  readonly medianSurface: number;
  readonly elasticity: number;
  readonly dispersion: number; // (p90 - p10) / median, mesure locale d'incertitude
}): Estimate {
  const { surface, rooms, medianPricePerSqm, medianSurface, elasticity, dispersion } = input;
  if (surface <= 0 || medianSurface <= 0 || medianPricePerSqm <= 0) {
    return { value: Number.NaN, low: Number.NaN, high: Number.NaN };
  }
  const safeElasticity = Number.isFinite(elasticity) ? elasticity : 1;
  // Ajustement de surface : le prix/m² décroît quand la surface s'éloigne de la médiane.
  const surfaceFactor = (surface / medianSurface) ** (safeElasticity - 1);
  // Prime de pièces : +2 % par pièce au-delà du ratio "1 pièce pour 25 m²", plafonnée.
  const expectedRooms = surface / 25;
  const roomPremium = Math.max(-0.06, Math.min(0.06, (rooms - expectedRooms) * 0.02));
  const value = medianPricePerSqm * surface * surfaceFactor * (1 + roomPremium);
  const halfWidth = value * Math.max(0.05, Math.min(0.35, dispersion / 2));
  return { value, low: value - halfWidth, high: value + halfWidth };
}
