import type { BackgroundJob, Prisma } from "@/generated/prisma/client";

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
};
