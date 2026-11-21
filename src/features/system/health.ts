import { prisma } from "@/lib/db";
import { getQueue } from "@/lib/jobs/queue";

export type HealthReport = {
  status: "ok" | "degraded";
  database: { ok: boolean; latencyMs?: number; error?: string };
  redis: { ok: boolean; latencyMs?: number; error?: string };
  checkedAt: string;
};

async function timed<T>(fn: () => Promise<T>) {
  const t = Date.now();
  await fn();
  return Date.now() - t;
}

/** Verifica banco e Redis. Mensagens de erro curtas, sem detalhes de conexão. */
export async function checkHealth(): Promise<HealthReport> {
  const database = await timed(() => prisma.$queryRaw`SELECT 1`)
    .then((latencyMs) => ({ ok: true, latencyMs }))
    .catch(() => ({ ok: false, error: "banco indisponível" }));
  const redis = await timed(async () => {
    // Consulta real ao Redis via BullMQ (API independente do backend), com timeout curto.
    await Promise.race([getQueue().getJobCounts("failed"), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000))]);
  })
    .then((latencyMs) => ({ ok: true, latencyMs }))
    .catch(() => ({ ok: false, error: "redis indisponível" }));
  return { status: database.ok && redis.ok ? "ok" : "degraded", database, redis, checkedAt: new Date().toISOString() };
}
