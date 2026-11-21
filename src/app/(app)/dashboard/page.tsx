import type { Metadata } from "next";
import { Building2, CalendarClock, ListChecks, Cpu } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { MetricCardWithSource } from "@/components/metric-card";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { DemoBadge } from "@/components/demo-badge";
import { StatusBadge } from "@/components/status-badge";
import { DataQualityBanner } from "@/components/data-banner";
import { requirePageUser } from "@/lib/security/session";
import { getDashboardData } from "@/features/dashboard/service";
import { formatDateTime, formatLongDate, DEFAULT_TZ } from "@/lib/format";
import { jobLabel } from "@/lib/jobs/labels";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { segmentLabel } from "@/features/clients/catalog";

export const metadata: Metadata = { title: "Visão geral" };

export default async function DashboardPage() {
  const user = await requirePageUser();
  const data = await getDashboardData(user);

  return (
    <>
      <Topbar crumbs={[{ label: "Visão geral" }]}>
        {user.role !== "VIEWER" ? <Button asChild><Link href="/clientes/novo">+ Novo cliente</Link></Button> : null}
      </Topbar>
      <PageContent>
        <PageHeader
          title="Visão geral"
          subtitle={`${formatLongDate(new Date())} · fuso ${DEFAULT_TZ}`}
        />
        {data.hasDemo ? <DataQualityBanner>Ambiente com dados DEMO (fictícios, gerados pelo seed)</DataQualityBanner> : null}

        <section aria-label="Indicadores operacionais" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCardWithSource label="Clientes ativos" value={data.activeClients} source="cadastro de clientes" period="agora" />
          <MetricCardWithSource label="Projetos em andamento" value={null} source="projetos" period="agora" unavailableReason="módulo de projetos chega na Fase 2" />
          <MetricCardWithSource label="Tarefas vencidas" value={null} source="tarefas" period="agora" unavailableReason="plano de ação chega na Fase 2" />
          <MetricCardWithSource label="Jobs com falha" value={data.failedJobs} alert={data.failedJobs > 0} source="fila de processamento" period="últimas 24 h" />
        </section>
        <p className="text-[13px] text-text-muted">
          Receitas e margens não são somadas entre clientes diferentes. Abra um cliente para ver indicadores comerciais com fonte e período.
        </p>

        <div className="flex flex-wrap items-start gap-6">
          <Card className="min-w-0 flex-[999_1_520px]" aria-labelledby="dash-clientes">
            <CardHeader id="dash-clientes" title="Clientes" action={data.clients.length ? <Link href="/clientes" className="text-sm font-bold text-navy hover:underline">Ver todos</Link> : null} />
            {data.clients.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Nenhum cliente cadastrado"
                description="Cadastre a primeira empresa-cliente para iniciar o diagnóstico 360°."
                action={user.role !== "VIEWER" ? <Button asChild><Link href="/clientes/novo">+ Novo cliente</Link></Button> : undefined}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase">
                      <th className="px-5 py-3 font-bold">Empresa</th>
                      <th className="px-3 py-3 font-bold">Segmento</th>
                      <th className="px-3 py-3 font-bold">Fase do método</th>
                      <th className="px-3 py-3 font-bold">Próximo marco</th>
                      <th className="px-5 py-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients.map((c) => (
                      <tr key={c.id} className="border-t border-border">
                        <td className="px-5 py-3.5">
                          <Link href={`/clientes/${c.id}`} className="font-bold text-navy hover:underline">{c.name}</Link> <DemoBadge show={c.isDemo} />
                        </td>
                        <td className="px-3 py-3.5">{segmentLabel(c.industry)}</td>
                        <td className="px-3 py-3.5">{c.phase ? `${c.phase.index}. ${c.phase.name}${c.phase.started ? "" : " (não iniciada)"}` : "—"}</td>
                        <td className="max-w-[260px] px-3 py-3.5 text-[13px] text-text-muted">{c.phase?.gate ?? "—"}</td>
                        <td className="px-5 py-3.5">
                          <StatusBadge context="client" value={c.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-6">
            <Card aria-labelledby="dash-tarefas">
              <CardHeader id="dash-tarefas" title="Tarefas vencidas" className="py-3.5 [&_h2]:text-[15px]" />
              <EmptyState icon={ListChecks} title="Sem tarefas" description="Tarefas de projetos aparecem aqui quando o plano de ação estiver disponível (Fase 2)." />
            </Card>
            <Card aria-labelledby="dash-agenda">
              <CardHeader id="dash-agenda" title="Próximos compromissos" className="py-3.5 [&_h2]:text-[15px]" />
              <EmptyState icon={CalendarClock} title="Sem compromissos" description="Prazos de tarefas e reuniões de projeto aparecem aqui a partir da Fase 2." />
            </Card>
            <Card aria-labelledby="dash-jobs">
              <CardHeader id="dash-jobs" title="Processamentos recentes" className="py-3.5 [&_h2]:text-[15px]" />
              {data.recentJobs.length === 0 ? (
                <EmptyState icon={Cpu} title="Nenhum processamento" description="Importações, exportações e gerações de documentos aparecem aqui com status e progresso." />
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentJobs.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-bold">{jobLabel(j.operation)}</span>
                        <span className="text-xs text-text-subtle">
                          {j.client?.name ?? "Sistema"} · {formatDateTime(j.createdAt)}
                        </span>
                      </span>
                      <StatusBadge context="job" value={j.status} suffix={j.status === "RUNNING" ? `${j.progress}%` : undefined} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </PageContent>
    </>
  );
}
