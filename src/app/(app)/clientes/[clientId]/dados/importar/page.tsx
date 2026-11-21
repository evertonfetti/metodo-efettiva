import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ImportStepper } from "@/components/imports/stepper";
import { UploadForm } from "@/components/imports/upload-form";
import { requirePageUser } from "@/lib/security/session";
import { getClientView } from "@/features/clients/service";
import { getSetting } from "@/features/settings/service";
import { IMPORT_TYPES } from "@/features/imports/fields";

export const metadata: Metadata = { title: "Importar dados" };

export default async function ImportPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const user = await requirePageUser();
  if (user.role === "VIEWER") notFound();
  const { clientId } = await params;
  const { tipo } = await searchParams;
  const [client, prm] = await Promise.all([getClientView(user, clientId), getSetting("parameters")]);
  const types = Object.entries(IMPORT_TYPES).map(([code, t]) => ({ code, label: t.label, description: t.description }));
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Dados e importações", href: `/clientes/${clientId}/dados` }, { label: "Importar" }]} />
      <PageContent>
        <PageHeader title="Importar dados" subtitle="Nada é gravado antes da sua confirmação: primeiro mapeamento e validação de todas as linhas." />
        <ImportStepper current={1} />
        <Card className="max-w-[960px]">
          <UploadForm clientId={clientId} types={types} defaultType={tipo && IMPORT_TYPES[tipo as keyof typeof IMPORT_TYPES] ? tipo : "CUSTOMERS"} maxMb={prm.uploadMaxMb} />
        </Card>
      </PageContent>
    </>
  );
}
