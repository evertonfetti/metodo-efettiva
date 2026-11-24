import { PAGE_HELP } from "@/lib/help";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { OpportunityForm } from "@/components/opportunities/opportunity-form";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { getClientView } from "@/features/clients/service";
import { getOpportunity } from "@/features/opportunities/service";
import { formatCode } from "@/features/opportunities/scoring";

export const metadata: Metadata = { title: "Editar oportunidade" };

const money = (v: unknown) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default async function EditOpportunityPage({ params }: { params: Promise<{ clientId: string; opportunityId: string }> }) {
  const user = await requirePageUser();
  if (user.role === "VIEWER") notFound();
  const { clientId, opportunityId } = await params;
  const [client, o] = await Promise.all([getClientView(user, clientId), orNotFound(getOpportunity(user, clientId, opportunityId))]);
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Oportunidades", href: `/clientes/${clientId}/oportunidades?sel=${o.id}` }, { label: formatCode(o.number) }]} />
      <PageContent>
        <PageHeader help={PAGE_HELP.oportunidadeEditar} title={`Editar ${formatCode(o.number)}`} subtitle="Alterações ficam registradas na auditoria." />
        <Card className="max-w-[880px]">
          <OpportunityForm
            clientId={clientId}
            opportunityId={o.id}
            findings={[]}
            catalog={[]}
            initial={{
              title: o.title,
              explanation: o.explanation,
              expectedOutcome: o.expectedOutcome ?? "",
              domainCode: o.domainCode,
              impactScore: o.impactScore,
              confidenceScore: o.confidenceScore,
              effortScore: o.effortScore,
              criticalRisk: o.criticalRisk,
              criticalRiskReason: o.criticalRiskReason ?? "",
              urgency: o.urgency ? String(o.urgency) : "",
              dependency: o.dependency ?? "",
              costEstimate: money(o.costEstimate),
              timeToImpact: o.timeToImpact ?? "",
              consultantOverrideReason: o.consultantOverrideReason ?? "",
              estimatedValue: money(o.estimatedValue),
              estimateType: o.estimateType ?? "",
              assumptions: (Array.isArray(o.assumptionsJson) ? (o.assumptionsJson as string[]) : []).join("\n"),
              evidence: "",
              missingData: o.missingData ?? "",
              processCodes: "",
            }}
          />
        </Card>
      </PageContent>
    </>
  );
}
