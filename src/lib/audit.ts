import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

type AuditInput = {
  actorUserId?: string | null;
  clientId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  meta?: Prisma.InputJsonValue;
};

const hashOf = (v: unknown) => (v === undefined ? null : createHash("sha256").update(JSON.stringify(v)).digest("hex"));

/** Registra evento de auditoria (sem segredos: guarda só hashes de antes/depois). */
export async function audit(input: AuditInput, tx: Prisma.TransactionClient = prisma) {
  try {
    await tx.auditEvent.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        clientId: input.clientId ?? null,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        action: input.action,
        beforeHash: hashOf(input.before),
        afterHash: hashOf(input.after),
        meta: input.meta,
      },
    });
  } catch (err) {
    // Dentro de transação o erro deve propagar; fora dela, não derrubar a operação principal.
    if (tx !== prisma) throw err;
    logger.error({ err, action: input.action }, "falha ao gravar auditoria");
  }
}
