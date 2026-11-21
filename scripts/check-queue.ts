/** Verificação ponta a ponta da fila: enfileira system.ping e aguarda o worker concluir. Uso: npx tsx scripts/check-queue.ts */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { enqueueJob, getQueue } from "@/lib/jobs/queue";

async function main() {
  const job = await enqueueJob({ operation: "system.ping", clientId: null, createdBy: null, idempotencyKey: `check:${Date.now()}` });
  for (let i = 0; i < 30; i++) {
    const r = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } });
    if (r.status === "COMPLETED" || r.status === "FAILED") {
      console.log(`[check-queue] job ${r.status} em ~${i}s`, JSON.stringify(r.resultJson ?? r.errorMessage));
      process.exitCode = r.status === "COMPLETED" ? 0 : 1;
      return;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  console.log("[check-queue] timeout: worker não processou em 30s (worker está rodando?)");
  process.exitCode = 1;
}
main().finally(async () => {
  await Promise.race([Promise.all([getQueue().close(), prisma.$disconnect()]), new Promise((r) => setTimeout(r, 3000))]);
  process.exit();
});
