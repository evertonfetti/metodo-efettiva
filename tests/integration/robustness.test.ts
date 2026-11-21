import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";

const added: string[] = [];
vi.mock("@/lib/jobs/queue", () => ({
  getQueue: () => ({ add: async (name: string) => { added.push(name); } }),
  enqueueJob: async (i: { operation: string; clientId: string | null; createdBy: string | null; idempotencyKey: string; payload?: object }) =>
    prisma.backgroundJob.create({ data: { operation: i.operation, clientId: i.clientId, createdBy: i.createdBy, idempotencyKey: i.idempotencyKey, payloadJson: i.payload } }),
}));

import { seedProcesses } from "@/features/processes/seed";
import { putFile } from "@/lib/storage";
import { deleteClientData, exportClientData, listAuditEvents } from "@/features/governance/service";
import { recoverStuckJobs, retryFailedJob } from "@/lib/jobs/recovery";
import { createOpportunity, transitionOpportunity } from "@/features/opportunities/service";
import { createProject, createTask, listTasks, updateTask } from "@/features/projects/service";
import { generateDocument, getDocument, requestExport, saveSection } from "@/features/documents/service";
import { createBatch } from "@/features/imports/service";
import { freezeBaseline, createMeeting } from "@/features/results/service";
import { setExternalAi } from "@/features/ai/service";
import { resetDb, resetClientData, createUser, createClient } from "../helpers";

async function richClient(ownerId: string) {
  const c = await createClient(ownerId, "Cliente Rico");
  const cust = await prisma.customer.create({ data: { clientId: c.id, externalId: "C1", name: "Comprador", rowHash: "x" } });
  const batch = await prisma.importBatch.create({ data: { clientId: c.id, type: "SALES", fileAssetId: crypto.randomUUID(), originalName: "v.csv", sourceSystem: "ERP", recordKind: "ORDER", status: "COMPLETED", createdBy: ownerId } });
  await prisma.sale.create({ data: { clientId: c.id, sourceSystem: "ERP", externalId: "S1", customerId: cust.id, occurredAt: new Date("2026-08-01"), recordKind: "ORDER", status: "VALID", statusRaw: "ok", netAmount: 10, rowHash: "x", batchId: batch.id } });
  await prisma.quote.create({ data: { clientId: c.id, sourceSystem: "ERP", externalId: "Q1", customerId: cust.id, issuedAt: new Date("2026-08-01"), status: "OPEN", statusRaw: "aberto", amount: 5, rowHash: "x", batchId: batch.id } });
  const f = await putFile({ clientId: c.id, uploadedBy: ownerId, originalName: "evidencia.txt", data: Buffer.from("arquivo do cliente"), maxBytes: 1_000_000 });
  return { c, file: f };
}

describe("fase 7: robustez", () => {
  beforeAll(async () => {
    await resetDb();
    await seedProcesses(prisma);
  });
  beforeEach(resetClientData);

  it("LGPD: exportação completa e exclusão assistida (banco + arquivos) com registro de eliminação", async () => {
    const owner = await createUser("OWNER");
    const { c, file } = await richClient(owner.id);
    const consultant = await createUser("CONSULTANT");
    await expect(exportClientData(consultant, c.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const data = await exportClientData(owner, c.id);
    expect(data.sales).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain("taxIdEncrypted");
    await expect(deleteClientData(owner, c.id, { confirmName: "outro", reason: "Fim do contrato e pedido do titular" })).rejects.toMatchObject({ code: "VALIDATION" });
    const storagePath = path.resolve(process.env.STORAGE_DIR ?? "./storage", file.storageKey);
    expect(existsSync(storagePath)).toBe(true);
    await deleteClientData(owner, c.id, { confirmName: "Cliente Rico", reason: "Fim do contrato e pedido do titular" });
    expect(await prisma.client.count({ where: { id: c.id } })).toBe(0);
    expect(await prisma.sale.count({ where: { clientId: c.id } })).toBe(0);
    expect(existsSync(storagePath)).toBe(false);
    const ev = await listAuditEvents(owner, { action: "client.deleted" });
    expect(ev.items[0]).toMatchObject({ entityId: c.id, clientId: null });
    expect(JSON.stringify(ev.items[0]!.meta)).not.toContain("Cliente Rico");
    await expect(listAuditEvents(consultant, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("jobs presos voltam à fila e falhas podem ser reprocessadas sem duplicar", async () => {
    const u = await createUser("OWNER");
    const old = new Date(Date.now() - 60 * 60_000);
    const stuck = await prisma.backgroundJob.create({ data: { operation: "system.ping", status: "RUNNING", startedAt: old, attempts: 1, idempotencyKey: "k1", createdBy: u.id } });
    const dead = await prisma.backgroundJob.create({ data: { operation: "system.ping", status: "RUNNING", startedAt: old, attempts: 9, idempotencyKey: "k2", createdBy: u.id } });
    const fresh = await prisma.backgroundJob.create({ data: { operation: "system.ping", status: "RUNNING", startedAt: new Date(), attempts: 1, idempotencyKey: "k3", createdBy: u.id } });
    expect(await recoverStuckJobs(15, 5)).toEqual({ requeued: 1, failed: 1 });
    expect((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe("QUEUED");
    expect((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: dead.id } })).status).toBe("FAILED");
    expect((await prisma.backgroundJob.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("RUNNING");
    expect(await retryFailedJob(dead.id)).toBe(true);
    expect(await retryFailedJob(fresh.id)).toBe(false);
    expect(added.length).toBe(2);
  });

  it("perfil VIEWER lê o cliente mas nenhuma mutação passa", async () => {
    const owner = await createUser("CONSULTANT");
    const c = await createClient(owner.id, "Cliente V");
    const o = await createOpportunity(owner, c.id, { title: "Oportunidade X", explanation: "Explicação suficiente.", domainCode: "C", impactScore: 3, confidenceScore: 3, effortScore: 3, processCodes: "C05", assumptions: "", evidence: "" });
    await transitionOpportunity(owner, c.id, o.id, { status: "REVIEWED" });
    await transitionOpportunity(owner, c.id, o.id, { status: "APPROVED" });
    const p = await createProject(owner, c.id, { name: "Projeto V", startDate: "2026-09-01", opportunityIds: [o.id], generatePlan: "on" });
    const doc = await generateDocument(owner, c.id, { projectId: p.id, type: "PLAYBOOK" });
    const viewer = await createUser("VIEWER");
    await prisma.clientAccess.create({ data: { clientId: c.id, userId: viewer.id, permission: "VIEW" } });
    // leitura permitida
    const d = await getDocument(viewer, c.id, doc.id);
    const t = (await listTasks(viewer, c.id, p.id))[0]!;
    const forbidden = { code: "FORBIDDEN" };
    await expect(transitionOpportunity(viewer, c.id, o.id, { status: "REVIEWED" })).rejects.toMatchObject(forbidden);
    await expect(updateTask(viewer, c.id, p.id, t.id, { status: "DONE" })).rejects.toMatchObject(forbidden);
    await expect(createTask(viewer, c.id, p.id, { title: "x", externalOwnerName: "y" })).rejects.toMatchObject(forbidden);
    await expect(saveSection(viewer, c.id, doc.id, d.revision.id, "capa", { lockVersion: 0, title: "Capa", visibility: "CLIENTE", blocks: [] })).rejects.toMatchObject(forbidden);
    await expect(requestExport(viewer, c.id, doc.id, d.revision.id, { format: "MD", audience: "INTERNO" })).rejects.toMatchObject(forbidden);
    await expect(createBatch(viewer, c.id, { type: "CUSTOMERS", sourceSystem: "ERP" }, { name: "c.csv", data: Buffer.from("a;b\n1;2") })).rejects.toMatchObject(forbidden);
    await expect(freezeBaseline(viewer, c.id, p.id)).rejects.toMatchObject(forbidden);
    await expect(createMeeting(viewer, c.id, p.id, { occurredAt: "2026-09-10", title: "Reunião", summary: "Resumo da reunião" })).rejects.toMatchObject(forbidden);
    await expect(setExternalAi(viewer, c.id, { allowed: true, acknowledged: true })).rejects.toMatchObject(forbidden);
    // consultor com acesso só de leitura também não altera
    const reader = await createUser("CONSULTANT");
    await prisma.clientAccess.create({ data: { clientId: c.id, userId: reader.id, permission: "VIEW" } });
    await expect(updateTask(reader, c.id, p.id, t.id, { status: "DONE" })).rejects.toMatchObject(forbidden);
  });
});
