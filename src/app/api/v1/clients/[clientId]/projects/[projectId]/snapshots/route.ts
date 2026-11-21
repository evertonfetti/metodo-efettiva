import { apiRoute, jsonBody } from "@/lib/api";
import { recordManualValue, recordSnapshot } from "@/features/results/service";

type P = { clientId: string; projectId: string };
/** `{ endDate? }` snapshot calculado; `{ metricCode, value, endDate, justification, source }` valor manual. */
export const POST = apiRoute<P>(async ({ req, user, params }) => {
  const b = (await jsonBody(req)) as Record<string, unknown>;
  return "metricCode" in b ? recordManualValue(user, params.clientId, params.projectId, b) : recordSnapshot(user, params.clientId, params.projectId, b);
}, { status: 201 });
