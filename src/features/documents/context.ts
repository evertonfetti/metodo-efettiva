import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import type { SessionUser } from "@/features/auth/service";
import { getAssessmentDetail } from "@/features/assessments/service";
import { getSetting } from "@/features/settings/service";
import { channelLabel, salesModelLabel, segmentLabel, sizeLabel } from "@/features/clients/catalog";
import { parseContent, type ProcessContent, type ProcessSnapshot } from "@/features/processes/content";
import { todayDateOnly } from "@/lib/dates";

export type CtxTask = { title: string; planKey: string | null; window: number | null; dueDate: Date | null; status: string; assignee: string | null; externalOwner: string | null; checklist: string[]; blockedReason: string | null };
export type CtxProcess = { id: string; code: string; name: string; objective: string; version: number; status: string; ownerName: string | null; content: ProcessContent | null; tasks: CtxTask[] };
export type CtxFinding = { id: string; title: string; description: string; domainCode: string; origin: string; severity: string; confidence: string; status: string; evidence: string[] };
export type CtxOpportunity = { id: string; number: number; title: string; explanation: string; domainCode: string; origin: string; impact: number; confidence: number; effort: number; score: number; criticalRisk: boolean; criticalRiskReason: string | null; status: string; statusReason: string | null; processCodes: string[]; dependency: string | null; assumptions: string[]; missingData: string | null; estimatedValue: number | null; estimateType: string | null; inProject: boolean };

/** Tudo que o gerador determinístico precisa, carregado sob o clientId já autorizado. Sem IA, sem dado inventado. */
export type GenContext = {
  today: Date;
  brand: { companyName: string; confidentiality: string };
  client: { id: string; name: string; legalName: string | null; segment: string; size: string | null; location: string | null; salesModel: string | null; channels: string[]; sellersCount: number | null; sourceSystem: string | null; salesCycle: string | null; mainChallenges: string | null };
  project: { id: string; number: number; name: string; scope: string | null; objectives: string[]; startDate: Date; targetDate: Date; sponsorName: string | null; ownerName: string; status: string } | null;
  processes: CtxProcess[];
  tasks: CtxTask[];
  opportunities: CtxOpportunity[];
  assessment: {
    id: string;
    label: string;
    finalized: boolean;
    overall: { weightedScore: number | null; coverage: number; answeredCount: number; applicableCount: number; unknownCount: number };
    domains: { code: string; name: string; score: number | null; coverage: number; answered: number; applicable: number; unknown: number }[];
  } | null;
  findings: CtxFinding[];
};

type Ev = { kind?: string; text?: string; title?: string; questionCode?: string; domainCode?: string; score?: number | null; coverage?: number; value?: number };
function evidenceLabel(e: Ev): string | null {
  if (e.kind === "NOTE" && e.text) return e.text;
  if (e.kind === "ASSESSMENT_SCORE") return `Score da área ${e.domainCode} no diagnóstico${e.score == null ? " (indisponível)" : `: ${e.score.toFixed(1).replace(".", ",")}`} · cobertura ${Math.round((e.coverage ?? 0) * 100)}%`;
  if (e.kind === "ASSESSMENT_ANSWER") return `Resposta ${e.value} na pergunta ${e.questionCode}: ${e.title}`;
  return null;
}

export async function loadContext(user: SessionUser, clientId: string, projectId: string | null): Promise<GenContext> {
  const client = await prisma.client.findFirstOrThrow({ where: { id: clientId } });
  const brand = await getSetting("brand");
  let project: GenContext["project"] = null;
  let processes: CtxProcess[] = [];
  let tasks: CtxTask[] = [];
  if (projectId) {
    const p = await prisma.project.findFirst({
      where: { id: projectId, clientId },
      include: {
        owner: { select: { name: true } },
        processes: { orderBy: { createdAt: "asc" } },
        tasks: { include: { assignee: { select: { name: true } } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] },
      },
    });
    if (!p) throw notFound("Projeto");
    project = { id: p.id, number: p.number, name: p.name, scope: p.scope, objectives: Array.isArray(p.objectivesJson) ? (p.objectivesJson as string[]) : [], startDate: p.startDate, targetDate: p.targetDate, sponsorName: p.sponsorName, ownerName: p.owner.name, status: p.status };
    const toTask = (t: (typeof p.tasks)[number]): CtxTask => ({
      title: t.title,
      planKey: t.planKey,
      window: t.window,
      dueDate: t.dueDate,
      status: t.status,
      assignee: t.assignee?.name ?? null,
      externalOwner: t.externalOwnerName,
      checklist: Array.isArray(t.checklistJson) ? (t.checklistJson as { text: string }[]).map((c) => c.text) : [],
      blockedReason: t.blockedReason,
    });
    tasks = p.tasks.map(toTask);
    processes = p.processes
      .filter((pp) => pp.status !== "CANCELLED")
      .map((pp) => {
        const snap = pp.snapshotJson as unknown as ProcessSnapshot;
        return {
          id: pp.id,
          code: snap.code,
          name: snap.name,
          objective: snap.objective,
          version: pp.processVersion,
          status: pp.status,
          ownerName: pp.ownerName,
          content: parseContent(snap.content),
          tasks: p.tasks.filter((t) => t.projectProcessId === pp.id).map(toTask),
        };
      });
  }

  const opps = await prisma.opportunity.findMany({ where: { clientId }, include: { processes: { where: { selected: true }, include: { process: { select: { code: true } } } } }, orderBy: { number: "asc" } });
  const opportunities: CtxOpportunity[] = opps.map((o) => ({
    id: o.id,
    number: o.number,
    title: o.title,
    explanation: o.explanation,
    domainCode: o.domainCode,
    origin: o.origin,
    impact: o.impactScore,
    confidence: o.confidenceScore,
    effort: o.effortScore,
    score: Number(o.priorityScore),
    criticalRisk: o.criticalRisk,
    criticalRiskReason: o.criticalRiskReason,
    status: o.status,
    statusReason: o.statusReason,
    processCodes: o.processes.map((p) => p.process.code),
    dependency: o.dependency,
    assumptions: Array.isArray(o.assumptionsJson) ? (o.assumptionsJson as string[]) : [],
    missingData: o.missingData,
    estimatedValue: o.estimatedValue == null ? null : Number(o.estimatedValue),
    estimateType: o.estimateType,
    inProject: !!projectId && o.projectId === projectId,
  }));

  const a = (await prisma.assessment.findFirst({ where: { clientId, status: "FINALIZED" }, orderBy: [{ finalizedAt: "desc" }] })) ?? (await prisma.assessment.findFirst({ where: { clientId }, orderBy: [{ startedAt: "desc" }] }));
  let assessment: GenContext["assessment"] = null;
  if (a) {
    const d = await getAssessmentDetail(user, clientId, a.id);
    const names = new Map(d.domains.map((x) => [x.code, x.name]));
    assessment = {
      id: a.id,
      label: `Diagnóstico #${a.number}${a.revision ? ` (revisão ${a.revision})` : ""}`,
      finalized: a.status === "FINALIZED",
      overall: d.overall,
      domains: d.domainScores.map((s) => ({ code: s.domainCode, name: names.get(s.domainCode) ?? s.domainCode, score: s.weightedScore, coverage: s.coverage, answered: s.answeredCount, applicable: s.applicableCount, unknown: s.unknownCount })),
    };
  }
  const findingRows = await prisma.finding.findMany({ where: { clientId, status: { not: "DISMISSED" }, ...(a ? { OR: [{ assessmentId: a.id }, { assessmentId: null }] } : {}) }, orderBy: [{ severity: "desc" }, { createdAt: "asc" }] });
  const findings: CtxFinding[] = findingRows.map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
    domainCode: f.domainCode,
    origin: f.origin,
    severity: f.severity,
    confidence: f.confidence,
    status: f.status,
    evidence: (Array.isArray(f.evidenceJson) ? (f.evidenceJson as Ev[]) : []).map(evidenceLabel).filter((x): x is string => !!x).slice(0, 4),
  }));

  return {
    today: todayDateOnly(),
    brand: { companyName: brand.companyName, confidentiality: brand.confidentiality },
    client: {
      id: client.id,
      name: client.name,
      legalName: client.legalName,
      segment: segmentLabel(client.industry, client.industryOther),
      size: sizeLabel(client.size),
      location: client.city ? `${client.city}${client.state ? `/${client.state}` : ""}` : client.state,
      salesModel: salesModelLabel(client.salesModel),
      channels: client.salesChannels.map(channelLabel),
      sellersCount: client.sellersCount,
      sourceSystem: client.sourceSystem,
      salesCycle: client.salesCycle,
      mainChallenges: client.mainChallenges,
    },
    project,
    processes,
    tasks,
    opportunities,
    assessment,
    findings,
  };
}
