import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { Prisma } from "@/generated/prisma/client";

export const QUEUE_NAME = "efettiva-jobs";

/**
 * Cria uma conexão ioredis já instanciada (o BullMQ 6 em ESM exige instância, não opções).
 * `maxRetriesPerRequest: null` é obrigatório para workers bloqueantes.
 */
export function createRedis(): Redis {
  return new Redis(env().REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false });
}

const globalForQueue = globalThis as unknown as { efettivaQueue?: Queue };

export function getQueue(): Queue {
  if (!globalForQueue.efettivaQueue) {
    globalForQueue.efettivaQueue = new Queue(QUEUE_NAME, { connection: createRedis() });
  }
  return globalForQueue.efettivaQueue;
}

export type EnqueueInput = {
  operation: string;
  clientId: string | null;
  createdBy: string | null;
  idempotencyKey: string;
  /** Somente IDs e parâmetros — nunca conteúdo sensível (o worker reconsulta o banco). */
  payload?: Prisma.InputJsonValue;
};

/**
 * Registra o job no banco (idempotente por `idempotencyKey`) e o envia ao Redis.
 * Reenvio com a mesma chave devolve o job existente sem duplicar.
 */
export async function enqueueJob(input: EnqueueInput) {
  const existing = await prisma.backgroundJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing && existing.status !== "FAILED" && existing.status !== "CANCELLED") return existing;

  const job = existing
    ? await prisma.backgroundJob.update({
        where: { id: existing.id },
        data: { status: "QUEUED", progress: 0, errorMessage: null, finishedAt: null },
      })
    : await prisma.backgroundJob.create({
        data: {
          operation: input.operation,
          clientId: input.clientId,
          createdBy: input.createdBy,
          idempotencyKey: input.idempotencyKey,
          payloadJson: input.payload,
        },
      });

  await getQueue().add(
    input.operation,
    { jobId: job.id, clientId: job.clientId },
    { jobId: `${job.id}-${job.attempts}`, attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 500, removeOnFail: 1000 },
  );
  return job;
}
