import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatInt, formatPct } from '@/lib/format';
import { Card, EmptyState } from '@/shared/ui';
import { ChartTooltip, axisProps, chartColors, firstPayload, tooltipCursor } from '@/shared/charts';
import type { SurfaceBandRow } from '../lib/explorerAnalytics';

/**
 * Structure du marché : effectifs par type de bien et tranche de surface.
 * Barres horizontales empilées, parce que les libellés de tranche se lisent à plat et que
 * l'empilement met la composition avant le volume, comme le veut la lecture du marché.
 */

interface TooltipProps {
  readonly active?: boolean;
  readonly payload?: unknown;
}

function StructureTooltip({ active, payload }: TooltipProps) {
  const row = firstPayload<SurfaceBandRow>(payload);
  if (!active || row === undefined) return null;
  const share = (value: number): string =>
    row.total === 0 ? '' : ` (${formatPct(value / row.total)})`;
  return (
    <ChartTooltip
      title={row.band}
      rows={[
        {
          label: 'Appartement',
          value: `${formatInt(row.appartement)}${share(row.appartement)}`,
          color: chartColors.accent,
        },
        {
          label: 'Maison',
          value: `${formatInt(row.maison)}${share(row.maison)}`,
          color: chartColors.info,
        },
      ]}
      note={`${formatInt(row.total)} mutations dans la tranche`}
    />
  );
}

function MiniLegend() {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-muted">
      <li className="flex items-center gap-1.5">
        <span
          className="size-2 rounded-sm"
          style={{ background: chartColors.accent }}
          aria-hidden
        />
        Appartement
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm" style={{ background: chartColors.info }} aria-hidden />
        Maison
      </li>
    </ul>
  );
}

export function MarketStructureCard({
  rows,
  height = 280,
  className = '',
}: {
  readonly rows: readonly SurfaceBandRow[];
  readonly height?: number;
  readonly className?: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <Card
      title="Structure du marché"
      subtitle="Effectifs par type de bien et tranche de surface bâtie"
      className={className}
    >
      {total > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={[...rows]}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
            >
              <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis {...axisProps} type="number" tickFormatter={(v: number) => formatInt(v)} />
              <YAxis {...axisProps} type="category" dataKey="band" width={72} />
              <Tooltip cursor={tooltipCursor} content={<StructureTooltip />} />
              <Bar
                dataKey="appartement"
                stackId="type"
                fill={chartColors.accent}
                radius={[2, 0, 0, 2]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="maison"
                stackId="type"
                fill={chartColors.info}
                radius={[0, 2, 2, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
          <MiniLegend />
        </>
      ) : (
        <EmptyState message="Élargissez les filtres pour lire la structure du marché." />
      )}
    </Card>
  );
}
