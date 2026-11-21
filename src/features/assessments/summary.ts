import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { formatDate, formatDateTime, formatDecimal } from "@/lib/format";
import type { SessionUser } from "@/features/auth/service";
import { segmentLabel } from "@/features/clients/catalog";
import { getAssessmentDetail } from "./service";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Rascunho", IN_REVIEW: "Em revisão", FINALIZED: "Fechado" };
const FINDING_TYPE: Record<string, string> = { PROBLEM: "Problema", OPPORTUNITY: "Oportunidade", RISK: "Risco", DATA_GAP: "Lacuna de dados", STRENGTH: "Ponto forte" };
const SEVERITY: Record<string, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" };
const ORIGIN: Record<string, string> = { RULE: "Regra", CONSULTANT: "Consultor", AI_SUGGESTION: "Sugestão IA" };

/** Resumo do diagnóstico: scores por área com cobertura, lacunas e achados — tudo do mesmo cliente. */
export async function buildSummary(user: SessionUser, clientId: string, assessmentId: string) {
  const d = await getAssessmentDetail(user, clientId, assessmentId);
  const findings = await prisma.finding.findMany({ where: { clientId, assessmentId, status: { not: "DISMISSED" } }, orderBy: [{ severity: "desc" }, { createdAt: "asc" }] });
  const domainName = new Map(d.domains.map((x) => [x.code, x.name]));
  const gaps = d.questions.filter((q) => d.visibility[q.code]?.visible && q.type === "SCALE_0_5" && q.weight > 0 && (!d.answers[q.code] || d.answers[q.code]!.value.kind === "unknown"));
  return {
    client: d.client,
    assessment: d.assessment,
    overall: d.overall,
    domains: d.domainScores.map((s) => ({ ...s, name: domainName.get(s.domainCode) ?? s.domainCode })),
    findings,
    gaps: gaps.map((q) => ({ code: q.code, title: q.title, domain: domainName.get(q.domainCode) ?? q.domainCode, unknown: d.answers[q.code]?.value.kind === "unknown" })),
  };
}

export type Summary = Awaited<ReturnType<typeof buildSummary>>;

export function summaryToMarkdown(s: Summary): string {
  const a = s.assessment;
  const label = `Diagnóstico #${a.number}${a.revision ? ` · revisão ${a.revision}` : ""}`;
  const score = (v: number | null) => (v === null ? "Indisponível (sem respostas válidas)" : `${formatDecimal(v)} / 5`);
  const lines: string[] = [];
  lines.push(`# Resumo do diagnóstico 360° — ${s.client.name}${s.client.isDemo ? " (DEMO — dados fictícios)" : ""}`, "");
  lines.push(`- **${label}** · status: ${STATUS_LABEL[a.status] ?? a.status}`);
  lines.push(`- Segmento considerado: ${segmentLabel(a.segment)}`);
  if (a.periodStart || a.periodEnd) lines.push(`- Período: ${formatDate(a.periodStart)} a ${formatDate(a.periodEnd)}`);
  lines.push(`- Iniciado em ${formatDateTime(a.startedAt)}${a.finalizedAt ? ` · fechado em ${formatDateTime(a.finalizedAt)}` : ""}`);
  lines.push(`- Score geral: ${score(s.overall.weightedScore)} · cobertura ${Math.round(s.overall.coverage * 100)}% (${s.overall.answeredCount}/${s.overall.applicableCount} perguntas aplicáveis) · ${s.overall.unknownCount} "não sei"`, "");
  lines.push("> Score calculado só sobre perguntas respondidas e aplicáveis. \"Não sei\" e \"não se aplica\" não reduzem a nota. A pontuação não é diagnóstico definitivo: combine com evidências, dados e julgamento do consultor.", "");
  lines.push("## Scores por área", "", "| Área | Score | Cobertura | Não sei |", "|---|---|---|---|");
  for (const d of s.domains) lines.push(`| ${d.name} | ${d.weightedScore === null ? "n/d" : formatDecimal(d.weightedScore)} | ${Math.round(d.coverage * 100)}% (${d.answeredCount}/${d.applicableCount}) | ${d.unknownCount} |`);
  lines.push("", "## Achados", "");
  if (s.findings.length === 0) lines.push("Nenhum achado registrado.");
  for (const f of s.findings) {
    lines.push(`### ${f.title}`, `- Tipo: ${FINDING_TYPE[f.type]} · severidade ${SEVERITY[f.severity]} · origem ${ORIGIN[f.origin]} · status ${f.status === "DETECTED" ? "Detectado" : f.status === "REVIEWED" ? "Revisado" : "Aprovado"}`, "", f.description, "");
  }
  lines.push("## Lacunas de informação", "");
  if (s.gaps.length === 0) lines.push("Nenhuma lacuna nas perguntas aplicáveis.");
  for (const g of s.gaps) lines.push(`- ${g.code} (${g.domain}): ${g.title}${g.unknown ? " — marcada como \"não sei\"" : " — sem resposta"}`);
  lines.push("", `---`, `Gerado pelo Efettiva OS em ${formatDateTime(new Date())}. Documento interno da Efettiva Gestão.`);
  return lines.join("\n");
}

export async function exportSummaryMarkdown(user: SessionUser, clientId: string, assessmentId: string) {
  const s = await buildSummary(user, clientId, assessmentId);
  await audit({ actorUserId: user.id, clientId, entityType: "Assessment", entityId: assessmentId, action: "assessment.export_summary", meta: { format: "md" } });
  const name = `resumo-diagnostico-${s.assessment.number}${s.assessment.revision ? `-r${s.assessment.revision}` : ""}-${s.client.name}.md`;
  return { filename: name, markdown: summaryToMarkdown(s) };
}
