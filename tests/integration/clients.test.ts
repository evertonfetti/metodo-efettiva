import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createClient as createClientSvc, getClientView, listClients, updateClient } from "@/features/clients/service";
import { resetDb, createUser } from "../helpers";

describe("clientes", () => {
  beforeEach(resetDb);

  it("cria com CPF/CNPJ cifrado e exibe mascarado", async () => {
    const owner = await createUser("OWNER");
    const c = await createClientSvc(owner, { name: "Alfa Distribuidora", industry: "DISTRIBUICAO", taxId: "12.345.678/0001-90", contactName: "Ana" });
    const row = await prisma.client.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.taxIdEncrypted).not.toContain("12345678000190");
    const view = await getClientView(owner, c.id);
    expect(view.taxIdMasked).toMatch(/0190$/);
    expect("taxIdEncrypted" in view).toBe(false);
    expect(await prisma.clientContact.count({ where: { clientId: c.id } })).toBe(1);
  });

  it("consultor só lista e edita os próprios clientes; segmento OUTRO exige descrição", async () => {
    const owner = await createUser("OWNER");
    const consultant = await createUser("CONSULTANT");
    await createClientSvc(owner, { name: "Do Owner", industry: "VAREJO" });
    const mine = await createClientSvc(consultant, { name: "Do Consultor", industry: "SERVICOS_B2B" });
    const list = await listClients(consultant, {});
    expect(list.items.map((i) => i.name)).toEqual(["Do Consultor"]);
    expect((await listClients(owner, {})).total).toBe(2);
    const other = await prisma.client.findFirstOrThrow({ where: { name: "Do Owner" } });
    await expect(updateClient(consultant, other.id, { name: "Hack", industry: "VAREJO" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createClientSvc(owner, { name: "Sem desc", industry: "OUTRO" })).rejects.toBeTruthy();
    await updateClient(consultant, mine.id, { name: "Do Consultor", industry: "SERVICOS_B2B", status: "ARCHIVED" });
    expect((await listClients(consultant, {})).total).toBe(0);
    expect((await listClients(consultant, { status: "ARCHIVED" })).total).toBe(1);
  });
});
