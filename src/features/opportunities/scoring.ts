/** Priorização auxiliar (seção 7.3): I × C ÷ E, entradas inteiras 1–5, máximo 25. */
export function priorityScore(impact: number, confidence: number, effort: number): number {
  for (const v of [impact, confidence, effort]) if (!Number.isInteger(v) || v < 1 || v > 5) throw new RangeError("Escala 1–5");
  return Math.round(((impact * confidence) / effort) * 100) / 100;
}

type Sortable = { criticalRisk: boolean; status: string; priorityScore: number | { toString(): string }; number: number };

/** Risco crítico no topo independentemente do score; descartadas por último; depois score desc. */
export function sortOpportunities<T extends Sortable>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(b.criticalRisk) - Number(a.criticalRisk) ||
      Number(a.status === "DISMISSED") - Number(b.status === "DISMISSED") ||
      Number(b.priorityScore) - Number(a.priorityScore) ||
      a.number - b.number,
  );
}

/** Quadrante da matriz Impacto × Esforço. */
export function quadrant(impact: number, effort: number) {
  const hi = impact >= 3, easy = effort <= 3;
  if (hi && easy) return "Ganhos rápidos";
  if (hi) return "Estruturantes";
  if (easy) return "Ajustes";
  return "Reavaliar";
}

export const OPPORTUNITY_TRANSITIONS: Record<string, string[]> = {
  DETECTED: ["REVIEWED", "DISMISSED"],
  REVIEWED: ["APPROVED", "DISMISSED"],
  APPROVED: ["REVIEWED", "DISMISSED"],
  DISMISSED: ["DETECTED"],
  LINKED_TO_PROJECT: [],
};

/** Transições que exigem motivo registrado (descarte, reabertura e retirada de aprovação). */
export function transitionNeedsReason(from: string, to: string) {
  return to === "DISMISSED" || from === "DISMISSED" || (from === "APPROVED" && to === "REVIEWED");
}

export const formatCode = (n: number) => `O-${String(n).padStart(2, "0")}`;
