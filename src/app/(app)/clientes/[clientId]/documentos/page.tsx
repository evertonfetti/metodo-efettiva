import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { GenerateDocumentForm } from "@/components/documents/generate-form";
import { requirePageUser } from "@/lib/security/session";
import { prisma } from "@/lib/db";
import { getClientView } from "@/features/clients/service";
import { listDocuments } from "@/features/documents/service";
import { formatDateTime } from "@/lib/format";
import type { ProcessSnapshot } from "@/features/processes/content";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ projeto?: string }> }) {
  const user = await requirePageUser();
  const { clientId } = await params;
  const { projeto } = await searchParams;
  const [client, docs, projects] = await Promise.all([
    getClientView(user, clientId),
    listDocuments(user, clientId),
    prisma.project.findMany({ where: { clientId, status: { not: "CANCELLED" } }, select: { id: true, name: true, processes: { where: { status: { not: "CANCELLED" } }, select: { snapshotJson: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const canEdit = user.role !== "VIEWER";
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Documentos" }]} />
      <PageContent>
        <PageHeader title="Documentos" badges={<DemoBadge show={client.isDemo} />} subtitle="Playbooks e POPs editáveis por seção, com aprovação, versões imutáveis e exportação DOCX, PDF e MD." />
        {canEdit ? (
          <Card aria-labelledby="gen">
            <CardHeader id="gen" title="Gerar documento" />
            {projects.length ? (
              <GenerateDocumentForm
                clientId={clientId}
                defaultProjectId={projeto}
                projects={projects.map((p) => ({ id: p.id, name: p.name, processes: p.processes.map((pp) => { const s = pp.snapshotJson as unknown as ProcessSnapshot; return { code: s.code, name: s.name }; }) }))}
              />
            ) : (
              <EmptyState icon={FileText} title="Nenhum projeto" description="O playbook é gerado a partir de um projeto com processos." action={<Button asChild variant="secondary"><Link href={`/clientes/${clientId}/projetos/novo`}>Novo projeto</Link></Button>} />
            )}
          </Card>
        ) : null}
        <Card aria-labelledby="docs">
          <CardHeader id="docs" title="Documentos do cliente" />
          {docs.length === 0 ? (
            <EmptyState icon={FileText} title="Nenhum documento ainda" description="Gere o primeiro playbook a partir do projeto." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase">
                    <th className="px-5 py-3 font-bold">Documento</th>
                    <th className="px-3 py-3 font-bold">Projeto</th>
                    <th className="px-3 py-3 font-bold">Última versão</th>
                    <th className="px-3 py-3 font-bold">Aprovada</th>
                    <th className="px-5 py-3 font-bold">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-t border-border hover:bg-surface-muted">
                      <td className="px-5 py-3"><Link href={`/clientes/${clientId}/documentos/${d.id}`} className="font-bold text-navy hover:underline">{d.title}</Link> <DemoBadge show={d.isDemo} /></td>
                      <td className="px-3 py-3">{d.project?.name ?? "—"}</td>
                      <td className="px-3 py-3">{d.latest ? <span className="flex items-center gap-2">v{d.latest.version} <StatusBadge context="revision" value={d.latest.state} /></span> : "—"}</td>
                      <td className="px-3 py-3">{d.approved ? `v${d.approved.version}` : <span className="text-text-subtle">Nenhuma</span>}</td>
                      <td className="px-5 py-3">{formatDateTime(d.latest?.updatedAt ?? d.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageContent>
    </>
  );
}
