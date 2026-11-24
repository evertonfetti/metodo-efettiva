import { formatMetricValue } from "@/features/documents/generate";

/** Série de um KPI (SVG): baseline tracejado + snapshots; unidade e fonte na legenda. */
export function KpiLine({ label, unit, baseline, points, source }: { label: string; unit: string; baseline: number | null; points: { date: Date; value: number | null }[]; source: string }) {
  const vals = [...points.map((p) => p.value).filter((v): v is number => v != null), ...(baseline != null ? [baseline] : [])];
  if (!vals.length) return null;
  const W = 300, H = 120, pad = 24;
  const lo = Math.min(...vals), hi = Math.max(...vals), padV = (hi - lo || Math.abs(hi) || 1) * 0.15;
  const min = lo - padV, max = hi + padV;
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const x = (i: number) => pad + (points.length <= 1 ? (W - pad * 2) / 2 : (i / (points.length - 1)) * (W - pad * 2));
  const pts = points.map((p, i) => (p.value == null ? null : `${x(i)},${y(p.value)}`)).filter(Boolean).join(" ");
  const fmt = (d: Date) => d.toISOString().slice(5, 10).split("-").reverse().join("/");
  const unitLabel = unit === "BRL" ? "R$" : unit === "PERCENT" ? "%" : unit === "DAYS" ? "dias" : "quantidade";
  return (
    <figure className="flex flex-col gap-1 rounded-[8px] border border-border p-3">
      <figcaption className="text-sm font-bold text-navy">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolução de ${label}`} className="w-full">
        {baseline != null ? <line x1={pad} x2={W - pad} y1={y(baseline)} y2={y(baseline)} stroke="#FDAF13" strokeDasharray="4 3" strokeWidth="2" /> : null}
        <polyline points={pts} fill="none" stroke="#031951" strokeWidth="2" />
        {points.map((p, i) => (p.value == null ? null : <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" fill="#031951"><title>{`${fmt(p.date)}: ${formatMetricValue({ value: p.value, unit })}`}</title></circle>))}
        {points.map((p, i) => <text key={`t${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">{fmt(p.date)}</text>)}
      </svg>
      <p className="text-xs text-text-subtle">Unidade: {unitLabel} · <span className="font-semibold text-amber-900">— — baseline</span> · Fonte: {source}</p>
    </figure>
  );
}
