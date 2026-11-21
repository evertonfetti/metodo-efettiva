/**
 * Cria o primeiro usuário OWNER a partir de OWNER_EMAIL / OWNER_NAME / OWNER_PASSWORD.
 * Idempotente: se já existir um OWNER, não faz nada. Nunca há senha padrão no repositório.
 */
import "dotenv/config";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/security/password";
import { audit } from "@/lib/audit";

const schema = z.object({
  OWNER_EMAIL: z.email().transform((v) => v.trim().toLowerCase()),
  OWNER_NAME: z.string().trim().min(2),
  OWNER_PASSWORD: z.string().min(MIN_PASSWORD_LENGTH, `OWNER_PASSWORD precisa de ao menos ${MIN_PASSWORD_LENGTH} caracteres`),
});

async function main() {
  const existing = await prisma.user.count({ where: { role: "OWNER" } });
  if (existing > 0) {
    console.log("[bootstrap-owner] Já existe usuário OWNER — nada a fazer.");
    return;
  }
  if (!process.env.OWNER_EMAIL && !process.env.OWNER_PASSWORD) {
    console.log("[bootstrap-owner] Nenhum OWNER e variáveis OWNER_* ausentes — defina-as no .env e rode novamente.");
    return;
  }
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[bootstrap-owner] Variáveis inválidas:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    process.exitCode = 1;
    return;
  }
  const { OWNER_EMAIL, OWNER_NAME, OWNER_PASSWORD } = parsed.data;
  const user = await prisma.user.create({
    data: { email: OWNER_EMAIL, name: OWNER_NAME, role: "OWNER", passwordHash: await hashPassword(OWNER_PASSWORD) },
  });
  await audit({ actorUserId: user.id, entityType: "User", entityId: user.id, action: "user.bootstrap_owner" });
  console.log(`[bootstrap-owner] OWNER criado: ${OWNER_EMAIL}. Recomenda-se remover OWNER_PASSWORD do .env.`);
}

main()
  .catch((err) => {
    console.error("[bootstrap-owner] falhou:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
