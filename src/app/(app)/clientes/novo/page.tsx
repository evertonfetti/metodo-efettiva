import { PAGE_HELP } from "@/lib/help";
import type { Metadata } from "next";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "@/components/clients/client-form";
import { createClientAction } from "@/features/clients/actions";
import { requirePageUser } from "@/lib/security/session";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  await requirePageUser();
  return (
    <>
      <Topbar crumbs={[{ label: "Clientes", href: "/clientes" }, { label: "Novo cliente" }]} />
      <PageContent>
        <PageHeader help={PAGE_HELP.clienteNovo} title="Novo cliente" subtitle="Cria a área isolada da empresa, com checklist inicial e questionário-base." />
        <ClientForm action={createClientAction} submitLabel="Cadastrar cliente" withContact />
      </PageContent>
    </>
  );
}
