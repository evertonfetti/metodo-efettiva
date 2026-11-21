import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getQueue } from "./queue";

/** Estados "em andamento" dos registros de domínio que acompanham um job (precisam voltar junto com ele). */
async function resetDomainState(job: { id: string; operation: string; payloadJson: unknown }) {
  const p = (job.payloadJson ?? {}) as { exportId?: string; batchId?: string; generationId?: string };
  if (job.operation === "document.export" && p.exportId) await prisma.documentExport.updateMany({ where: { id: p.exportId, status: { in: ["RUNNING", "FAILED"] } }, data: { status: "QUEUED", errorMessage: null } });
  if (job.operation === "ai.generate" && p.generationId) await prisma.aiGeneration.updateMany({ where: { id: p.generationId, status: { in: ["RUNNING", "FAILED"] } }, data: { status: "QUEUED", errorCode: null, errorMessage: null } });
  if (job.operation === "import.commit" && p.batchId) await prisma.importBatch.updateMany({ where: { id: p.batchId, status: { in: ["IMPORTING", "FAILED"] } }, data: { status: "IMPORTING", errorMessage: null } });
}

async function requeue(job: { id: string; clientId: string | null; attempts: number; operation: string; payloadJson: unknown }) {
  await resetDomainState(job);
  await prisma.backgroundJob.update({ where: { id: job.id }, data: { status: "QUEUED", progress: 0, errorMessage: null, finishedAt: null } });
  await getQueue().add(job.operation, { jobId: job.id, clientId: job.clientId }, { jobId: `${job.id}-r${Date.now()}`, attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 500, removeOnFail: 1000 });
}

/**
 * Recuperação (RF-114/4.4): jobs presos em RUNNING (worker caiu) há mais de `staleMinutes` voltam para a fila
 * até `maxAttempts`; depois disso falham com motivo. Os handlers são idempotentes, então reprocessar não duplica.
 */
export async function recoverStuckJobs(staleMinutes = 15, maxAttempts = 5) {
  const stale = await prisma.backgroundJob.findMany({ where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - staleMinutes * 60_000) } } });
  let requeued = 0, failed = 0;
  for (const j of stale) {
    if (j.attempts >= maxAttempts) {
      await prisma.backgroundJob.update({ where: { id: j.id }, data: { status: "FAILED", errorMessage: "Interrompido repetidamente (worker reiniciado); reprocessar manualmente.", finishedAt: new Date() } });
      failed++;
    } else {
      await requeue(j);
      requeued++;
    }
  }
  if (stale.length) logger.warn({ requeued, failed }, "jobs presos recuperados");
  return { requeued, failed };
}

/** Reprocessar manualmente um job que falhou (mesmo registro, sem duplicar efeitos: handlers idempotentes). */
export async function retryFailedJob(jobId: string) {
  const j = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!j || j.status !== "FAILED") return false;
  await requeue(j);
  return true;
}
