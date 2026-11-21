import { cn } from "@/lib/utils";
import type { JourneyPhase } from "@/features/clients/journey";

const LABEL = { DONE: "✓ CONCLUÍDA", CURRENT: "● EM ANDAMENTO", NOT_STARTED: "○ NÃO INICIADA" } as const;

/** Faixa das 5 fases do método (UI_LAYOUT §4). Nomes e gates vêm de configuração. */
export function MethodJourney({ phases }: { phases: JourneyPhase[] }) {
  return (
    <section aria-label="Jornada do método EFETTIVA" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {phases.map((p, i) => (
        <div
          key={p.code}
          aria-current={p.state === "CURRENT" ? "step" : undefined}
          className={cn(
            "flex flex-col gap-1 rounded-[12px] border p-3",
            p.state === "CURRENT" && "border-navy bg-navy text-white",
            p.state === "DONE" && "border-ok-bg bg-ok-bg text-ok",
            p.state === "NOT_STARTED" && "border-border bg-surface-sunken text-neutral",
          )}
        >
          <span className={cn("text-[11px] font-extrabold tracking-[0.5px]", p.state === "CURRENT" && "text-amber")}>{LABEL[p.state]}</span>
          <span className="text-sm font-extrabold">{i + 1}. {p.name}</span>
          <span className={cn("text-xs leading-snug", p.state === "CURRENT" ? "text-on-navy-item" : "opacity-90")}>{p.gate}</span>
        </div>
      ))}
    </section>
  );
}
