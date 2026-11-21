import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seedProcesses } from "@/features/processes/seed";
import { createOpportunity, transitionOpportunity } from "@/features/opportunities/service";
import { createProject, getProject, listTasks, updateTask } from "@/features/projects/service";
import { createEvent, createMeeting, freezeBaseline, getIndicators, recordManualValue, recordProcessAudit, recordSnapshot } from "@/features/results/service";
import { createReport, listReports } from "@/features/results/report";
import { getDocument, regenerateSection } from "@/features/documents/service";
import { adoptionRate, onTimeTaskRate, variation, NON_CAUSALITY } from "@/features/results/rules";
import { addDays, parseDateOnly, toISODate } from "@/lib/dates";
import { resetDb, resetClientData, createUser, createClient } from "../helpers";

const D = (s: string) => parseDateOnly(s)!;

describe("regras de acompanhamento", () => {
  it("variação, tarefas no prazo e aderência", () => {
    expect(variation(100, 125)).toEqual({ abs: 25, pct: 25 });
    expect(variation(0, 5)).toEqual({ abs: 5, pct: null });
    expect(variation(null, 5)).toEqual({ abs: null, pct: null });
    expect(onTimeTaskRate([{ status: "DONE", dueDate: D("2026-11-10"), completedAt: new Date("2026-11-10T20:00:00Z") }, { status: "DONE", dueDate: D("2026-11-10"), completedAt: new Date("2026-11-12T10:00:00Z") }, { status: "TODO", dueDate: D("2026-11-10"), completedAt: null }])).toBe(50);
    expect(adoptionRate([{ projectProcessId: "a", auditedAt: D("2026-10-01"), itemsChecked: 10, itemsConforming: 2 }, { projectProcessId: "a", auditedAt: D("2026-11-01"), itemsChecked: 10, itemsConforming: 8 }, { projectProcessId: "b", auditedAt: D("2026-11-01"), itemsChecked: 10, itemsConforming: 6 }])).toBe(70);
    expect(adoptionRate([])).toBeNull();
  });
});

describe("fase 6: baseline, snapshots, reuniões e relatório", () => {
  beforeAll(async () => {
    await resetDb();
    await seedProcesses(prisma);
  });
  beforeEach(resetClientData);

  async function scenario() {
    const u = await createUser("CONSULTANT");
    const c = await createClient(u.id);
    const cust = await prisma.customer.create({ data: { clientId: c.id, externalId: "C1", name: "Cliente 1", rowHash: "x" } });
    const batch = await prisma.importBatch.create({ data: { clientId: c.id, type: "SALES", fileAssetId: crypto.randomUUID(), originalName: "vendas.csv", sourceSystem: "ERP", recordKind: "ORDER", status: "COMPLETED", createdBy: u.id, finishedAt: new Date() } });
    const start = D("2026-09-01");
    // 90 dias antes: 3 vendas de 1.000; depois do início: 3 vendas de 1.500
    for (const [i, ago] of [[0, 80], [1, 50], [2, 20]] as const) await prisma.sale.create({ data: { clientId: c.id, sourceSystem: "ERP", externalId: `B${i}`, customerId: cust.id, occurredAt: addDays(start, -ago), recordKind: "ORDER", status: "VALID", statusRaw: "ok", netAmount: 1000, rowHash: "x", batchId: batch.id } });
    for (const [i, d] of [[0, 10], [1, 40], [2, 70]] as const) await prisma.sale.create({ data: { clientId: c.id, sourceSystem: "ERP", externalId: `A${i}`, customerId: cust.id, occurredAt: addDays(start, d), recordKind: "ORDER", status: "VALID", statusRaw: "ok", netAmount: 1500, rowHash: "x", batchId: batch.id } });
    const o = await createOpportunity(u, c.id, { title: "Recuperar inativos", explanation: "Clientes parados.", domainCode: "C", impactScore: 5, confidenceScore: 4, effortScore: 2, processCodes: "C05", assumptions: "", evidence: "" });
    await transitionOpportunity(u, c.id, o.id, { status: "REVIEWED" });
    await transitionOpportunity(u, c.id, o.id, { status: "APPROVED" });
    const p = await createProject(u, c.id, { name: "Projeto 60 dias", startDate: toISODate(start), opportunityIds: [o.id], generatePlan: "on" });
    return { u, c, p, start };
  }

  it("baseline congelado e imutável; revisão com motivo; snapshot e variação observada", async () => {
    const { u, c, p, start } = await scenario();
    const f = await freezeBaseline(u, c.id, p.id);
    expect(f.period).toEqual({ start: toISODate(addDays(start, -90)), end: toISODate(addDays(start, -1)) });
    const b = await prisma.projectBaseline.findFirstOrThrow({ where: { projectId: p.id, metricCode: "SALES_VALUE" } });
    expect(Number(b.valueDecimal)).toBe(3000);
    await expect(prisma.projectBaseline.update({ where: { id: b.id }, data: { valueDecimal: 1 } })).rejects.toThrow(/BASELINE_IMMUTABLE/);
    await expect(freezeBaseline(u, c.id, p.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await freezeBaseline(u, c.id, p.id, { reason: "Correção: vendas de agosto reimportadas", metricCodes: ["SALES_VALUE"] });
    expect(await prisma.projectBaseline.count({ where: { projectId: p.id, metricCode: "SALES_VALUE" } })).toBe(2);

    const tasks = await listTasks(u, c.id, p.id);
    await updateTask(u, c.id, p.id, tasks[0]!.id, { status: "DONE" });
    const proj = await getProject(u, c.id, p.id);
    await recordProcessAudit(u, c.id, p.id, proj.processes[0]!.id, { auditedAt: toISODate(addDays(start, 55)), itemsChecked: 10, itemsConforming: 7, notes: "Amostra de 10 contatos" });
    await recordSnapshot(u, c.id, p.id, { endDate: toISODate(addDays(start, 89)) });
    await recordManualValue(u, c.id, p.id, { metricCode: "QUOTE_CONVERSION", value: 30, endDate: toISODate(addDays(start, 89)), justification: "Controle paralelo do gerente comercial", source: "Planilha de propostas" });
    await createEvent(u, c.id, p.id, { occurredAt: toISODate(addDays(start, 30)), kind: "PRICE_CHANGE", description: "Reajuste de 5% na tabela" });
    const ind = await getIndicators(u, c.id, p.id);
    const sv = ind.rows.find((r) => r.code === "SALES_VALUE")!;
    expect(sv).toMatchObject({ abs: 1500, pct: 50, classification: "OBSERVED" });
    expect(ind.rows.find((r) => r.code === "PROCESS_ADOPTION_RATE")!.current!.value).toBe(70);
    expect(ind.rows.find((r) => r.code === "QUOTE_CONVERSION")!.classification).toBe("ESTIMATED");
    expect(ind.events).toHaveLength(1);
  });

  it("relatório com 11 seções, fonte, limitações e frase de não causalidade; regenerável; isolado", async () => {
    const { u, c, p, start } = await scenario();
    await freezeBaseline(u, c.id, p.id);
    await recordSnapshot(u, c.id, p.id, { endDate: toISODate(addDays(start, 59)) });
    await createMeeting(u, c.id, p.id, { occurredAt: toISODate(addDays(start, 20)), title: "Revisão semanal", attendees: "Gerente comercial", summary: "Revisão das abordagens", decisions: "Priorizar clientes A", nextSteps: "Cliente aprovar nova cadência", impediments: "ERP sem campo de próximo passo", trainings: "Treinamento do script C05" });
    const rp = await createReport(u, c.id, { projectId: p.id, periodStart: toISODate(start), periodEnd: toISODate(addDays(start, 59)) });
    const d = await getDocument(u, c.id, rp.documentId!);
    expect(d.revision.content.sections).toHaveLength(11);
    const text = JSON.stringify(d.revision.content);
    expect(text).toContain(NON_CAUSALITY);
    expect(text).toContain("Baseline (congelado)");
    expect(text).toContain("vendas.csv");
    expect(text).toContain("ERP sem campo de próximo passo");
    expect(text).toContain("Treinamento do script C05");
    expect(text).not.toMatch(/lucro (líquido )?de R\$/i);
    expect((await listReports(u, c.id))[0]!.status).toBe("DRAFT");
    await regenerateSection(u, c.id, rp.documentId!, d.revision.id, "kpis", { lockVersion: d.revision.lockVersion });

    const other = await createUser("CONSULTANT");
    const oc = await createClient(other.id, "Outro");
    await expect(getIndicators(other, oc.id, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createReport(other, oc.id, { projectId: p.id, periodStart: "2026-09-01", periodEnd: "2026-10-01" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(freezeBaseline(other, c.id, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listReports(other, oc.id)).toEqual([]);
  });
});
