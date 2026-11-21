import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/security/password";
import type { SessionUser } from "@/features/auth/service";
import type { UserRole } from "@/generated/prisma/enums";

/** Remove todos os dados (ordem segura via TRUNCATE CASCADE). */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function createUser(role: UserRole = "CONSULTANT", password = "senha-de-teste-123"): Promise<SessionUser & { password: string }> {
  const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@teste.local`;
  const u = await prisma.user.create({ data: { email, name: `Usuário ${role}`, role, passwordHash: await hashPassword(password) } });
  return { id: u.id, email: u.email, name: u.name, role: u.role, password };
}

export async function createClient(ownerUserId: string, name = "Empresa Teste") {
  return prisma.client.create({ data: { name, industry: "Distribuição", ownerUserId } });
}
