/** Regras puras de acompanhamento (seção 7 e 7.4). */

export type Classification = "OBSERVED" | "ESTIMATED" | "TARGET" | "NOT_MEASURED";
export const CLASS_LABEL: Record<Classification, string> = { OBSERVED: "Observado", ESTIMATED: "Estimado", TARGET: "Meta", NOT_MEASURED: "Não mensurado" };

/** Variação absoluta e % (null se faltar valor; % null com baseline zero). */
export function variation(base: number | null, current: number | null) {
  if (base == null || current == null) return { abs: null, pct: null };
  return { abs: Math.round((current - base) * 100) / 100, pct: base === 0 ? null : Math.round(((current - base) / Math.abs(base)) * 10000) / 100 };
}

/** ON_TIME_TASK_RATE: concluídas até o prazo ÷ concluídas com prazo, no período. */
export function onTimeTaskRate(tasks: { status: string; dueDate: Date | null; completedAt: Date | null }[], period?: { start: Date; end: Date }) {
  const done = tasks.filter((t) => t.status === "DONE" && t.dueDate && t.completedAt && (!period || (t.completedAt >= period.start && t.completedAt <= new Date(period.end.getTime() + 86_399_999))));
  if (!done.length) return null;
  const onTime = done.filter((t) => t.completedAt!.toISOString().slice(0, 10) <= t.dueDate!.toISOString().slice(0, 10)).length;
  return Math.round((onTime / done.length) * 10000) / 100;
}

/** PROCESS_ADOPTION_RATE: última auditoria de cada processo; Σ conformes ÷ Σ aplicáveis. */
export function adoptionRate(audits: { projectProcessId: string; auditedAt: Date; itemsChecked: number; itemsConforming: number }[]) {
  const latest = new Map<string, (typeof audits)[number]>();
  for (const a of audits) {
    const cur = latest.get(a.projectProcessId);
    if (!cur || a.auditedAt > cur.auditedAt) latest.set(a.projectProcessId, a);
  }
  const list = [...latest.values()];
  const checked = list.reduce((t, a) => t + a.itemsChecked, 0);
  if (!checked) return null;
  return Math.round((list.reduce((t, a) => t + a.itemsConforming, 0) / checked) * 10000) / 100;
}

export const NON_CAUSALITY = "A evolução observada ocorreu durante o projeto, mas não constitui comprovação isolada de que foi causada pela consultoria.";
