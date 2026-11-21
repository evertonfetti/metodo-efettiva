import Link from "next/link";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectStatusActions } from "@/components/projects/project-actions";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { getClientView } from "@/features/clients/service";
import { getProject } from "@/features/projects/service";
import { PROJECT_TRANSITIONS } from "@/features/projects/rules";
import { formatDay } from "@/lib/format";

const LABEL: Record<string, string> = { APPROVED: "Aprovar", ACTIVE: "Iniciar execução", PAUSED: "Pausar", COMPLETED: "Concluir", CANCELLED: "Cancelar projeto", DRAFT: "Voltar a rascunho" };

export default async function ProjectLayout({ params, children }: { params: Promise<{ clientId: string; projectId: string }>; children: React.ReactNode }) {
  const user = await requirePageUser();
  const { clientId, projectId } = await params;
  const [client, p] = await Promise.all([getClientView(user, clientId), orNotFound(getProject(user, clientId, projectId))]);
  const canEdit = user.role !== "VIEWER";
  const open = !["COMPLETED", "CANCELLED"].includes(p.status);
  const base = `/clientes/${clientId}/projetos/${projectId}`;
  const transitions = (PROJECT_TRANSITIONS[p.status] ?? []).map((to) => ({
    to,
    label: p.status === "PAUSED" && to === "ACTIVE" ? "Retomar" : LABEL[to]!,
    needsReason: to === "CANCELLED" || to === "PAUSED",
    variant: (to === "CANCELLED" ? "ghost" : "secondary") as "ghost" | "secondary",
    danger: to === "CANCELLED",
  }));
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Projetos", href: `/clientes/${clientId}/projetos` }, { label: p.name }]} />
      <PageContent wide>
        <PageHeader
          title={p.name}
          badges={<><StatusBadge context="project" value={p.status} /><DemoBadge show={p.isDemo} /></>}
          subtitle={`${formatDay(p.startDate)} → ${formatDay(p.targetDate)} · Responsável Efettiva: ${p.owner.name} · Patrocinador no cliente: ${p.sponsorName ?? "não informado"}`}
          actions={
            canEdit && open ? (
              <>
                <Button variant="secondary" asChild><Link href={`${base}/editar`}>Editar</Link></Button>
                <Button asChild><Link href={`${base}/acoes?nova=1`}>+ Nova tarefa</Link></Button>
              </>
            ) : null
          }
        />
        {canEdit && transitions.length ? <ProjectStatusActions clientId={clientId} projectId={projectId} transitions={transitions} /> : null}
        <ProjectTabs base={base} />
        {children}
      </PageContent>
    </>
  );
}
