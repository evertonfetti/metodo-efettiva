import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "@/components/clients/client-form";
import { updateClientAction } from "@/features/clients/actions";
import { getClientView } from "@/features/clients/service";
import { requirePageUser } from "@/lib/security/session";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await requirePageUser();
  const { clientId } = await params;
  if (user.role === "VIEWER") redirect(`/clientes/${clientId}`);
  const c = await getClientView(user, clientId);
  return (
    <>
      <Topbar crumbs={[{ label: "Clientes", href: "/clientes" }, { label: c.name, href: `/clientes/${clientId}` }, { label: "Editar cadastro" }]} />
      <PageContent>
        <PageHeader title="Editar cadastro" subtitle={c.name} />
        <ClientForm
          action={updateClientAction.bind(null, clientId)}
          submitLabel="Salvar alterações"
          taxIdMasked={c.taxIdMasked}
          defaults={{
            name: c.name, legalName: c.legalName ?? "", industry: c.industry, industryOther: c.industryOther ?? "", size: c.size ?? "",
            city: c.city ?? "", state: c.state ?? "", timezone: c.timezone, salesModel: c.salesModel ?? "", salesChannels: c.salesChannels,
            sellersCount: c.sellersCount, sourceSystem: c.sourceSystem ?? "", salesCycle: c.salesCycle ?? "",
            typicalPurchaseFrequencyDays: c.typicalPurchaseFrequencyDays, mainChallenges: c.mainChallenges ?? "", tags: c.tags,
          }}
        />
      </PageContent>
    </>
  );
}
