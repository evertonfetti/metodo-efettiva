import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import type { SessionUser } from "@/features/auth/service";
import { loadContext } from "@/features/documents/context";
import { contentSchema, type EvidenceSource, type Sources } from "@/features/documents/content";
import { blockToMarkdown } from "@/features/documents/render/markdown";
import { formatMetricValue } from "@/features/documents/generate";

export const TASK_BY_SECTION = (key: string) =>
  key.startsWith("pop:") ? "SOP_BUILD"
  : key === "roteiros" ? "SCRIPT_BUILD"
  : key === "treinamento" ? "TRAINING_PLAN_BUILD"
  : key === "diagnostico" ? "ASSESSMENT_SUMMARY"
  : key === "oportunidades" ? "OPPORTUNITY_EXPLANATION"
  : key.startsWith("processo:") ? "PROCESS_RECOMMENDATION_EXPLANATION"
  : "PLAYBOOK_SECTION_REWRITE";

export type AiEvidence = EvidenceSource & { sourceType: "ASSESSMENT" | "IMPORT" | "METRIC" | "MANUAL"; quality: "VERIFIED" | "REPORTED" | "ESTIMATED" | "INCOMPLETE"; period?: string };
export type AssembleOptions = { includeFinancial: boolean; instruction?: string | null };
export type Assembled = {
  payload: Record<string, unknown>;
  replacements: [string, string][]; // [token, real]
  evidence: AiEvidence[];
  allowedProcessCodes: string[];
  inputHash: string;
  sensitive: string[];
  sectionTitle: string;
  visibility: "INTERNO" | "CLIENTE";
};

/**
 * ContextAssembler + DataMinimizer + EvidenceBuilder (8.2 passos 2–4):
 * só dados do cliente/projeto do documento; agregados (nunca a base de vendas); nomes de pessoas e da empresa
 * pseudonimizados; valores em R$ omitidos se o consultor não autorizar; evidências numeradas EV-xxx.
 */
export async function assembleSectionContext(user: SessionUser, clientId: string, documentId: string, revisionId: string, sectionKey: string, opts: AssembleOptions): Promise<Assembled> {
  const doc = await prisma.document.findFirst({ where: { id: documentId, clientId } });
  if (!doc) throw notFound("Documento");
  const rev = await prisma.documentRevision.findFirst({ where: { id: revisionId, documentId, clientId } });
  if (!rev) throw notFound("Versão");
  const content = contentSchema.parse(rev.contentJson);
  const section = content.sections.find((s) => s.key === sectionKey);
  if (!section) throw notFound("Seção");
  const sources = rev.structuredSourcesJson as unknown as Sources;
  const ctx = await loadContext(user, clientId, doc.projectId);

  // ── pseudonimização (RF-096)
  const users = await prisma.user.findMany({ select: { name: true } });
  const pairs: [string, string][] = [];
  const add = (real: string | null | undefined, token: string) => {
    const r = real?.trim();
    if (r && r.length >= 3 && !pairs.some(([, x]) => x === r)) pairs.push([token, r]);
  };
  add(ctx.client.name, "[EMPRESA]");
  add(ctx.client.legalName, "[EMPRESA]");
  add(ctx.project?.sponsorName, "[PATROCINADOR]");
  for (const u of users) add(u.name, "[EQUIPE_EFETTIVA]");
  ctx.processes.forEach((p) => add(p.ownerName, `[RESP_${p.code}]`));
  [...new Set(ctx.tasks.map((t) => t.externalOwner).filter(Boolean))].forEach((n, i) => add(n, `[RESP_CLIENTE_${i + 1}]`));
  pairs.sort((a, b) => b[1].length - a[1].length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pseudo = (s: string) => pairs.reduce((acc, [token, real]) => acc.replace(new RegExp(esc(real), "gi"), token), s);
  const money = (s: string) => (opts.includeFinancial ? s : s.replace(/R\$\s?-?[\d.]+(,\d+)?/g, "[valor omitido]"));
  const clean = (s: string) => money(pseudo(s));

  // ── evidências: as do documento + indicadores + oportunidades do projeto
  const evidence: AiEvidence[] = (sources.evidence ?? []).map((e) => ({ ...e, label: clean(e.label), sourceType: "ASSESSMENT", quality: "REPORTED" }));
  let n = evidence.reduce((m, e) => Math.max(m, Number(e.ref.slice(3)) || 0), 0);
  const nextRef = () => `EV-${String(++n).padStart(3, "0")}`;
  for (const m of Object.values(ctx.metrics)) {
    if (m.unit === "BRL" && !opts.includeFinancial) continue;
    evidence.push({ ref: nextRef(), kind: "Indicador calculado", label: `${m.label}: ${m.value == null ? `indisponível (${m.reason ?? "dados insuficientes"})` : formatMetricValue(m)} · período ${m.period} · fonte ${m.source}`, sourceType: "METRIC", quality: m.value == null ? "INCOMPLETE" : "VERIFIED", period: m.period });
  }
  for (const o of ctx.opportunities.filter((x) => x.status !== "DISMISSED")) {
    evidence.push({ ref: nextRef(), kind: "Oportunidade registrada", label: clean(`O-${String(o.number).padStart(2, "0")} ${o.title}: ${o.explanation} (impacto ${o.impact}, confiança ${o.confidence}, esforço ${o.effort}${o.criticalRisk ? ", risco crítico" : ""})`), sourceType: "MANUAL", quality: "REPORTED" });
  }

  const procs = section.processCode ? ctx.processes.filter((p) => p.code === section.processCode) : ctx.processes;
  const allowedProcessCodes = ctx.processes.map((p) => p.code);
  const sensitive: string[] = [];
  if (ctx.client.mainChallenges) sensitive.push("Desafios relatados no cadastro (texto livre)");
  if (opts.includeFinancial) sensitive.push("Valores financeiros agregados (R$)");

  const payload = {
    task: { type: doc.type === "REPORT" ? "REPORT_NARRATIVE_BUILD" : TASK_BY_SECTION(sectionKey), section: { key: section.key, title: clean(section.title), visibility: section.visibility } },
    company: {
      name: "[EMPRESA]",
      segment: ctx.client.segment,
      size: ctx.client.size,
      salesModel: ctx.client.salesModel,
      channels: ctx.client.channels,
      sellersCount: ctx.client.sellersCount,
      salesCycle: ctx.client.salesCycle,
      challenges: ctx.client.mainChallenges ? clean(ctx.client.mainChallenges).slice(0, 1500) : null,
    },
    project: ctx.project ? { name: clean(ctx.project.name), objectives: ctx.project.objectives.map(clean), scope: ctx.project.scope ? clean(ctx.project.scope).slice(0, 1500) : null } : null,
    currentSection: clean(section.blocks.map(blockToMarkdown).join("\n\n")).slice(0, 24_000),
    processes: procs.map((p) => ({
      code: p.code,
      name: p.name,
      objective: p.objective,
      responsible: p.ownerName ? `[RESP_${p.code}]` : null,
      trigger: p.content?.trigger ?? null,
      steps: p.content?.steps ?? [],
      approach: p.content?.approach ?? null,
      cadence: p.content?.cadence ?? null,
      kpis: (p.content?.kpis ?? []).map((k) => ({ name: k, formula: p.content?.kpiFormulas?.[k] ?? null })),
      exceptions: p.content?.exceptions ?? null,
      validation: p.content?.validation ?? null,
    })),
    evidence: evidence.map((e) => ({ id: e.ref, sourceType: e.sourceType, quality: e.quality, summary: e.label, ...(e.period ? { period: e.period } : {}) })),
    dataAlerts: ctx.dataAlerts.map((a) => `${a.code}: ${a.message}`),
    allowedProcessCodes,
    allowedEvidenceIds: evidence.map((e) => e.ref),
    instruction: opts.instruction ? opts.instruction.slice(0, 1000) : null,
  };
  const inputHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { payload, replacements: pairs, evidence, allowedProcessCodes, inputHash, sensitive, sectionTitle: section.title, visibility: section.visibility };
}
