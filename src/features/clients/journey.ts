import { prisma } from "@/lib/db";
import { getSetting } from "@/features/settings/service";

export type PhaseState = "DONE" | "CURRENT" | "NOT_STARTED";
export type JourneyPhase = { code: string; name: string; gate: string; state: PhaseState };

/**
 * Situação do cliente nas 5 fases do método (nomes/gates vindos de Configurações), por regras objetivas:
 * 1 Diagnosticar: diagnóstico fechado · 2 Ativar: processo em piloto ou além ·
 * 3 Estruturar: processo Validado (execução + indicadores + evidência) ·
 * 4 Escalar e 5 Sustentar: critérios objetivos entram com resultados/baseline (Fase 6) — nunca marcados sem dado.
 */
export async function getClientJourney(clientId: string): Promise<JourneyPhase[]> {
  const [phases, finalized, anyAssessment, piloting, validated] = await Promise.all([
    getSetting("methodPhases"),
    prisma.assessment.count({ where: { clientId, status: "FINALIZED" } }),
    prisma.assessment.count({ where: { clientId } }),
    prisma.projectProcess.count({ where: { clientId, status: { in: ["PILOT", "ACTIVE", "VALIDATED", "SUSTAINED"] } } }),
    prisma.projectProcess.count({ where: { clientId, status: { in: ["VALIDATED", "SUSTAINED"] } } }),
  ]);
  return journeyStates(phases, { finalized, anyAssessment, piloting, validated });
}

export function journeyStates<T>(phases: T[], f: { finalized: number; anyAssessment: number; piloting: number; validated: number }): (T & { state: PhaseState })[] {
  const done = [f.finalized > 0, f.piloting > 0, f.validated > 0, false, false];
  // fases concluídas só contam em sequência (não pular gates)
  let firstOpen = done.findIndex((d) => !d);
  if (firstOpen === -1) firstOpen = done.length;
  const states: PhaseState[] = phases.map((_, i) => (i < firstOpen ? "DONE" : "NOT_STARTED"));
  if (firstOpen < phases.length && (firstOpen > 0 || f.anyAssessment > 0)) states[firstOpen] = "CURRENT";
  return phases.map((p, i) => ({ ...p, state: states[i]! }));
}
