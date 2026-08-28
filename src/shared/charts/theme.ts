/** Thème Recharts aligné sur les tokens Tailwind (src/index.css). */
export const chartColors = {
  accent: '#34d399',
  info: '#60a5fa',
  warn: '#fbbf24',
  danger: '#fb7185',
  muted: '#5d6780',
  grid: '#1c2233',
  axis: '#5d6780',
  text: '#98a2b8',
  series: ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f97316'] as const,
} as const;

export const axisProps = {
  stroke: chartColors.axis,
  tick: { fill: chartColors.text, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = {
  stroke: chartColors.grid,
  strokeDasharray: '3 3',
  vertical: false,
} as const;

export const tooltipCursor = { stroke: chartColors.muted, strokeWidth: 1, strokeDasharray: '4 4' };

export const seriesColor = (index: number): string =>
  chartColors.series[index % chartColors.series.length] ?? chartColors.accent;
