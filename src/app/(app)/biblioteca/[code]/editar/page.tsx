import { PAGE_HELP } from "@/lib/help";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ProcessEditForm } from "@/components/processes/process-edit-form";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { getProcess } from "@/features/processes/service";

export const metadata: Metadata = { title: "Editar processo" };

export default async function EditProcessPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requirePageUser();
  if (user.role === "VIEWER") notFound();
  const { code } = await params;
  const p = await orNotFound(getProcess(code));
  return (
    <>
      <Topbar crumbs={[{ label: "Biblioteca de processos", href: "/biblioteca" }, { label: p.code, href: `/biblioteca/${p.code}` }, { label: "Editar" }]} />
      <PageContent>
        <PageHeader help={PAGE_HELP.processoEditar} title={`Editar ${p.code}`} subtitle="Cada alteração gera uma nova versão imutável no histórico." />
        <Card className="max-w-[880px]">
          <ProcessEditForm code={p.code} version={p.currentVersion} name={p.name} objective={p.objective} active={p.active} content={p.content} />
        </Card>
      </PageContent>
    </>
  );
}
