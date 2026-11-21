import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/service";
import { suggestProcessCodes, toProcessDomain } from "@/features/processes/mapping";
import { processCatalog } from "@/features/processes/service";
import { OPPORTUNITY_TRANSITIONS, priorityScore, sortOpportunities, transitionNeedsReason } from "./scoring";

const scale = z.coerce.number().int("Use inteiros de 1 a 5.").min(1, "Mínimo 1.").max(5, "Máximo 5.");
const optText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
const optMoney = z.preprocess((v) => {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return v;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  return s === "" ? null : Number(s);
}, z.number({ error: "Valor inválido." }).finite().nonnegative("Valor não pode ser negativo.").max(1e12).nullable());
const lines = z.preprocess(
  (v) => (Array.isArray(v) ? v : String(v ?? "").split(/\r?\n/)).map((s) => String(s).trim()).filter(Boolean),
  z.array(z.string().max(500)).max(30),
);
const codes = z.preprocess(
  (v) => (Array.isArray(v) ? v : [v]).flatMap((x) => String(x ?? "").split(/[\s,;]+/)).map((s) => s.trim().toUpperCase()).filter(Boolean),
  z.array(z.string().regex(/^[A-Z]\d{2}$/, "Código de processo inválido.")).max(20),
);

export const opportunitySchema = z
  .object({
    findingId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
    title: z.string().trim().min(5, "Informe um título (mínimo 5 caracteres).").max(200),
    explanation: z.string().trim().min(10, "Explique a oportunidade (mínimo 10 caracteres).").max(5000),
    expectedOutcome: optText(2000),
    domainCode: z.string().trim().regex(/^[A-Z]$/, "Selecione a área."),
    origin: z.enum(["CONSULTANT", "RULE", "AI_SUGGESTION"]).default("CONSULTANT"),
    impactScore: scale,
    confidenceScore: scale,
    effortScore: scale,
    criticalRisk: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
    criticalRiskReason: optText(1000),
    urgency: z.preprocess((v) => (v === "" || v == null ? null : v), scale.nullable()),
    dependency: optText(1000),
    costEstimate: optMoney,
    timeToImpact: optText(200),
    consultantOverrideReason: optText(1000),
    estimatedValue: optMoney,
    estimateType: z.preprocess((v) => (v === "" ? null : v), z.enum(["OBSERVED", "ESTIMATED", "TARGET"]).nullable().default(null)),
    assumptions: lines,
    evidence: lines,
    missingData: optText(2000),
    processCodes: codes.default([]),
  })
  .superRefine((d, ctx) => {
    if (d.criticalRisk && !d.criticalRiskReason) ctx.addIssue({ code: "custom", path: ["criticalRiskReason"], message: "Explique o risco crítico (segurança, conformidade, capacidade ou caixa)." });
    if (d.estimatedValue != null && !d.estimateType) ctx.addIssue({ code: "custom", path: ["estimateType"], message: "Classifique o valor (observado, estimado ou meta)." });
    if (d.estimatedValue != null && d.estimateType === "ESTIMATED" && d.assumptions.length === 0)
      ctx.addIssue({ code: "custom", path: ["assumptions"], message: "Valor estimado exige ao menos uma premissa." });
  });
export type OpportunityInput = z.input<typeof opportunitySchema>;

export const opportunityFilterSchema = z.object({
  area: z.string().regex(/^[A-Z]$/).optional().catch(undefined),
  origin: z.enum(["RULE", "CONSULTANT", "AI_SUGGESTION"]).optional().catch(undefined),
  status: z.enum(["DETECTED", "REVIEWED", "APPROVED", "DISMISSED", "LINKED_TO_PROJECT"]).optional().catch(undefined),
  conf: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
});

const include = {
  processes: { include: { process: { select: { code: true, name: true, hasFullSheet: true } } }, orderBy: [{ selected: "desc" as const }, { rank: "asc" as const }] },
  finding: { select: { id: true, title: true, assessmentId: true, origin: true, evidenceJson: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.OpportunityInclude;

export type OpportunityView = Awaited<ReturnType<typeof listOpportunities>>[number];

export async function listOpportunities(user: SessionUser, clientId: string, filters: unknown = {}) {
  await assertClientAccess(user, clientId, "VIEW");
  const f = opportunityFilterSchema.parse(filters);
  const rows = await prisma.opportunity.findMany({
    where: {
      clientId,
      ...(f.area ? { domainCode: f.area } : {}),
      ...(f.origin ? { origin: f.origin } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.conf ? { confidenceScore: { gte: f.conf } } : {}),
    },
    include,
    take: 500,
  });
  return sortOpportunities(rows.map((r) => ({ ...r, priorityScore: Number(r.priorityScore) })));
}

export async function getOpportunity(user: SessionUser, clientId: string, id: string) {
  await assertClientAccess(user, clientId, "VIEW");
  if (!isUuid(id)) throw notFound("Oportunidade");
  const o = await prisma.opportunity.findFirst({ where: { id, clientId }, include });
  if (!o) throw notFound("Oportunidade");
  return { ...o, priorityScore: Number(o.priorityScore) };
}

async function resolveCodes(list: string[]) {
  if (list.length === 0) return [];
  const unique = [...new Set(list)];
  const found = await prisma.processDefinition.findMany({ where: { code: { in: unique } }, select: { id: true, code: true } });
  const missing = unique.filter((c) => !found.some((f) => f.code === c));
  if (missing.length) throw new AppError("VALIDATION", `Processo inexistente no catálogo: ${missing.join(", ")}.`, { processCodes: missing });
  return unique.map((c) => found.find((f) => f.code === c)!);
}

function dataFrom(d: z.output<typeof opportunitySchema>) {
  return {
    title: d.title,
    explanation: d.explanation,
    expectedOutcome: d.expectedOutcome ?? null,
    domainCode: d.domainCode,
    impactScore: d.impactScore,
    confidenceScore: d.confidenceScore,
    effortScore: d.effortScore,
    priorityScore: new Prisma.Decimal(priorityScore(d.impactScore, d.confidenceScore, d.effortScore)),
    criticalRisk: d.criticalRisk,
    criticalRiskReason: d.criticalRisk ? (d.criticalRiskReason ?? null) : null,
    urgency: d.urgency,
    dependency: d.dependency ?? null,
    costEstimate: d.costEstimate,
    timeToImpact: d.timeToImpact ?? null,
    consultantOverrideReason: d.consultantOverrideReason ?? null,
    estimatedValue: d.estimatedValue,
    estimateType: d.estimatedValue != null ? d.estimateType : null,
    assumptionsJson: d.assumptions,
    missingData: d.missingData ?? null,
  };
}

/**
 * Registra oportunidade (RF-046/047). Sem `findingId`, cria também o achado de origem CONSULTANT
 * para manter rastreabilidade achado → oportunidade. Processos informados são validados no catálogo;
 * se nenhum for informado, grava sugestões determinísticas da área (não selecionadas).
 */
export async function createOpportunity(user: SessionUser, clientId: string, input: unknown) {
  const client = await assertClientAccess(user, clientId, "EDIT");
  const d = opportunitySchema.parse(input);
  const selected = await resolveCodes(d.processCodes);
  const catalog = await processCatalog();
  const suggestedCodes = suggestProcessCodes(d.domainCode, catalog).filter((c) => !d.processCodes.includes(c));
  const suggested = suggestedCodes.map((code) => catalog.find((p) => p.code === code)!);

  let finding: { id: string; origin: "RULE" | "CONSULTANT" | "AI_SUGGESTION"; evidenceJson: unknown; title: string } | null = null;
  if (d.findingId) {
    finding = await prisma.finding.findFirst({ where: { id: d.findingId, clientId }, select: { id: true, origin: true, evidenceJson: true, title: true, status: true } });
    if (!finding) throw notFound("Achado");
  }

  const evidence = [
    ...(Array.isArray(finding?.evidenceJson) ? (finding.evidenceJson as unknown[]) : []),
    ...(finding ? [{ kind: "FINDING", findingId: finding.id, title: finding.title }] : []),
    ...d.evidence.map((text) => ({ kind: "NOTE", text })),
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        let findingId = finding?.id ?? null;
        if (!findingId) {
          const f = await tx.finding.create({
            data: {
              clientId,
              type: "OPPORTUNITY",
              domainCode: d.domainCode,
              title: d.title,
              description: d.explanation,
              origin: "CONSULTANT",
              confidence: d.confidenceScore >= 4 ? "HIGH" : d.confidenceScore >= 3 ? "MEDIUM" : "LOW",
              severity: d.criticalRisk ? "CRITICAL" : "MEDIUM",
              evidenceJson: d.evidence.map((text) => ({ kind: "NOTE", text })),
              createdBy: user.id,
              isDemo: client.isDemo,
            },
          });
          findingId = f.id;
        }
        const last = await tx.opportunity.aggregate({ where: { clientId }, _max: { number: true } });
        const o = await tx.opportunity.create({
          data: {
            ...dataFrom(d),
            clientId,
            number: (last._max.number ?? 0) + 1,
            findingId,
            origin: finding?.origin ?? d.origin,
            evidenceJson: evidence as Prisma.InputJsonValue,
            createdBy: user.id,
            isDemo: client.isDemo,
            processes: {
              create: [
                ...selected.map((p, i) => ({ clientId, processDefinitionId: p.id, rank: i, selected: true, selectedBy: user.id, rationale: "Seleção do consultor" })),
                ...suggested.map((p, i) => ({ clientId, processDefinitionId: p.id, rank: 100 + i, selected: false, suggested: true, rationale: `Sugerido pela área ${d.domainCode} (regra determinística)` })),
              ],
            },
          },
        });
        await audit({ actorUserId: user.id, clientId, entityType: "Opportunity", entityId: o.id, action: "opportunity.create", after: o }, tx);
        return o;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 2) continue;
      throw err;
    }
  }
  throw new AppError("CONFLICT", "Não foi possível numerar a oportunidade. Tente novamente.");
}

async function loadOwned(clientId: string, id: string) {
  if (!isUuid(id)) throw notFound("Oportunidade");
  const o = await prisma.opportunity.findFirst({ where: { id, clientId } });
  if (!o) throw notFound("Oportunidade");
  return o;
}

/** Edição de conteúdo/estimativa; descartada ou em projeto não muda escopo silenciosamente. */
export async function updateOpportunity(user: SessionUser, clientId: string, id: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const current = await loadOwned(clientId, id);
  if (current.status === "DISMISSED") throw new AppError("INVALID_STATE", "Reabra a oportunidade antes de editar.");
  const d = opportunitySchema.parse(input);
  const updated = await prisma.opportunity.update({ where: { id: current.id }, data: dataFrom(d) });
  await audit({ actorUserId: user.id, clientId, entityType: "Opportunity", entityId: id, action: "opportunity.update", before: current, after: updated });
  return updated;
}

export const transitionSchema = z.object({
  status: z.enum(["DETECTED", "REVIEWED", "APPROVED", "DISMISSED"]),
  reason: optText(1000),
});

/** Fluxo DETECTED → REVIEWED → APPROVED / DISMISSED (RF-048), com responsável, data e motivo. */
export async function transitionOpportunity(user: SessionUser, clientId: string, id: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const d = transitionSchema.parse(input);
  const current = await loadOwned(clientId, id);
  if (!OPPORTUNITY_TRANSITIONS[current.status]?.includes(d.status))
    throw new AppError("INVALID_STATE", current.status === "LINKED_TO_PROJECT" ? "Oportunidade já vinculada a projeto." : "Transição de status não permitida.");
  if (transitionNeedsReason(current.status, d.status) && !d.reason) throw new AppError("VALIDATION", "Informe o motivo.", { reason: "Informe o motivo." });
  const now = new Date();
  const res = await prisma.opportunity.updateMany({
    where: { id: current.id, status: current.status },
    data: {
      status: d.status,
      statusReason: d.reason ?? null,
      ...(d.status === "REVIEWED" ? { reviewerId: user.id, reviewedAt: now } : {}),
      ...(d.status === "APPROVED" ? { approvedAt: now, reviewerId: current.reviewerId ?? user.id } : {}),
      ...(d.status !== "APPROVED" ? { approvedAt: null } : {}),
    },
  });
  if (res.count === 0) throw new AppError("CONFLICT", "A oportunidade foi alterada por outra pessoa. Recarregue a página.");
  await audit({ actorUserId: user.id, clientId, entityType: "Opportunity", entityId: id, action: `opportunity.${d.status.toLowerCase()}`, meta: { from: current.status, reason: d.reason ?? null } });
  return { id, status: d.status };
}

export const processSelectionSchema = z.object({ processCodes: codes, rationale: optText(1000) });

/** Seleção manual de processos (RF-062): substitui os selecionados, mantém sugestões como não selecionadas. */
export async function setOpportunityProcesses(user: SessionUser, clientId: string, id: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const d = processSelectionSchema.parse(input);
  const current = await loadOwned(clientId, id);
  if (current.status === "LINKED_TO_PROJECT" || current.status === "DISMISSED") throw new AppError("INVALID_STATE", "Processos não podem ser alterados neste status.");
  const procs = await resolveCodes(d.processCodes);
  await prisma.$transaction(async (tx) => {
    await tx.opportunityProcess.updateMany({ where: { opportunityId: id, processDefinitionId: { notIn: procs.map((p) => p.id) } }, data: { selected: false } });
    await tx.opportunityProcess.deleteMany({ where: { opportunityId: id, selected: false, suggested: false } });
    for (const [i, p] of procs.entries()) {
      await tx.opportunityProcess.upsert({
        where: { opportunityId_processDefinitionId: { opportunityId: id, processDefinitionId: p.id } },
        create: { clientId, opportunityId: id, processDefinitionId: p.id, rank: i, selected: true, selectedBy: user.id, rationale: d.rationale ?? "Seleção do consultor" },
        update: { rank: i, selected: true, selectedBy: user.id, ...(d.rationale ? { rationale: d.rationale } : {}) },
      });
    }
    await audit({ actorUserId: user.id, clientId, entityType: "Opportunity", entityId: id, action: "opportunity.processes", meta: { codes: d.processCodes } }, tx);
  });
  return { id, processCodes: d.processCodes };
}

/** Achados do cliente que ainda não originaram oportunidade (para "Registrar a partir de achado"). */
export async function findingsWithoutOpportunity(user: SessionUser, clientId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  return prisma.finding.findMany({
    where: { clientId, status: { not: "DISMISSED" }, opportunities: { none: {} }, type: { not: "STRENGTH" } },
    select: { id: true, title: true, domainCode: true, description: true, origin: true, confidence: true, severity: true, assessmentId: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export { toProcessDomain };
