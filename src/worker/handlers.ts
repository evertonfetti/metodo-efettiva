import type { BackgroundJob, Prisma } from "@/generated/prisma/client";
import { runExport } from "@/features/documents/service";
import { runCommit } from "@/features/imports/service";

export type HandlerContext = {
  job: BackgroundJob;
  setProgress: (p: number) => Promise<unknown>;
};

export type JobHandler = (ctx: HandlerContext) => Promise<Prisma.InputJsonValue | void>;

/** Registro de operações executadas pelo worker. Novas fases adicionam handlers aqui. */
export const handlers: Record<string, JobHandler> = {
  /** Verificação ponta a ponta da fila (web → Redis → worker → banco). */
  "system.ping": async ({ setProgress }) => {
    await setProgress(50);
    return { ok: true, at: new Date().toISOString() };
  },
  /** Exportação DOCX/PDF/MD: payload só com o ID; filtro de audiência e clientId revalidados em runExport. */
  "document.export": async ({ job, setProgress }) => {
    const exportId = (job.payloadJson as { exportId?: string } | null)?.exportId;
    if (!exportId) throw new Error("payload sem exportId");
    await setProgress(10);
    return runExport(exportId, job.clientId);
  },
  /** Importação: grava o lote validado de forma idempotente e recalcula os indicadores do cliente. */
  "import.commit": async ({ job, setProgress }) => {
    const batchId = (job.payloadJson as { batchId?: string } | null)?.batchId;
    if (!batchId) throw new Error("payload sem batchId");
    await setProgress(10);
    return runCommit(batchId, job.clientId);
  },
};
