import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { prisma } from "@/lib/db";

// Fila isolada: registra o job no banco de teste sem enviar ao Redis (o teste executa runExport diretamente).
vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: async (i: { operation: string; clientId: string | null; createdBy: string | null; idempotencyKey: string; payload?: object }) =>
    prisma.backgroundJob.create({ data: { operation: i.operation, clientId: i.clientId, createdBy: i.createdBy, idempotencyKey: i.idempotencyKey, payloadJson: i.payload } }),
}));

import { seedProcesses } from "@/features/processes/seed";
import { seedQuestionnaire } from "@/features/assessments/seed";
import { createAssessment, finalizeAssessment, saveAnswer, createManualFinding } from "@/features/assessments/service";
import { createOpportunity, transitionOpportunity } from "@/features/opportunities/service";
import { createProject, updateProjectProcess, getProject } from "@/features/projects/service";
import {
  approveRevision,
  createRevision,
  downloadExport,
  generateDocument,
  getDocument,
  publishRevision,
  regenerateSection,
  requestExport,
  runExport,
  saveSection,
  setSectionState,
} from "@/features/documents/service";
import type { Block } from "@/features/documents/content";
import { resetDb, resetClientData, createUser, createClient } from "../helpers";

async function scenario() {
  const owner = await createUser("CONSULTANT");
  const c = await createClient(owner.id, "Distribuidora Teste Playbook");
  const a = await createAssessment(owner, c.id, {});
  for (const [code, v] of [["DIAG05_01", 1], ["DIAG05_02", 1], ["DIAG04_01", 2]] as const) await saveAnswer(owner, c.id, a.id, { questionCode: code, value: { kind: "scale", value: v } });
  await finalizeAssessment(owner, c.id, a.id);
  await createManualFinding(owner, c.id, { assessmentId: a.id, type: "PROBLEM", domainCode: "DIAG05", title: "Clientes inativos sem rotina de recuperação", description: "Reativação não é sistemática.", evidence: "Relato do gerente comercial" });
  const o = await createOpportunity(owner, c.id, { title: "Recuperar inativos", explanation: "40 clientes sem compra no intervalo habitual.", domainCode: "C", impactScore: 5, confidenceScore: 4, effortScore: 2, processCodes: "C05", assumptions: "", evidence: "" });
  await transitionOpportunity(owner, c.id, o.id, { status: "REVIEWED" });
  await transitionOpportunity(owner, c.id, o.id, { status: "APPROVED" });
  const p = await createProject(owner, c.id, { name: "Implantação 90 dias", startDate: "2026-11-02", sponsorName: "Diretor comercial", objectives: "Reativar clientes", opportunityIds: [o.id], processCodes: "D03", generatePlan: "on" });
  const proj = await getProject(owner, c.id, p.id);
  for (const pp of proj.processes) await updateProjectProcess(owner, c.id, p.id, pp.id, { status: "IN_PROGRESS", ownerName: "Gerente comercial" });
  return { owner, c, p };
}

const sectionByKey = (d: Awaited<ReturnType<typeof getDocument>>, key: string) => d.revision.content.sections.find((s) => s.key === key)!;

describe("fase 3: playbook determinístico, versões e exportação", () => {
  beforeAll(async () => {
    await resetDb();
    await seedQuestionnaire(prisma);
    await seedProcesses(prisma);
  });
  beforeEach(resetClientData);

  it("gera playbook real (9.1), aprova com QA, fica imutável, exporta com audiência filtrada", async () => {
    const { owner, c, p } = await scenario();
    const doc = await generateDocument(owner, c.id, { projectId: p.id, type: "PLAYBOOK" });
    await expect(generateDocument(owner, c.id, { projectId: p.id, type: "PLAYBOOK" })).rejects.toMatchObject({ code: "CONFLICT" });
    let d = await getDocument(owner, c.id, doc.id);
    const keys = d.revision.content.sections.map((s) => s.key);
    expect(keys.length).toBeGreaterThanOrEqual(19);
    expect(keys).toEqual(expect.arrayContaining(["capa", "contexto", "diagnostico", "oportunidades", "objetivos", "governanca", "processo:c05", "processo:d03", "raci", "cronograma", "anexos", "notas-internas"]));
    const all = JSON.stringify(d.revision.content);
    expect(all).not.toMatch(/lorem/i);
    expect(all).toContain("Distribuidora Teste Playbook");
    expect(all).toContain("Reativados ÷ Abordados × 100");
    expect(all).toMatch(/EV-001/);
    expect(sectionByKey(d, "notas-internas").visibility).toBe("INTERNO");

    // QA bloqueia: seções sem aprovação e D03 sem passos definidos
    expect(d.qa.find((q) => q.id === "pop")?.level).toBe("error");
    await expect(approveRevision(owner, c.id, doc.id, d.revision.id)).rejects.toMatchObject({ code: "INVALID_STATE" });

    // consultor completa os passos do D03 (edição manual)
    const d03 = sectionByKey(d, "processo:d03");
    const blocks: Block[] = d03.blocks.map((b) => (b.type === "list" && b.ordered ? { ...b, items: ["Extrair faturamento por cliente dos últimos 12 meses", "Classificar clientes em A, B e C por participação acumulada", "Revisar a classificação com o gerente comercial"] } : b));
    let lock = d.revision.lockVersion;
    lock = (await saveSection(owner, c.id, doc.id, d.revision.id, "processo:d03", { lockVersion: lock, title: d03.title, visibility: "CLIENTE", blocks })).lockVersion;
    await expect(saveSection(owner, c.id, doc.id, d.revision.id, "processo:d03", { lockVersion: 0, title: d03.title, visibility: "CLIENTE", blocks })).rejects.toMatchObject({ code: "CONFLICT" });
    // regenerar seção editada exige confirmação
    await expect(regenerateSection(owner, c.id, doc.id, d.revision.id, "processo:d03", { lockVersion: lock })).rejects.toMatchObject({ code: "CONFLICT" });

    for (const s of d.revision.content.sections) lock = (await setSectionState(owner, c.id, doc.id, d.revision.id, s.key, { state: "APPROVED", lockVersion: lock })).lockVersion;
    d = await getDocument(owner, c.id, doc.id);
    expect(d.revision.state).toBe("READY_FOR_REVIEW");
    expect(d.qa.filter((q) => q.level === "error")).toEqual([]);
    await approveRevision(owner, c.id, doc.id, d.revision.id);

    // imutável: serviço e trigger do banco
    await expect(saveSection(owner, c.id, doc.id, d.revision.id, "capa", { lockVersion: lock, title: "Capa", visibility: "CLIENTE", blocks: [] })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(prisma.documentRevision.update({ where: { id: d.revision.id }, data: { contentJson: { sections: [] } } })).rejects.toThrow(/REVISION_IMMUTABLE/);
    await publishRevision(owner, c.id, doc.id, d.revision.id);

    // exportações finais: CLIENTE sem seção interna; INTERNO com ela
    const md = await requestExport(owner, c.id, doc.id, d.revision.id, { format: "MD", audience: "CLIENTE" });
    expect(md.isDraft).toBe(false);
    await runExport(md.id, c.id);
    const mdFile = (await downloadExport(owner, c.id, md.id)).data.toString("utf8");
    expect(mdFile).toContain("C05 — Recuperação de inativos");
    expect(mdFile).not.toContain("Notas estratégicas internas");
    expect(mdFile).not.toContain("RASCUNHO");

    const mdInt = await requestExport(owner, c.id, doc.id, d.revision.id, { format: "MD", audience: "INTERNO" });
    await runExport(mdInt.id, c.id);
    expect((await downloadExport(owner, c.id, mdInt.id)).data.toString("utf8")).toContain("Notas estratégicas internas");

    const docx = await requestExport(owner, c.id, doc.id, d.revision.id, { format: "DOCX", audience: "CLIENTE" });
    await runExport(docx.id, c.id);
    const zip = unzipSync(new Uint8Array((await downloadExport(owner, c.id, docx.id)).data));
    const xml = strFromU8(zip["word/document.xml"]!);
    expect(xml).toContain("Distribuidora Teste Playbook");
    expect(xml).toContain("Matriz RACI simplificada");
    expect(xml).not.toContain("Notas estratégicas internas");

    const pdf = await requestExport(owner, c.id, doc.id, d.revision.id, { format: "PDF", audience: "CLIENTE" });
    await runExport(pdf.id, c.id);
    const pdfData = (await downloadExport(owner, c.id, pdf.id)).data;
    expect(pdfData.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdfData.length).toBeGreaterThan(20_000);

    // nova versão: rascunho exporta com marca d'água
    const v2 = await createRevision(owner, c.id, doc.id);
    expect(v2.version).toBe(2);
    await expect(createRevision(owner, c.id, doc.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const capa = sectionByKey(d, "capa");
    await saveSection(owner, c.id, doc.id, v2.id, "capa", { lockVersion: 0, title: capa.title, visibility: "CLIENTE", blocks: [...capa.blocks, { type: "paragraph", text: "Revisão acordada em reunião." }] });
    const draft = await requestExport(owner, c.id, doc.id, v2.id, { format: "MD", audience: "CLIENTE" });
    expect(draft.isDraft).toBe(true);
    await runExport(draft.id, c.id);
    expect((await downloadExport(owner, c.id, draft.id)).data.toString("utf8")).toContain("RASCUNHO");
    // v1 publicada continua intacta
    const v1 = await getDocument(owner, c.id, doc.id, d.revision.id);
    expect(v1.revision.state).toBe("PUBLISHED");
    expect(JSON.stringify(v1.revision.content)).not.toContain("Revisão acordada em reunião.");
  }, 120_000);

  it("POP de processo e isolamento entre clientes", async () => {
    const { owner, c, p } = await scenario();
    const pop = await generateDocument(owner, c.id, { projectId: p.id, type: "POP", processCode: "C05" });
    const d = await getDocument(owner, c.id, pop.id);
    expect(d.revision.content.sections.map((s) => s.key)).toEqual(expect.arrayContaining(["pop:execucao", "pop:responsabilidades", "pop:kpis", "pop:checklist"]));
    await expect(generateDocument(owner, c.id, { projectId: p.id, type: "POP", processCode: "A03" })).rejects.toMatchObject({ code: "VALIDATION" });

    const other = await createUser("CONSULTANT");
    const oc = await createClient(other.id, "Outro Cliente");
    await expect(getDocument(other, c.id, pop.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDocument(other, oc.id, pop.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(generateDocument(other, oc.id, { projectId: p.id, type: "PLAYBOOK" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const exp = await requestExport(owner, c.id, pop.id, d.revision.id, { format: "MD", audience: "CLIENTE" });
    await expect(runExport(exp.id, oc.id)).rejects.toThrow(/diverge/);
    await runExport(exp.id, c.id);
    await expect(downloadExport(other, oc.id, exp.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requestExport(other, oc.id, pop.id, d.revision.id, { format: "MD", audience: "INTERNO" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }, 60_000);
});
