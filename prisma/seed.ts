/**
 * Seeds idempotentes (podem rodar a cada deploy sem duplicar):
 * catálogo de processos, questionário-base e, opcionalmente, dados DEMO.
 * Cada fase acrescenta sua etapa aqui.
 */
import "dotenv/config";
import { prisma } from "@/lib/db";

async function main() {
  console.log("[seed] nada a semear nesta fase.");
}

main()
  .catch((err) => {
    console.error("[seed] falhou:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
