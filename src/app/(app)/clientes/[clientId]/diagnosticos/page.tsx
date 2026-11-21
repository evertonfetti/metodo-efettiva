import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { NewAssessmentForm } from "@/components/assessments/new-assessment-form";
import { requirePageUser } from "@/lib/security/session";
import { getClientView } from "@/features/clients/service";
import { getActiveTemplate, listAssessments } from "@/features/assessments/service";
import { segmentLabel } from "@/features/clients/catalog";
import { formatDateTime, formatDay, formatDecimal } from "@/lib/format";

export const metadata: Metadata = { title: "Diagnósticos" };

export default async function AssessmentsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ novo?: string }> }) {
  const user = await requirePageUser();
  const { clientId } = await params;
  const { novo } = await searchParams;
  const [client, assessments, template] = await Promise.all([getClientView(user, clientId), listAssessments(user, clientId), getActiveTemplate()]);
  const canEdit = user.role !== "VIEWER";
  const showForm = canEdit && (novo === "1" || assessments.length === 0);

  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Diagnósticos" }]} />
      <PageContent>
        <PageHeader
          title="Diagnósticos"
          badges={<DemoBadge show={client.isDemo} />}
          subtitle="Questionário-base 360°: 12 áreas, 96 perguntas e perguntas condicionais por segmento."
          actions={canEdit && !showForm ? <Button asChild><Link href={`/clientes/${clientId}/diagnosticos?novo=1`}>Novo diagnóstico</Link></Button> : null}
        />
        {showForm ? (
          <Card aria-labelledby="novo-diag">
            <CardHeader id="novo-diag" title="Novo diagnóstico" />
            <NewAssessmentForm clientId={clientId} defaultSegment={client.industry} templateName={`${template.name} · v${template.version}`} />
          </Card>
        ) : null}
        <Card aria-labelledby="hist-diag">
          <CardHeader id="hist-diag" title="Histórico" />
          {assessments.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Nenhum diagnóstico ainda" description="Comece pelo questionário-base de 96 perguntas." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase">
                    <th className="px-5 py-3 font-bold">Diagnóstico</th>
                    <th className="px-3 py-3 font-bold">Status</th>
                    <th className="px-3 py-3 font-bold">Segmento</th>
                    <th className="px-3 py-3 font-bold">Período</th>
                    <th className="px-3 py-3 font-bold">Score geral</th>
                    <th className="px-5 py-3 font-bold">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((a) => {
                    const answered = a.scores.reduce((s, x) => s + Number(x.answeredWeight), 0);
                    const sum = a.scores.reduce((s, x) => s + (x.weightedScore ? Number(x.weightedScore) * Number(x.answeredWeight) : 0), 0);
                    return (
                      <tr key={a.id} className="border-t border-border hover:bg-surface-muted">
                        <td className="px-5 py-3.5">
                          <Link className="font-bold text-navy hover:underline" href={`/clientes/${clientId}/diagnosticos/${a.id}`}>
                            Diagnóstico #{a.number}{a.revision ? ` · revisão ${a.revision}` : ""}
                          </Link>
                        </td>
                        <td className="px-3 py-3.5"><StatusBadge context="assessment" value={a.status} /></td>
                        <td className="px-3 py-3.5">{segmentLabel(a.segment)}</td>
                        <td className="px-3 py-3.5">{a.periodStart ? `${formatDay(a.periodStart)} – ${formatDay(a.periodEnd)}` : "Não definido"}</td>
                        <td className="px-3 py-3.5">{a.status === "FINALIZED" ? (answered > 0 ? `${formatDecimal(sum / answered)} / 5` : "Indisponível") : <span className="text-text-subtle">Calculado ao fechar</span>}</td>
                        <td className="px-5 py-3.5">{formatDateTime(a.finalizedAt ?? a.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageContent>
    </>
  );
}
