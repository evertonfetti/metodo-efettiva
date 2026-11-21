import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";
import { requirePageUser } from "@/lib/security/session";
import { getClientView } from "@/features/clients/service";
import { listOpportunities } from "@/features/opportunities/service";
import { assignableUsers } from "@/features/projects/service";
import { processCatalog } from "@/features/processes/service";
import { formatCode } from "@/features/opportunities/scoring";
import { todayDateOnly, addDays, toISODate } from "@/lib/dates";

export const metadata: Metadata = { title: "Novo projeto" };

export default async function NewProjectPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ opp?: string }> }) {
  const user = await requirePageUser();
  if (user.role === "VIEWER") notFound();
  const { clientId } = await params;
  const { opp } = await searchParams;
  const [client, approved, users, catalog] = await Promise.all([
    getClientView(user, clientId),
    listOpportunities(user, clientId, { status: "APPROVED" }),
    assignableUsers(clientId),
    processCatalog(),
  ]);
  const today = todayDateOnly();
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Projetos", href: `/clientes/${clientId}/projetos` }, { label: "Novo projeto" }]} />
      <PageContent>
        <PageHeader title="Novo projeto" subtitle="Os processos entram no projeto com a versão atual da ficha (snapshot); edições futuras da biblioteca não alteram este projeto." />
        <Card className="max-w-[880px]">
          <ProjectForm
            clientId={clientId}
            users={users}
            catalog={catalog.map((c) => ({ code: c.code, name: c.name }))}
            opportunities={approved.map((o) => ({ id: o.id, code: formatCode(o.number), title: o.title, processes: o.processes.filter((p) => p.selected).map((p) => p.process.code) }))}
            preselected={opp && approved.some((o) => o.id === opp) ? [opp] : []}
            initial={{ name: "", scope: "", objectives: "", startDate: toISODate(today), targetDate: toISODate(addDays(today, 90)), sponsorName: "", ownerUserId: users.some((u) => u.id === user.id) ? user.id : (users[0]?.id ?? "") }}
          />
        </Card>
      </PageContent>
    </>
  );
}
