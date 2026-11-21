import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { assertClientAccess, assertRole } from "@/lib/security/access";
import type { SessionUser } from "@/features/auth/service";

/**
 * Exportação dos dados de um cliente (RF-113): JSON com cadastro, diagnóstico, base comercial, oportunidades,
 * projetos, documentos (todas as versões), resultados e metadados de arquivos. Só OWNER; auditado.
 */
export async function exportClientData(user: SessionUser, clientId: string) {
  assertRole(user, "OWNER");
  const client = await assertClientAccess(user, clientId, "VIEW");
  const where = { clientId };
  const [contacts, notes, assessments, answers, findings, customers, products, sales, saleItems, quotes, batches, opportunities, projects, projectProcesses, tasks, evidences, documents, revisions, exportsMeta, baselines, snapshots, meetings, events, audits, reports, files, ai] = await Promise.all([
    prisma.clientContact.findMany({ where }), prisma.clientNote.findMany({ where }), prisma.assessment.findMany({ where }), prisma.assessmentAnswer.findMany({ where }), prisma.finding.findMany({ where }),
    prisma.customer.findMany({ where }), prisma.product.findMany({ where }), prisma.sale.findMany({ where }), prisma.saleItem.findMany({ where }), prisma.quote.findMany({ where }), prisma.importBatch.findMany({ where }),
    prisma.opportunity.findMany({ where, include: { processes: true } }), prisma.project.findMany({ where }), prisma.projectProcess.findMany({ where }), prisma.actionTask.findMany({ where }), prisma.actionEvidence.findMany({ where }),
    prisma.document.findMany({ where }), prisma.documentRevision.findMany({ where }), prisma.documentExport.findMany({ where }),
    prisma.projectBaseline.findMany({ where }), prisma.metricSnapshot.findMany({ where }), prisma.projectMeeting.findMany({ where }), prisma.projectEvent.findMany({ where }), prisma.processAudit.findMany({ where }), prisma.reportPeriod.findMany({ where }),
    prisma.fileAsset.findMany({ where, select: { id: true, originalName: true, mime: true, bytes: true, sha256: true, createdAt: true } }),
    prisma.aiGeneration.findMany({ where, select: { id: true, taskType: true, model: true, status: true, decision: true, sectionKey: true, tokensIn: true, tokensOut: true, costEstimate: true, createdAt: true } }),
  ]);
  const { taxIdEncrypted: _omit, ...profile } = client as typeof client & { access?: unknown };
  void _omit;
  await audit({ actorUserId: user.id, clientId, entityType: "Client", entityId: clientId, action: "client.data_export" });
  return {
    exportedAt: new Date().toISOString(),
    note: "Exportação de dados do cliente (Efettiva OS). CPF/CNPJ cifrado omitido; arquivos listados por metadados (baixe-os pela aplicação).",
    client: { ...profile, access: undefined },
    contacts, notes, assessments, answers, findings, customers, products, sales, saleItems, quotes, importBatches: batches, opportunities, projects, projectProcesses, tasks, evidences,
    documents, documentRevisions: revisions, documentExports: exportsMeta, baselines, metricSnapshots: snapshots, meetings, projectEvents: events, processAudits: audits, reportPeriods: reports, files, aiGenerations: ai,
  };
}

export const deleteSchema = z.object({ confirmName: z.string().trim().min(1), reason: z.string().trim().min(10, "Registre o motivo/base da exclusão (mínimo 10 caracteres).").max(1000) });

/**
 * Exclusão assistida (RF-113/12.3): só OWNER, com confirmação pelo nome exato e motivo. Remove dados do banco
 * (cascata por clientId) e os arquivos privados do prefixo `clients/<clientId>/`. O registro de auditoria da
 * exclusão permanece (sem dados do cliente além do hash do nome) como registro de eliminação.
 */
export async function deleteClientData(user: SessionUser, clientId: string, input: unknown) {
  assertRole(user, "OWNER");
  const client = await assertClientAccess(user, clientId, "EDIT");
  const d = deleteSchema.parse(input);
  if (d.confirmName !== client.name) throw new AppError("VALIDATION", "O nome digitado não confere com o cadastro.", { confirmName: "Digite o nome exatamente como no cadastro." });
  const counts = { files: await prisma.fileAsset.count({ where: { clientId } }), sales: await prisma.sale.count({ where: { clientId } }), documents: await prisma.document.count({ where: { clientId } }) };
  await prisma.client.delete({ where: { id: clientId } });
  const root = path.resolve(env().STORAGE_DIR);
  const dir = path.resolve(root, "clients", clientId);
  if (dir.startsWith(root + path.sep) && /^[0-9a-f-]{36}$/.test(clientId)) await rm(dir, { recursive: true, force: true });
  await audit({ actorUserId: user.id, clientId: null, entityType: "Client", entityId: clientId, action: "client.deleted", meta: { nameHash: createHash("sha256").update(client.name).digest("hex").slice(0, 16), reason: d.reason, ...counts } });
  return { deleted: true };
}

export const auditFilterSchema = z.object({
  action: z.string().trim().max(60).optional().catch(undefined),
  clientId: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

/** Trilha de auditoria (RNF-08) para OWNER: aprovações, importações, exportações, exclusões e edições críticas. */
export async function listAuditEvents(user: SessionUser, input: unknown) {
  assertRole(user, "OWNER");
  const f = auditFilterSchema.parse(input ?? {});
  const where = { ...(f.action ? { action: { startsWith: f.action } } : {}), ...(f.clientId ? { clientId: f.clientId } : {}) };
  const [items, total] = await Promise.all([
    prisma.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * 50, take: 50 }),
    prisma.auditEvent.count({ where }),
  ]);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: items.map((i) => i.actorUserId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const clients = new Map((await prisma.client.findMany({ where: { id: { in: items.map((i) => i.clientId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  return { items: items.map((i) => ({ ...i, actor: i.actorUserId ? (users.get(i.actorUserId) ?? "Usuário removido") : "Sistema", client: i.clientId ? (clients.get(i.clientId) ?? "Cliente excluído") : null })), total, page: f.page, pages: Math.max(1, Math.ceil(total / 50)) };
}
