import { beforeEach, describe, expect, it } from "vitest";
import { assertClientAccess } from "@/lib/security/access";
import { prisma } from "@/lib/db";
import { resetDb, createUser, createClient } from "../helpers";

describe("isolamento por cliente (base)", () => {
  beforeEach(resetDb);

  it("OWNER acessa qualquer cliente; consultor sem atribuição recebe 404", async () => {
    const owner = await createUser("OWNER");
    const consultant = await createUser("CONSULTANT");
    const a = await createClient(owner.id, "Empresa A");
    await expect(assertClientAccess(owner, a.id, "EDIT")).resolves.toMatchObject({ id: a.id });
    await expect(assertClientAccess(consultant, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("consultor atribuído a A não acessa B", async () => {
    const owner = await createUser("OWNER");
    const consultant = await createUser("CONSULTANT");
    const a = await createClient(owner.id, "Empresa A");
    const b = await createClient(owner.id, "Empresa B");
    await prisma.clientAccess.create({ data: { clientId: a.id, userId: consultant.id, permission: "EDIT" } });
    await expect(assertClientAccess(consultant, a.id, "EDIT")).resolves.toMatchObject({ id: a.id });
    await expect(assertClientAccess(consultant, b.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("VIEWER lê mas não edita; ID inválido e cliente excluído não vazam", async () => {
    const owner = await createUser("OWNER");
    const viewer = await createUser("VIEWER");
    const a = await createClient(owner.id);
    await prisma.clientAccess.create({ data: { clientId: a.id, userId: viewer.id, permission: "VIEW" } });
    await expect(assertClientAccess(viewer, a.id, "VIEW")).resolves.toBeTruthy();
    await expect(assertClientAccess(viewer, a.id, "EDIT")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertClientAccess(owner, "nao-e-uuid")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await prisma.client.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    await expect(assertClientAccess(owner, a.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
