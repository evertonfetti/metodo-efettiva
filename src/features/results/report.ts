import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import { parseDateOnly } from "@/lib/dates";
import { formatDay, formatDecimal } from "@/lib/format";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/service";
import { loadContext, type GenContext } from "@/features/documents/context";
import type { Block, DocContent, Section, Sources } from "@/features/documents/content";
import { formatMetricValue, GENERATOR_VERSION } from "@/features/documents/generate";
import { STATUS_MAP } from "@/lib/status";
import { CLASS_LABEL, NON_CAUSALITY } from "./rules";
import { EVENT_KINDS, getIndicators, type IndicatorRow } from "./service";

const P = (w: string) => `[PENDENTE: ${w}]`;
const para = (text: string): Block => ({ type: "paragraph", text });
const h3 = (text: string): Block => ({ type: "heading", level: 3, text });
const list = (items: string[]): Block => ({ type: "list", ordered: false, items });
const table = (headers: string[], rows: string[][], kind: "generic" | "kpi" = "generic"): Block => ({ type: "table", kind, headers, rows });
const callout = (text: string, tone: "info" | "warn" = "info"): Block => ({ type: "callout", tone, text });
const sec = (key: string, title: string, origin: string, blocks: Block[], extra: Partial<Section> = {}): Section => ({ key, title, visibility: "CLIENTE", state: "PENDING", origin, manuallyEdited: false, blocks, ...extra });
const label = (ctx: keyof typeof STATUS_MAP, v: string) => (STATUS_MAP[ctx] as Record<string, { label: string }>)[v]?.label ?? v;
const val = (v: number | null, unit: string) => (v == null ? "Indisponível" : formatMetricValue({ value: v, unit }));

export type ReportData = {
  period: { start: Date; end: Date };
  indicators: IndicatorRow[];
  meetings: { occurredAt: Date; title: string; decisions: string[]; nextSteps: string[]; impediments: string[]; trainings: string[] }[];
  events: { occurredAt: Date; kind: string; description: string }[];
  doneTasks: { title: string; completedAt: Date; process: string | null }[];
  audits: { code: string; auditedAt: Date; checked: number; conforming: number }[];
};

export async function loadReportData(user: SessionUser, clientId: string, projectId: string, period: { start: Date; end: Date }): Promise<ReportData> {
  const ind = await getIndicators(user, clientId, projectId);
  const endInc = new Date(period.end.getTime() + 86_399_999);
  const [meetings, tasks, audits] = await Promise.all([
    prisma.projectMeeting.findMany({ where: { projectId, clientId, occurredAt: { gte: period.start, lte: period.end } }, orderBy: { occurredAt: "asc" } }),
    prisma.actionTask.findMany({ where: { projectId, clientId, status: "DONE", completedAt: { gte: period.start, lte: endInc } }, include: { projectProcess: { select: { process: { select: { code: true } } } } }, orderBy: { completedAt: "asc" } }),
    prisma.processAudit.findMany({ where: { clientId, projectProcess: { projectId }, auditedAt: { gte: period.start, lte: period.end } }, include: { projectProcess: { select: { process: { select: { code: true } } } } } }),
  ]);
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  return {
    period,
    indicators: ind.rows,
    meetings: meetings.map((m) => ({ occurredAt: m.occurredAt, title: m.title, decisions: arr(m.decisionsJson), nextSteps: arr(m.nextStepsJson), impediments: arr(m.impedimentsJson), trainings: arr(m.trainingsJson) })),
    events: ind.events.map((e) => ({ occurredAt: e.occurredAt, kind: e.kind, description: e.description })),
    doneTasks: tasks.map((t) => ({ title: t.title, completedAt: t.completedAt!, process: t.projectProcess?.process.code ?? null })),
    audits: audits.map((a) => ({ code: a.projectProcess.process.code, auditedAt: a.auditedAt, checked: a.itemsChecked, conforming: a.itemsConforming })),
  };
}

/** Relatório periódico determinístico (9.3): 11 seções; observado × estimado × não mensurado; frase de não causalidade. */
export function buildReport(ctx: GenContext, r: ReportData): { content: DocContent; sources: Sources } {
  const pr = ctx.project!;
  const pl = `${formatDay(r.period.start)} a ${formatDay(r.period.end)}`;
  const observed = r.indicators.filter((i) => i.classification === "OBSERVED" && i.baseline?.value != null);
  const sales = r.indicators.find((i) => i.code === "SALES_VALUE");
  const processLines = ctx.processes.map((p) => `${p.code} — ${p.name}: ${label("processImpl", p.status)}`);
  const open = ctx.tasks.filter((t) => t.status !== "DONE");
  const blocked = ctx.tasks.filter((t) => t.status === "BLOCKED");
  const done = ctx.tasks.filter((t) => t.status === "DONE").length;
  const nextCycle = open.filter((t) => t.dueDate && t.dueDate.getTime() <= r.period.end.getTime() + 45 * 86_400_000).slice(0, 12);
  const estimated = ctx.opportunities.filter((o) => o.inProject && o.estimatedValue != null);
  const sections: Section[] = [
    sec("resumo", "Resumo executivo do período", "Projeto + indicadores + plano", [
      para(`Relatório do projeto “${pr.name}” no período de ${pl}. ${done} de ${ctx.tasks.length} tarefas concluídas no total; ${r.doneTasks.length} concluídas neste período. Processos: ${processLines.join("; ") || "nenhum"}.`),
      observed.length ? list(observed.map((i) => `${i.label}: ${val(i.baseline!.value, i.unit)} no baseline → ${val(i.current!.value, i.unit)} no último registro (${i.pct == null ? "variação % indisponível" : `${i.pct > 0 ? "+" : ""}${formatDecimal(i.pct)}%`}).`)) : para("Nenhum indicador com baseline e valor atual comparáveis no período."),
      callout(NON_CAUSALITY, "warn"),
    ]),
    sec("metas", "Metas e escopo", "Projeto", [
      para(pr.scope ?? P("escopo do projeto")),
      pr.objectives.length ? list(pr.objectives) : para(P("objetivos aprovados")),
      para("Metas numéricas só constam quando aprovadas pelo patrocinador; sem meta aprovada, os indicadores são acompanhados como evolução observada."),
    ]),
    sec("atividades", "Atividades implantadas", "Plano de ação + reuniões", [
      r.doneTasks.length ? table(["Tarefa", "Processo", "Concluída em"], r.doneTasks.map((t) => [t.title, t.process ?? "Geral", formatDay(t.completedAt)])) : para("Nenhuma tarefa concluída no período."),
      ...(r.meetings.some((m) => m.trainings.length) ? [h3("Treinamentos registrados"), list(r.meetings.flatMap((m) => m.trainings.map((t) => `${formatDay(m.occurredAt)} — ${t}`)))] : []),
    ]),
    sec("status", "Status das tarefas e dos processos", "Plano de ação + auditorias", [
      table(["Processo", "Status", "Auditorias no período (conformes/auditados)"], ctx.processes.map((p) => {
        const au = r.audits.filter((a) => a.code === p.code);
        return [`${p.code} — ${p.name}`, label("processImpl", p.status), au.length ? au.map((a) => `${formatDay(a.auditedAt)}: ${a.conforming}/${a.checked}`).join("; ") : "Sem auditoria"];
      })),
      para(`Tarefas: ${done} concluídas, ${open.length} em aberto, ${blocked.length} bloqueadas.`),
    ]),
    sec("kpis", "Indicadores, fonte e comparabilidade", "Baseline congelado + snapshots", [
      table(["Indicador", "Baseline (congelado)", "Atual", "Variação", "Classificação", "Fonte"], r.indicators.map((i) => [
        i.label,
        i.baseline ? `${val(i.baseline.value, i.unit)} (${i.baseline.period})` : "Não aplicável",
        i.current ? `${val(i.current.value, i.unit)} (até ${formatDay(i.current.periodEnd)})` : "Sem registro",
        i.abs == null ? "—" : `${i.abs > 0 ? "+" : ""}${val(i.abs, i.unit)}${i.pct == null ? "" : ` (${i.pct > 0 ? "+" : ""}${formatDecimal(i.pct)}%)`}`,
        CLASS_LABEL[i.classification],
        i.source,
      ])),
      para(`Comparação entre janelas de mesma duração (90 dias), mesma fórmula e mesma base de vendas. Valores manuais aparecem como “Estimado”.`),
      ...(r.events.length ? [h3("Notas de comparabilidade"), list(r.events.map((e) => `${formatDay(e.occurredAt)} · ${EVENT_KINDS[e.kind] ?? e.kind}: ${e.description}`))] : []),
      ...ctx.dataAlerts.map((a) => callout(`${a.code}: ${a.message}`, "warn")),
    ]),
    sec("financeiro", "Efeitos financeiros observados e hipóteses", "Indicadores observados", [
      sales?.baseline?.value != null && sales.current?.value != null ? para(`Valor comercial registrado: ${val(sales.baseline.value, "BRL")} no baseline e ${val(sales.current.value, "BRL")} na janela atual (${sales.abs! > 0 ? "+" : ""}${val(sales.abs, "BRL")}). Trata-se de valor comercial, não de lucro, e não desconta custos do projeto.`) : para("Sem base comparável de valor comercial no período: efeito financeiro não mensurado."),
      callout(NON_CAUSALITY, "warn"),
      para("Hipótese de contribuição: a evolução pode estar relacionada às rotinas implantadas; validar com os registros de execução e os eventos externos listados antes de qualquer atribuição."),
    ]),
    sec("estimados", "Benefícios estimados (isolados)", "Oportunidades do projeto", [
      estimated.length ? table(["Oportunidade", "Valor estimado", "Classificação", "Premissas"], estimated.map((o) => [`O-${String(o.number).padStart(2, "0")} ${o.title}`, val(o.estimatedValue, "BRL"), o.estimateType === "OBSERVED" ? "Observado" : o.estimateType === "TARGET" ? "Meta" : "Estimado", o.assumptions.join("; ") || "—"])) : para("Nenhum benefício estimado registrado. Estimativas não são somadas aos resultados observados."),
      para("ROI e ganho econômico só são calculados com margem confiável, investimento informado e método de atribuição documentado; até lá: não mensurado."),
    ]),
    sec("problemas", "Problemas e impedimentos", "Tarefas bloqueadas + reuniões", [
      blocked.length || r.meetings.some((m) => m.impediments.length) ? list([...blocked.map((t) => `${t.title}: ${t.blockedReason ?? "bloqueada"}`), ...r.meetings.flatMap((m) => m.impediments.map((i) => `${formatDay(m.occurredAt)} — ${i}`))]) : para("Nenhum impedimento registrado no período."),
    ]),
    sec("decisoes", "Decisões pendentes do cliente", "Reuniões do período", [
      r.meetings.some((m) => m.nextSteps.length) ? list(r.meetings.flatMap((m) => m.nextSteps.map((n) => `${formatDay(m.occurredAt)} — ${n}`))) : para(P("decisões pendentes do cliente")),
      ...(r.meetings.some((m) => m.decisions.length) ? [h3("Decisões tomadas"), list(r.meetings.flatMap((m) => m.decisions.map((d) => `${formatDay(m.occurredAt)} — ${d}`)))] : []),
    ]),
    sec("proximo", "Plano do próximo ciclo", "Plano de ação", [
      nextCycle.length ? table(["Tarefa", "Responsável", "Prazo"], nextCycle.map((t) => [t.title, [t.assignee, t.externalOwner].filter(Boolean).join(" / ") || P("responsável"), formatDay(t.dueDate)])) : para(P("ações do próximo ciclo")),
    ]),
    sec("anexos", "Anexos e fontes", "Fontes do relatório", [
      list([...new Set(r.indicators.map((i) => i.source).filter((s) => s && s !== "—"))].map((s) => `Fonte: ${s}`)),
      para(`Reuniões consideradas: ${r.meetings.map((m) => `${formatDay(m.occurredAt)} (${m.title})`).join("; ") || "nenhuma"}.`),
    ]),
  ];
  return {
    content: { sections },
    sources: { clientId: ctx.client.id, clientName: ctx.client.name, projectId: pr.id, assessmentId: ctx.assessment?.id ?? null, assessmentLabel: ctx.assessment?.label ?? null, processes: ctx.processes.map((p) => ({ code: p.code, version: p.version })), opportunityIds: [], evidence: [], generatedAt: new Date().toISOString(), generator: `${GENERATOR_VERSION}+report` },
  };
}

const reportSchema = z.object({ projectId: z.uuid({ error: "Selecione o projeto." }), periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.") });

/** Cria período + documento REPORT (v1 rascunho); aprovação/versões/exportação seguem o fluxo de documentos. */
export async function createReport(user: SessionUser, clientId: string, input: unknown) {
  const client = await assertClientAccess(user, clientId, "EDIT");
  const d = reportSchema.parse(input);
  const start = parseDateOnly(d.periodStart), end = parseDateOnly(d.periodEnd);
  if (!start || !end || end < start) throw new AppError("VALIDATION", "Período inválido.", { periodEnd: "Fim anterior ao início." });
  const project = await prisma.project.findFirst({ where: { id: d.projectId, clientId } });
  if (!project) throw notFound("Projeto");
  const ctx = await loadContext(user, clientId, project.id);
  const data = await loadReportData(user, clientId, project.id, { start, end });
  const { content, sources } = buildReport(ctx, data);
  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({ data: { clientId, projectId: project.id, type: "REPORT", title: `Relatório de resultados — ${project.name} — ${formatDay(start)} a ${formatDay(end)}`, createdBy: user.id, isDemo: client.isDemo } });
    const rev = await tx.documentRevision.create({ data: { clientId, documentId: doc.id, version: 1, contentJson: content as unknown as Prisma.InputJsonValue, structuredSourcesJson: sources as unknown as Prisma.InputJsonValue, createdBy: user.id } });
    await tx.document.update({ where: { id: doc.id }, data: { currentRevisionId: rev.id } });
    const rp = await tx.reportPeriod.create({ data: { clientId, projectId: project.id, periodStart: start, periodEnd: end, documentId: doc.id, createdBy: user.id } });
    await audit({ actorUserId: user.id, clientId, entityType: "ReportPeriod", entityId: rp.id, action: "report.create", meta: { documentId: doc.id } }, tx);
    return { ...rp, documentId: doc.id };
  });
}

/** Lista com estado derivado: Rascunho → Aprovado (versão aprovada) → Exportado (exportação final concluída). */
export async function listReports(user: SessionUser, clientId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  const rps = await prisma.reportPeriod.findMany({ where: { clientId }, include: { project: { select: { name: true } } }, orderBy: { periodEnd: "desc" } });
  const docIds = rps.map((r) => r.documentId).filter((x): x is string => !!x);
  const [revs, exps] = await Promise.all([
    prisma.documentRevision.findMany({ where: { clientId, documentId: { in: docIds } }, select: { documentId: true, state: true, version: true } }),
    prisma.documentExport.findMany({ where: { clientId, documentId: { in: docIds }, isDraft: false, status: "COMPLETED" }, select: { documentId: true } }),
  ]);
  return rps.map((r) => {
    const rv = revs.filter((x) => x.documentId === r.documentId);
    const status = exps.some((e) => e.documentId === r.documentId) ? "EXPORTED" : rv.some((x) => x.state === "APPROVED" || x.state === "PUBLISHED") ? "APPROVED" : "DRAFT";
    return { ...r, status, versions: rv.length };
  });
}

export async function reportPeriodForDocument(clientId: string, documentId: string) {
  if (!isUuid(documentId)) return null;
  return prisma.reportPeriod.findFirst({ where: { clientId, documentId } });
}
