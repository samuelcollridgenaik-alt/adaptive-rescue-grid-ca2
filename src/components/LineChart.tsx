import { useId } from "react";

interface LineChartProps {
  title: string;
  data: number[];
  color: string;
  suffix?: string;
  emptyMessage?: string;
}

export function LineChart({ title, data, color, suffix = "", emptyMessage = "Train an experiment to populate this chart." }: LineChartProps) {
  const gradientId = useId().replace(/:/g, "");
  if (!data.length) {
    return (
      <div className="panel min-h-[218px] p-4">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <div className="flex h-40 items-center justify-center text-center text-sm text-[#8ea2c4]">{emptyMessage}</div>
      </div>
    );
  }
  const width = 480;
  const height = 170;
  const padding = 14;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(max - min, 1);
  const points = data.map((value, index) => {
    const x = padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const last = data[data.length - 1];
  return (
    <div className="panel min-h-[218px] p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <span className="metric-value text-sm font-bold" style={{ color }}>{format(last)}{suffix}</span>
      </div>
      <svg className="h-40 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, latest value ${format(last)}${suffix}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.30" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.5, 0.8].map((ratio) => <line key={ratio} x1={padding} x2={width - padding} y1={height * ratio} y2={height * ratio} stroke="#1e365a" strokeDasharray="4 5" />)}
        <polygon points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} fill={`url(#${gradientId})`} />
        <polyline points={points} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      </svg>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.14em] text-[#7186aa]"><span>Episode 1</span><span>Episode {data.length}</span></div>
    </div>
  );
}

function format(value: number): string {
  return Number.isFinite(value) ? (Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2)) : "—";
}
