import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seedQuestionnaire } from "@/features/assessments/seed";
import { buildWorkbook } from "@/features/workbook/build";
import { readSheets } from "@/features/workbook/read";
import { applyWorkbook, inspectWorkbook, uploadWorkbook } from "@/features/workbook/service";
import { resetDb, createUser, createClient } from "../helpers";

async function xlsx(sheets: Record<string, unknown[][]>): Promise<Buffer> {
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  return writeXlsxFile(Object.entries(sheets).map(([sheet, data]) => ({ sheet, data })) as never).toBuffer();
}
const c = (value: string | number) => ({ value });

/** Planilha “devolvida pelo cliente”: linha 1 cabeçalho, linha 2 exemplo, dados da linha 3. */
const returned = () =>
  xlsx({
    Empresa: [
      [c("Campo"), c("Preenchimento")],
      [c("Segmento"), c("Varejo")],
      [c("Porte"), c("média")],
      [c("Canais de venda"), c("Loja física; Televendas")],
      [c("Quantidade de vendedores"), c(7)],
      [c("UF"), c("sp")],
      [c("Cidade"), c("Campinas")],
    ],
    Contatos: [
      [c("Nome *"), c("Cargo"), c("E-mail")],
      [c("Exemplo"), c("Gerente"), c("exemplo@x.com")],
      [c("Maria Souza"), c("Diretora"), c("maria@cliente.com")],
      [c("Maria Souza (repetida)"), c(""), c("MARIA@cliente.com")],
    ],
    Diagnóstico: [
      [c("Código"), c("Área"), c("Pergunta"), c("Resposta (0 a 5, NS ou NA)"), c("Quem respondeu"), c("Observação / evidência"), c("Como sabe? (Verificado, Informado ou Estimado)")],
      [c("EXEMPLO"), c(""), c(""), c(3), c(""), c(""), c("Informado")],
      [c("DIAG01_01"), c(""), c(""), c(4), c("Maria"), c("Há documento"), c("verificado")],
      [c("DIAG01_02"), c(""), c(""), c("NS")],
    ],
    Clientes: [
      [c("ID externo *"), c("Nome *")],
      [c("CLI001"), c("Exemplo")],
      [c("C1"), c("Comercial Alfa")],
      [c("C2"), c("Beta Peças")],
    ],
  });

describe("planilha do cliente (modelo, exportação e importação)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedQuestionnaire(prisma);
  });

  it("modelo em branco traz todas as abas, com exemplos; exportação não vaza CPF/CNPJ", async () => {
    const owner = await createUser("OWNER");
    const cl = await createClient(owner.id);
    const { data } = await buildWorkbook(owner, cl.id, "template");
    const sheets = await readSheets(data);
    expect([...sheets.keys()]).toEqual(["Leia-me", "Empresa", "Contatos", "Diagnóstico", "Clientes", "Produtos", "Vendas", "Itens de venda", "Orçamentos"]);
    expect(sheets.get("Empresa")!.some((r) => String(r[3]).includes("Distribuidora Exemplo"))).toBe(true); // coluna Exemplo
    expect(sheets.get("Diagnóstico")!.length).toBeGreaterThan(97);
    await prisma.client.update({ where: { id: cl.id }, data: { taxIdEncrypted: "x" } }); // valor cifrado qualquer: nunca sai na planilha
    const exp = await buildWorkbook(owner, cl.id, "data");
    expect(JSON.stringify([...(await readSheets(exp.data)).values()])).not.toContain("12345678");
  });

  it("confere sem gravar; aplica por partes; reaplicar a mesma parte é bloqueado", async () => {
    const owner = await createUser("OWNER");
    const cl = await createClient(owner.id);
    const file = await uploadWorkbook(owner, cl.id, { name: "devolvida.xlsx", data: await returned() });

    const before = await inspectWorkbook(owner, cl.id, file.id);
    expect(before.analysis.company.issues).toEqual([]);
    expect(before.analysis.company.changes.map((x) => x.key).sort()).toEqual(["city", "industry", "salesChannels", "sellersCount", "size", "state"]);
    expect(before.analysis.contacts.toCreate).toHaveLength(1); // exemplo ignorado; repetida por e-mail ignorada
    expect(before.analysis.contacts.duplicates).toBe(1);
    expect(before.analysis.diagnostic.answers).toHaveLength(2);
    expect(before.analysis.commercial.find((x) => x.type === "CUSTOMERS")!.rows).toHaveLength(2);
    expect(await prisma.clientContact.count()).toBe(0); // nada gravado na conferência

    const r = await applyWorkbook(owner, cl.id, file.id, { sections: ["company", "contacts", "diagnostic", "commercial:CUSTOMERS"] });
    expect(r.map((x) => [x.section, x.ok])).toEqual([["company", true], ["contacts", true], ["diagnostic", true], ["commercial:CUSTOMERS", true]]);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: cl.id } });
    expect(client).toMatchObject({ industry: "VAREJO", size: "MEDIA", state: "SP", sellersCount: 7, city: "Campinas" });
    expect(client.salesChannels.sort()).toEqual(["LOJA", "TELEVENDAS"]);
    expect(await prisma.clientContact.count({ where: { clientId: cl.id } })).toBe(1);
    const a = await prisma.assessment.findFirstOrThrow({ where: { clientId: cl.id } });
    expect(a.status).toBe("DRAFT");
    const ans = await prisma.assessmentAnswer.findMany({ where: { assessmentId: a.id } });
    expect(ans).toHaveLength(2);
    expect(ans.find((x) => x.respondent === "Maria")).toMatchObject({ confidence: "VERIFIED" });
    const batch = await prisma.importBatch.findFirstOrThrow({ where: { clientId: cl.id } });
    expect(batch).toMatchObject({ type: "CUSTOMERS", status: "VALIDATED" });
    expect(await prisma.customer.count()).toBe(0); // base comercial só grava após confirmar o lote

    const again = await applyWorkbook(owner, cl.id, file.id, { sections: ["company", "contacts"] });
    expect(again.every((x) => !x.ok)).toBe(true);
    expect(await prisma.clientContact.count({ where: { clientId: cl.id } })).toBe(1);
    expect(await prisma.assessment.count({ where: { clientId: cl.id } })).toBe(1);
  });

  it("valores inválidos bloqueiam a parte; vendas exigem pedido/faturamento", async () => {
    const owner = await createUser("OWNER");
    const cl = await createClient(owner.id);
    const bad = await xlsx({
      Empresa: [[c("Campo"), c("Preenchimento")], [c("Segmento"), c("Astronáutica")], [c("UF"), c("XX")]],
      Diagnóstico: [[c("Código"), c("Resposta")], [c("EXEMPLO"), c(1)], [c("DIAG01_01"), c(9)], [c("NAO_EXISTE"), c(1)]],
      Vendas: [[c("ID externo da venda *"), c("ID do cliente *"), c("Data *"), c("Status *")], [c("PED001"), c("CLI001"), c("01/10/2026"), c("confirmado")], [c("P1"), c("C1"), c("02/10/2026"), c("confirmado")]],
    });
    const file = await uploadWorkbook(owner, cl.id, { name: "ruim.xlsx", data: bad });
    const { analysis } = await inspectWorkbook(owner, cl.id, file.id);
    expect(analysis.company.issues.length).toBeGreaterThanOrEqual(2);
    expect(analysis.company.input).toBeNull();
    expect(analysis.diagnostic.issues).toHaveLength(2);
    const r = await applyWorkbook(owner, cl.id, file.id, { sections: ["company", "diagnostic", "commercial:SALES"] });
    expect(r.every((x) => !x.ok)).toBe(true);
    expect(r.find((x) => x.section === "commercial:SALES")!.message).toMatch(/Pedidos ou Faturamento/);
    expect(await prisma.assessment.count()).toBe(0);
  });

  it("isolamento: outro cliente/usuário sem acesso e VIEWER não baixam, enviam nem aplicam", async () => {
    const owner = await createUser("OWNER");
    const other = await createUser("CONSULTANT");
    const viewer = await createUser("VIEWER");
    const cl = await createClient(owner.id);
    const other2 = await createClient(owner.id, "Outra Empresa");
    await expect(buildWorkbook(other, cl.id, "template")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(buildWorkbook(viewer, cl.id, "data")).rejects.toBeTruthy();
    const file = await uploadWorkbook(owner, cl.id, { name: "a.xlsx", data: await returned() });
    await expect(inspectWorkbook(owner, other2.id, file.id)).rejects.toBeTruthy(); // arquivo de outro cliente
    await expect(applyWorkbook(other, cl.id, file.id, { sections: ["company"] })).rejects.toBeTruthy();
    await expect(uploadWorkbook(owner, cl.id, { name: "x.xlsx", data: Buffer.from("não é xlsx") })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
