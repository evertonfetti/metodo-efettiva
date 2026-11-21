import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: async (i: { operation: string; clientId: string | null; createdBy: string | null; idempotencyKey: string; payload?: object }) =>
    prisma.backgroundJob.upsert({ where: { idempotencyKey: i.idempotencyKey }, create: { operation: i.operation, clientId: i.clientId, createdBy: i.createdBy, idempotencyKey: i.idempotencyKey, payloadJson: i.payload }, update: { status: "QUEUED" } }),
}));

import { commitBatch, createBatch, getBatch, runCommit, setMapping, validateBatch } from "@/features/imports/service";
import { getMetricsOverview } from "@/features/metrics/service";
import { addDays, toISODate, todayDateOnly } from "@/lib/dates";
import { resetDb, resetClientData, createUser, createClient } from "../helpers";
import type { SessionUser } from "@/features/auth/service";

const csv = (rows: string[]) => ({ name: "dados.csv", data: Buffer.from(rows.join("\n"), "utf8") });
const d = (days: number) => toISODate(addDays(todayDateOnly(), -days)).split("-").reverse().join("/");

async function importFile(user: SessionUser, clientId: string, type: string, file: { name: string; data: Buffer }, extra: object = {}) {
  const b = await createBatch(user, clientId, { type, sourceSystem: "ERP Teste", ...extra }, file);
  await setMapping(user, clientId, b.id, { mapping: b.mappingJson });
  const v = await validateBatch(user, clientId, b.id);
  if (v.summary.total - v.summary.rejected > 0) {
    await commitBatch(user, clientId, b.id);
    await runCommit(b.id, clientId);
  }
  return { batch: await getBatch(user, clientId, b.id), summary: v.summary };
}

const customers = ["id_externo;nome;segmento;vendedor;intervalo_compra_dias;ativo", "CLI1;Comercial Alfa;Oficinas;V1;30;sim", "CLI2;Beta Peças;Oficinas;V1;;sim", "CLI3;Gama Ltda;Frotas;V2;;não"];
const sales = [
  "id_externo;id_cliente;data;status;valor_bruto;descontos;deducoes;valor_liquido;vendedor",
  ...[200, 170, 140, 110].map((ago, i) => `P${i};CLI1;${d(ago)};confirmado;"1.000,00";"100,00";;"900,00";V1`),
  `P9;CLI2;${d(10)};confirmado;;;;"2.500,50";V1`,
  `PX;CLI2;${d(9)};cancelado;;;;"99.999,00";V1`,
  `PY;CLI9;${d(9)};confirmado;;;;100;V1`,
];

describe("fase 4: importação idempotente, KPIs e isolamento", () => {
  beforeAll(resetDb);
  beforeEach(resetClientData);

  it("teste 2: importar, reimportar sem duplicar e atualizar alterados", async () => {
    const u = await createUser("CONSULTANT");
    const c = await createClient(u.id);
    const c1 = await importFile(u, c.id, "CUSTOMERS", csv(customers));
    expect(c1.batch).toMatchObject({ status: "COMPLETED", createdRows: 3 });
    const s1 = await importFile(u, c.id, "SALES", csv(sales), { recordKind: "ORDER" });
    expect(s1.batch).toMatchObject({ status: "PARTIAL", createdRows: 6, rejectedRows: 1 });
    expect(s1.batch.errors[0]).toMatchObject({ field: "id_cliente", reason: expect.stringMatching(/cliente não encontrado/) });

    const s2 = await importFile(u, c.id, "SALES", csv(sales), { recordKind: "ORDER" });
    expect(s2.summary).toMatchObject({ willCreate: 0, willUpdate: 0, unchanged: 6 });
    expect(s2.batch).toMatchObject({ createdRows: 0, updatedRows: 0 });
    expect(await prisma.sale.count({ where: { clientId: c.id } })).toBe(6);

    const changed = sales.map((l) => (l.startsWith("P9;") ? l.replace('"2.500,50"', '"3.000,00"') : l));
    const s3 = await importFile(u, c.id, "SALES", csv(changed), { recordKind: "ORDER" });
    expect(s3.batch).toMatchObject({ createdRows: 0, updatedRows: 1 });
    expect(Number((await prisma.sale.findFirstOrThrow({ where: { clientId: c.id, externalId: "P9" } })).netAmount)).toBe(3000);

    // KPIs com fonte: cancelada fora, valor = 4×900 + 3000
    const m = await getMetricsOverview(u, c.id);
    const kpi = (code: string) => m.kpis.find((k) => k.metricCode === code)!;
    expect(Number(kpi("SALES_VALUE").valueDecimal)).toBe(6600);
    expect(kpi("CONTRIBUTION_MARGIN").valueDecimal).toBeNull();
    expect((kpi("SALES_VALUE").sourceJson as { source: { label: string } }).source.label).toMatch(/dados\.csv/);
    expect(Number(m.analyses.INACTIVE_CUSTOMERS!.valueDecimal)).toBe(1); // CLI1: última compra há 110 dias > 45
    expect(m.quality.alerts.map((a) => a.code)).toEqual(expect.arrayContaining(["DADOS_INSUFICIENTES", "FONTE_NAO_VALIDADA"]));
    const f = await prisma.finding.findFirstOrThrow({ where: { clientId: c.id, ruleKey: "DATA:INACTIVE" } });
    expect(f.title).toBe("1 clientes com sinal de inatividade");
    expect(JSON.stringify(f.evidenceJson)).toMatch(/dados\.csv/);
  });

  it("isolamento: lote e dados de outro cliente não são acessíveis nem referenciáveis", async () => {
    const a = await createUser("CONSULTANT");
    const b = await createUser("CONSULTANT");
    const ca = await createClient(a.id, "A");
    const cb = await createClient(b.id, "B");
    await importFile(a, ca.id, "CUSTOMERS", csv(customers));
    const bad = await importFile(b, cb.id, "SALES", csv(sales.slice(0, 2)), { recordKind: "ORDER" });
    expect(bad.summary.rejected).toBe(1); // CLI1 existe só no cliente A
    const batchA = await prisma.importBatch.findFirstOrThrow({ where: { clientId: ca.id } });
    await expect(getBatch(b, cb.id, batchA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getBatch(b, ca.id, batchA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(runCommit(batchA.id, cb.id)).rejects.toThrow(/diverge/);
    expect(await prisma.sale.count({ where: { clientId: cb.id } })).toBe(0);
  });

  it("vendas exigem pedido/faturamento; arquivo inválido é rejeitado", async () => {
    const u = await createUser("CONSULTANT");
    const c = await createClient(u.id);
    await expect(createBatch(u, c.id, { type: "SALES", sourceSystem: "ERP" }, csv(sales))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createBatch(u, c.id, { type: "CUSTOMERS", sourceSystem: "ERP" }, { name: "x.exe", data: Buffer.from("MZ\x90\x00binario") })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
