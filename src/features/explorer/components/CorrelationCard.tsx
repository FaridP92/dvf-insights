import type { CorrelationCell } from '@/lib/stats';
import { Card, EmptyState } from '@/shared/ui';
import { CORRELATION_VARIABLES } from '../lib/explorerAnalytics';

/**
 * Heatmap de corrélation en CSS pur.
 *
 * Recharts n'a pas de heatmap et une grille de 25 cellules n'a pas besoin d'un moteur de
 * rendu SVG : une grille CSS reste sélectionnable, lisible par un lecteur d'écran via le
 * tableau sémantique, et se redimensionne sans recalcul.
 */

/** Extrémités de l'échelle divergente : rose pour le négatif, émeraude pour le positif. */
const NEGATIVE = { r: 251, g: 113, b: 133 } as const;
const NEUTRAL = { r: 35, g: 42, b: 61 } as const;
const POSITIVE = { r: 52, g: 211, b: 153 } as const;

const mix = (
  from: { readonly r: number; readonly g: number; readonly b: number },
  to: { readonly r: number; readonly g: number; readonly b: number },
  t: number,
): string => {
  const channel = (a: number, b: number): number => Math.round(a + (b - a) * t);
  return `rgb(${channel(from.r, to.r)} ${channel(from.g, to.g)} ${channel(from.b, to.b)})`;
};

/** Couleur d'une cellule : gris neutre à 0, saturation croissante vers chaque extrémité. */
export function correlationColor(value: number): string {
  if (!Number.isFinite(value)) return 'rgb(35 42 61)';
  const intensity = Math.min(1, Math.abs(value));
  return value < 0 ? mix(NEUTRAL, NEGATIVE, intensity) : mix(NEUTRAL, POSITIVE, intensity);
}

/**
 * Le texte passe en sombre dès que le fond est saturé : au-delà de |0,55| les extrémités
 * rose et émeraude sont trop claires pour porter du texte clair.
 */
const textClass = (value: number): string =>
  Number.isFinite(value) && Math.abs(value) > 0.55 ? 'text-bg' : 'text-fg';

const formatCoefficient = (value: number): string =>
  Number.isFinite(value)
    ? value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : 'n/d';

export function CorrelationCard({
  cells,
  className = '',
}: {
  readonly cells: readonly CorrelationCell[];
  readonly className?: string;
}) {
  const byKey = new Map(cells.map((cell) => [`${cell.row}|${cell.col}`, cell.value]));
  const hasData = cells.some((cell) => cell.row !== cell.col && Number.isFinite(cell.value));

  return (
    <Card title="Corrélations" subtitle="Pearson sur la sélection" className={className}>
      {hasData ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-separate border-spacing-1 text-xs">
            <caption className="sr-only">
              Matrice des corrélations de Pearson entre prix, surface, pièces, terrain et prix au
              mètre carré
            </caption>
            <thead>
              <tr>
                <th scope="col" className="w-20">
                  <span className="sr-only">Variable</span>
                </th>
                {CORRELATION_VARIABLES.map((name) => (
                  <th
                    key={name}
                    scope="col"
                    className="px-1 pb-1 text-center text-[11px] font-medium text-fg-muted"
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CORRELATION_VARIABLES.map((row) => (
                <tr key={row}>
                  <th
                    scope="row"
                    className="pr-2 text-right text-[11px] font-medium text-fg-muted whitespace-nowrap"
                  >
                    {row}
                  </th>
                  {CORRELATION_VARIABLES.map((col) => {
                    const value = byKey.get(`${row}|${col}`) ?? Number.NaN;
                    return (
                      <td key={col} className="p-0">
                        <div
                          className={`flex h-11 items-center justify-center rounded-md tabular font-medium ${textClass(value)}`}
                          style={{ backgroundColor: correlationColor(value) }}
                          title={`${row} / ${col}`}
                        >
                          {formatCoefficient(value)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-fg-subtle">
            <span className="tabular">-1</span>
            <span
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: `linear-gradient(to right, ${correlationColor(-1)}, ${correlationColor(0)}, ${correlationColor(1)})`,
              }}
              aria-hidden
            />
            <span className="tabular">+1</span>
          </div>
        </div>
      ) : (
        <EmptyState message="Au moins deux mutations sont nécessaires pour corréler." />
      )}
    </Card>
  );
}
