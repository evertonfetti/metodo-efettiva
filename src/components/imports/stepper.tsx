import { cn } from "@/lib/utils";

const STEPS = ["Tipo", "Arquivo", "Mapeamento", "Prévia e validação", "Confirmação"];

export function ImportStepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Etapas da importação">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={s} aria-current={state === "current" ? "step" : undefined} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold", state === "current" ? "border-navy bg-navy text-white" : state === "done" ? "border-ok/30 bg-ok-bg text-ok" : "border-border bg-surface text-text-subtle")}>
            <span aria-hidden="true">{state === "done" ? "✓" : n}</span> {s}
          </li>
        );
      })}
    </ol>
  );
}
