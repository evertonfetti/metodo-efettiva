import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Chip } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { EmptyState } from "@/components/empty-state";
import { DomainBars } from "@/components/domain-bars";
import { MetricCardWithSource } from "@/components/metric-card";
import { FindingActions, GenerateFindingsButton, ManualFindingForm } from "@/components/assessments/findings";
import { requirePageUser } from "@/lib/security/session";
import { buildSummary } from "@/features/assessments/summary";
import { segmentLabel } from "@/features/clients/catalog";
import { AppError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Resumo do diagnóstico" };

const TYPE: Record<string, string> = { PROBLEM: "Problema", OPPORTUNITY: "Oportunidade", RISK: "Risco", DATA_GAP: "Lacuna de dados", STRENGTH: "Ponto forte" };
const SEV: Record<string, { label: string; tone: "neutral" | "warn" | "err" | "blocked" }> = { LOW: { label: "Baixa", tone: "neutral" }, MEDIUM: { label: "Média", tone: "warn" }, HIGH: { label: "Alta", tone: "blocked" }, CRITICAL: { label: "Crítica", tone: "err" } };
const FSTATUS: Record<string, string> = { DETECTED: "DETECTED", REVIEWED: "REVIEWED", APPROVED: "APPROVED", DISMISSED: "DISMISSED" };

export default async function SummaryPage({ params }: { params: Promise<{ clientId: string; assessmentId: string }> }) {
  const user = await requirePageUser();
  const { clientId, assessmentId } = await params;
  let s;
  try {
    s = await buildSummary(user, clientId, assessmentId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const canEdit = user.role !== "VIEWER";
  const a = s.assessment;
  const label = `Diagnóstico #${a.number}${a.revision ? ` · revisão ${a.revision}` : ""}`;
  const allFindings = s.findings;

  return (
    <>
      <Topbar crumbs={[{ label: s.client.name, href: `/clientes/${clientId}` }, { label: "Diagnósticos", href: `/clientes/${clientId}/diagnosticos` }, { label: label, href: `/clientes/${clientId}/diagnosticos/${a.id}` }, { label: "Resumo" }]} />
      <PageContent>
        <PageHeader
          title="Resumo e scores"
          badges={<><StatusBadge context="assessment" value={a.status} /><DemoBadge show={s.client.isDemo} /></>}
          subtitle={`${label} · segmento ${segmentLabel(a.segment)} · ${a.finalizedAt ? `fechado em ${formatDateTime(a.finalizedAt)}` : "rascunho (scores parciais)"}`}
          actions={
            <>
              <Button asChild variant="secondary"><Link href={`/clientes/${clientId}/diagnosticos/${a.id}`}>Voltar ao questionário</Link></Button>
              <Button asChild><a href={`/api/v1/clients/${clientId}/assessments/${a.id}/summary?format=md`}>Exportar resumo (MD)</a></Button>
            </>
          }
        />
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Indicadores do diagnóstico">
          <MetricCardWithSource label="Score geral (0–5)" value={s.overall.weightedScore} format="decimal" source="respostas do diagnóstico" period={a.finalizedAt ? "snapshot do fechamento" : "rascunho atual"} unavailableReason="nenhuma resposta válida na escala" />
          <MetricCardWithSource label="Cobertura das perguntas aplicáveis" value={Math.round(s.overall.coverage * 1000) / 10} format="percent" source={`${s.overall.answeredCount}/${s.overall.applicableCount} respondidas`} period={a.finalizedAt ? "snapshot do fechamento" : "rascunho atual"} />
          <MetricCardWithSource label='Respostas "não sei"' value={s.overall.unknownCount} source="lacunas de informação" period={a.finalizedAt ? "snapshot do fechamento" : "rascunho atual"} alert={s.overall.unknownCount > 0} />
        </section>
        <p className="text-[13px] text-text-muted">A pontuação considera só itens respondidos e aplicáveis e não é diagnóstico definitivo: combine com evidências, dados importados e julgamento do consultor.</p>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card aria-labelledby="sum-areas">
            <CardHeader id="sum-areas" title="Scores por área" />
            <div className="p-5">
              <DomainBars items={s.domains.map((d) => ({ code: d.domainCode, name: d.name, score: d.weightedScore, coverage: d.coverage, answered: d.answeredCount, applicable: d.applicableCount }))} />
            </div>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase"><th className="px-5 py-2 font-bold">Área</th><th className="px-3 py-2 font-bold">Cobertura</th><th className="px-5 py-2 font-bold">Não sei</th></tr></thead>
                <tbody>
                  {s.domains.map((d) => (
                    <tr key={d.domainCode} className="border-t border-border">
                      <td className="px-5 py-2">{d.name}</td>
                      <td className="px-3 py-2">{Math.round(d.coverage * 100)}% ({d.answeredCount}/{d.applicableCount})</td>
                      <td className="px-5 py-2">{d.unknownCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card aria-labelledby="sum-gaps">
            <CardHeader id="sum-gaps" title={`Lacunas de informação (${s.gaps.length})`} />
            {s.gaps.length === 0 ? (
              <p className="p-5 text-sm text-text-muted">Nenhuma lacuna nas perguntas aplicáveis.</p>
            ) : (
              <ul className="max-h-[520px] divide-y divide-border overflow-y-auto text-sm">
                {s.gaps.map((g) => (
                  <li key={g.code} className="flex flex-col gap-0.5 px-5 py-2.5">
                    <span className="text-xs text-text-subtle">{g.code} · {g.domain}</span>
                    <span>{g.title}</span>
                    <span className={g.unknown ? "text-xs font-semibold text-warn" : "text-xs text-text-subtle"}>{g.unknown ? "Marcada como “não sei”" : "Sem resposta"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card aria-labelledby="sum-findings">
          <CardHeader id="sum-findings" title="Achados" action={canEdit ? <GenerateFindingsButton clientId={clientId} assessmentId={a.id} /> : null} />
          {allFindings.length === 0 ? (
            <EmptyState icon={Lightbulb} title="Nenhum achado ainda" description="Gere achados preliminares pelas regras objetivas ou registre achados do consultor com evidências." />
          ) : (
            <ul className="divide-y divide-border">
              {allFindings.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge context="opportunity" value={FSTATUS[f.status]!} />
                    <StatusBadge context="origin" value={f.origin} />
                    <Chip tone="neutral">{TYPE[f.type]}</Chip>
                    <Chip tone={SEV[f.severity]!.tone} symbol={f.severity === "CRITICAL" ? "✕" : "!"}>Severidade {SEV[f.severity]!.label}</Chip>
                    <DemoBadge show={f.isDemo} />
                  </div>
                  <p className="text-[15px] font-bold">{f.title}</p>
                  <p className="text-sm text-text-muted">{f.description}</p>
                  {canEdit ? <FindingActions clientId={clientId} findingId={f.id} status={f.status} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canEdit ? (
          <Card aria-labelledby="sum-new-finding">
            <CardHeader id="sum-new-finding" title="Registrar achado do consultor" />
            <ManualFindingForm clientId={clientId} assessmentId={a.id} domains={s.domains.map((d) => ({ code: d.domainCode, name: d.name }))} />
          </Card>
        ) : null}
      </PageContent>
    </>
  );
}
