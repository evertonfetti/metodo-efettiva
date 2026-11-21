import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { QUEUE_NAME, createRedis } from "@/lib/jobs/queue";
import { handlers } from "@/worker/handlers";
import { recoverStuckJobs } from "@/lib/jobs/recovery";

type JobData = { jobId: string; clientId: string | null };

/**
 * Worker: recebe apenas IDs, recarrega o job do banco e confere o clientId
 * antes de executar. Estados: QUEUED → RUNNING → COMPLETED/FAILED.
 */
async function processJob(job: Job<JobData>) {
  const record = await prisma.backgroundJob.findUnique({ where: { id: job.data.jobId } });
  if (!record) throw new Error("Job não encontrado no banco");
  if (record.clientId !== job.data.clientId) throw new Error("clientId divergente entre fila e banco");
  if (record.status === "COMPLETED" || record.status === "CANCELLED") return;

  const handler = handlers[record.operation];
  if (!handler) throw new Error(`Operação desconhecida: ${record.operation}`);

  await prisma.backgroundJob.update({
    where: { id: record.id },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });

  const setProgress = (p: number) =>
    prisma.backgroundJob.update({ where: { id: record.id }, data: { progress: Math.max(0, Math.min(100, Math.round(p))) } });

  try {
    const result = await handler({ job: record, setProgress });
    await prisma.backgroundJob.update({
      where: { id: record.id },
      data: { status: "COMPLETED", progress: 100, finishedAt: new Date(), resultJson: result ?? undefined, errorMessage: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const final = (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);
    await prisma.backgroundJob.update({
      where: { id: record.id },
      data: { status: final ? "FAILED" : "QUEUED", errorMessage: message.slice(0, 500), finishedAt: final ? new Date() : null },
    });
    throw err;
  }
}

const worker = new Worker<JobData>(QUEUE_NAME, processJob, { connection: createRedis(), concurrency: 2 });

worker.on("completed", (job) => logger.info({ jobId: job.data.jobId, op: job.name }, "job concluído"));
worker.on("failed", (job, err) => logger.warn({ jobId: job?.data.jobId, op: job?.name, err: err.message }, "job falhou"));
worker.on("ready", () => logger.info({ queue: QUEUE_NAME }, "worker pronto"));

// Recupera jobs presos ao iniciar e a cada 5 minutos.
const recover = () => recoverStuckJobs().catch((err) => logger.error({ err: err instanceof Error ? err.message : String(err) }, "falha na recuperação de jobs"));
void recover();
const recoveryTimer = setInterval(recover, 5 * 60_000);

async function shutdown() {
  logger.info("encerrando worker");
  clearInterval(recoveryTimer);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
