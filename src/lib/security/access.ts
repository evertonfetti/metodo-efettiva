import { prisma } from "@/lib/db";
import { AppError, forbidden, notFound } from "@/lib/errors";
import type { SessionUser } from "@/features/auth/service";
import type { Prisma } from "@/generated/prisma/client";

export type AccessMode = "VIEW" | "EDIT";

/** Filtro Prisma de clientes visíveis ao usuário (negar por padrão). */
export function accessibleClientsWhere(user: SessionUser): Prisma.ClientWhereInput {
  const base: Prisma.ClientWhereInput = { deletedAt: null };
  if (user.role === "OWNER") return base;
  return { ...base, OR: [{ ownerUserId: user.id }, { access: { some: { userId: user.id } } }] };
}

/**
 * Verifica no servidor se o usuário pode acessar o cliente no modo pedido.
 * Cliente inexistente ou não autorizado responde igual (404) para não revelar existência.
 */
export async function assertClientAccess(user: SessionUser, clientId: string, mode: AccessMode = "VIEW") {
  if (!isUuid(clientId)) throw notFound("Cliente");
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...accessibleClientsWhere(user) },
    include: { access: { where: { userId: user.id } } },
  });
  if (!client) throw notFound("Cliente");

  if (mode === "EDIT") {
    if (user.role === "VIEWER") throw forbidden();
    if (user.role === "CONSULTANT" && client.ownerUserId !== user.id) {
      const perm = client.access[0]?.permission;
      if (perm !== "EDIT") throw forbidden();
    }
  }
  return client;
}

export function assertRole(user: SessionUser, ...roles: SessionUser["role"][]) {
  if (!roles.includes(user.role)) throw forbidden();
}

export function assertCanEdit(user: SessionUser) {
  if (user.role === "VIEWER") throw new AppError("FORBIDDEN", "Perfil somente leitura.");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);
