import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Chip, StatusBadge } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { ProcessCodeChip } from "@/components/processes/process-chip";
import { requirePageUser } from "@/lib/security/session";
import { getClientView } from "@/features/clients/service";
import { listProjects } from "@/features/projects/service";
import { formatDay } from "@/lib/format";

export const metadata: Metadata = { title: "Projetos" };

export default async function ProjectsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await requirePageUser();
  const { clientId } = await params;
  const [client, projects] = await Promise.all([getClientView(user, clientId), listProjects(user, clientId)]);
  const canEdit = user.role !== "VIEWER";
  const base = `/clientes/${clientId}/projetos`;
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Projetos" }]} />
      <PageContent>
        <PageHeader
          title="Projetos"
          badges={<DemoBadge show={client.isDemo} />}
          subtitle="Implantação dos processos priorizados com plano 30/60/90, tarefas e critérios de validação."
          actions={canEdit ? <Button asChild><Link href={`${base}/novo`}>+ Novo projeto</Link></Button> : null}
        />
        {projects.length === 0 ? (
          <Card>
            <EmptyState
              icon={FolderKanban}
              title="Nenhum projeto ainda"
              description="Aprove oportunidades, selecione processos e crie o projeto: o plano 30/60/90 é gerado a partir das fichas."
              action={canEdit ? <Button asChild><Link href={`${base}/novo`}>+ Novo projeto</Link></Button> : undefined}
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((p) => {
              const pct = p.taskTotal ? Math.round((p.taskDone / p.taskTotal) * 100) : 0;
              return (
                <Card key={p.id} className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge context="project" value={p.status} />
                    {p.taskOverdue ? <Chip tone="err" symbol="!">{p.taskOverdue} vencida(s)</Chip> : null}
                    {p.taskBlocked ? <Chip tone="blocked" symbol="⊘">{p.taskBlocked} bloqueada(s)</Chip> : null}
                  </div>
                  <Link href={`${base}/${p.id}/acoes`} className="text-[17px] font-extrabold text-navy hover:underline">{p.name}</Link>
                  <p className="text-sm text-text-muted">{formatDay(p.startDate)} → {formatDay(p.targetDate)} · Responsável: {p.owner.name}</p>
                  <div className="flex flex-wrap gap-1">{p.processes.map((pp) => <ProcessCodeChip key={pp.process.code} code={pp.process.code} />)}</div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-text-muted"><span>Tarefas concluídas</span><span>{p.taskDone} de {p.taskTotal}</span></div>
                    <div className="h-2 rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso das tarefas">
                      <div className="h-2 rounded-full bg-navy" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </PageContent>
    </>
  );
}
