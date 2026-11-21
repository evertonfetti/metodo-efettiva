import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssessmentRunner } from "@/components/assessments/assessment-runner";
import { requirePageUser } from "@/lib/security/session";
import { getAssessmentDetail } from "@/features/assessments/service";
import { segmentLabel } from "@/features/clients/catalog";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Diagnóstico" };

const monthYear = (d: Date | null) => (d ? new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(d).replace(". de ", "/").replace(" de ", "/") : null);

export default async function AssessmentPage({ params, searchParams }: { params: Promise<{ clientId: string; assessmentId: string }>; searchParams: Promise<{ area?: string }> }) {
  const user = await requirePageUser();
  const { clientId, assessmentId } = await params;
  const { area } = await searchParams;
  let detail;
  try {
    detail = await getAssessmentDetail(user, clientId, assessmentId);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const template = await prisma.assessmentTemplate.findUniqueOrThrow({ where: { id: detail.assessment.templateId } });
  const a = detail.assessment;
  const period = a.periodStart || a.periodEnd ? `${monthYear(a.periodStart) ?? "?"} – ${monthYear(a.periodEnd) ?? "?"}` : "não definido";
  return (
    <AssessmentRunner
      clientId={clientId}
      clientName={detail.client.name}
      isDemo={detail.client.isDemo}
      canEdit={user.role !== "VIEWER"}
      assessment={{ id: a.id, number: a.number, revision: a.revision, status: a.status, segment: a.segment, segmentLabel: segmentLabel(a.segment), periodLabel: period, templateLabel: `${template.name} v${template.version}` }}
      domains={detail.domains.map((d) => ({ code: d.code, name: d.name }))}
      questions={detail.questions}
      initialAnswers={detail.answers}
      scaleLabels={detail.scaleLabels}
      initialArea={area}
      frozen={a.status === "FINALIZED" ? { visibility: detail.visibility, domainScores: detail.domainScores, overall: detail.overall } : undefined}
    />
  );
}
