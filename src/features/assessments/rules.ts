import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertRole, isUuid } from "@/lib/security/access";
import type { SessionUser } from "@/features/auth/service";
import { SEGMENT_CODES, segmentLabel } from "@/features/clients/catalog";
import { conditionSchema, type Condition } from "./conditions";
import { getActiveTemplate } from "./service";

/** Formulário estruturado de regra (sem editor livre de JSON): por segmento ou por resposta anterior. */
export const ruleFormSchema = z
  .object({
    id: z.uuid().optional().or(z.literal("").transform(() => undefined)),
    targetQuestionCode: z.string().min(2, "Escolha a pergunta-alvo."),
    effect: z.enum(["SHOW", "HIDE"]),
    conditionType: z.enum(["SEGMENT", "ANSWER"]),
    segments: z.array(z.enum(SEGMENT_CODES)).default([]),
    answerQuestionCode: z.string().optional(),
    operator: z.enum(["lessThan", "greaterThan", "equals"]).optional(),
    value: z.coerce.number().int().min(0).max(5).optional(),
    reason: z.string().trim().min(5, "Explique o motivo exibido ao consultor.").max(200),
    active: z.coerce.boolean().default(true),
  })
  .refine((v) => v.conditionType !== "SEGMENT" || v.segments.length > 0, { message: "Selecione ao menos um segmento.", path: ["segments"] })
  .refine((v) => v.conditionType !== "ANSWER" || (!!v.answerQuestionCode && !!v.operator && v.value !== undefined), { message: "Informe pergunta, operador e valor.", path: ["answerQuestionCode"] })
  .refine((v) => v.conditionType !== "ANSWER" || v.answerQuestionCode !== v.targetQuestionCode, { message: "A condição não pode depender da própria pergunta.", path: ["answerQuestionCode"] });

export function buildCondition(v: z.infer<typeof ruleFormSchema>): Condition {
  if (v.conditionType === "SEGMENT") {
    return v.segments.length === 1 ? { op: "equals", field: "segment", value: v.segments[0]! } : { op: "in", field: "segment", values: v.segments };
  }
  return { op: v.operator!, field: `answer:${v.answerQuestionCode}`, value: v.value! } as Condition;
}

/** Descrição legível da condição (para listagem). */
export function describeCondition(c: Condition, titleOf: (code: string) => string = (x) => x): string {
  const field = (f: string) => (f === "segment" ? "segmento" : `resposta de ${f.slice(7)} (${titleOf(f.slice(7)).slice(0, 50)}…)`);
  const val = (f: string, v: unknown) => (f === "segment" ? segmentLabel(String(v)) : String(v));
  switch (c.op) {
    case "equals":
      return `${field(c.field)} = ${val(c.field, c.value)}`;
    case "in":
      return `${field(c.field)} em ${c.values.map((v) => val(c.field, v)).join(", ")}`;
    case "lessThan":
      return `${field(c.field)} < ${c.value}`;
    case "greaterThan":
      return `${field(c.field)} > ${c.value}`;
    case "not":
      return `não (${describeCondition(c.condition, titleOf)})`;
    case "and":
      return c.conditions.map((x) => describeCondition(x, titleOf)).join(" e ");
    case "or":
      return c.conditions.map((x) => describeCondition(x, titleOf)).join(" ou ");
  }
}

export async function listRules() {
  const template = await getActiveTemplate();
  const [rules, questions] = await Promise.all([
    prisma.assessmentRule.findMany({ where: { templateId: template.id }, include: { target: { select: { questionCode: true, title: true } } }, orderBy: { code: "asc" } }),
    prisma.assessmentQuestion.findMany({ where: { templateId: template.id }, select: { questionCode: true, title: true, type: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return { template, rules, questions };
}

export async function saveRule(user: SessionUser, input: unknown) {
  assertRole(user, "OWNER");
  const v = ruleFormSchema.parse(input);
  const template = await getActiveTemplate();
  const target = await prisma.assessmentQuestion.findFirst({ where: { templateId: template.id, questionCode: v.targetQuestionCode } });
  if (!target) throw new AppError("VALIDATION", "Pergunta-alvo inexistente.");
  if (v.conditionType === "ANSWER") {
    const src = await prisma.assessmentQuestion.findFirst({ where: { templateId: template.id, questionCode: v.answerQuestionCode } });
    if (!src || src.type !== "SCALE_0_5") throw new AppError("VALIDATION", "A condição por resposta usa perguntas da escala 0–5.");
  }
  const conditionJson = conditionSchema.parse(buildCondition(v)) as object;
  if (v.id) {
    if (!isUuid(v.id)) throw notFound("Regra");
    const before = await prisma.assessmentRule.findFirst({ where: { id: v.id, templateId: template.id } });
    if (!before) throw notFound("Regra");
    const rule = await prisma.assessmentRule.update({ where: { id: v.id }, data: { targetQuestionId: target.id, effect: v.effect, conditionJson, reason: v.reason, active: v.active, updatedBy: user.id } });
    await audit({ actorUserId: user.id, entityType: "AssessmentRule", entityId: rule.id, action: "rule.update", before, after: rule });
    return rule;
  }
  const code = `USR_${v.effect}_${v.targetQuestionCode}_${Date.now().toString(36).toUpperCase()}`;
  const rule = await prisma.assessmentRule.create({ data: { templateId: template.id, targetQuestionId: target.id, code, effect: v.effect, conditionJson, reason: v.reason, active: v.active, updatedBy: user.id } });
  await audit({ actorUserId: user.id, entityType: "AssessmentRule", entityId: rule.id, action: "rule.create" });
  return rule;
}

export async function setRuleActive(user: SessionUser, ruleId: string, active: boolean) {
  assertRole(user, "OWNER");
  if (!isUuid(ruleId)) throw notFound("Regra");
  const r = await prisma.assessmentRule.update({ where: { id: ruleId }, data: { active, updatedBy: user.id } }).catch(() => null);
  if (!r) throw notFound("Regra");
  await audit({ actorUserId: user.id, entityType: "AssessmentRule", entityId: ruleId, action: active ? "rule.activate" : "rule.deactivate" });
  return r;
}
