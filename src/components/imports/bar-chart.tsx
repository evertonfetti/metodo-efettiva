import { formatBRL, formatShortDay } from "@/lib/format";

/** Série mensal em barras (SVG puro, valores vindos dos snapshots do backend). */
export function MonthlyBars({ points, caption }: { points: { start: Date; value: number | null }[]; caption: string }) {
  if (!points.length) return null;
  const max = Math.max(...points.map((p) => p.value ?? 0), 1);
  const W = 720, H = 200, pad = 28, bw = (W - pad * 2) / points.length;
  const month = (d: Date) => new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(d);
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H + 30}`} role="img" aria-label={caption} className="w-full">
        <line x1={pad} y1={H} x2={W - pad} y2={H} stroke="#cbd5e1" />
        {points.map((p, i) => {
          const h = p.value == null ? 0 : (Math.max(p.value, 0) / max) * (H - 20);
          return (
            <g key={i}>
              <rect x={pad + i * bw + 3} y={H - h} width={Math.max(bw - 6, 2)} height={h} rx="2" fill="#031951">
                <title>{`${month(p.start)}: ${p.value == null ? "Indisponível" : formatBRL(p.value)}`}</title>
              </rect>
              {points.length <= 12 || i % 2 === 0 ? <text x={pad + i * bw + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="#64748b">{month(p.start)}</text> : null}
            </g>
          );
        })}
        <text x={pad} y={12} fontSize="11" fill="#64748b">máx. {formatBRL(max)}</text>
      </svg>
      <figcaption className="text-xs text-text-subtle">{caption}{points.length ? ` · ${formatShortDay(points[0]!.start)} a ${formatShortDay(points.at(-1)!.start)}` : ""}</figcaption>
    </figure>
  );
}
