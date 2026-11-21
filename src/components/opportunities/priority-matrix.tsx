import Link from "next/link";
import { formatCode } from "@/features/opportunities/scoring";

type Point = { id: string; number: number; title: string; impactScore: number; effortScore: number; status: string; criticalRisk: boolean };

const FILL: Record<string, string> = { APPROVED: "#166534", LINKED_TO_PROJECT: "#166534", REVIEWED: "#1e40af", DETECTED: "#64748b", DISMISSED: "#cbd5e1" };

/** Matriz Impacto × Esforço (1–5). Cada ponto é um link para selecionar a oportunidade. */
export function PriorityMatrix({ items, selectedId, hrefFor }: { items: Point[]; selectedId?: string; hrefFor: (id: string) => string }) {
  const W = 420, H = 300, pad = 36;
  const x = (e: number) => pad + ((e - 0.5) / 5) * (W - pad - 12);
  const y = (i: number) => H - pad - ((i - 0.5) / 5) * (H - pad - 12);
  const seen = new Map<string, number>();
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Matriz de impacto por esforço" className="w-full">
        <rect x={pad} y={12} width={(W - pad - 12) / 2} height={(H - pad - 12) / 2} fill="#dcfce7" opacity="0.45" />
        <rect x={pad + (W - pad - 12) / 2} y={12} width={(W - pad - 12) / 2} height={(H - pad - 12) / 2} fill="#dbeafe" opacity="0.45" />
        <rect x={pad} y={12 + (H - pad - 12) / 2} width={(W - pad - 12) / 2} height={(H - pad - 12) / 2} fill="#f1f5f9" opacity="0.8" />
        <rect x={pad + (W - pad - 12) / 2} y={12 + (H - pad - 12) / 2} width={(W - pad - 12) / 2} height={(H - pad - 12) / 2} fill="#fee2e2" opacity="0.35" />
        <g fontSize="11" fontWeight="700" fill="#475569">
          <text x={pad + 8} y={28}>Ganhos rápidos</text>
          <text x={W - 20} y={28} textAnchor="end">Estruturantes</text>
          <text x={pad + 8} y={H - pad - 8}>Ajustes</text>
          <text x={W - 20} y={H - pad - 8} textAnchor="end">Reavaliar</text>
        </g>
        <line x1={pad} y1={H - pad} x2={W - 12} y2={H - pad} stroke="#cbd5e1" />
        <line x1={pad} y1={12} x2={pad} y2={H - pad} stroke="#cbd5e1" />
        <g fontSize="10" fill="#64748b">
          {[1, 2, 3, 4, 5].map((n) => (
            <g key={n}>
              <text x={x(n)} y={H - pad + 14} textAnchor="middle">{n}</text>
              <text x={pad - 10} y={y(n) + 3} textAnchor="middle">{n}</text>
            </g>
          ))}
          <text x={(W + pad) / 2} y={H - 4} textAnchor="middle" fontWeight="700">Esforço →</text>
          <text x={10} y={(H - pad) / 2} textAnchor="middle" fontWeight="700" transform={`rotate(-90 10 ${(H - pad) / 2})`}>Impacto →</text>
        </g>
        {items.map((o) => {
          const key = `${o.impactScore}:${o.effortScore}`;
          const k = seen.get(key) ?? 0;
          seen.set(key, k + 1);
          const cx = x(o.effortScore) + (k % 3) * 14 - (k > 0 ? 7 : 0);
          const cy = y(o.impactScore) - Math.floor(k / 3) * 14;
          const sel = o.id === selectedId;
          return (
            <Link key={o.id} href={hrefFor(o.id)} aria-label={`${formatCode(o.number)}: ${o.title}`}>
              <g>
                <circle cx={cx} cy={cy} r={sel ? 13 : 11} fill={FILL[o.status] ?? "#64748b"} stroke={sel ? "#d9a441" : o.criticalRisk ? "#991b1b" : "#fff"} strokeWidth={sel || o.criticalRisk ? 3 : 1.5} />
                <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="9" fontWeight="800" fill={o.status === "DISMISSED" ? "#334155" : "#fff"}>{String(o.number).padStart(2, "0")}</text>
              </g>
            </Link>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-3 text-xs text-text-muted">
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-ok" aria-hidden="true" /> Aprovada / em projeto</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-info" aria-hidden="true" /> Revisada</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-text-subtle" aria-hidden="true" /> Detectada</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border-2 border-amber" aria-hidden="true" /> Selecionada</span>
        <span className="flex items-center gap-1"><span className="size-2.5 rounded-full border-2 border-err" aria-hidden="true" /> Risco crítico</span>
      </figcaption>
    </figure>
  );
}
