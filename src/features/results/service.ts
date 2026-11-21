import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import { addDays, parseDateOnly, toISODate, todayDateOnly } from "@/lib/dates";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/service";
import { computeForPeriod } from "@/features/metrics/service";
import { CALC_VERSION } from "@/features/metrics/engine";
import { adoptionRate, onTimeTaskRate, variation, type Classification } from "./rules";

/** Indicadores acompanhados por projeto (base comercial + execução do projeto). */
export const PROJECT_METRICS = ["SALES_VALUE", "ACTIVE_CUSTOMERS", "AVG_ORDER_VALUE", "DISCOUNT_RATE", "CONTRIBUTION_MARGIN_PCT", "QUOTE_CONVERSION", "INACTIVE_CUSTOMERS"] as const;
export const EXECUTION_METRICS = ["ON_TIME_TASK_RATE", "PROCESS_ADOPTION_RATE"] as const;
const LABELS: Record<string, string> = { ON_TIME_TASK_RATE: "Tarefas concluídas no prazo", PROCESS_ADOPTION_RATE: "Aderência aos processos (auditorias)" };
export const WINDOW_DAYS = 90;

const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
const lines = z.preprocess((v) => (Array.isArray(v) ? v : String(v ?? "").split(/\r?\n/)).map((s) => String(s).trim()).filter(Boolean), z.array(z.string().max(500)).max(50));
const day = z.preprocess((v) => (typeof v === "string" ? (parseDateOnly(v) ?? "invalid") : v), z.date({ error: "Data inválida." }));

async function loadProject(user: SessionUser, clientId: string, projectId: string, mode: "VIEW" | "EDIT") {
  await assertClientAccess(user, clientId, mode);
  if (!isUuid(projectId)) throw notFound("Projeto");
  const p = await prisma.project.findFirst({ where: { id: projectId, clientId } });
  if (!p) throw notFound("Projeto");
  return p;
}

/** Período comparável: janela de N dias terminando em `end` (inclusive). */
export const windowEnding = (end: Date, days = WINDOW_DAYS) => ({ start: toISODate(addDays(end, -(days - 1))), end: toISODate(end) });

/**
 * Congela o baseline (RF-101): período anterior comparável ao início do projeto (N dias antes do início),
 * com valor, fórmula, versão de cálculo e fonte. Uma vez congelado não muda (trigger); correção = nova revisão com motivo.
 */
export async function freezeBaseline(user: SessionUser, clientId: string, projectId: string, input: unknown = {}) {
  const p = await loadProject(user, clientId, projectId, "EDIT");
  const d = z.object({ reason: optText(1000), metricCodes: z.array(z.enum(PROJECT_METRICS)).optional() }).parse(input);
  const existing = await prisma.projectBaseline.findMany({ where: { projectId, clientId }, orderBy: { revision: "desc" } });
  if (existing.length && !d.reason) throw new AppError("INVALID_STATE", "Baseline já congelado. Para corrigir, informe o motivo da revisão.");
  const period = windowEnding(addDays(p.startDate, -1));
  const r = await computeForPeriod(clientId, period);
  if (!r.kind) throw new AppError("VALIDATION", "Sem vendas importadas: importe os dados antes de congelar o baseline.");
  const codes = d.metricCodes ?? [...PROJECT_METRICS];
  const rev = (code: string) => (existing.find((b) => b.metricCode === code)?.revision ?? 0) + 1;
  const rows = codes.map((code) => {
    const m = r.kpis.find((k) => k.code === code);
    return {
      clientId,
      projectId,
      metricCode: code,
      revision: rev(code),
      label: m?.label ?? code,
      unit: m?.unit ?? "COUNT",
      periodStart: parseDateOnly(period.start)!,
      periodEnd: parseDateOnly(period.end)!,
      valueDecimal: m?.value == null ? null : new Prisma.Decimal(m.value),
      unavailableReason: m?.value == null ? (m?.reason ?? "dados insuficientes") : null,
      calculationVersion: CALC_VERSION,
      sourceJson: { basis: m?.basis ?? null, source: r.source(code), recordKind: r.kind } as Prisma.InputJsonValue,
      revisionReason: existing.length ? d.reason! : null,
      lockedBy: user.id,
    };
  });
  await prisma.projectBaseline.createMany({ data: rows });
  await prisma.project.update({ where: { id: projectId }, data: { baselineLockedAt: p.baselineLockedAt ?? new Date() } });
  await audit({ actorUserId: user.id, clientId, entityType: "Project", entityId: projectId, action: existing.length ? "baseline.revise" : "baseline.freeze", meta: { period: `${period.start}..${period.end}`, reason: d.reason ?? null } });
  return { period, count: rows.length };
}

/**
 * Snapshot periódico (RF-102): mesma janela de N dias terminando na data informada, mesma fórmula do baseline.
 * Valores manuais exigem justificativa/fonte e ficam com usuário e data.
 */
export async function recordSnapshot(user: SessionUser, clientId: string, projectId: string, input: unknown) {
  const p = await loadProject(user, clientId, projectId, "EDIT");
  const d = z.object({ endDate: day.optional() }).parse(input ?? {});
  const end = d.endDate ?? todayDateOnly();
  if (end <= p.startDate) throw new AppError("VALIDATION", "A data do snapshot deve ser posterior ao início do projeto.");
  const period = windowEnding(end);
  const r = await computeForPeriod(clientId, period);
  const tasks = await prisma.actionTask.findMany({ where: { projectId, clientId }, select: { status: true, dueDate: true, completedAt: true } });
  const audits = await prisma.processAudit.findMany({ where: { clientId, projectProcess: { projectId }, auditedAt: { lte: end } } });
  const exec = [
    { code: "ON_TIME_TASK_RATE", value: onTimeTaskRate(tasks, { start: p.startDate, end }), reason: "Nenhuma tarefa concluída com prazo" },
    { code: "PROCESS_ADOPTION_RATE", value: adoptionRate(audits), reason: "Nenhuma auditoria de processo registrada" },
  ];
  const runId = crypto.randomUUID();
  const rows: Prisma.MetricSnapshotCreateManyInput[] = [
    ...PROJECT_METRICS.map((code) => {
      const m = r.kpis.find((k) => k.code === code);
      return { clientId, projectId, metricCode: code, periodStart: parseDateOnly(period.start)!, periodEnd: parseDateOnly(period.end)!, valueDecimal: m?.value == null ? null : new Prisma.Decimal(m.value), unit: m?.unit ?? "COUNT", calculationVersion: CALC_VERSION, unavailableReason: m?.value == null ? (m?.reason ?? "dados insuficientes") : null, inputQuality: "AUTO", recordedBy: user.id, sourceJson: { scope: "PROJECT", runId, label: m?.label ?? code, basis: m?.basis ?? null, source: r.source(code) } as Prisma.InputJsonValue };
    }),
    ...exec.map((e) => ({ clientId, projectId, metricCode: e.code, periodStart: p.startDate, periodEnd: parseDateOnly(period.end)!, valueDecimal: e.value == null ? null : new Prisma.Decimal(e.value), unit: "PERCENT", calculationVersion: CALC_VERSION, unavailableReason: e.value == null ? e.reason : null, inputQuality: "AUTO", recordedBy: user.id, sourceJson: { scope: "PROJECT", runId, label: LABELS[e.code], source: { label: e.code === "ON_TIME_TASK_RATE" ? "plano de ação do projeto" : "auditorias de processo do projeto" } } as Prisma.InputJsonValue })),
  ];
  await prisma.metricSnapshot.createMany({ data: rows });
  await audit({ actorUserId: user.id, clientId, entityType: "Project", entityId: projectId, action: "snapshot.record", meta: { period: `${period.start}..${period.end}`, runId } });
  return { period, count: rows.length, runId };
}

export const manualSnapshotSchema = z.object({
  metricCode: z.enum([...PROJECT_METRICS, ...EXECUTION_METRICS]),
  value: z.coerce.number().finite(),
  endDate: day,
  justification: z.string().trim().min(10, "Explique a origem do valor (mínimo 10 caracteres).").max(1000),
  source: z.string().trim().min(3, "Informe a fonte.").max(300),
});

export async function recordManualValue(user: SessionUser, clientId: string, projectId: string, input: unknown) {
  await loadProject(user, clientId, projectId, "EDIT");
  const d = manualSnapshotSchema.parse(input);
  const period = windowEnding(d.endDate);
  const unit = ["SALES_VALUE", "AVG_ORDER_VALUE"].includes(d.metricCode) ? "BRL" : ["ACTIVE_CUSTOMERS", "INACTIVE_CUSTOMERS"].includes(d.metricCode) ? "COUNT" : "PERCENT";
  await prisma.metricSnapshot.create({
    data: { clientId, projectId, metricCode: d.metricCode, periodStart: parseDateOnly(period.start)!, periodEnd: d.endDate, valueDecimal: new Prisma.Decimal(d.value), unit, calculationVersion: "manual", inputQuality: "MANUAL", recordedBy: user.id, sourceJson: { scope: "PROJECT", runId: crypto.randomUUID(), manual: true, label: LABELS[d.metricCode] ?? d.metricCode, justification: d.justification, source: { label: `${d.source} (informado manualmente)` } } },
  });
  await audit({ actorUserId: user.id, clientId, entityType: "Project", entityId: projectId, action: "snapshot.manual", meta: { metricCode: d.metricCode, justification: d.justification } });
  return { ok: true };
}

export type IndicatorRow = {
  code: string;
  label: string;
  unit: string;
  baseline: { value: number | null; period: string; lockedAt: Date; revision: number; reason: string | null; unavailable: string | null } | null;
  current: { value: number | null; periodEnd: Date; manual: boolean; unavailable: string | null } | null;
  abs: number | null;
  pct: number | null;
  classification: Classification;
  source: string;
  series: { date: Date; value: number | null }[];
};

/** Tabela baseline × atual com variação, classificação e série (RF-104). Execução não tem baseline (não aplicável). */
export async function getIndicators(user: SessionUser, clientId: string, projectId: string) {
  const p = await loadProject(user, clientId, projectId, "VIEW");
  const [baselines, snaps, events] = await Promise.all([
    prisma.projectBaseline.findMany({ where: { projectId, clientId }, orderBy: { revision: "desc" } }),
    prisma.metricSnapshot.findMany({ where: { projectId, clientId }, orderBy: { periodEnd: "asc" } }),
    prisma.projectEvent.findMany({ where: { projectId, clientId }, orderBy: { occurredAt: "asc" } }),
  ]);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
  const rows: IndicatorRow[] = [...PROJECT_METRICS, ...EXECUTION_METRICS].map((code) => {
    const b = baselines.find((x) => x.metricCode === code);
    const series = snaps.filter((s) => s.metricCode === code);
    const last = series.at(-1);
    const lj = (last?.sourceJson ?? {}) as { label?: string; manual?: boolean; source?: { label?: string } };
    const bv = b?.valueDecimal == null ? null : Number(b.valueDecimal);
    const cv = last?.valueDecimal == null ? null : Number(last.valueDecimal);
    const v = variation(bv, cv);
    return {
      code,
      label: b?.label ?? lj.label ?? LABELS[code] ?? code,
      unit: b?.unit ?? last?.unit ?? "PERCENT",
      baseline: b ? { value: bv, period: `${fmt(b.periodStart)} a ${fmt(b.periodEnd)}`, lockedAt: b.lockedAt, revision: b.revision, reason: b.revisionReason, unavailable: b.unavailableReason } : null,
      current: last ? { value: cv, periodEnd: last.periodEnd, manual: !!lj.manual, unavailable: last.unavailableReason } : null,
      abs: v.abs,
      pct: v.pct,
      classification: cv == null ? "NOT_MEASURED" : lj.manual ? "ESTIMATED" : "OBSERVED",
      source: lj.source?.label ?? ((b?.sourceJson as { source?: { label?: string } } | undefined)?.source?.label ?? "—"),
      series: series.map((s) => ({ date: s.periodEnd, value: s.valueDecimal == null ? null : Number(s.valueDecimal) })),
    };
  });
  return { project: p, rows, events, baselineLocked: baselines.length > 0 };
}

// ───────── reuniões, eventos externos e auditorias ─────────

export const meetingSchema = z.object({
  occurredAt: day,
  title: z.string().trim().min(3, "Informe o título.").max(200),
  attendees: lines,
  summary: z.string().trim().min(5, "Descreva a reunião.").max(5000),
  decisions: lines,
  nextSteps: lines,
  impediments: lines,
  trainings: lines,
});

export async function createMeeting(user: SessionUser, clientId: string, projectId: string, input: unknown) {
  await loadProject(user, clientId, projectId, "EDIT");
  const d = meetingSchema.parse(input);
  const m = await prisma.projectMeeting.create({ data: { clientId, projectId, occurredAt: d.occurredAt, title: d.title, summary: d.summary, attendeesJson: d.attendees, decisionsJson: d.decisions, nextStepsJson: d.nextSteps, impedimentsJson: d.impediments, trainingsJson: d.trainings, createdBy: user.id } });
  await audit({ actorUserId: user.id, clientId, entityType: "ProjectMeeting", entityId: m.id, action: "meeting.create" });
  return m;
}

export async function listMeetings(user: SessionUser, clientId: string, projectId: string) {
  await loadProject(user, clientId, projectId, "VIEW");
  return prisma.projectMeeting.findMany({ where: { projectId, clientId }, orderBy: { occurredAt: "desc" } });
}

export const EVENT_KINDS: Record<string, string> = { SEASONALITY: "Sazonalidade", PRICE_CHANGE: "Reajuste de preço", PORTFOLIO: "Mudança de portfólio", TEAM: "Mudança na equipe", CAMPAIGN: "Campanha paralela", MARKET: "Mercado/concorrência", OTHER: "Outro" };
export const eventSchema = z.object({ occurredAt: day, kind: z.enum(Object.keys(EVENT_KINDS) as [string, ...string[]]), description: z.string().trim().min(5, "Descreva o evento.").max(1000) });

export async function createEvent(user: SessionUser, clientId: string, projectId: string, input: unknown) {
  await loadProject(user, clientId, projectId, "EDIT");
  const d = eventSchema.parse(input);
  const e = await prisma.projectEvent.create({ data: { clientId, projectId, occurredAt: d.occurredAt, kind: d.kind, description: d.description, createdBy: user.id } });
  await audit({ actorUserId: user.id, clientId, entityType: "ProjectEvent", entityId: e.id, action: "event.create" });
  return e;
}

export const auditSchema = z
  .object({ auditedAt: day, itemsChecked: z.coerce.number().int().min(1, "Mínimo 1 item auditado.").max(10000), itemsConforming: z.coerce.number().int().min(0).max(10000), notes: z.string().trim().min(5, "Registre o que foi verificado.").max(2000) })
  .refine((d) => d.itemsConforming <= d.itemsChecked, { path: ["itemsConforming"], message: "Conformes não podem passar dos auditados." });

export async function recordProcessAudit(user: SessionUser, clientId: string, projectId: string, ppId: string, input: unknown) {
  await loadProject(user, clientId, projectId, "EDIT");
  if (!isUuid(ppId)) throw notFound("Processo do projeto");
  const pp = await prisma.projectProcess.findFirst({ where: { id: ppId, projectId, clientId } });
  if (!pp) throw notFound("Processo do projeto");
  const d = auditSchema.parse(input);
  const a = await prisma.processAudit.create({ data: { clientId, projectProcessId: ppId, auditedAt: d.auditedAt, itemsChecked: d.itemsChecked, itemsConforming: d.itemsConforming, notes: d.notes, createdBy: user.id } });
  await audit({ actorUserId: user.id, clientId, entityType: "ProcessAudit", entityId: a.id, action: "process.audit", meta: { checked: d.itemsChecked, conforming: d.itemsConforming } });
  return a;
}

/** Arquivos e evidências do projeto (aba Arquivos). */
export async function projectFiles(user: SessionUser, clientId: string, projectId: string) {
  await loadProject(user, clientId, projectId, "VIEW");
  return prisma.actionEvidence.findMany({
    where: { clientId, OR: [{ task: { projectId } }, { projectProcess: { projectId } }] },
    include: { file: { select: { id: true, originalName: true, bytes: true } }, task: { select: { title: true } }, projectProcess: { select: { process: { select: { code: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}
