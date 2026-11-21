import { prisma } from "@/lib/db";
import { getSetting } from "@/features/settings/service";

export type PhaseState = "DONE" | "CURRENT" | "NOT_STARTED";
export type JourneyPhase = { code: string; name: string; gate: string; state: PhaseState };

/**
 * Situação do cliente nas 5 fases do método (nomes/gates vindos de Configurações).
 * Regras objetivas a partir dos dados existentes; fases seguintes ganham critérios conforme os módulos entram.
 */
export async function getClientJourney(clientId: string): Promise<JourneyPhase[]> {
  const [phases, finalized, anyAssessment] = await Promise.all([
    getSetting("methodPhases"),
    prisma.assessment.count({ where: { clientId, status: "FINALIZED" } }),
    prisma.assessment.count({ where: { clientId } }),
  ]);
  const states: PhaseState[] = phases.map(() => "NOT_STARTED");
  if (finalized > 0) {
    states[0] = "DONE";
    states[1] = "CURRENT";
  } else if (anyAssessment > 0) {
    states[0] = "CURRENT";
  }
  return phases.map((p, i) => ({ ...p, state: states[i]! }));
}
