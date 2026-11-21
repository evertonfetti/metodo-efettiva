import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import { enqueueJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/service";
import { getSetting } from "@/features/settings/service";
import { applyAiContent } from "@/features/documents/service";
import { contentSchema, type Block } from "@/features/documents/content";
import { aiConfigured, estimateCost, getAiProvider } from "./provider";
import { assembleSectionContext, type AiEvidence } from "./context";
import { PROMPT_VERSION, SYSTEM_PROMPT, userPrompt } from "./prompt";
import { OUTPUT_SCHEMA_VERSION, sectionDraftSchema, type SectionDraft } from "./schemas";
import { restore, validateDraft, type AiIssue } from "./validate";

/** Situação da IA para um cliente: sem chave / desativada / cliente não autorizado → o sistema segue sem IA. */
export async function aiStatus(clientId?: string) {
  const s = await getSetting("ai");
  const configured = aiConfigured();
  const client = clientId ? await prisma.client.findUnique({ where: { id: clientId }, select: { externalAiAllowed: true } }) : null;
  const reason = !configured ? "IA desativada: chave do provedor não configurada (ANTHROPIC_API_KEY)." : !s.enabled ? "IA desativada em Configurações." : clientId && !client?.externalAiAllowed ? "IA externa não autorizada para este cliente (edite o cliente para autorizar)." : null;
  return { available: !reason, reason, model: s.model, effort: s.effort, settings: s };
}

export const requestSchema = z.object({
  sectionKeys: z.array(z.string().regex(/^[a-z0-9:-]{2,60}$/)).min(1).max(8),
  includeFinancial: z.boolean().default(false),
  instruction: z.string().trim().max(1000).optional(),
});

const charsToTokens = (n: number) => Math.ceil(n / 3.2);

async function guard(user: SessionUser, clientId: string, documentId: string, revisionId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const st = await aiStatus(clientId);
  if (!st.available) throw new AppError("INVALID_STATE", st.reason!);
  if (!isUuid(documentId) || !isUuid(revisionId)) throw notFound("Documento");
  const rev = await prisma.documentRevision.findFirst({ where: { id: revisionId, documentId, clientId }, select: { state: true } });
  if (!rev) throw notFound("Versão");
  if (rev.state !== "DRAFT" && rev.state !== "READY_FOR_REVIEW") throw new AppError("INVALID_STATE", "Versão aprovada é imutável: crie uma nova versão para pedir sugestões.");
  return st.settings;
}

/** Prévia exata do que seria enviado ao provedor (8.6), com custo estimado e campos sensíveis. */
export async function previewGeneration(user: SessionUser, clientId: string, documentId: string, revisionId: string, input: unknown) {
  const s = await guard(user, clientId, documentId, revisionId);
  const d = requestSchema.parse(input);
  const items = [];
  for (const key of d.sectionKeys) {
    const a = await assembleSectionContext(user, clientId, documentId, revisionId, key, { includeFinancial: d.includeFinancial, instruction: d.instruction });
    const inTok = charsToTokens(SYSTEM_PROMPT.length + JSON.stringify(a.payload).length + 400);
    items.push({ sectionKey: key, title: a.sectionTitle, payload: a.payload, sensitive: a.sensitive, pseudonymized: [...new Set(a.replacements.map(([t]) => t))], estimatedCostUsd: estimateCost(s.model, inTok, s.maxOutputTokens), estimatedInputTokens: inTok });
  }
  return { model: s.model, maxCostUsdPerTask: s.maxCostUsdPerTask, providerNotes: s.providerNotes, items };
}

/** Enfileira geração(ões) como rascunho (nada é aplicado sem decisão do consultor). */
export async function requestGeneration(user: SessionUser, clientId: string, documentId: string, revisionId: string, input: unknown) {
  const s = await guard(user, clientId, documentId, revisionId);
  const d = requestSchema.parse(input);
  const recent = await prisma.aiGeneration.count({ where: { actorUserId: user.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recent + d.sectionKeys.length > s.maxRequestsPerHour) throw new AppError("RATE_LIMITED", `Limite de ${s.maxRequestsPerHour} gerações por hora atingido. Tente mais tarde.`);
  const created = [];
  for (const key of d.sectionKeys) {
    const a = await assembleSectionContext(user, clientId, documentId, revisionId, key, { includeFinancial: d.includeFinancial, instruction: d.instruction });
    const inTok = charsToTokens(SYSTEM_PROMPT.length + JSON.stringify(a.payload).length + 400);
    const est = estimateCost(s.model, inTok, s.maxOutputTokens);
    if (est != null && est > s.maxCostUsdPerTask) throw new AppError("VALIDATION", `Custo estimado (US$ ${est.toFixed(2)}) acima do limite por tarefa (US$ ${s.maxCostUsdPerTask.toFixed(2)}): reduza a seção ou ajuste o limite.`);
    const gen = await prisma.aiGeneration.create({
      data: {
        clientId,
        actorUserId: user.id,
        documentId,
        revisionId,
        sectionKey: key,
        taskType: (a.payload.task as { type: string }).type,
        provider: "anthropic",
        model: s.model,
        promptVersion: PROMPT_VERSION,
        inputHash: a.inputHash,
        inputJson: { sent: a.payload, local: { replacements: a.replacements, evidence: a.evidence, allowedProcessCodes: a.allowedProcessCodes, includeFinancial: d.includeFinancial, instruction: d.instruction ?? null } } as unknown as Prisma.InputJsonValue,
        evidenceRefsJson: a.evidence.map((e) => e.ref),
        outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
      },
    });
    const job = await enqueueJob({ operation: "ai.generate", clientId, createdBy: user.id, idempotencyKey: `ai.generate:${gen.id}`, payload: { generationId: gen.id } });
    await prisma.aiGeneration.update({ where: { id: gen.id }, data: { jobId: job.id } });
    await audit({ actorUserId: user.id, clientId, entityType: "AiGeneration", entityId: gen.id, action: "ai.request", meta: { sectionKey: key, model: s.model, inputHash: a.inputHash, includeFinancial: d.includeFinancial } });
    created.push({ id: gen.id, sectionKey: key, jobId: job.id });
  }
  return { items: created };
}

type Local = { replacements: [string, string][]; evidence: AiEvidence[]; allowedProcessCodes: string[] };

/** Worker: revalida cliente/autorização, chama o provedor, valida (Zod + negócio) e guarda como rascunho. */
export async function runGeneration(generationId: string, jobClientId: string | null) {
  const g = await prisma.aiGeneration.findUnique({ where: { id: generationId } });
  if (!g) throw new Error("Geração não encontrada");
  if (g.clientId !== jobClientId) throw new Error("clientId do job diverge da geração");
  if (g.status === "COMPLETED") return { status: g.status };
  const fail = async (code: string, message: string) => {
    await prisma.aiGeneration.update({ where: { id: g.id }, data: { status: "FAILED", errorCode: code, errorMessage: message.slice(0, 500), finishedAt: new Date() } });
    return { status: "FAILED", code };
  };
  const client = await prisma.client.findUnique({ where: { id: g.clientId }, select: { externalAiAllowed: true } });
  if (!client?.externalAiAllowed) return fail("NOT_ALLOWED", "IA externa não autorizada para este cliente.");
  const provider = await getAiProvider();
  const s = await getSetting("ai");
  if (!provider || !s.enabled) return fail("DISABLED", "IA desativada ou sem chave configurada.");
  await prisma.aiGeneration.update({ where: { id: g.id }, data: { status: "RUNNING" } });
  const input = g.inputJson as unknown as { sent: Record<string, unknown>; local: Local & { instruction: string | null } };
  let res;
  try {
    res = await provider.generateStructured<SectionDraft>({ system: SYSTEM_PROMPT, user: userPrompt(input.sent, input.local.instruction), schema: sectionDraftSchema, model: g.model, effort: s.effort, maxOutputTokens: s.maxOutputTokens, timeoutMs: s.timeoutSeconds * 1000 });
  } catch (err) {
    logger.warn({ generationId: g.id, err: err instanceof Error ? err.message : String(err) }, "falha no provedor de IA");
    const msg = err instanceof Error && /timeout|timed out/i.test(err.message) ? "Tempo limite excedido no provedor." : "Falha ao chamar o provedor de IA. Tente novamente.";
    return fail("PROVIDER_ERROR", msg);
  }
  const cost = res.tokensIn != null && res.tokensOut != null ? estimateCost(res.model, res.tokensIn, res.tokensOut) : null;
  const usage = { tokensIn: res.tokensIn, tokensOut: res.tokensOut, costEstimate: cost == null ? null : new Prisma.Decimal(cost.toFixed(4)), model: res.model };
  if (!res.output) {
    await prisma.aiGeneration.update({ where: { id: g.id }, data: usage });
    return fail(res.errorCode ?? "INVALID_OUTPUT", res.errorMessage ?? "Resposta inválida.");
  }
  const parsed = sectionDraftSchema.safeParse(res.output);
  if (!parsed.success) {
    await prisma.aiGeneration.update({ where: { id: g.id }, data: usage });
    return fail("INVALID_OUTPUT", "Resposta fora do schema esperado.");
  }
  const current = JSON.stringify(input.sent);
  const v = validateDraft(parsed.data, { evidence: input.local.evidence.map((e) => e.ref), processCodes: input.local.allowedProcessCodes, contextText: current + " " + (input.local.instruction ?? ""), kpiTablePresent: /\| Indicador \| Processo \| Fórmula/.test(String((input.sent as { currentSection?: string }).currentSection ?? "")) });
  const restored = restore(v.blocks, input.local.replacements);
  await prisma.aiGeneration.update({
    where: { id: g.id },
    data: {
      ...usage,
      status: "COMPLETED",
      finishedAt: new Date(),
      outputJson: { draft: parsed.data, blocks: restored, cited: v.cited } as unknown as Prisma.InputJsonValue,
      validationJson: v.issues as unknown as Prisma.InputJsonValue,
    },
  });
  await audit({ actorUserId: g.actorUserId, clientId: g.clientId, entityType: "AiGeneration", entityId: g.id, action: "ai.generated", meta: { errors: v.issues.filter((i) => i.level === "error").length, tokensIn: res.tokensIn, tokensOut: res.tokensOut } });
  return { status: "COMPLETED", issues: v.issues.length };
}

export async function listGenerations(user: SessionUser, clientId: string, documentId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  if (!isUuid(documentId)) throw notFound("Documento");
  return prisma.aiGeneration.findMany({
    where: { clientId, documentId },
    select: { id: true, revisionId: true, sectionKey: true, taskType: true, model: true, status: true, decision: true, outputJson: true, validationJson: true, errorCode: true, errorMessage: true, tokensIn: true, tokensOut: true, costEstimate: true, createdAt: true, finishedAt: true, decisionNote: true, inputJson: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export const decisionSchema = z.object({
  decision: z.enum(["ACCEPT", "REJECT"]),
  /** Conteúdo editado pelo consultor antes de aceitar (decisão registrada como EDITED). */
  blocks: z.array(z.unknown()).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** Aceitar/editar/rejeitar (RF-094). Aceitar com erro de validação é bloqueado — edite ou rejeite. */
export async function decideGeneration(user: SessionUser, clientId: string, generationId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  if (!isUuid(generationId)) throw notFound("Sugestão");
  const g = await prisma.aiGeneration.findFirst({ where: { id: generationId, clientId } });
  if (!g || !g.documentId || !g.revisionId || !g.sectionKey) throw notFound("Sugestão");
  if (g.decision !== "PENDING") throw new AppError("INVALID_STATE", "Esta sugestão já foi decidida.");
  const d = decisionSchema.parse(input);
  if (d.decision === "REJECT") {
    await prisma.aiGeneration.update({ where: { id: g.id }, data: { decision: "REJECTED", decidedBy: user.id, decidedAt: new Date(), decisionNote: d.note ?? null } });
    await audit({ actorUserId: user.id, clientId, entityType: "AiGeneration", entityId: g.id, action: "ai.reject" });
    return { id: g.id, decision: "REJECTED" };
  }
  if (g.status !== "COMPLETED") throw new AppError("INVALID_STATE", "Sugestão ainda não concluída.");
  const out = g.outputJson as { blocks: Block[]; cited: string[] };
  const issues = (g.validationJson ?? []) as AiIssue[];
  const edited = !!d.blocks;
  if (!edited && issues.some((i) => i.level === "error")) throw new AppError("INVALID_STATE", "A sugestão tem problemas de validação (evidência inexistente, código ou número sem fonte): use “Editar” para corrigir ou rejeite.");
  const blocks = edited ? d.blocks : out.blocks;
  const local = (g.inputJson as unknown as { local: Local }).local;
  const text = JSON.stringify(blocks);
  const cited = new Set([...(out.cited ?? []), ...(text.match(/\bEV-\d{3}\b/g) ?? [])]);
  const evidence = local.evidence.filter((e) => cited.has(e.ref)).map((e) => ({ ref: e.ref, label: e.label, kind: e.kind }));
  const user1 = user.name.split(" ")[0];
  await applyAiContent(user, clientId, g.documentId, g.revisionId, g.sectionKey, { blocks, aiGenerationId: g.id, evidence, originNote: `Sugestão IA (${g.model}) ${edited ? "editada" : "aceita"} por ${user1}` });
  await prisma.aiGeneration.update({ where: { id: g.id }, data: { decision: edited ? "EDITED" : "ACCEPTED", decidedBy: user.id, decidedAt: new Date(), decisionNote: d.note ?? null } });
  await audit({ actorUserId: user.id, clientId, entityType: "AiGeneration", entityId: g.id, action: edited ? "ai.accept_edited" : "ai.accept", meta: { sectionKey: g.sectionKey } });
  return { id: g.id, decision: edited ? "EDITED" : "ACCEPTED" };
}

/** Garante que a sugestão pertence à mesma revisão/seção (evita aplicar em versão errada). */
export function sameTarget(g: { revisionId: string | null; sectionKey: string | null }, revisionId: string, key: string) {
  return g.revisionId === revisionId && g.sectionKey === key;
}
export { contentSchema };
