type Series = { data: number[]; color?: string; label: string };

type Props = {
  series: Series[];
  height?: number;
  yMax?: number;
  yMin?: number;
  xLabel?: string;
  yLabel?: string;
};

export default function LineChart({ series, height = 220, yMax, yMin, xLabel, yLabel }: Props) {
  const width = 600;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const allValues = series.flatMap((s) => s.data);
  const maxTemp = yMax ?? Math.max(...allValues) * 1.05;
  const min = yMin ?? Math.min(...allValues, 0);
  const max = Math.max(maxTemp, min + 1); // Fallback to prevent divide by zero
  const len = series[0]?.data.length ?? 0;

  const toPath = (data: number[]) => {
    if (!data.length) return '';
    return data
      .map((v, i) => {
        const x = pad.l + (i / (len - 1 || 1)) * (width - pad.l - pad.r);
        const y = pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  };

  const gridY = 4;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      {[...Array(gridY + 1)].map((_, i) => {
        const y = pad.t + (i / gridY) * (height - pad.t - pad.b);
        const v = max - (i / gridY) * (max - min);
        return (
          <g key={i}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={y}
              y2={y}
              className="stroke-neutral-200 dark:stroke-neutral-800"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <text
              x={pad.l - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-neutral-400 dark:fill-neutral-600"
              style={{ fontSize: 9 }}
            >
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      {series.map((s, idx) => (
        <g key={idx}>
          <path
            d={toPath(s.data)}
            fill="none"
            stroke={s.color ?? 'currentColor'}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-900 dark:text-white"
          />
        </g>
      ))}
      {xLabel && (
        <text
          x={(width + pad.l - pad.r) / 2}
          y={height - 4}
          textAnchor="middle"
          className="fill-neutral-400 dark:fill-neutral-600"
          style={{ fontSize: 9 }}
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={10}
          y={pad.t + 4}
          className="fill-neutral-400 dark:fill-neutral-600"
          style={{ fontSize: 9 }}
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
}
