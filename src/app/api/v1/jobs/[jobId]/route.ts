import { apiRoute } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { assertClientAccess, assertRole, isUuid } from "@/lib/security/access";

type P = { jobId: string };
/** Progresso de job: job de cliente exige acesso ao cliente; job de sistema só para OWNER. */
export const GET = apiRoute<P>(async ({ user, params }) => {
  if (!isUuid(params.jobId)) throw notFound("Job");
  const job = await prisma.backgroundJob.findUnique({ where: { id: params.jobId }, select: { id: true, clientId: true, operation: true, status: true, progress: true, errorMessage: true, createdAt: true, finishedAt: true } });
  if (!job) throw notFound("Job");
  if (job.clientId) await assertClientAccess(user, job.clientId, "VIEW");
  else assertRole(user, "OWNER");
  return job;
});
