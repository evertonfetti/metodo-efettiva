import { WINDOW_LABELS, planWindows } from "@/features/projects/plan";
import { diffDays } from "@/lib/dates";
import { formatShortDay } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Cronograma 30/60/90 com marcador de hoje e progresso de tarefas por janela. */
export function Timeline306090({ start, target, today, tasks }: { start: Date; target: Date; today: Date; tasks: { window: number | null; status: string }[] }) {
  const windows = planWindows(start, target);
  const day = diffDays(start, today) + 1;
  const total = diffDays(start, target) + 1;
  const pct = Math.min(100, Math.max(0, ((day - 1) / Math.max(total - 1, 1)) * 100));
  const caption = day < 1 ? `começa em ${formatShortDay(start)}` : day > total ? "prazo encerrado" : `hoje é o dia ${day} de ${total}`;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-muted">Cronograma 30/60/90 · {caption}</p>
      <div className="relative">
        <ol className="grid grid-cols-3 gap-2">
          {windows.map((w) => {
            const t = tasks.filter((x) => x.window === w.window);
            const done = t.filter((x) => x.status === "DONE").length;
            const current = today >= w.start && today <= w.end;
            const label = WINDOW_LABELS[w.window];
            return (
              <li key={w.window} className={cn("flex flex-col gap-1 rounded-[8px] border p-3", current ? "border-navy bg-surface-muted" : "border-border")}>
                <span className="text-xs font-bold text-text-subtle">Dias {diffDays(start, w.start) + 1}–{diffDays(start, w.end) + 1} · {formatShortDay(w.start)} a {formatShortDay(w.end)}</span>
                <span className="font-extrabold text-navy">{label.title}</span>
                <span className="text-xs text-text-muted">{label.summary}</span>
                <span className="text-xs font-semibold text-text-muted">{t.length ? `${done} de ${t.length} tarefas concluídas` : "Sem tarefas do plano"}</span>
              </li>
            );
          })}
        </ol>
        {day >= 1 && day <= total ? <div aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 bg-amber" style={{ left: `${pct}%` }} /> : null}
      </div>
    </div>
  );
}
