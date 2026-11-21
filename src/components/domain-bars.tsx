import { formatDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DomainBar = { code: string; name: string; score: number | null; coverage: number; answered: number; applicable: number };

/** Barras horizontais 0–5 por área; âmbar abaixo de 2,0; "n/d" tracejado quando não há resposta válida. */
export function DomainBars({ items }: { items: DomainBar[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((d, i) => (
        <li key={d.code} className="grid grid-cols-[minmax(0,210px)_1fr_44px] items-center gap-3 text-sm">
          <span className="truncate font-semibold" title={d.name}>{String(i + 1).padStart(2, "0")} · {d.name}</span>
          <span className="relative h-2.5 rounded-full bg-surface-sunken" aria-hidden="true">
            {d.score === null ? (
              <span className="absolute inset-0 rounded-full border border-dashed border-border-strong" />
            ) : (
              <span className={cn("absolute inset-y-0 left-0 rounded-full", d.score < 2 ? "bg-amber" : "bg-navy")} style={{ width: `${Math.max(2, (d.score / 5) * 100)}%` }} />
            )}
          </span>
          <span className="text-right font-bold" aria-label={d.score === null ? `${d.name}: sem respostas válidas` : `${d.name}: ${formatDecimal(d.score)} de 5`}>
            {d.score === null ? "n/d" : formatDecimal(d.score)}
          </span>
        </li>
      ))}
    </ul>
  );
}
