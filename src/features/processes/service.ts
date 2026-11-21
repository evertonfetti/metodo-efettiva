import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertCanEdit } from "@/lib/security/access";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/service";
import { parseContent, processContentSchema, type ProcessSnapshot } from "./content";
import { suggestProcessCodes } from "./mapping";

const CODE_RE = /^[A-Z]\d{2}$/;

export const processFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  area: z.string().regex(/^[A-Z]$/).optional().catch(undefined),
  full: z.enum(["1"]).optional().catch(undefined),
});

/** Biblioteca global (sem clientId): visível a qualquer usuário autenticado. */
export async function listProcesses(input: unknown = {}) {
  const f = processFilterSchema.parse(input);
  const where: Prisma.ProcessDefinitionWhereInput = {
    ...(f.area ? { domainCode: f.area } : {}),
    ...(f.full ? { hasFullSheet: true } : {}),
    ...(f.q
      ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { objective: { contains: f.q, mode: "insensitive" } }, { code: { equals: f.q.toUpperCase() } }] }
      : {}),
  };
  const items = await prisma.processDefinition.findMany({
    where,
    select: { id: true, code: true, domainCode: true, domainName: true, name: true, objective: true, hasFullSheet: true, active: true, currentVersion: true, customized: true },
  });
  return items.sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
}

export async function areaCounts() {
  const rows = await prisma.processDefinition.groupBy({ by: ["domainCode"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.domainCode, r._count._all]));
}

export async function getProcess(code: string) {
  if (!CODE_RE.test(code)) throw notFound("Processo");
  const p = await prisma.processDefinition.findUnique({
    where: { code },
    include: { revisions: { orderBy: { version: "desc" }, select: { id: true, version: true, changeNotes: true, source: true, changedBy: true, createdAt: true } } },
  });
  if (!p) throw notFound("Processo");
  const authors = await prisma.user.findMany({ where: { id: { in: p.revisions.map((r) => r.changedBy).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const nameById = new Map(authors.map((a) => [a.id, a.name]));
  return {
    ...p,
    content: parseContent(p.contentJson),
    revisions: p.revisions.map((r) => ({ ...r, author: r.changedBy ? (nameById.get(r.changedBy) ?? "Usuário removido") : "Seed" })),
  };
}

export async function getProcessRevision(code: string, version: number) {
  const p = await prisma.processDefinition.findUnique({ where: { code }, select: { id: true } });
  if (!p) throw notFound("Processo");
  const r = await prisma.processRevision.findUnique({ where: { processDefinitionId_version: { processDefinitionId: p.id, version } } });
  if (!r) throw notFound("Versão");
  return { ...r, snapshot: r.contentJson as unknown as ProcessSnapshot };
}

const lines = (v: unknown) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
const opt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
};

/** KPIs no formulário: uma linha por indicador, "Nome | fórmula". */
function kpiLines(v: unknown) {
  const kpis: string[] = [];
  const kpiFormulas: Record<string, string> = {};
  for (const line of lines(v)) {
    const [name, ...rest] = line.split("|");
    const n = name!.trim();
    if (!n) continue;
    kpis.push(n);
    const f = rest.join("|").trim();
    if (f) kpiFormulas[n] = f;
  }
  return { kpis, kpiFormulas };
}

export const processEditSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1),
  name: z.string().trim().min(3, "Informe o nome.").max(200),
  objective: z.string().trim().min(10, "Descreva o objetivo.").max(2000),
  changeNotes: z.string().trim().min(5, "Descreva o que mudou (mínimo 5 caracteres).").max(1000),
  active: z.boolean().default(true),
  content: processContentSchema,
});

/** Converte o formulário (passos/KPIs um por linha) no formato validado. */
export function processEditFromForm(raw: Record<string, unknown>) {
  return {
    expectedVersion: raw.expectedVersion,
    name: raw.name,
    objective: raw.objective,
    changeNotes: raw.changeNotes,
    active: raw.active === "on" || raw.active === "true" || raw.active === true,
    content: {
      trigger: opt(raw.trigger),
      inputs: opt(raw.inputs),
      roles: opt(raw.roles),
      steps: lines(raw.steps),
      approach: opt(raw.approach),
      cadence: opt(raw.cadence),
      ...kpiLines(raw.kpis),
      exceptions: opt(raw.exceptions),
      controls: opt(raw.controls),
      validation: opt(raw.validation),
    },
  };
}

/**
 * Edição da biblioteca (RF-063): cria nova revisão imutável com o conteúdo completo.
 * Conflito de versão (outra pessoa salvou antes) → 409, sem sobrescrita silenciosa.
 * Projetos já criados mantêm o snapshot da versão usada.
 */
export async function updateProcess(user: SessionUser, code: string, input: unknown) {
  assertCanEdit(user);
  const d = processEditSchema.parse(input);
  const current = await prisma.processDefinition.findUnique({ where: { code } });
  if (!current) throw notFound("Processo");
  const hasContent = d.content.steps.length > 0 || Object.entries(d.content).some(([k, v]) => k !== "steps" && k !== "kpis" && !!v);
  const snapshot: ProcessSnapshot = { code, domainCode: current.domainCode, name: d.name, objective: d.objective, content: hasContent ? d.content : null };
  const version = current.currentVersion + 1;
  return prisma.$transaction(async (tx) => {
    const res = await tx.processDefinition.updateMany({
      where: { id: current.id, currentVersion: d.expectedVersion },
      data: {
        name: d.name,
        objective: d.objective,
        active: d.active,
        contentJson: (snapshot.content ?? undefined) as Prisma.InputJsonValue | undefined,
        currentVersion: version,
        customized: true,
      },
    });
    if (res.count === 0) throw new AppError("CONFLICT", "Este processo foi alterado por outra pessoa. Recarregue a página para ver a versão atual.");
    await tx.processRevision.create({
      data: { processDefinitionId: current.id, version, changeNotes: d.changeNotes, contentJson: snapshot as unknown as Prisma.InputJsonValue, source: "EDIT", changedBy: user.id },
    });
    await audit({ actorUserId: user.id, entityType: "ProcessDefinition", entityId: current.id, action: "process.update", before: current.contentJson, after: snapshot, meta: { code, version } }, tx);
    return { code, version };
  });
}

/** Catálogo enxuto para sugestões e seletores. */
export async function processCatalog() {
  return prisma.processDefinition.findMany({
    where: { active: true },
    select: { id: true, code: true, domainCode: true, name: true, hasFullSheet: true, active: true, currentVersion: true },
    orderBy: { code: "asc" },
  });
}

export async function suggestForDomain(domainCode: string, limit = 3) {
  return suggestProcessCodes(domainCode, await processCatalog(), limit);
}
