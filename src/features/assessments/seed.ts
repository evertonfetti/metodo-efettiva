import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { conditionSchema } from "./conditions";

import { BASE_TEMPLATE } from "./constants";
export { BASE_TEMPLATE };

type SeedQuestion = { code: string; domainCode: string; domainName?: string; title: string; type: string; weight: number; options?: string[] | null; guidance?: string | null; applicableByDefault: boolean; allowUnknown?: boolean };
type SeedRule = { code: string; target: string; effect: "SHOW" | "HIDE"; condition: unknown; reason: string };

const root = process.cwd();
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(path.join(root, p), "utf8")) as T;

/**
 * Importa o questionário-base (96 perguntas, 12 áreas) e as perguntas/regras condicionais.
 * Idempotente: cria o que falta; nunca sobrescreve regras já existentes (podem ter sido editadas).
 */
export async function seedQuestionnaire(prisma: PrismaClient) {
  const base = readJson<{ questions: SeedQuestion[] }>("questionario_diagnostico_seed.json").questions;
  const cond = readJson<{ questions: SeedQuestion[]; rules: SeedRule[] }>("prisma/seed-data/diagnostico-condicional.json");

  const template = await prisma.assessmentTemplate.upsert({
    where: { code_version: { code: BASE_TEMPLATE.code, version: BASE_TEMPLATE.version } },
    create: { ...BASE_TEMPLATE, industry: "GERAL", status: "ACTIVE" },
    update: {},
  });

  const domains = new Map<string, string>();
  for (const q of base) if (q.domainName) domains.set(q.domainCode, q.domainName);
  let order = 0;
  for (const [code, name] of domains) {
    await prisma.assessmentDomain.upsert({
      where: { templateId_code: { templateId: template.id, code } },
      create: { templateId: template.id, code, name, sortOrder: ++order },
      update: { name },
    });
  }

  const all = [...base, ...cond.questions];
  const seen = new Set<string>();
  let created = 0;
  for (const [i, q] of all.entries()) {
    if (seen.has(q.code)) throw new Error(`Código de pergunta duplicado no seed: ${q.code}`);
    seen.add(q.code);
    const exists = await prisma.assessmentQuestion.findUnique({ where: { templateId_questionCode: { templateId: template.id, questionCode: q.code } } });
    if (exists) continue;
    await prisma.assessmentQuestion.create({
      data: {
        templateId: template.id,
        domainCode: q.domainCode,
        questionCode: q.code,
        title: q.title,
        type: q.type as never,
        weight: q.weight,
        sortOrder: i + 1,
        optionsJson: q.options ?? undefined,
        guidance: q.guidance ?? null,
        applicableByDefault: q.applicableByDefault,
        allowUnknown: q.allowUnknown ?? true,
      },
    });
    created++;
  }

  const questions = await prisma.assessmentQuestion.findMany({ where: { templateId: template.id }, select: { id: true, questionCode: true } });
  const idByCode = new Map(questions.map((q) => [q.questionCode, q.id]));
  let rulesCreated = 0;
  for (const r of cond.rules) {
    const targetId = idByCode.get(r.target);
    if (!targetId) throw new Error(`Regra ${r.code} aponta para pergunta inexistente ${r.target}`);
    const condition = conditionSchema.parse(r.condition);
    const exists = await prisma.assessmentRule.findUnique({ where: { templateId_code: { templateId: template.id, code: r.code } } });
    if (exists) continue;
    await prisma.assessmentRule.create({
      data: { templateId: template.id, targetQuestionId: targetId, code: r.code, effect: r.effect, conditionJson: condition as object, reason: r.reason, isSeed: true },
    });
    rulesCreated++;
  }

  return { templateId: template.id, questionsCreated: created, totalQuestions: questions.length, rulesCreated };
}
