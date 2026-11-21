/** Regras puras de status de projeto, processo implantado e tarefa (RF-075/076, seção 5.6). */

export const PROJECT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["ACTIVE", "DRAFT", "CANCELLED"],
  ACTIVE: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["ACTIVE", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const PROCESS_STATUSES = ["PLANNED", "IN_PROGRESS", "PILOT", "ACTIVE", "VALIDATED", "SUSTAINED", "BLOCKED", "CANCELLED"] as const;
export type ProcessStatus = (typeof PROCESS_STATUSES)[number];

export type ValidationRecord = {
  indicatorsChecked?: boolean;
  indicatorsNote?: string;
  clientOwnerTrained?: boolean;
  auditDate?: string; // AAAA-MM-DD
  auditNote?: string;
};

export type ProcessFacts = {
  status: ProcessStatus;
  tasksTotal: number;
  tasksOpen: number; // não concluídas
  evidenceCount: number;
  ownerName: string | null;
  validatedAt: Date | null;
};

/**
 * Critérios explícitos (RF-076):
 * - VALIDATED: processo executado (tarefas vinculadas todas concluídas) + indicadores verificados (nota) + ≥ 1 evidência;
 * - SUSTAINED: estar VALIDATED + responsável do cliente nomeado e treinado + auditoria posterior à validação.
 * Retorna a lista de pendências (vazia = permitido).
 */
export function processTransitionIssues(facts: ProcessFacts, to: ProcessStatus, v: ValidationRecord, reason?: string | null): string[] {
  const issues: string[] = [];
  if (facts.status === to) return ["O processo já está neste status."];
  if (facts.status === "CANCELLED" && to !== "PLANNED") issues.push("Processo cancelado só pode voltar para Planejado.");
  if ((to === "BLOCKED" || to === "CANCELLED") && !reason?.trim()) issues.push("Informe o motivo.");
  if (to === "VALIDATED") {
    if (facts.tasksTotal === 0) issues.push("Nenhuma tarefa vinculada: não há como comprovar a execução.");
    else if (facts.tasksOpen > 0) issues.push(`Processo não executado por completo: ${facts.tasksOpen} tarefa(s) vinculada(s) em aberto.`);
    if (!v.indicatorsChecked || !v.indicatorsNote?.trim()) issues.push("Confirme os indicadores verificados e descreva o resultado.");
    if (facts.evidenceCount === 0) issues.push("Registre ao menos uma evidência de execução.");
  }
  if (to === "SUSTAINED") {
    if (facts.status !== "VALIDATED") issues.push("Só um processo Validado pode ser marcado como Sustentado.");
    if (!facts.ownerName?.trim()) issues.push("Informe o responsável do cliente pelo processo.");
    if (!v.clientOwnerTrained) issues.push("Confirme que o responsável do cliente foi treinado.");
    const audit = v.auditDate ? new Date(`${v.auditDate}T00:00:00Z`) : null;
    if (!audit || Number.isNaN(audit.getTime())) issues.push("Informe a data da auditoria posterior.");
    else if (facts.validatedAt && audit.getTime() < Date.UTC(facts.validatedAt.getUTCFullYear(), facts.validatedAt.getUTCMonth(), facts.validatedAt.getUTCDate()))
      issues.push("A auditoria precisa ser posterior à validação.");
    if (!v.auditNote?.trim()) issues.push("Descreva o resultado da auditoria.");
  }
  return issues;
}

/** Tarefa vencida: prazo antes de hoje e não concluída. Retorna dias de atraso ou 0. */
export function overdueDays(due: Date | null, status: string, today: Date): number {
  if (!due || status === "DONE") return 0;
  const d = Math.round((today.getTime() - due.getTime()) / 86_400_000);
  return d > 0 ? d : 0;
}
