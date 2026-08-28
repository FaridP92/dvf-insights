export interface ForecastPoint {
  readonly step: number;
  readonly value: number;
  readonly low: number;
  readonly high: number;
}

export interface HoltResult {
  readonly fitted: readonly number[];
  readonly forecast: readonly ForecastPoint[];
  readonly level: number;
  readonly trend: number;
}

/**
 * Lissage exponentiel double de Holt (niveau + tendance), adapté aux séries mensuelles
 * de prix médians : peu de paramètres, robuste sur 24 à 60 points, explicable à un décideur.
 * La bande d'incertitude s'élargit en racine de l'horizon, à partir de l'erreur type des résidus.
 */
export function holtForecast(
  series: readonly number[],
  horizon: number,
  options: { readonly alpha?: number; readonly beta?: number; readonly z?: number } = {},
): HoltResult {
  const alpha = options.alpha ?? 0.4;
  const beta = options.beta ?? 0.15;
  const z = options.z ?? 1.28; // ~80 % de couverture
  const first = series[0];
  const second = series[1];
  if (first === undefined || second === undefined) {
    return { fitted: [...series], forecast: [], level: first ?? Number.NaN, trend: 0 };
  }

  let level = first;
  let trend = second - first;
  const fitted: number[] = [first];
  const residuals: number[] = [];

  for (let t = 1; t < series.length; t += 1) {
    const actual = series[t];
    if (actual === undefined) continue;
    const predicted = level + trend;
    fitted.push(predicted);
    residuals.push(actual - predicted);
    const previousLevel = level;
    level = alpha * actual + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
  }

  const sigma =
    residuals.length > 1
      ? Math.sqrt(residuals.reduce((acc, r) => acc + r * r, 0) / (residuals.length - 1))
      : 0;

  const forecast: ForecastPoint[] = [];
  for (let h = 1; h <= horizon; h += 1) {
    const value = level + h * trend;
    const width = z * sigma * Math.sqrt(h);
    forecast.push({ step: h, value, low: value - width, high: value + width });
  }
  return { fitted, forecast, level, trend };
}

/** Moyenne mobile centrée, utilisée pour lisser visuellement les séries bruitées. */
export function movingAverage(series: readonly number[], window: number): readonly number[] {
  if (window <= 1) return [...series];
  const half = Math.floor(window / 2);
  return series.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(series.length, i + half + 1);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += series[j] ?? 0;
    return sum / (end - start);
  });
}
