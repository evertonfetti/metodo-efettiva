import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { dummyPasswordHash, verifyPassword } from "@/lib/security/password";
import type { UserRole } from "@/generated/prisma/enums";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export type SessionUser = { id: string; email: string; name: string; role: UserRole };

export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido.").transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, "Informe a senha.").max(256),
});

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const GENERIC_LOGIN_ERROR = "E-mail ou senha inválidos.";

/**
 * Autentica por e-mail/senha. Bloqueia temporariamente após tentativas excessivas.
 * Retorna o token em claro (só vai para o cookie); no banco fica apenas o hash.
 */
export async function authenticate(input: unknown, userAgent?: string | null) {
  const { email, password } = loginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.active) {
    await verifyPassword(await dummyPasswordHash(), password); // tempo constante aproximado
    await audit({ action: "auth.login_failed", entityType: "User", meta: { reason: "unknown_or_inactive" } });
    throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("RATE_LIMITED", `Acesso bloqueado temporariamente por excesso de tentativas. Tente novamente após ${LOCK_MINUTES} minutos.`);
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    await audit({ actorUserId: user.id, action: lock ? "auth.locked" : "auth.login_failed", entityType: "User", entityId: user.id });
    throw new AppError(lock ? "RATE_LIMITED" : "UNAUTHENTICATED", lock ? `Muitas tentativas. Acesso bloqueado por ${LOCK_MINUTES} minutos.` : GENERIC_LOGIN_ERROR);
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3_600_000);
  await prisma.$transaction([
    prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt, userAgent: userAgent?.slice(0, 200) ?? null } }),
    prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } }),
  ]);
  await audit({ actorUserId: user.id, action: "auth.login", entityType: "User", entityId: user.id });

  return { token, expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role } satisfies SessionUser };
}

/** Valida token de sessão: existente, não revogado, não expirado e usuário ativo. */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) return null;
  // Atualiza "visto por último" no máximo a cada 5 minutos
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  const { id, email, name, role } = session.user;
  return { id, email, name, role };
}

export async function revokeSessionToken(token: string | undefined | null) {
  if (!token) return;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session || session.revokedAt) return;
  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await audit({ actorUserId: session.userId, action: "auth.logout", entityType: "User", entityId: session.userId });
}
