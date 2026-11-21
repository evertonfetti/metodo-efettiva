import { beforeEach, describe, expect, it } from "vitest";
import { authenticate, validateSessionToken, revokeSessionToken, MAX_FAILED_LOGINS } from "@/features/auth/service";
import { prisma } from "@/lib/db";
import { resetDb, createUser } from "../helpers";

describe("autenticação", () => {
  beforeEach(resetDb);

  it("login válido cria sessão com hash (token não é salvo em claro)", async () => {
    const u = await createUser("OWNER");
    const { token, user } = await authenticate({ email: u.email.toUpperCase(), password: u.password });
    expect(user.id).toBe(u.id);
    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).not.toBe(token);
    expect((await validateSessionToken(token))?.id).toBe(u.id);
  });

  it("senha errada falha com mensagem genérica; e-mail inexistente também", async () => {
    const u = await createUser();
    await expect(authenticate({ email: u.email, password: "errada-123456" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(authenticate({ email: "nao@existe.local", password: "x" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("bloqueia temporariamente após tentativas excessivas, mesmo com a senha certa", async () => {
    const u = await createUser();
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) {
      await expect(authenticate({ email: u.email, password: "errada" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
    await expect(authenticate({ email: u.email, password: "errada" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(authenticate({ email: u.email, password: u.password })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("logout revoga a sessão; usuário inativo perde acesso", async () => {
    const u = await createUser();
    const { token } = await authenticate({ email: u.email, password: u.password });
    await revokeSessionToken(token);
    expect(await validateSessionToken(token)).toBeNull();

    const { token: t2 } = await authenticate({ email: u.email, password: u.password });
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect(await validateSessionToken(t2)).toBeNull();
  });

  it("sessão expirada é rejeitada", async () => {
    const u = await createUser();
    const { token } = await authenticate({ email: u.email, password: u.password });
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(token)).toBeNull();
  });
});
