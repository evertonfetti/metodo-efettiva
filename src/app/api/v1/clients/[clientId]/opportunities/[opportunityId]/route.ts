import { apiRoute, jsonBody } from "@/lib/api";
import { getOpportunity, setOpportunityProcesses, transitionOpportunity, updateOpportunity } from "@/features/opportunities/service";

type P = { clientId: string; opportunityId: string };
export const GET = apiRoute<P>(async ({ user, params }) => getOpportunity(user, params.clientId, params.opportunityId));

/**
 * PATCH aceita uma operação por chamada:
 * `{ status, reason? }` (revisar/aprovar/descartar/reabrir) · `{ processCodes, rationale? }` (seleção de processos) · demais campos (edição).
 */
export const PATCH = apiRoute<P>(async ({ req, user, params }) => {
  const body = (await jsonBody(req)) as Record<string, unknown>;
  const { clientId, opportunityId } = params;
  if ("status" in body) return transitionOpportunity(user, clientId, opportunityId, body);
  if ("processCodes" in body && !("title" in body)) return setOpportunityProcesses(user, clientId, opportunityId, body);
  return updateOpportunity(user, clientId, opportunityId, body);
});
