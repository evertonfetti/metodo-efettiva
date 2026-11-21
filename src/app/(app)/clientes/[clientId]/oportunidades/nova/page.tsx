import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { requirePageUser } from "@/lib/security/session";
import { getClientView } from "@/features/clients/service";
import { findingsWithoutOpportunity } from "@/features/opportunities/service";
import { processCatalog } from "@/features/processes/service";
import { toProcessDomain } from "@/features/processes/mapping";

export const metadata: Metadata = { title: "Registrar achado" };

export default async function NewOpportunityPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ achado?: string }> }) {
  const user = await requirePageUser();
  if (user.role === "VIEWER") notFound();
  const { clientId } = await params;
  const { achado } = await searchParams;
  const [client, findings, catalog] = await Promise.all([getClientView(user, clientId), findingsWithoutOpportunity(user, clientId), processCatalog()]);
  const f = findings.find((x) => x.id === achado);
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Oportunidades", href: `/clientes/${clientId}/oportunidades` }, { label: "Registrar achado" }]} />
      <PageContent>
        <PageHeader title="Registrar achado e oportunidade" subtitle="Achado sempre preliminar: registre evidências e premissas; o valor estimado é opcional." />
        <Card className="max-w-[880px]">
          <OpportunityForm
            clientId={clientId}
            opportunityId={null}
            findings={findings}
            catalog={catalog.map((c) => ({ code: c.code, name: c.name }))}
            initial={{
              findingId: f?.id,
              title: f?.title ?? "",
              explanation: f?.description ?? "",
              expectedOutcome: "",
              domainCode: (f && toProcessDomain(f.domainCode)) || "C",
              impactScore: 3,
              confidenceScore: 3,
              effortScore: 3,
              criticalRisk: false,
              criticalRiskReason: "",
              urgency: "",
              dependency: "",
              costEstimate: "",
              timeToImpact: "",
              consultantOverrideReason: "",
              estimatedValue: "",
              estimateType: "",
              assumptions: "",
              evidence: "",
              missingData: "",
              processCodes: "",
            }}
          />
        </Card>
      </PageContent>
    </>
  );
}
