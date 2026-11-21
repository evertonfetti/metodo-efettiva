import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import type { SessionUser } from "@/features/auth/service";
import type { Prisma } from "@/generated/prisma/client";
import { SEGMENT_CODES } from "@/features/clients/catalog";
import { getSetting } from "@/features/settings/service";
import { answerValueSchema, questionVisibility, type AnswerValue, type RuleLike } from "./conditions";
import { scoreDomains, overallScore, type DomainScore } from "./scoring";
import { BASE_TEMPLATE } from "./seed";

// ───────────────────────── leitura ─────────────────────────

export async function getActiveTemplate() {
  const t = await prisma.assessmentTemplate.findFirst({ where: { code: BASE_TEMPLATE.code, status: "ACTIVE" }, orderBy: { version: "desc" } });
  if (!t) throw new AppError("INVALID_STATE", "Questionário-base não encontrado. Rode o seed (npm run db:seed).");
  return t;
}

export async function listAssessments(user: SessionUser, clientId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  return prisma.assessment.findMany({
    where: { clientId },
    orderBy: [{ number: "desc" }, { revision: "desc" }],
    include: { template: { select: { name: true, version: true } }, scores: true },
  });
}

/** Carrega o diagnóstico sob {id, clientId} — nunca só pelo id. */
async function loadOwned(clientId: string, assessmentId: string) {
  if (!isUuid(assessmentId)) throw notFound("Diagnóstico");
  const a = await prisma.assessment.findFirst({ where: { id: assessmentId, clientId } });
  if (!a) throw notFound("Diagnóstico");
  return a;
}

export type QuestionView = {
  id: string;
  code: string;
  domainCode: string;
  title: string;
  type: string;
  weight: number;
  options: string[] | null;
  guidance: string | null;
  allowUnknown: boolean;
  allowNotApplicable: boolean;
  allowEvidence: boolean;
  allowNotes: boolean;
  applicableByDefault: boolean;
  rules: RuleLike[];
};

export type AnswerView = {
  questionCode: string;
  value: AnswerValue;
  confidence: string;
  respondent: string | null;
  notes: string | null;
  updatedAt: string;
  evidences: { id: string; note: string | null; url: string | null; file: { id: string; name: string; bytes: number } | null; createdAt: string }[];
};

/** Diagnóstico completo para a tela: domínios, perguntas, regras, respostas, visibilidade e scores. */
export async function getAssessmentDetail(user: SessionUser, clientId: string, assessmentId: string) {
  const client = await assertClientAccess(user, clientId, "VIEW");
  const assessment = await loadOwned(clientId, assessmentId);
  const [domains, questions, answers, scaleLabels] = await Promise.all([
    prisma.assessmentDomain.findMany({ where: { templateId: assessment.templateId }, orderBy: { sortOrder: "asc" } }),
    prisma.assessmentQuestion.findMany({ where: { templateId: assessment.templateId }, orderBy: { sortOrder: "asc" }, include: { rules: true } }),
    prisma.assessmentAnswer.findMany({ where: { assessmentId, clientId }, include: { question: { select: { questionCode: true } }, evidences: { include: { file: true }, orderBy: { createdAt: "asc" } } } }),
    getSetting("scaleLabels"),
  ]);

  const questionViews: QuestionView[] = questions.map((q) => ({
    id: q.id,
    code: q.questionCode,
    domainCode: q.domainCode,
    title: q.title,
    type: q.type,
    weight: Number(q.weight),
    options: Array.isArray(q.optionsJson) ? (q.optionsJson as string[]) : null,
    guidance: q.guidance,
    allowUnknown: q.allowUnknown,
    allowNotApplicable: q.allowNotApplicable,
    allowEvidence: q.allowEvidence,
    allowNotes: q.allowNotes,
    applicableByDefault: q.applicableByDefault,
    rules: q.rules.map((r) => ({ effect: r.effect, conditionJson: r.conditionJson, reason: r.reason, active: r.active })),
  }));

  const answerViews: Record<string, AnswerView> = {};
  for (const a of answers) {
    const parsed = answerValueSchema.safeParse(a.valueJson);
    if (!parsed.success) continue;
    answerViews[a.question.questionCode] = {
      questionCode: a.question.questionCode,
      value: parsed.data,
      confidence: a.confidence,
      respondent: a.respondent,
      notes: a.notes,
      updatedAt: a.updatedAt.toISOString(),
      evidences: a.evidences.map((e) => ({
        id: e.id,
        note: e.note,
        url: e.url,
        file: e.file ? { id: e.file.id, name: e.file.originalName, bytes: e.file.bytes } : null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  const computed = computeScores(assessment.segment, questionViews, answerViews);
  return { client: { id: client.id, name: client.name, isDemo: client.isDemo }, assessment, domains, questions: questionViews, answers: answerViews, scaleLabels, ...computed };
}

/** Visibilidade + scores (mesma função pura usada no navegador). */
export function computeScores(segment: string, questions: QuestionView[], answers: Record<string, Pick<AnswerView, "value"> | undefined>) {
  const answerValues: Record<string, AnswerValue | undefined> = {};
  for (const [k, v] of Object.entries(answers)) answerValues[k] = v?.value;
  const ctx = { segment, answers: answerValues };
  const visibility: Record<string, { visible: boolean; reason?: string }> = {};
  for (const q of questions) visibility[q.code] = questionVisibility(q.applicableByDefault, q.rules, ctx);
  const domainScores = scoreDomains(
    questions.map((q) => ({ code: q.code, domainCode: q.domainCode, type: q.type, weight: q.weight, visible: visibility[q.code]!.visible })),
    answerValues,
  );
  return { visibility, domainScores, overall: overallScore(domainScores) };
}

// ───────────────────────── escrita ─────────────────────────

export const createAssessmentSchema = z.object({
  segment: z.enum(SEGMENT_CODES).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined)),
});

export async function createAssessment(user: SessionUser, clientId: string, input: unknown) {
  const client = await assertClientAccess(user, clientId, "EDIT");
  const d = createAssessmentSchema.parse(input ?? {});
  if (d.periodStart && d.periodEnd && d.periodEnd < d.periodStart) throw new AppError("VALIDATION", "Fim do período antes do início.");
  const template = await getActiveTemplate();
  return prisma.$transaction(async (tx) => {
    const last = await tx.assessment.aggregate({ where: { clientId }, _max: { number: true } });
    const a = await tx.assessment.create({
      data: {
        clientId,
        templateId: template.id,
        number: (last._max.number ?? 0) + 1,
        segment: d.segment ?? client.industry,
        periodStart: d.periodStart ? new Date(d.periodStart) : null,
        periodEnd: d.periodEnd ? new Date(d.periodEnd) : null,
        createdBy: user.id,
        isDemo: client.isDemo,
      },
    });
    await audit({ actorUserId: user.id, clientId, entityType: "Assessment", entityId: a.id, action: "assessment.create" }, tx);
    return a;
  });
}

function assertEditable(a: { status: string }) {
  if (a.status === "FINALIZED") throw new AppError("INVALID_STATE", "Diagnóstico fechado é somente leitura. Crie uma revisão para alterar.");
}

const ALLOWED_KINDS: Record<string, AnswerValue["kind"][]> = {
  SCALE_0_5: ["scale"],
  BOOLEAN: ["boolean"],
  NUMBER: ["number"],
  CURRENCY: ["number"],
  PERCENT: ["number"],
  TEXT: ["text"],
  SINGLE_CHOICE: ["choice"],
  MULTI_CHOICE: ["choices"],
  DATE: ["date"],
};

export const saveAnswerSchema = z.object({
  questionCode: z.string().min(2).max(40),
  value: answerValueSchema.nullable(),
  confidence: z.enum(["VERIFIED", "REPORTED", "ESTIMATED"]).optional(),
  respondent: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

/** Autosave de uma resposta (upsert por assessment+pergunta). `value: null` remove a resposta. */
export async function saveAnswer(user: SessionUser, clientId: string, assessmentId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const a = await loadOwned(clientId, assessmentId);
  assertEditable(a);
  const d = saveAnswerSchema.parse(input);
  const q = await prisma.assessmentQuestion.findFirst({ where: { templateId: a.templateId, questionCode: d.questionCode } });
  if (!q) throw new AppError("VALIDATION", "Pergunta não pertence a este questionário.");

  if (d.value === null) {
    const existing = await prisma.assessmentAnswer.findUnique({ where: { assessmentId_questionId: { assessmentId, questionId: q.id } }, include: { evidences: true } });
    if (existing && existing.evidences.length === 0 && !existing.notes) await prisma.assessmentAnswer.delete({ where: { id: existing.id } });
    else if (existing) throw new AppError("VALIDATION", "Remova evidências e notas antes de limpar a resposta.");
    return { savedAt: new Date().toISOString() };
  }

  const v = d.value;
  if (v.kind === "unknown" && !q.allowUnknown) throw new AppError("VALIDATION", "Esta pergunta não aceita 'não sei'.");
  if (v.kind === "na" && !q.allowNotApplicable) throw new AppError("VALIDATION", "Esta pergunta não aceita 'não se aplica'.");
  if (v.kind !== "unknown" && v.kind !== "na" && !ALLOWED_KINDS[q.type]?.includes(v.kind)) throw new AppError("VALIDATION", "Tipo de resposta incompatível com a pergunta.");
  if (v.kind === "choice" && Array.isArray(q.optionsJson) && !(q.optionsJson as string[]).includes(v.value)) throw new AppError("VALIDATION", "Opção inválida.");
  if (v.kind === "number" && q.type === "PERCENT" && (v.value < 0 || v.value > 100)) throw new AppError("VALIDATION", "Percentual deve estar entre 0 e 100.");

  const data = {
    valueJson: v as object,
    ...(d.confidence ? { confidence: d.confidence } : {}),
    ...(d.respondent !== undefined ? { respondent: d.respondent || null } : {}),
    ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    updatedBy: user.id,
  };
  const saved = await prisma.assessmentAnswer.upsert({
    where: { assessmentId_questionId: { assessmentId, questionId: q.id } },
    create: { clientId, assessmentId, questionId: q.id, ...data },
    update: data,
  });
  return { savedAt: saved.updatedAt.toISOString() };
}

/** Fecha o diagnóstico: grava scores e snapshot imutável (RF-026). */
export async function finalizeAssessment(user: SessionUser, clientId: string, assessmentId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const detail = await getAssessmentDetail(user, clientId, assessmentId);
  assertEditable(detail.assessment);
  if (detail.overall.answeredCount === 0) throw new AppError("VALIDATION", "Responda ao menos uma pergunta antes de fechar o diagnóstico.");

  const snapshot = {
    finalizedAt: new Date().toISOString(),
    segment: detail.assessment.segment,
    templateId: detail.assessment.templateId,
    answers: detail.answers,
    visibility: detail.visibility,
    domainScores: detail.domainScores,
    overall: detail.overall,
  };
  return prisma.$transaction(async (tx) => {
    // Trava otimista: só fecha se ainda não estiver fechado.
    const { count } = await tx.assessment.updateMany({
      where: { id: assessmentId, clientId, status: { not: "FINALIZED" } },
      data: { status: "FINALIZED", finalizedAt: new Date(), finalizedBy: user.id, snapshotJson: snapshot as unknown as Prisma.InputJsonValue },
    });
    if (count === 0) throw new AppError("INVALID_STATE", "Diagnóstico já foi fechado.");
    await tx.assessmentScore.deleteMany({ where: { assessmentId } });
    await tx.assessmentScore.createMany({ data: detail.domainScores.map((s) => scoreRow(clientId, assessmentId, s)) });
    await audit({ actorUserId: user.id, clientId, entityType: "Assessment", entityId: assessmentId, action: "assessment.finalize", after: snapshot }, tx);
    return tx.assessment.findUniqueOrThrow({ where: { id: assessmentId } });
  });
}

function scoreRow(clientId: string, assessmentId: string, s: DomainScore) {
  return {
    clientId,
    assessmentId,
    domainCode: s.domainCode,
    weightedScore: s.weightedScore,
    answeredWeight: s.answeredWeight,
    applicableWeight: s.applicableWeight,
    unknownCount: s.unknownCount,
    coverage: s.coverage,
  };
}

/** Cria revisão de um diagnóstico fechado copiando respostas e evidências; o original não muda. */
export async function createRevision(user: SessionUser, clientId: string, assessmentId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const parent = await loadOwned(clientId, assessmentId);
  if (parent.status !== "FINALIZED") throw new AppError("INVALID_STATE", "Só é possível revisar um diagnóstico fechado.");
  const openRevision = await prisma.assessment.findFirst({ where: { clientId, number: parent.number, status: { not: "FINALIZED" } } });
  if (openRevision) return openRevision;

  return prisma.$transaction(async (tx) => {
    const maxRev = await tx.assessment.aggregate({ where: { clientId, number: parent.number }, _max: { revision: true } });
    const rev = await tx.assessment.create({
      data: {
        clientId,
        templateId: parent.templateId,
        number: parent.number,
        revision: (maxRev._max.revision ?? 0) + 1,
        parentAssessmentId: parent.id,
        segment: parent.segment,
        periodStart: parent.periodStart,
        periodEnd: parent.periodEnd,
        createdBy: user.id,
        isDemo: parent.isDemo,
      },
    });
    const answers = await tx.assessmentAnswer.findMany({ where: { assessmentId: parent.id, clientId }, include: { evidences: true } });
    for (const a of answers) {
      await tx.assessmentAnswer.create({
        data: {
          clientId,
          assessmentId: rev.id,
          questionId: a.questionId,
          valueJson: a.valueJson as Prisma.InputJsonValue,
          confidence: a.confidence,
          respondent: a.respondent,
          source: a.source,
          notes: a.notes,
          updatedBy: user.id,
          evidences: { create: a.evidences.map((e) => ({ clientId, fileAssetId: e.fileAssetId, note: e.note, url: e.url, createdBy: e.createdBy })) },
        },
      });
    }
    await audit({ actorUserId: user.id, clientId, entityType: "Assessment", entityId: rev.id, action: "assessment.revision", meta: { parentId: parent.id } }, tx);
    return rev;
  });
}

// ───────────────────────── evidências ─────────────────────────

export const evidenceSchema = z.object({
  questionCode: z.string().min(2).max(40),
  note: z.string().trim().max(2000).optional().transform((v) => v || undefined),
  url: z.url("Link inválido.").max(500).optional().or(z.literal("").transform(() => undefined)),
  fileAssetId: z.uuid().optional(),
});

export async function addEvidence(user: SessionUser, clientId: string, assessmentId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const a = await loadOwned(clientId, assessmentId);
  assertEditable(a);
  const d = evidenceSchema.parse(input);
  if (!d.note && !d.url && !d.fileAssetId) throw new AppError("VALIDATION", "Informe um arquivo, link ou descrição da evidência.");
  if (d.url && !/^https?:\/\//i.test(d.url)) throw new AppError("VALIDATION", "Use links http(s).");
  const q = await prisma.assessmentQuestion.findFirst({ where: { templateId: a.templateId, questionCode: d.questionCode } });
  if (!q) throw new AppError("VALIDATION", "Pergunta não pertence a este questionário.");
  const answer = await prisma.assessmentAnswer.findUnique({ where: { assessmentId_questionId: { assessmentId, questionId: q.id } } });
  if (!answer) throw new AppError("VALIDATION", "Responda a pergunta antes de anexar evidência.");
  if (d.fileAssetId) {
    const file = await prisma.fileAsset.findFirst({ where: { id: d.fileAssetId, clientId } });
    if (!file) throw notFound("Arquivo");
  }
  const ev = await prisma.assessmentEvidence.create({ data: { clientId, assessmentAnswerId: answer.id, fileAssetId: d.fileAssetId, note: d.note, url: d.url, createdBy: user.id } });
  await audit({ actorUserId: user.id, clientId, entityType: "AssessmentEvidence", entityId: ev.id, action: "evidence.create" });
  return ev;
}

export async function removeEvidence(user: SessionUser, clientId: string, assessmentId: string, evidenceId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const a = await loadOwned(clientId, assessmentId);
  assertEditable(a);
  const { count } = await prisma.assessmentEvidence.deleteMany({ where: { id: evidenceId, clientId, answer: { assessmentId } } });
  if (!count) throw notFound("Evidência");
  await audit({ actorUserId: user.id, clientId, entityType: "AssessmentEvidence", entityId: evidenceId, action: "evidence.delete" });
}

// ───────────────────────── achados ─────────────────────────

export const findingSchema = z.object({
  assessmentId: z.uuid().optional(),
  type: z.enum(["PROBLEM", "OPPORTUNITY", "RISK", "DATA_GAP", "STRENGTH"]),
  domainCode: z.string().min(2).max(10),
  title: z.string().trim().min(3, "Informe o título.").max(200),
  description: z.string().trim().min(3, "Descreva o achado.").max(5000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  evidence: z.string().trim().max(2000).optional(),
});

export async function createManualFinding(user: SessionUser, clientId: string, input: unknown) {
  const client = await assertClientAccess(user, clientId, "EDIT");
  const d = findingSchema.parse(input);
  if (d.assessmentId) await loadOwned(clientId, d.assessmentId);
  const f = await prisma.finding.create({
    data: {
      clientId,
      assessmentId: d.assessmentId,
      type: d.type,
      domainCode: d.domainCode,
      title: d.title,
      description: d.description,
      severity: d.severity,
      confidence: d.confidence,
      origin: "CONSULTANT",
      evidenceJson: d.evidence ? [{ kind: "NOTE", text: d.evidence }] : undefined,
      createdBy: user.id,
      isDemo: client.isDemo,
    },
  });
  await audit({ actorUserId: user.id, clientId, entityType: "Finding", entityId: f.id, action: "finding.create" });
  return f;
}

/**
 * Achados preliminares por regra objetiva (RF-025), idempotentes por (assessment, ruleKey):
 * - área com score < 2,0 e cobertura ≥ 50% → maturidade baixa;
 * - área com cobertura < 50% → lacuna de dados (não vira conclusão).
 */
export async function generateRuleFindings(user: SessionUser, clientId: string, assessmentId: string) {
  const detail = await getAssessmentDetail(user, clientId, assessmentId);
  await assertClientAccess(user, clientId, "EDIT");
  const domainName = new Map(detail.domains.map((d) => [d.code, d.name]));
  let created = 0;
  for (const s of detail.domainScores) {
    if (s.applicableCount === 0) continue;
    const name = domainName.get(s.domainCode) ?? s.domainCode;
    const lowItems = detail.questions
      .filter((q) => q.domainCode === s.domainCode && detail.visibility[q.code]?.visible)
      .filter((q) => {
        const v = detail.answers[q.code]?.value;
        return v?.kind === "scale" && v.value <= 1;
      })
      .map((q) => ({ kind: "ASSESSMENT_ANSWER", questionCode: q.code, title: q.title, value: (detail.answers[q.code]!.value as { value: number }).value }));

    let rule: { key: string; type: "PROBLEM" | "DATA_GAP"; title: string; description: string; severity: "HIGH" | "MEDIUM" | "LOW"; confidence: "MEDIUM" | "LOW"; evidence: unknown[] } | null = null;
    if (s.coverage >= 0.5 && s.weightedScore !== null && s.weightedScore < 2) {
      rule = {
        key: `LOW_MATURITY:${s.domainCode}`,
        type: "PROBLEM",
        title: `Maturidade baixa em ${name}`,
        description: `Score ${s.weightedScore.toFixed(1).replace(".", ",")} de 5 com cobertura de ${Math.round(s.coverage * 100)}% das perguntas aplicáveis. Achado preliminar gerado por regra: validar com evidências antes de priorizar.`,
        severity: s.weightedScore < 1 ? "HIGH" : "MEDIUM",
        confidence: "MEDIUM",
        evidence: [{ kind: "ASSESSMENT_SCORE", domainCode: s.domainCode, score: s.weightedScore, coverage: s.coverage }, ...lowItems],
      };
    } else if (s.coverage < 0.5) {
      rule = {
        key: `DATA_GAP:${s.domainCode}`,
        type: "DATA_GAP",
        title: `Lacuna de informação em ${name}`,
        description: `Somente ${Math.round(s.coverage * 100)}% das perguntas aplicáveis foram respondidas (${s.unknownCount} marcadas como "não sei"). Completar antes de concluir sobre esta área.`,
        severity: "LOW",
        confidence: "LOW",
        evidence: [{ kind: "ASSESSMENT_SCORE", domainCode: s.domainCode, score: s.weightedScore, coverage: s.coverage }],
      };
    }
    if (!rule) continue;
    const exists = await prisma.finding.findUnique({ where: { assessmentId_ruleKey: { assessmentId, ruleKey: rule.key } } });
    if (exists) continue;
    await prisma.finding.create({
      data: {
        clientId,
        assessmentId,
        ruleKey: rule.key,
        type: rule.type,
        domainCode: s.domainCode,
        title: rule.title,
        description: rule.description,
        severity: rule.severity,
        confidence: rule.confidence,
        origin: "RULE",
        evidenceJson: rule.evidence as Prisma.InputJsonValue,
        createdBy: user.id,
        isDemo: detail.client.isDemo,
      },
    });
    created++;
  }
  await audit({ actorUserId: user.id, clientId, entityType: "Assessment", entityId: assessmentId, action: "finding.generate_rules", meta: { created } });
  return { created };
}

export async function listFindings(user: SessionUser, clientId: string, assessmentId?: string) {
  await assertClientAccess(user, clientId, "VIEW");
  return prisma.finding.findMany({ where: { clientId, ...(assessmentId ? { assessmentId } : {}) }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
}

export const findingStatusSchema = z.object({
  status: z.enum(["REVIEWED", "APPROVED", "DISMISSED"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function updateFindingStatus(user: SessionUser, clientId: string, findingId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const d = findingStatusSchema.parse(input);
  if (d.status === "DISMISSED" && !d.reason) throw new AppError("VALIDATION", "Informe o motivo do descarte.");
  if (!isUuid(findingId)) throw notFound("Achado");
  const f = await prisma.finding.findFirst({ where: { id: findingId, clientId } });
  if (!f) throw notFound("Achado");
  const updated = await prisma.finding.update({ where: { id: f.id }, data: { status: d.status, dismissReason: d.status === "DISMISSED" ? d.reason : null } });
  await audit({ actorUserId: user.id, clientId, entityType: "Finding", entityId: f.id, action: `finding.${d.status.toLowerCase()}`, meta: { reason: d.reason ?? null } });
  return updated;
}
