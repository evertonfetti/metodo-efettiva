import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { seedQuestionnaire } from "@/features/assessments/seed";
import { createAssessment, saveAnswer, finalizeAssessment, createRevision, getAssessmentDetail, generateRuleFindings, addEvidence } from "@/features/assessments/service";
import { resetDb, createUser, createClient } from "../helpers";

describe("diagnóstico 360°", () => {
  beforeAll(async () => {
    await resetDb();
  });
  beforeEach(async () => {
    await resetDb();
    await seedQuestionnaire(prisma);
  });

  it("seed: 96 perguntas-base + condicionais, idempotente, sem códigos duplicados", async () => {
    const again = await seedQuestionnaire(prisma);
    expect(again.questionsCreated).toBe(0);
    const base = await prisma.assessmentQuestion.count({ where: { questionCode: { startsWith: "DIAG" } } });
    expect(base).toBe(96);
    expect(await prisma.assessmentDomain.count()).toBe(12);
  });

  it("autosave, regra condicional por resposta, fechamento imutável e revisão", async () => {
    const owner = await createUser("OWNER");
    const c = await createClient(owner.id);
    const a = await createAssessment(owner, c.id, {});
    await saveAnswer(owner, c.id, a.id, { questionCode: "DIAG11_03", value: { kind: "scale", value: 1 } });
    await saveAnswer(owner, c.id, a.id, { questionCode: "DIAG11_01", value: { kind: "unknown" } });
    await saveAnswer(owner, c.id, a.id, { questionCode: "DIAG11_02", value: { kind: "na" } });
    // Resposta ruim no CRM revela a pergunta complementar FU_CRM
    let d = await getAssessmentDetail(owner, c.id, a.id);
    expect(d.visibility.FU_CRM?.visible).toBe(true);
    const tec = d.domainScores.find((s) => s.domainCode === "DIAG11")!;
    expect(tec.weightedScore).toBe(1);
    expect(tec.unknownCount).toBe(1);
    // Tipo incompatível é rejeitado
    await expect(saveAnswer(owner, c.id, a.id, { questionCode: "DIAG11_04", value: { kind: "text", value: "x" } })).rejects.toMatchObject({ code: "VALIDATION" });

    await addEvidence(owner, c.id, a.id, { questionCode: "DIAG11_03", note: "Print do CRM" });
    await finalizeAssessment(owner, c.id, a.id);
    await expect(saveAnswer(owner, c.id, a.id, { questionCode: "DIAG11_03", value: { kind: "scale", value: 5 } })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(finalizeAssessment(owner, c.id, a.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(await prisma.assessmentScore.count({ where: { assessmentId: a.id } })).toBe(12);

    const rev = await createRevision(owner, c.id, a.id);
    expect(rev.revision).toBe(1);
    await saveAnswer(owner, c.id, rev.id, { questionCode: "DIAG11_03", value: { kind: "scale", value: 4 } });
    d = await getAssessmentDetail(owner, c.id, a.id);
    expect(d.answers.DIAG11_03?.value).toEqual({ kind: "scale", value: 1 }); // original preservado
    const dr = await getAssessmentDetail(owner, c.id, rev.id);
    expect(dr.answers.DIAG11_03?.value).toEqual({ kind: "scale", value: 4 });
    expect(dr.answers.DIAG11_03?.evidences).toHaveLength(1);
  });

  it("segmento muda perguntas: Serviços B2B oculta estoque e mostra capacidade", async () => {
    const owner = await createUser("OWNER");
    const c = await createClient(owner.id);
    const a = await createAssessment(owner, c.id, { segment: "SERVICOS_B2B" });
    const d = await getAssessmentDetail(owner, c.id, a.id);
    expect(d.visibility.DIAG08_04?.visible).toBe(false);
    expect(d.visibility.SERV_01?.visible).toBe(true);
    expect(d.visibility.DIST_01?.visible).toBe(false);
  });

  it("achados por regra são idempotentes", async () => {
    const owner = await createUser("OWNER");
    const c = await createClient(owner.id);
    const a = await createAssessment(owner, c.id, {});
    for (const code of ["DIAG05_01", "DIAG05_02", "DIAG05_03", "DIAG05_04", "DIAG05_05"]) {
      await saveAnswer(owner, c.id, a.id, { questionCode: code, value: { kind: "scale", value: 1 } });
    }
    const r1 = await generateRuleFindings(owner, c.id, a.id);
    const r2 = await generateRuleFindings(owner, c.id, a.id);
    expect(r1.created).toBeGreaterThan(0);
    expect(r2.created).toBe(0);
    expect(await prisma.finding.count({ where: { ruleKey: "LOW_MATURITY:DIAG05" } })).toBe(1);
  });

  it("isolamento: consultor de A não lê nem responde diagnóstico de B, nem trocando IDs", async () => {
    const owner = await createUser("OWNER");
    const consultant = await createUser("CONSULTANT");
    const ca = await createClient(owner.id, "A");
    const cb = await createClient(owner.id, "B");
    await prisma.clientAccess.create({ data: { clientId: ca.id, userId: consultant.id } });
    const ab = await createAssessment(owner, cb.id, {});
    await expect(getAssessmentDetail(consultant, cb.id, ab.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // troca de ID: rota do cliente A com diagnóstico do cliente B
    await expect(getAssessmentDetail(consultant, ca.id, ab.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveAnswer(consultant, ca.id, ab.id, { questionCode: "DIAG01_01", value: { kind: "scale", value: 3 } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
