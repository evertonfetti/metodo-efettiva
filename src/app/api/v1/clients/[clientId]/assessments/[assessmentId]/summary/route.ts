import { apiRoute, attachment, searchParams } from "@/lib/api";
import { buildSummary, exportSummaryMarkdown } from "@/features/assessments/summary";

type P = { clientId: string; assessmentId: string };
/** Score, achados e lacunas. `?format=md` baixa o resumo em Markdown. */
export const GET = apiRoute<P>(async ({ req, user, params }) => {
  if (searchParams(req).format === "md") {
    const { filename, markdown } = await exportSummaryMarkdown(user, params.clientId, params.assessmentId);
    return new Response(markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": attachment(filename), "Cache-Control": "no-store" } });
  }
  return buildSummary(user, params.clientId, params.assessmentId);
});
