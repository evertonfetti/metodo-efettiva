import { PAGE_HELP } from "@/lib/help";
import type { Metadata } from "next";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { ReportForm } from "@/components/results/forms";
import { requirePageUser } from "@/lib/security/session";
import { prisma } from "@/lib/db";
import { getClientView } from "@/features/clients/service";
import { listReports } from "@/features/results/report";
import { addDays, todayDateOnly, toISODate } from "@/lib/dates";
import { formatDateTime, formatDay } from "@/lib/format";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await requirePageUser();
  const { clientId } = await params;
  const [client, reports, projects] = await Promise.all([getClientView(user, clientId), listReports(user, clientId), prisma.project.findMany({ where: { clientId, status: { not: "CANCELLED" } }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } })]);
  const today = todayDateOnly();
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Relatórios" }]} />
      <PageContent>
        <PageHeader help={PAGE_HELP.relatorios} title="Relatórios de resultados" badges={<DemoBadge show={client.isDemo} />} subtitle="Relatório periódico com entregas, adoção, indicadores com fonte e limitações; editado, aprovado e exportado como os playbooks." />
        {user.role !== "VIEWER" && projects.length ? <Card aria-labelledby="new-rp"><CardHeader id="new-rp" title="Novo relatório" /><ReportForm clientId={clientId} projects={projects.map((p) => ({ value: p.id, label: p.name }))} defaults={{ start: toISODate(addDays(today, -30)), end: toISODate(today) }} /></Card> : null}
        <Card aria-labelledby="rps">
          <CardHeader id="rps" title="Relatórios por período" />
          {reports.length === 0 ? (
            <EmptyState icon={LineChart} title="Nenhum relatório ainda" description={projects.length ? "Congele o baseline, registre snapshots e reuniões no projeto e gere o relatório do período." : "Crie um projeto antes de gerar relatórios."} />
          ) : (
            <ul className="divide-y divide-border">
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Link href={`/clientes/${clientId}/documentos/${r.documentId}`} className="min-w-0 flex-1 font-bold text-navy hover:underline">{r.project.name} · {formatDay(r.periodStart)} a {formatDay(r.periodEnd)}</Link>
                  <StatusBadge context="report" value={r.status} />
                  <span className="text-xs text-text-subtle">{r.versions} versão(ões) · criado {formatDateTime(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageContent>
    </>
  );
}
