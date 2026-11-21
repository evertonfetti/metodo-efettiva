import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/service";
import { addDays, parseDateOnly, todayDateOnly } from "@/lib/dates";
import { parseContent, type ProcessSnapshot } from "@/features/processes/content";
import { buildPlan } from "./plan";
import { PROCESS_STATUSES, PROJECT_TRANSITIONS, overdueDays, processTransitionIssues, type ValidationRecord } from "./rules";

type Tx = Prisma.TransactionClient;

const optText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
const dateField = (msg: string) => z.preprocess((v) => (typeof v === "string" ? parseDateOnly(v) : v), z.date({ error: msg }));
const optDate = z.preprocess((v) => (v === "" || v == null ? null : typeof v === "string" ? (parseDateOnly(v) ?? "invalid") : v), z.date({ error: "Data inválida." }).nullable());
const lines = z.preprocess(
  (v) => (Array.isArray(v) ? v : String(v ?? "").split(/\r?\n/)).map((s) => String(s).trim()).filter(Boolean),
  z.array(z.string().max(500)).max(30),
);
const codes = z.preprocess(
  (v) => (Array.isArray(v) ? v : [v]).flatMap((x) => String(x ?? "").split(/[\s,;]+/)).map((s) => s.trim().toUpperCase()).filter(Boolean),
  z.array(z.string().regex(/^[A-Z]\d{2}$/, "Código de processo inválido.")).max(30),
);
const bool = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

// ───────────────────────── usuários atribuíveis ─────────────────────────

/** Usuários internos que podem receber tarefas/projetos deste cliente (OWNERs, dono e acessos). */
export async function assignableUsers(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { ownerUserId: true, access: { select: { userId: true } } } });
  if (!client) return [];
  return prisma.user.findMany({
    where: { active: true, role: { not: "VIEWER" }, OR: [{ role: "OWNER" }, { id: client.ownerUserId }, { id: { in: client.access.map((a) => a.userId) } }] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function assertAssignable(clientId: string, userId: string | null | undefined) {
  if (!userId) return;
  const users = await assignableUsers(clientId);
  if (!users.some((u) => u.id === userId)) throw new AppError("VALIDATION", "Responsável sem acesso a este cliente.", { assigneeUserId: "Responsável sem acesso a este cliente." });
}

// ───────────────────────── projetos ─────────────────────────

export const projectSchema = z
  .object({
    name: z.string().trim().min(3, "Informe o nome do projeto.").max(200),
    scope: optText(5000),
    objectives: lines,
    startDate: dateField("Informe a data de início."),
    targetDate: z.preprocess((v) => (v === "" || v == null ? undefined : typeof v === "string" ? (parseDateOnly(v) ?? "invalid") : v), z.date({ error: "Data inválida." }).optional()),
    sponsorName: optText(200),
    ownerUserId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  })
  .transform((d) => ({ ...d, targetDate: d.targetDate ?? addDays(d.startDate, 90) }))
  .refine((d) => d.targetDate > d.startDate, { path: ["targetDate"], message: "A data-alvo deve ser posterior ao início." });

export const createProjectSchema = z.object({
  opportunityIds: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.uuid()).max(30)).default([]),
  processCodes: codes.default([]),
  generatePlan: bool.default(false),
});

async function snapshotFor(tx: Tx, processDefinitionId: string) {
  const def = await tx.processDefinition.findUniqueOrThrow({ where: { id: processDefinitionId } });
  const rev = await tx.processRevision.findUnique({ where: { processDefinitionId_version: { processDefinitionId, version: def.currentVersion } } });
  const snap: ProcessSnapshot = (rev?.contentJson as unknown as ProcessSnapshot) ?? { code: def.code, domainCode: def.domainCode, name: def.name, objective: def.objective, content: parseContent(def.contentJson) };
  return { version: def.currentVersion, snap, criteria: snap.content?.validation ? [snap.content.validation] : [] };
}

async function addProcessesTx(tx: Tx, clientId: string, projectId: string, processIds: string[]) {
  const existing = await tx.projectProcess.findMany({ where: { projectId }, select: { processDefinitionId: true } });
  const have = new Set(existing.map((e) => e.processDefinitionId));
  let added = 0;
  for (const pid of new Set(processIds)) {
    if (have.has(pid)) continue;
    const { version, snap, criteria } = await snapshotFor(tx, pid);
    await tx.projectProcess.create({
      data: { clientId, projectId, processDefinitionId: pid, processVersion: version, snapshotJson: snap as unknown as Prisma.InputJsonValue, successCriteriaJson: criteria },
    });
    added++;
  }
  return added;
}

async function resolveProcessIds(list: string[]) {
  if (!list.length) return [];
  const found = await prisma.processDefinition.findMany({ where: { code: { in: list } }, select: { id: true, code: true } });
  const missing = list.filter((c) => !found.some((f) => f.code === c));
  if (missing.length) throw new AppError("VALIDATION", `Processo inexistente no catálogo: ${missing.join(", ")}.`, { processCodes: missing });
  return found.map((f) => f.id);
}

/**
 * Cria projeto a partir de oportunidades aprovadas (J04): processos selecionados viram ProjectProcess
 * com snapshot da versão da ficha; oportunidades passam a "Em projeto". Plano 30/60/90 opcional.
 */
export async function createProject(user: SessionUser, clientId: string, input: unknown) {
  const client = await assertClientAccess(user, clientId, "EDIT");
  const raw = (input ?? {}) as Record<string, unknown>;
  const d = projectSchema.parse(raw);
  const extra = createProjectSchema.parse(raw);
  const ownerUserId = d.ownerUserId ?? user.id;
  await assertAssignable(clientId, ownerUserId);

  const opps = extra.opportunityIds.length
    ? await prisma.opportunity.findMany({ where: { id: { in: extra.opportunityIds }, clientId }, include: { processes: { where: { selected: true } } } })
    : [];
  if (opps.length !== extra.opportunityIds.length) throw notFound("Oportunidade");
  const notApproved = opps.filter((o) => o.status !== "APPROVED");
  if (notApproved.length) throw new AppError("INVALID_STATE", "Só oportunidades aprovadas podem gerar projeto.", { opportunityIds: notApproved.map((o) => o.id) });
  const processIds = [...opps.flatMap((o) => o.processes.map((p) => p.processDefinitionId)), ...(await resolveProcessIds(extra.processCodes))];
  if (processIds.length === 0) throw new AppError("VALIDATION", "Selecione ao menos um processo (pelas oportunidades ou diretamente).", { processCodes: "Selecione ao menos um processo." });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.project.aggregate({ where: { clientId }, _max: { number: true } });
        const project = await tx.project.create({
          data: {
            clientId,
            number: (last._max.number ?? 0) + 1,
            name: d.name,
            scope: d.scope ?? null,
            objectivesJson: d.objectives,
            startDate: d.startDate,
            targetDate: d.targetDate,
            sponsorName: d.sponsorName ?? null,
            ownerUserId,
            createdBy: user.id,
            isDemo: client.isDemo,
          },
        });
        await addProcessesTx(tx, clientId, project.id, processIds);
        if (opps.length) {
          const res = await tx.opportunity.updateMany({ where: { id: { in: opps.map((o) => o.id) }, clientId, status: "APPROVED" }, data: { status: "LINKED_TO_PROJECT", projectId: project.id } });
          if (res.count !== opps.length) throw new AppError("CONFLICT", "Uma das oportunidades mudou de status. Recarregue e tente de novo.");
        }
        const plan = extra.generatePlan ? await generatePlanTx(tx, clientId, project.id, user.id) : null;
        await audit({ actorUserId: user.id, clientId, entityType: "Project", entityId: project.id, action: "project.create", after: project, meta: { opportunities: opps.length, processes: processIds.length, planTasks: plan?.created ?? 0 } }, tx);
        return { ...project, planTasks: plan?.created ?? 0 };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < 2) continue;
      throw err;
    }
  }
  throw new AppError("CONFLICT", "Não foi possível numerar o projeto. Tente novamente.");
}

export async function listProjects(user: SessionUser, clientId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  const today = todayDateOnly();
  const projects = await prisma.project.findMany({
    where: { clientId },
    include: {
      owner: { select: { name: true } },
      processes: { select: { status: true, process: { select: { code: true } } } },
      tasks: { select: { status: true, dueDate: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return projects.map(({ tasks, ...p }) => ({
    ...p,
    taskTotal: tasks.length,
    taskDone: tasks.filter((t) => t.status === "DONE").length,
    taskOverdue: tasks.filter((t) => overdueDays(t.dueDate, t.status, today) > 0).length,
    taskBlocked: tasks.filter((t) => t.status === "BLOCKED").length,
  }));
}

async function loadProject(clientId: string, projectId: string) {
  if (!isUuid(projectId)) throw notFound("Projeto");
  const p = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!p) throw notFound("Projeto");
  return p;
}

export async function getProject(user: SessionUser, clientId: string, projectId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  await loadProject(clientId, projectId);
  const p = await prisma.project.findFirstOrThrow({
    where: { id: projectId, clientId },
    include: {
      owner: { select: { id: true, name: true } },
      opportunities: { select: { id: true, number: true, title: true, priorityScore: true, criticalRisk: true } },
      processes: {
        include: {
          process: { select: { code: true, name: true, currentVersion: true } },
          tasks: { select: { status: true } },
          _count: { select: { evidences: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const taskEvidence = await prisma.actionEvidence.groupBy({ by: ["actionTaskId"], where: { clientId, task: { projectId } }, _count: { _all: true } });
  const evByTask = new Map(taskEvidence.map((e) => [e.actionTaskId, e._count._all]));
  const tasksByPP = await prisma.actionTask.findMany({ where: { projectId, clientId }, select: { id: true, projectProcessId: true } });
  return {
    ...p,
    objectives: Array.isArray(p.objectivesJson) ? (p.objectivesJson as string[]) : [],
    processes: p.processes.map((pp) => {
      const taskEv = tasksByPP.filter((t) => t.projectProcessId === pp.id).reduce((s, t) => s + (evByTask.get(t.id) ?? 0), 0);
      return {
        ...pp,
        snapshot: pp.snapshotJson as unknown as ProcessSnapshot,
        validation: (pp.validationJson ?? {}) as ValidationRecord,
        tasksTotal: pp.tasks.length,
        tasksOpen: pp.tasks.filter((t) => t.status !== "DONE").length,
        evidenceCount: pp._count.evidences + taskEv,
      };
    }),
  };
}
export type ProjectDetail = Awaited<ReturnType<typeof getProject>>;

export async function updateProject(user: SessionUser, clientId: string, projectId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const current = await loadProject(clientId, projectId);
  if (current.status === "COMPLETED" || current.status === "CANCELLED") throw new AppError("INVALID_STATE", "Projeto encerrado não pode ser editado.");
  const d = projectSchema.parse(input);
  await assertAssignable(clientId, d.ownerUserId);
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { name: d.name, scope: d.scope ?? null, objectivesJson: d.objectives, startDate: d.startDate, targetDate: d.targetDate, sponsorName: d.sponsorName ?? null, ...(d.ownerUserId ? { ownerUserId: d.ownerUserId } : {}) },
  });
  await audit({ actorUserId: user.id, clientId, entityType: "Project", entityId: projectId, action: "project.update", before: current, after: updated });
  return updated;
}

export const projectTransitionSchema = z.object({ status: z.enum(["DRAFT", "APPROVED", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]), reason: optText(1000) });

export async function transitionProject(user: SessionUser, clientId: string, projectId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const d = projectTransitionSchema.parse(input);
  const current = await loadProject(clientId, projectId);
  if (!PROJECT_TRANSITIONS[current.status]?.includes(d.status)) throw new AppError("INVALID_STATE", "Transição de status não permitida.");
  if ((d.status === "CANCELLED" || d.status === "PAUSED") && !d.reason) throw new AppError("VALIDATION", "Informe o motivo.", { reason: "Informe o motivo." });
  const res = await prisma.project.updateMany({ where: { id: projectId, status: current.status }, data: { status: d.status } });
  if (res.count === 0) throw new AppError("CONFLICT", "O projeto foi alterado por outra pessoa. Recarregue a página.");
  await audit({ actorUserId: user.id, clientId, entityType: "Project", entityId: projectId, action: `project.${d.status.toLowerCase()}`, meta: { from: current.status, reason: d.reason ?? null } });
  return { id: projectId, status: d.status };
}

function assertOpen(p: { status: string }) {
  if (p.status === "COMPLETED" || p.status === "CANCELLED") throw new AppError("INVALID_STATE", "Projeto encerrado: reabra ou crie outro projeto.");
}

/** Vincula oportunidade aprovada a projeto existente, trazendo seus processos selecionados. */
export async function linkOpportunity(user: SessionUser, clientId: string, projectId: string, opportunityId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const project = await loadProject(clientId, projectId);
  assertOpen(project);
  if (!isUuid(opportunityId)) throw notFound("Oportunidade");
  const o = await prisma.opportunity.findFirst({ where: { id: opportunityId, clientId }, include: { processes: { where: { selected: true } } } });
  if (!o) throw notFound("Oportunidade");
  if (o.status !== "APPROVED") throw new AppError("INVALID_STATE", "Só oportunidades aprovadas podem ser vinculadas a projeto.");
  if (o.processes.length === 0) throw new AppError("VALIDATION", "Selecione ao menos um processo na oportunidade antes de vincular.");
  return prisma.$transaction(async (tx) => {
    const res = await tx.opportunity.updateMany({ where: { id: o.id, status: "APPROVED" }, data: { status: "LINKED_TO_PROJECT", projectId } });
    if (res.count === 0) throw new AppError("CONFLICT", "A oportunidade mudou de status. Recarregue a página.");
    const added = await addProcessesTx(tx, clientId, projectId, o.processes.map((p) => p.processDefinitionId));
    await audit({ actorUserId: user.id, clientId, entityType: "Project", entityId: projectId, action: "project.link_opportunity", meta: { opportunityId, processesAdded: added } }, tx);
    return { added };
  });
}

export async function addProjectProcesses(user: SessionUser, clientId: string, projectId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const project = await loadProject(clientId, projectId);
  assertOpen(project);
  const { processCodes } = z.object({ processCodes: codes }).parse(input);
  const ids = await resolveProcessIds(processCodes);
  if (!ids.length) throw new AppError("VALIDATION", "Informe ao menos um código de processo.", { processCodes: "Informe ao menos um código." });
  return prisma.$transaction(async (tx) => {
    const added = await addProcessesTx(tx, clientId, projectId, ids);
    await audit({ actorUserId: user.id, clientId, entityType: "Project", entityId: projectId, action: "project.add_processes", meta: { processCodes } }, tx);
    return { added };
  });
}

// ───────────────────────── plano 30/60/90 ─────────────────────────

async function generatePlanTx(tx: Tx, clientId: string, projectId: string, userId: string) {
  const project = await tx.project.findFirstOrThrow({ where: { id: projectId, clientId } });
  const pps = await tx.projectProcess.findMany({ where: { projectId, clientId, status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" } });
  const planned = buildPlan(
    project.startDate,
    project.targetDate,
    pps.map((pp) => {
      const snap = pp.snapshotJson as unknown as ProcessSnapshot;
      return { projectProcessId: pp.id, code: snap.code, name: snap.name, version: pp.processVersion, content: snap.content ? parseContent(snap.content) : null };
    }),
  );
  const existing = new Set((await tx.actionTask.findMany({ where: { projectId, planKey: { not: null } }, select: { planKey: true } })).map((t) => t.planKey));
  const toCreate = planned.filter((t) => !existing.has(t.planKey));
  if (toCreate.length) {
    await tx.actionTask.createMany({
      data: toCreate.map((t) => ({
        clientId,
        projectId,
        projectProcessId: t.projectProcessId,
        title: t.title.slice(0, 300),
        description: t.description,
        dueDate: t.dueDate,
        window: t.window,
        priority: t.priority,
        checklistJson: t.checklist,
        planKey: t.planKey,
        assigneeUserId: project.ownerUserId,
        createdBy: userId,
      })),
      skipDuplicates: true,
    });
  }
  return { created: toCreate.length, skipped: planned.length - toCreate.length };
}

/** Gera (ou completa) o plano 30/60/90. Idempotente: tarefas já geradas não são duplicadas nem sobrescritas. */
export async function generatePlan(user: SessionUser, clientId: string, projectId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const project = await loadProject(clientId, projectId);
  assertOpen(project);
  return prisma.$transaction(async (tx) => {
    const r = await generatePlanTx(tx, clientId, projectId, user.id);
    await audit({ actorUserId: user.id, clientId, entityType: "Project", entityId: projectId, action: "project.plan", meta: r }, tx);
    return r;
  });
}

// ───────────────────────── processo no projeto ─────────────────────────

export const projectProcessSchema = z.object({
  status: z.enum(PROCESS_STATUSES),
  reason: optText(1000),
  ownerName: optText(200),
  indicatorsChecked: bool.default(false),
  indicatorsNote: optText(2000),
  clientOwnerTrained: bool.default(false),
  auditDate: optText(10),
  auditNote: optText(2000),
});

/** Muda o status de implantação com critérios explícitos para Validado/Sustentado (RF-075/076). */
export async function updateProjectProcess(user: SessionUser, clientId: string, projectId: string, ppId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  if (!isUuid(ppId)) throw notFound("Processo do projeto");
  const d = projectProcessSchema.parse(input);
  const project = await getProject(user, clientId, projectId);
  assertOpen(project);
  const pp = project.processes.find((p) => p.id === ppId);
  if (!pp) throw notFound("Processo do projeto");
  const validation: ValidationRecord = {
    ...pp.validation,
    ...(d.status === "VALIDATED" ? { indicatorsChecked: d.indicatorsChecked, indicatorsNote: d.indicatorsNote } : {}),
    ...(d.status === "SUSTAINED" ? { clientOwnerTrained: d.clientOwnerTrained, auditDate: d.auditDate, auditNote: d.auditNote } : {}),
  };
  const ownerName = d.ownerName ?? pp.ownerName;
  const issues = processTransitionIssues(
    { status: pp.status, tasksTotal: pp.tasksTotal, tasksOpen: pp.tasksOpen, evidenceCount: pp.evidenceCount, ownerName, validatedAt: pp.validatedAt },
    d.status,
    validation,
    d.reason,
  );
  if (issues.length) throw new AppError("INVALID_STATE", issues[0]!, { issues });
  const now = new Date();
  const res = await prisma.projectProcess.updateMany({
    where: { id: ppId, clientId, status: pp.status },
    data: {
      status: d.status,
      statusReason: d.reason ?? null,
      ownerName: ownerName ?? null,
      validationJson: validation as Prisma.InputJsonValue,
      ...(d.status === "VALIDATED" ? { validatedAt: now } : {}),
      ...(d.status === "SUSTAINED" ? { sustainedAt: now } : {}),
      ...(d.status === "IN_PROGRESS" && !pp.startDate ? { startDate: todayDateOnly() } : {}),
    },
  });
  if (res.count === 0) throw new AppError("CONFLICT", "O processo foi alterado por outra pessoa. Recarregue a página.");
  await audit({ actorUserId: user.id, clientId, entityType: "ProjectProcess", entityId: ppId, action: `project_process.${d.status.toLowerCase()}`, meta: { from: pp.status, reason: d.reason ?? null } });
  return { id: ppId, status: d.status };
}

export async function addProcessEvidence(user: SessionUser, clientId: string, projectId: string, ppId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  await loadProject(clientId, projectId);
  if (!isUuid(ppId)) throw notFound("Processo do projeto");
  const pp = await prisma.projectProcess.findFirst({ where: { id: ppId, projectId, clientId } });
  if (!pp) throw notFound("Processo do projeto");
  return createEvidence(user, clientId, { projectProcessId: ppId }, input);
}

// ───────────────────────── tarefas ─────────────────────────

const checklistSchema = z.array(z.object({ text: z.string().trim().min(1).max(300), done: z.boolean() })).max(30);

export const taskSchema = z
  .object({
    title: z.string().trim().min(3, "Informe o título.").max(300),
    description: optText(5000),
    projectProcessId: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().default(null)),
    assigneeUserId: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().default(null)),
    externalOwnerName: optText(200),
    dueDate: optDate.default(null),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).default("TODO"),
    blockedReason: optText(1000),
    notes: optText(5000),
    checklist: z.preprocess((v) => {
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v);
      } catch {
        return v.split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false }));
      }
    }, checklistSchema).default([]),
  })
  .superRefine((d, ctx) => {
    if (d.status === "BLOCKED" && !d.blockedReason) ctx.addIssue({ code: "custom", path: ["blockedReason"], message: "Descreva o impedimento." });
    if (!d.assigneeUserId && !d.externalOwnerName) ctx.addIssue({ code: "custom", path: ["assigneeUserId"], message: "Defina um responsável interno ou do cliente." });
  });

export const taskFilterSchema = z.object({
  filter: z.enum(["overdue", "blocked", "done", "external"]).optional().catch(undefined),
  process: z.uuid().optional().catch(undefined),
});

export async function listTasks(user: SessionUser, clientId: string, projectId: string, filters: unknown = {}) {
  await assertClientAccess(user, clientId, "VIEW");
  await loadProject(clientId, projectId);
  const f = taskFilterSchema.parse(filters);
  const today = todayDateOnly();
  const tasks = await prisma.actionTask.findMany({
    where: {
      projectId,
      clientId,
      ...(f.process ? { projectProcessId: f.process } : {}),
      ...(f.filter === "blocked" ? { status: "BLOCKED" } : {}),
      ...(f.filter === "done" ? { status: "DONE" } : {}),
      ...(f.filter === "overdue" ? { status: { not: "DONE" }, dueDate: { lt: today } } : {}),
      ...(f.filter === "external" ? { externalOwnerName: { not: null } } : {}),
    },
    include: {
      assignee: { select: { id: true, name: true } },
      projectProcess: { select: { id: true, process: { select: { code: true } } } },
      evidences: { select: { id: true, text: true, url: true, fileAssetId: true, createdAt: true, file: { select: { originalName: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return tasks.map((t) => ({
    ...t,
    checklist: checklistSchema.catch([]).parse(t.checklistJson),
    overdueDays: overdueDays(t.dueDate, t.status, today),
  }));
}
export type TaskView = Awaited<ReturnType<typeof listTasks>>[number];

async function assertProcessInProject(clientId: string, projectId: string, ppId: string | null) {
  if (!ppId) return;
  const pp = await prisma.projectProcess.findFirst({ where: { id: ppId, projectId, clientId }, select: { id: true } });
  if (!pp) throw new AppError("VALIDATION", "Processo não pertence a este projeto.", { projectProcessId: "Processo não pertence a este projeto." });
}

export async function createTask(user: SessionUser, clientId: string, projectId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const project = await loadProject(clientId, projectId);
  assertOpen(project);
  const d = taskSchema.parse(input);
  await assertProcessInProject(clientId, projectId, d.projectProcessId);
  await assertAssignable(clientId, d.assigneeUserId);
  const t = await prisma.actionTask.create({
    data: {
      clientId,
      projectId,
      projectProcessId: d.projectProcessId,
      title: d.title,
      description: d.description ?? null,
      assigneeUserId: d.assigneeUserId,
      externalOwnerName: d.externalOwnerName ?? null,
      dueDate: d.dueDate,
      priority: d.priority,
      status: d.status,
      blockedReason: d.status === "BLOCKED" ? (d.blockedReason ?? null) : null,
      notes: d.notes ?? null,
      checklistJson: d.checklist,
      completedAt: d.status === "DONE" ? new Date() : null,
      createdBy: user.id,
    },
  });
  await audit({ actorUserId: user.id, clientId, entityType: "ActionTask", entityId: t.id, action: "task.create", meta: { projectId } });
  return t;
}

async function loadTask(clientId: string, projectId: string, taskId: string) {
  if (!isUuid(taskId)) throw notFound("Tarefa");
  const t = await prisma.actionTask.findFirst({ where: { id: taskId, projectId, clientId } });
  if (!t) throw notFound("Tarefa");
  return t;
}

/** Atualização completa ou parcial (status/checklist) de tarefa. */
export async function updateTask(user: SessionUser, clientId: string, projectId: string, taskId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const project = await loadProject(clientId, projectId);
  assertOpen(project);
  const current = await loadTask(clientId, projectId, taskId);
  const merged = {
    title: current.title,
    description: current.description ?? undefined,
    projectProcessId: current.projectProcessId,
    assigneeUserId: current.assigneeUserId,
    externalOwnerName: current.externalOwnerName ?? undefined,
    dueDate: current.dueDate,
    priority: current.priority,
    status: current.status,
    blockedReason: current.blockedReason ?? undefined,
    notes: current.notes ?? undefined,
    checklist: current.checklistJson,
    ...(input as Record<string, unknown>),
  };
  const d = taskSchema.parse(merged);
  await assertProcessInProject(clientId, projectId, d.projectProcessId);
  if (d.assigneeUserId !== current.assigneeUserId) await assertAssignable(clientId, d.assigneeUserId);
  const updated = await prisma.actionTask.update({
    where: { id: taskId },
    data: {
      title: d.title,
      description: d.description ?? null,
      projectProcessId: d.projectProcessId,
      assigneeUserId: d.assigneeUserId,
      externalOwnerName: d.externalOwnerName ?? null,
      dueDate: d.dueDate,
      priority: d.priority,
      status: d.status,
      blockedReason: d.status === "BLOCKED" ? (d.blockedReason ?? null) : null,
      notes: d.notes ?? null,
      checklistJson: d.checklist,
      completedAt: d.status === "DONE" ? (current.completedAt ?? new Date()) : null,
    },
  });
  await audit({
    actorUserId: user.id,
    clientId,
    entityType: "ActionTask",
    entityId: taskId,
    action: current.status !== d.status ? `task.status.${d.status.toLowerCase()}` : "task.update",
    before: current,
    after: updated,
  });
  return updated;
}

export async function deleteTask(user: SessionUser, clientId: string, projectId: string, taskId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const project = await loadProject(clientId, projectId);
  assertOpen(project);
  const t = await loadTask(clientId, projectId, taskId);
  const ev = await prisma.actionEvidence.count({ where: { actionTaskId: taskId } });
  if (t.status === "DONE" || ev > 0) throw new AppError("INVALID_STATE", "Tarefa concluída ou com evidência não pode ser excluída.");
  await prisma.actionTask.delete({ where: { id: taskId } });
  await audit({ actorUserId: user.id, clientId, entityType: "ActionTask", entityId: taskId, action: "task.delete", before: t });
  return { ok: true };
}

export const evidenceSchema = z
  .object({ text: optText(2000), url: optText(1000), fileAssetId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()) })
  .refine((d) => d.text || d.url || d.fileAssetId, { message: "Informe um texto, link ou arquivo.", path: ["text"] })
  .refine((d) => !d.url || /^https?:\/\//i.test(d.url), { message: "Link deve começar com http:// ou https://", path: ["url"] });

async function createEvidence(user: SessionUser, clientId: string, target: { actionTaskId?: string; projectProcessId?: string }, input: unknown) {
  const d = evidenceSchema.parse(input);
  if (d.fileAssetId) {
    const f = await prisma.fileAsset.findFirst({ where: { id: d.fileAssetId, clientId }, select: { id: true } });
    if (!f) throw notFound("Arquivo");
  }
  const ev = await prisma.actionEvidence.create({ data: { clientId, ...target, text: d.text ?? null, url: d.url ?? null, fileAssetId: d.fileAssetId ?? null, authorId: user.id } });
  await audit({ actorUserId: user.id, clientId, entityType: "ActionEvidence", entityId: ev.id, action: "action_evidence.create", meta: target });
  return ev;
}

export async function addTaskEvidence(user: SessionUser, clientId: string, projectId: string, taskId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const project = await loadProject(clientId, projectId);
  assertOpen(project);
  await loadTask(clientId, projectId, taskId);
  return createEvidence(user, clientId, { actionTaskId: taskId }, input);
}
