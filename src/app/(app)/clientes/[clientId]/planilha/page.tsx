import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadWorkbookForm } from "@/components/workbook/upload-workbook-form";
import { requirePageUser } from "@/lib/security/session";
import { getClientView } from "@/features/clients/service";
import { getSetting } from "@/features/settings/service";
import { PAGE_HELP } from "@/lib/help";

export const metadata: Metadata = { title: "Planilha do cliente" };

export default async function WorkbookPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await requirePageUser();
  if (user.role === "VIEWER") notFound();
  const { clientId } = await params;
  const [client, prm] = await Promise.all([getClientView(user, clientId), getSetting("parameters")]);
  const api = `/api/v1/clients/${clientId}/planilha`;
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Planilha do cliente" }]} />
      <PageContent>
        <PageHeader help={PAGE_HELP.planilha} title="Planilha do cliente" subtitle="Envie um modelo ao cliente, receba preenchido e importe para o sistema, com conferência antes de gravar." />
        <div className="grid max-w-[1100px] gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="1 · Modelo em branco" />
            <div className="flex flex-col gap-3 p-5 text-sm">
              <p>Arquivo XLSX para enviar ao cliente. Cada campo vem com exemplo, orientação e opções aceitas. Abas: Empresa, Contatos, Diagnóstico (questionário completo) e base comercial (clientes, produtos, vendas, itens e orçamentos).</p>
              <div><Button asChild><a href={`${api}?modo=modelo`}><Download className="size-4" aria-hidden="true" /> Baixar modelo</a></Button></div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Exportar dados atuais" />
            <div className="flex flex-col gap-3 p-5 text-sm">
              <p>Mesmo formato, preenchido com o que já existe no sistema para este cliente (cadastro, contatos, último diagnóstico e base comercial). Útil para revisar com o cliente e devolver ajustado.</p>
              <div><Button asChild variant="secondary"><a href={`${api}?modo=dados`}><Download className="size-4" aria-hidden="true" /> Exportar dados</a></Button></div>
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="2 · Importar planilha preenchida" />
            <div className="flex flex-col gap-3 p-5">
              <UploadWorkbookForm clientId={clientId} maxMb={prm.uploadMaxMb} />
              <p className="text-xs text-text-subtle">Você verá um relatório do que será criado ou alterado antes de qualquer gravação. A base comercial entra como lote na tela “Dados e importações”, onde você confirma.</p>
            </div>
          </Card>
        </div>
      </PageContent>
    </>
  );
}
