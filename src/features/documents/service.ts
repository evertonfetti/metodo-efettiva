import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import { enqueueJob } from "@/lib/jobs/queue";
import { FILE_TYPES, putFile, readClientFile, readSystemFile } from "@/lib/storage";
import { formatDay } from "@/lib/format";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/service";
import { getSetting } from "@/features/settings/service";
import { blockSchema, contentSchema, hashContent, type DocContent, type Section, type Sources } from "./content";
import { loadContext } from "./context";
import { buildPlaybook, buildPop } from "./generate";
import { runQa, qaBlocking, type QaItem } from "./qa";
import type { RenderMeta } from "./render/meta";

const REVISION_LABEL: Record<string, string> = { DRAFT: "Rascunho", READY_FOR_REVIEW: "Em revisão", APPROVED: "Aprovada", PUBLISHED: "Publicada" };
export const revisionLabel = (s: string) => REVISION_LABEL[s] ?? s;
const isOpen = (s: string) => s === "DRAFT" || s === "READY_FOR_REVIEW";

function parseContent(v: unknown): DocContent {
  const r = contentSchema.safeParse(v);
  if (!r.success) throw new AppError("INTERNAL", "Conteúdo do documento inválido.");
  return r.data;
}

async function loadDoc(clientId: string, documentId: string) {
  if (!isUuid(documentId)) throw notFound("Documento");
  const d = await prisma.document.findFirst({ where: { id: documentId, clientId } });
  if (!d) throw notFound("Documento");
  return d;
}

/** Revisão sempre carregada sob (documento, cliente): IDs do payload não forçam associação (seção 5.5). */
async function loadRevision(clientId: string, documentId: string, revisionId: string) {
  if (!isUuid(revisionId)) throw notFound("Versão");
  const r = await prisma.documentRevision.findFirst({ where: { id: revisionId, documentId, clientId } });
  if (!r) throw notFound("Versão");
  return r;
}

/** Converte a exceção do trigger de imutabilidade do banco em erro de domínio. */
function immutableGuard(err: unknown): never {
  if (err instanceof Error && /REVISION_IMMUTABLE/.test(err.message)) throw new AppError("INVALID_STATE", "Versão aprovada é imutável: crie uma nova versão para alterar.");
  throw err;
}

// ───────────────────────── geração ─────────────────────────

export const generateSchema = z
  .object({
    projectId: z.uuid({ error: "Selecione o projeto." }),
    type: z.enum(["PLAYBOOK", "POP"]),
    processCode: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[A-Z]\d{2}$/).optional()),
  })
  .refine((d) => d.type !== "POP" || d.processCode, { path: ["processCode"], message: "Selecione o processo do POP." });

function build(ctx: Awaited<ReturnType<typeof loadContext>>, type: "PLAYBOOK" | "POP", processCode?: string | null) {
  if (type === "POP") {
    if (!ctx.processes.some((p) => p.code === processCode)) throw new AppError("VALIDATION", "Processo não está neste projeto.", { processCode: "Processo não está neste projeto." });
    return buildPop(ctx, processCode!);
  }
  if (ctx.processes.length === 0) throw new AppError("VALIDATION", "O projeto não tem processos: inclua ao menos um antes de gerar o playbook.");
  return buildPlaybook(ctx);
}

/** Gera documento determinístico (sem IA) como versão 1 em rascunho (RF-080/081/082). */
export async function generateDocument(user: SessionUser, clientId: string, input: unknown) {
  const client = await assertClientAccess(user, clientId, "EDIT");
  const d = generateSchema.parse(input);
  const project = await prisma.project.findFirst({ where: { id: d.projectId, clientId } });
  if (!project) throw notFound("Projeto");
  const existing = await prisma.document.findFirst({ where: { clientId, projectId: project.id, type: d.type, processCode: d.processCode ?? null } });
  if (existing) throw new AppError("CONFLICT", "Já existe este documento para o projeto: abra-o e crie uma nova versão.", { documentId: existing.id });
  const ctx = await loadContext(user, clientId, project.id);
  const { content, sources } = build(ctx, d.type, d.processCode);
  const proc = d.processCode ? ctx.processes.find((p) => p.code === d.processCode) : null;
  const title = d.type === "PLAYBOOK" ? `Playbook Comercial — ${client.name}` : `POP ${proc!.code} — ${proc!.name}`;
  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({ data: { clientId, projectId: project.id, processCode: d.processCode ?? null, type: d.type, title, createdBy: user.id, isDemo: client.isDemo } });
    const rev = await tx.documentRevision.create({
      data: { clientId, documentId: doc.id, version: 1, contentJson: content as unknown as Prisma.InputJsonValue, structuredSourcesJson: sources as unknown as Prisma.InputJsonValue, createdBy: user.id },
    });
    await tx.document.update({ where: { id: doc.id }, data: { currentRevisionId: rev.id } });
    await audit({ actorUserId: user.id, clientId, entityType: "Document", entityId: doc.id, action: "document.generate", meta: { type: d.type, processCode: d.processCode ?? null, sections: content.sections.length } }, tx);
    return { ...doc, currentRevisionId: rev.id };
  });
}

// ───────────────────────── leitura ─────────────────────────

export async function listDocuments(user: SessionUser, clientId: string, projectId?: string) {
  await assertClientAccess(user, clientId, "VIEW");
  const docs = await prisma.document.findMany({
    where: { clientId, ...(projectId ? { projectId } : {}) },
    include: { project: { select: { id: true, name: true } }, revisions: { select: { id: true, version: true, state: true, updatedAt: true }, orderBy: { version: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });
  return docs.map((d) => ({ ...d, latest: d.revisions[0] ?? null, approved: d.revisions.find((r) => r.state === "APPROVED" || r.state === "PUBLISHED") ?? null }));
}

async function qaFor(doc: { clientId: string; projectId: string | null }, rev: { state: string; contentHash: string | null }, content: DocContent, sources: Sources): Promise<QaItem[]> {
  const [catalog, assessment, noDue] = await Promise.all([
    prisma.processDefinition.findMany({ select: { code: true } }),
    sources.assessmentId ? prisma.assessment.findFirst({ where: { id: sources.assessmentId, clientId: doc.clientId }, select: { status: true, snapshotJson: true } }) : null,
    doc.projectId ? prisma.actionTask.count({ where: { projectId: doc.projectId, clientId: doc.clientId, dueDate: null, status: { not: "DONE" } } }) : 0,
  ]);
  const overall = (assessment?.snapshotJson as { overall?: { coverage?: number } } | null)?.overall;
  return runQa(content, sources, {
    documentClientId: doc.clientId,
    catalogCodes: new Set(catalog.map((c) => c.code)),
    approvedContentModified: (rev.state === "APPROVED" || rev.state === "PUBLISHED") && !!rev.contentHash && rev.contentHash !== hashContent(content),
    assessmentCoverage: assessment ? (overall?.coverage ?? 0) : null,
    assessmentFinalized: assessment?.status === "FINALIZED",
    tasksWithoutDueDate: noDue,
    hasCommercialData: (await prisma.metricSnapshot.count({ where: { clientId: doc.clientId, projectId: null, metricCode: "SALES_VALUE", valueDecimal: { not: null } } })) > 0,
  });
}

export async function getDocument(user: SessionUser, clientId: string, documentId: string, revisionId?: string) {
  await assertClientAccess(user, clientId, "VIEW");
  const doc = await loadDoc(clientId, documentId);
  const revisions = await prisma.documentRevision.findMany({ where: { documentId, clientId }, select: { id: true, version: true, state: true, createdAt: true, updatedAt: true, approvedAt: true, approvedBy: true, createdBy: true }, orderBy: { version: "desc" } });
  const revId = revisionId && revisions.some((r) => r.id === revisionId) ? revisionId : revisions[0]!.id;
  const rev = await loadRevision(clientId, documentId, revId);
  const content = parseContent(rev.contentJson);
  const sources = rev.structuredSourcesJson as unknown as Sources;
  const userIds = [...new Set(revisions.flatMap((r) => [r.approvedBy, r.createdBy]).filter((x): x is string => !!x))];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const [qa, exports, project] = await Promise.all([
    qaFor(doc, rev, content, sources),
    prisma.documentExport.findMany({ where: { documentId, clientId }, include: { revision: { select: { version: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    doc.projectId ? prisma.project.findFirst({ where: { id: doc.projectId, clientId }, select: { id: true, name: true } }) : null,
  ]);
  return {
    doc,
    project,
    revision: { ...rev, content, sources },
    revisions: revisions.map((r) => ({ ...r, approverName: r.approvedBy ? (users.get(r.approvedBy) ?? "—") : null, authorName: users.get(r.createdBy) ?? "—" })),
    qa,
    exports,
  };
}
export type DocumentView = Awaited<ReturnType<typeof getDocument>>;

// ───────────────────────── edição por seção ─────────────────────────

export const sectionInputSchema = z.object({
  lockVersion: z.number().int().min(0),
  title: z.string().trim().min(2).max(200),
  visibility: z.enum(["INTERNO", "CLIENTE"]),
  blocks: z.array(blockSchema).max(400),
});

async function mutateOpen(user: SessionUser, clientId: string, documentId: string, revisionId: string, lockVersion: number | null, fn: (c: DocContent) => DocContent, action: string, meta?: Prisma.InputJsonValue) {
  await assertClientAccess(user, clientId, "EDIT");
  await loadDoc(clientId, documentId);
  const rev = await loadRevision(clientId, documentId, revisionId);
  if (!isOpen(rev.state)) throw new AppError("INVALID_STATE", "Versão aprovada é imutável: crie uma nova versão para alterar.");
  if (lockVersion !== null && rev.lockVersion !== lockVersion) throw new AppError("CONFLICT", "O documento foi alterado em outra aba ou por outra pessoa. Recarregue para continuar.");
  const next = contentSchema.parse(fn(parseContent(rev.contentJson)));
  const allApproved = next.sections.every((s) => s.state === "APPROVED");
  const res = await prisma.documentRevision
    .updateMany({
      where: { id: rev.id, lockVersion: rev.lockVersion, state: { in: ["DRAFT", "READY_FOR_REVIEW"] } },
      data: { contentJson: next as unknown as Prisma.InputJsonValue, lockVersion: { increment: 1 }, state: allApproved ? "READY_FOR_REVIEW" : "DRAFT" },
    })
    .catch(immutableGuard);
  if (res.count === 0) throw new AppError("CONFLICT", "O documento foi alterado por outra pessoa. Recarregue para continuar.");
  await audit({ actorUserId: user.id, clientId, entityType: "DocumentRevision", entityId: rev.id, action, meta });
  return { lockVersion: rev.lockVersion + 1, state: allApproved ? "READY_FOR_REVIEW" : "DRAFT" };
}

const findSection = (c: DocContent, key: string) => {
  const s = c.sections.find((x) => x.key === key);
  if (!s) throw notFound("Seção");
  return s;
};

/** Salva edição manual: seção volta a "Em revisão" e fica marcada como editada (protege contra regeneração). */
export async function saveSection(user: SessionUser, clientId: string, documentId: string, revisionId: string, key: string, input: unknown) {
  const d = sectionInputSchema.parse(input);
  return mutateOpen(user, clientId, documentId, revisionId, d.lockVersion, (c) => {
    findSection(c, key);
    return { sections: c.sections.map((s): Section => (s.key === key ? { ...s, title: d.title, visibility: d.visibility, blocks: d.blocks, manuallyEdited: true, state: "IN_REVIEW", approvedAt: undefined, approvedBy: undefined } : s)) };
  }, "document.section.save", { key });
}

export async function setSectionState(user: SessionUser, clientId: string, documentId: string, revisionId: string, key: string, input: unknown) {
  const d = z.object({ state: z.enum(["APPROVED", "IN_REVIEW"]), lockVersion: z.number().int().min(0) }).parse(input);
  return mutateOpen(user, clientId, documentId, revisionId, d.lockVersion, (c) => {
    findSection(c, key);
    return { sections: c.sections.map((s): Section => (s.key === key ? { ...s, state: d.state, approvedBy: d.state === "APPROVED" ? user.name : undefined, approvedAt: d.state === "APPROVED" ? new Date().toISOString() : undefined } : s)) };
  }, `document.section.${d.state.toLowerCase()}`, { key });
}

/** Regenera só a seção pedida a partir dos dados atuais (RF-087); edição manual exige confirmação explícita. */
export async function regenerateSection(user: SessionUser, clientId: string, documentId: string, revisionId: string, key: string, input: unknown) {
  const d = z.object({ confirm: z.boolean().default(false), lockVersion: z.number().int().min(0) }).parse(input);
  const doc = await loadDoc(clientId, documentId);
  const rev = await loadRevision(clientId, documentId, revisionId);
  const current = findSection(parseContent(rev.contentJson), key);
  if (current.manuallyEdited && !d.confirm) throw new AppError("CONFLICT", "Esta seção tem edições manuais. Confirme para substituí-las pelo conteúdo gerado.", { needsConfirmation: true });
  const ctx = await loadContext(user, clientId, doc.projectId);
  const fresh = build(ctx, doc.type, doc.processCode).content.sections.find((s) => s.key === key);
  if (!fresh) throw new AppError("VALIDATION", "Esta seção não é mais gerada pelos dados atuais (processo removido do projeto?).");
  return mutateOpen(user, clientId, documentId, revisionId, d.lockVersion, (c) => ({ sections: c.sections.map((s) => (s.key === key ? { ...fresh, visibility: s.visibility } : s)) }), "document.section.regenerate", { key, replacedManual: current.manuallyEdited });
}

// ───────────────────────── versões ─────────────────────────

/** Aprova a versão: todas as seções aprovadas e QA sem erros. Depois disso, imutável (trigger no banco). */
export async function approveRevision(user: SessionUser, clientId: string, documentId: string, revisionId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const doc = await loadDoc(clientId, documentId);
  const rev = await loadRevision(clientId, documentId, revisionId);
  if (!isOpen(rev.state)) throw new AppError("INVALID_STATE", "Esta versão já foi aprovada.");
  const content = parseContent(rev.contentJson);
  const qa = await qaFor(doc, rev, content, rev.structuredSourcesJson as unknown as Sources);
  const errors = qaBlocking(qa);
  if (errors.length) throw new AppError("INVALID_STATE", `Aprovação bloqueada: ${errors.map((e) => e.message).join("; ")}.`, { qa: errors });
  const res = await prisma.documentRevision.updateMany({
    where: { id: rev.id, lockVersion: rev.lockVersion, state: { in: ["DRAFT", "READY_FOR_REVIEW"] } },
    data: { state: "APPROVED", approvedBy: user.id, approvedAt: new Date(), contentHash: hashContent(content) },
  });
  if (res.count === 0) throw new AppError("CONFLICT", "O documento foi alterado. Recarregue antes de aprovar.");
  await prisma.document.update({ where: { id: documentId }, data: { currentRevisionId: rev.id } });
  await audit({ actorUserId: user.id, clientId, entityType: "DocumentRevision", entityId: rev.id, action: "document.approve", meta: { version: rev.version } });
  return { id: rev.id, state: "APPROVED" };
}

export async function publishRevision(user: SessionUser, clientId: string, documentId: string, revisionId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  await loadDoc(clientId, documentId);
  const rev = await loadRevision(clientId, documentId, revisionId);
  if (rev.state !== "APPROVED") throw new AppError("INVALID_STATE", "Só versões aprovadas podem ser publicadas.");
  await prisma.documentRevision.update({ where: { id: rev.id }, data: { state: "PUBLISHED", publishedAt: new Date() } }).catch(immutableGuard);
  await audit({ actorUserId: user.id, clientId, entityType: "DocumentRevision", entityId: rev.id, action: "document.publish", meta: { version: rev.version } });
  return { id: rev.id, state: "PUBLISHED" };
}

/** Nova versão a partir da última: copia conteúdo (seções mantêm aprovação até serem editadas). */
export async function createRevision(user: SessionUser, clientId: string, documentId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  await loadDoc(clientId, documentId);
  const latest = await prisma.documentRevision.findFirst({ where: { documentId, clientId }, orderBy: { version: "desc" } });
  if (!latest) throw notFound("Versão");
  if (isOpen(latest.state)) throw new AppError("CONFLICT", `A versão ${latest.version} ainda está em edição.`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rev = await prisma.documentRevision.create({
        data: { clientId, documentId, version: latest.version + 1, contentJson: latest.contentJson as Prisma.InputJsonValue, structuredSourcesJson: latest.structuredSourcesJson as Prisma.InputJsonValue, parentRevisionId: latest.id, state: "READY_FOR_REVIEW", createdBy: user.id },
      });
      await audit({ actorUserId: user.id, clientId, entityType: "DocumentRevision", entityId: rev.id, action: "document.revision", meta: { from: latest.version } });
      return rev;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt === 0) continue;
      throw err;
    }
  }
  throw new AppError("CONFLICT", "Outra versão foi criada ao mesmo tempo. Recarregue.");
}

// ───────────────────────── exportação ─────────────────────────

export const exportSchema = z.object({ format: z.enum(["DOCX", "PDF", "MD"]), audience: z.enum(["INTERNO", "CLIENTE"]) });

/**
 * Enfileira exportação (job no worker). Versão não aprovada sai como RASCUNHO com marca d'água (RF-086);
 * versão final só existe para revisão aprovada/publicada. Filtro de audiência é aplicado no worker, no servidor.
 */
export async function requestExport(user: SessionUser, clientId: string, documentId: string, revisionId: string, input: unknown) {
  await assertClientAccess(user, clientId, "VIEW");
  if (user.role === "VIEWER") throw new AppError("FORBIDDEN", "Perfil somente leitura.");
  const d = exportSchema.parse(input);
  await loadDoc(clientId, documentId);
  const rev = await loadRevision(clientId, documentId, revisionId);
  const isDraft = isOpen(rev.state);
  const reusable = await prisma.documentExport.findFirst({
    where: { clientId, revisionId: rev.id, format: d.format, audience: d.audience, isDraft, status: { in: ["QUEUED", "RUNNING", "COMPLETED"] }, createdAt: { gte: rev.updatedAt } },
    orderBy: { createdAt: "desc" },
  });
  if (reusable) return reusable;
  const exp = await prisma.documentExport.create({ data: { clientId, documentId, revisionId: rev.id, format: d.format, audience: d.audience, isDraft, createdBy: user.id } });
  const job = await enqueueJob({ operation: "document.export", clientId, createdBy: user.id, idempotencyKey: `document.export:${exp.id}`, payload: { exportId: exp.id } });
  await prisma.documentExport.update({ where: { id: exp.id }, data: { jobId: job.id } });
  await audit({ actorUserId: user.id, clientId, entityType: "DocumentExport", entityId: exp.id, action: "document.export.request", meta: { format: d.format, audience: d.audience, isDraft, version: rev.version } });
  return { ...exp, jobId: job.id };
}

const EXT: Record<string, string> = { DOCX: "docx", PDF: "pdf", MD: "md" };
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Executado pelo worker: reconsulta tudo pelo ID + clientId, renderiza e grava arquivo privado. */
export async function runExport(exportId: string, jobClientId: string | null) {
  const exp = await prisma.documentExport.findUnique({ where: { id: exportId } });
  if (!exp) throw new Error("Exportação não encontrada");
  if (exp.clientId !== jobClientId) throw new Error("clientId do job diverge da exportação");
  if (exp.status === "COMPLETED") return { fileAssetId: exp.fileAssetId };
  await prisma.documentExport.update({ where: { id: exp.id }, data: { status: "RUNNING" } });
  try {
    const doc = await prisma.document.findFirstOrThrow({ where: { id: exp.documentId, clientId: exp.clientId }, include: { client: { select: { name: true } }, project: { select: { name: true } } } });
    const rev = await prisma.documentRevision.findFirstOrThrow({ where: { id: exp.revisionId, documentId: doc.id, clientId: exp.clientId } });
    const content = parseContent(rev.contentJson);
    const brand = await getSetting("brand");
    const logo = brand.logoFileId ? await readSystemFile(brand.logoFileId).then((f) => ({ data: f.data, mime: f.file.mime })).catch(() => null) : null;
    const meta: RenderMeta = {
      title: doc.title,
      clientName: doc.client.name,
      projectName: doc.project?.name ?? null,
      version: rev.version,
      stateLabel: revisionLabel(rev.state),
      dateLabel: formatDay(rev.approvedAt ?? rev.updatedAt),
      audience: exp.audience,
      isDraft: exp.isDraft,
      brand: { ...brand, logo },
    };
    let data: Buffer;
    if (exp.format === "MD") data = Buffer.from((await import("./render/markdown")).renderMarkdown(content, meta), "utf8");
    else if (exp.format === "DOCX") data = await (await import("./render/docx")).renderDocx(content, meta);
    else data = await (await import("./render/pdf")).renderPdf(content, meta);
    const name = `${slug(doc.title)}-v${rev.version}-${exp.audience}${exp.isDraft ? "-RASCUNHO" : ""}.${EXT[exp.format]}`;
    const file = await putFile({ clientId: exp.clientId, uploadedBy: exp.createdBy, originalName: name, data, maxBytes: 50 * 1_048_576, forcedType: FILE_TYPES[EXT[exp.format]!]!, accessLevel: exp.audience === "CLIENTE" ? "CLIENT" : "INTERNAL" });
    await prisma.documentExport.update({ where: { id: exp.id }, data: { status: "COMPLETED", fileAssetId: file.id, finishedAt: new Date(), errorMessage: null } });
    return { fileAssetId: file.id, bytes: data.length };
  } catch (err) {
    await prisma.documentExport.update({ where: { id: exp.id }, data: { status: "FAILED", errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 300), finishedAt: new Date() } });
    throw err;
  }
}

export async function getExport(user: SessionUser, clientId: string, exportId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  if (!isUuid(exportId)) throw notFound("Exportação");
  const exp = await prisma.documentExport.findFirst({ where: { id: exportId, clientId } });
  if (!exp) throw notFound("Exportação");
  return exp;
}

/** Download autenticado: exportação e arquivo validados sob o clientId da rota. */
export async function downloadExport(user: SessionUser, clientId: string, exportId: string) {
  const exp = await getExport(user, clientId, exportId);
  if (exp.status !== "COMPLETED" || !exp.fileAssetId) throw new AppError("INVALID_STATE", "Exportação ainda não concluída.");
  const { file, data } = await readClientFile(clientId, exp.fileAssetId);
  await audit({ actorUserId: user.id, clientId, entityType: "DocumentExport", entityId: exp.id, action: "document.download", meta: { audience: exp.audience, format: exp.format } });
  return { file, data };
}
