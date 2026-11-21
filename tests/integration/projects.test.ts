import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seedProcesses } from "@/features/processes/seed";
import { getProcess, updateProcess } from "@/features/processes/service";
import { createOpportunity, listOpportunities, setOpportunityProcesses, transitionOpportunity, getOpportunity } from "@/features/opportunities/service";
import { addTaskEvidence, createProject, createTask, generatePlan, getProject, listTasks, updateProjectProcess, updateTask } from "@/features/projects/service";
import { resetDb, resetClientData, createUser, createClient } from "../helpers";

const opp = (over: Record<string, unknown> = {}) => ({
  title: "Recuperar clientes inativos",
  explanation: "40 clientes sem compra acima do intervalo habitual.",
  domainCode: "C",
  impactScore: 5,
  confidenceScore: 4,
  effortScore: 2,
  assumptions: "",
  evidence: "Diagnóstico área Carteira",
  processCodes: "C05",
  ...over,
});

describe("fase 2: biblioteca, oportunidades e projetos", () => {
  beforeAll(async () => {
    await resetDb();
    await seedProcesses(prisma);
  });
  beforeEach(resetClientData);

  it("seed: 146 processos, 10 fichas completas, idempotente e sem duplicar códigos", async () => {
    const again = await seedProcesses(prisma);
    expect(again).toMatchObject({ created: 0, sheetsApplied: 0, total: 146, full: 10 });
    const c05 = await getProcess("C05");
    expect(c05.content?.steps).toHaveLength(10);
    expect(c05.revisions.map((r) => r.version)).toEqual([2, 1]);
  });

  it("edição da biblioteca cria revisão; conflito de versão retorna 409", async () => {
    const u = await createUser("CONSULTANT");
    const p = await getProcess("A03");
    const form = { expectedVersion: p.currentVersion, name: p.name, objective: p.objective, changeNotes: "Ajuste de cadência", active: true, content: { ...p.content!, cadence: "45 minutos" } };
    const r = await updateProcess(u, "A03", form);
    expect(r.version).toBe(p.currentVersion + 1);
    await expect(updateProcess(u, "A03", form)).rejects.toMatchObject({ code: "CONFLICT" });
    const viewer = await createUser("VIEWER");
    await expect(updateProcess(viewer, "A03", { ...form, expectedVersion: r.version })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("aceite: três achados → duas oportunidades aprovadas → processos → projeto com tarefas", async () => {
    const owner = await createUser("OWNER");
    const c = await createClient(owner.id);
    const o1 = await createOpportunity(owner, c.id, opp());
    const o2 = await createOpportunity(owner, c.id, opp({ title: "Follow-up de propostas paradas", domainCode: "V", processCodes: "", impactScore: 4, confidenceScore: 4, effortScore: 2 }));
    const o3 = await createOpportunity(owner, c.id, opp({ title: "Descontos sem alçada", domainCode: "L", processCodes: "L05", criticalRisk: "on", criticalRiskReason: "Margem negativa em pedidos grandes", impactScore: 2, confidenceScore: 2, effortScore: 4 }));
    expect([o1.number, o2.number, o3.number]).toEqual([1, 2, 3]);
    expect(await prisma.finding.count({ where: { clientId: c.id } })).toBe(3);
    expect(Number(o1.priorityScore)).toBe(10);

    // risco crítico no topo apesar do score 1
    const list = await listOpportunities(owner, c.id);
    expect(list[0]!.id).toBe(o3.id);
    // sugestões determinísticas quando nenhum processo foi escolhido
    const o2v = await getOpportunity(owner, c.id, o2.id);
    expect(o2v.processes.filter((p) => p.suggested).map((p) => p.process.code)).toEqual(["V05", "V11", "V01"]);
    await expect(createOpportunity(owner, c.id, opp({ processCodes: "Z99" }))).rejects.toMatchObject({ code: "VALIDATION" });

    await setOpportunityProcesses(owner, c.id, o2.id, { processCodes: ["V05", "V11"] });
    for (const o of [o1, o2]) {
      await expect(transitionOpportunity(owner, c.id, o.id, { status: "APPROVED" })).rejects.toMatchObject({ code: "INVALID_STATE" });
      await transitionOpportunity(owner, c.id, o.id, { status: "REVIEWED" });
      await transitionOpportunity(owner, c.id, o.id, { status: "APPROVED" });
    }
    await expect(transitionOpportunity(owner, c.id, o3.id, { status: "DISMISSED" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createProject(owner, c.id, { name: "Projeto X", startDate: "2026-11-02", opportunityIds: [o3.id] })).rejects.toMatchObject({ code: "INVALID_STATE" });

    const project = await createProject(owner, c.id, { name: "Implantação Comercial 90 dias", startDate: "2026-11-02", opportunityIds: [o1.id, o2.id], processCodes: "A03", generatePlan: "on" });
    expect(project.planTasks).toBeGreaterThan(20);
    const detail = await getProject(owner, c.id, project.id);
    expect(detail.processes.map((p) => p.process.code).sort()).toEqual(["A03", "C05", "V05", "V11"]);
    expect(detail.processes.find((p) => p.process.code === "C05")!.processVersion).toBe(2);
    expect((await getOpportunity(owner, c.id, o1.id)).status).toBe("LINKED_TO_PROJECT");

    // plano idempotente
    expect(await generatePlan(owner, c.id, project.id)).toMatchObject({ created: 0 });
    expect(await prisma.actionTask.count({ where: { projectId: project.id } })).toBe(project.planTasks);

    // validação de processo exige execução + indicadores + evidência
    const a03 = detail.processes.find((p) => p.process.code === "A03")!;
    await expect(updateProjectProcess(owner, c.id, project.id, a03.id, { status: "VALIDATED", indicatorsChecked: "on", indicatorsNote: "4 reuniões" })).rejects.toMatchObject({ code: "INVALID_STATE" });
    const a03Tasks = (await listTasks(owner, c.id, project.id, { process: a03.id }));
    for (const t of a03Tasks) await updateTask(owner, c.id, project.id, t.id, { status: "DONE" });
    await addTaskEvidence(owner, c.id, project.id, a03Tasks[0]!.id, { text: "Ata da 4ª reunião" });
    await updateProjectProcess(owner, c.id, project.id, a03.id, { status: "VALIDATED", indicatorsChecked: "on", indicatorsNote: "4 reuniões com decisões" });
    expect((await getProject(owner, c.id, project.id)).processes.find((p) => p.id === a03.id)!.status).toBe("VALIDATED");

    // tarefa bloqueada exige impedimento; responsável obrigatório
    const t = await createTask(owner, c.id, project.id, { title: "Importar histórico de contatos", externalOwnerName: "TI / ERP", dueDate: "2026-11-28" });
    await expect(updateTask(owner, c.id, project.id, t.id, { status: "BLOCKED" })).rejects.toMatchObject({ name: "ZodError" });
    await updateTask(owner, c.id, project.id, t.id, { status: "BLOCKED", blockedReason: "Aguardando exportação do ERP" });
    await expect(createTask(owner, c.id, project.id, { title: "Sem responsável" })).rejects.toMatchObject({ name: "ZodError" });
  });

  it("isolamento: oportunidade, projeto e tarefa de outro cliente respondem 404", async () => {
    const a = await createUser("CONSULTANT");
    const b = await createUser("CONSULTANT");
    const ca = await createClient(a.id, "Cliente A");
    const cb = await createClient(b.id, "Cliente B");
    const o = await createOpportunity(a, ca.id, opp());
    await transitionOpportunity(a, ca.id, o.id, { status: "REVIEWED" });
    await transitionOpportunity(a, ca.id, o.id, { status: "APPROVED" });
    const p = await createProject(a, ca.id, { name: "Projeto A", startDate: "2026-11-02", opportunityIds: [o.id], generatePlan: true });
    const task = (await listTasks(a, ca.id, p.id))[0]!;

    // B não acessa o cliente A
    await expect(getOpportunity(b, ca.id, o.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getProject(b, ca.id, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // B usa o próprio clientId com IDs do cliente A
    await expect(getOpportunity(b, cb.id, o.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getProject(b, cb.id, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateTask(b, cb.id, p.id, task.id, { status: "DONE" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createProject(b, cb.id, { name: "Roubo", startDate: "2026-11-02", opportunityIds: [o.id] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // B não atribui tarefa no projeto A a si mesmo nem usa arquivo de outro cliente
    await expect(createTask(a, ca.id, p.id, { title: "Tarefa", assigneeUserId: b.id })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.actionTask.count({ where: { id: task.id, status: "DONE" } })).toBe(0);
  });
});
