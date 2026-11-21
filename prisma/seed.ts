/**
 * Seeds idempotentes (podem rodar a cada deploy sem duplicar):
 * questionário-base + regras condicionais; catálogo de processos (Fase 2); DEMO opcional.
 */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { seedQuestionnaire } from "@/features/assessments/seed";
import { seedProcesses } from "@/features/processes/seed";

async function main() {
  const q = await seedQuestionnaire(prisma);
  console.log(`[seed] questionário: ${q.totalQuestions} perguntas (${q.questionsCreated} novas), ${q.rulesCreated} regras novas`);
  const p = await seedProcesses(prisma);
  console.log(`[seed] processos: ${p.total} no catálogo (${p.created} novos), ${p.full} fichas completas (${p.sheetsApplied} aplicadas agora)`);
}

main()
  .catch((err) => {
    console.error("[seed] falhou:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
