import { apiRoute, jsonBody } from "@/lib/api";
import { getProject, linkOpportunity, transitionProject, updateProject } from "@/features/projects/service";

type P = { clientId: string; projectId: string };
export const GET = apiRoute<P>(async ({ user, params }) => getProject(user, params.clientId, params.projectId));

/** `{ status, reason? }` muda status; `{ opportunityId }` vincula oportunidade aprovada; demais campos editam. */
export const PATCH = apiRoute<P>(async ({ req, user, params }) => {
  const body = (await jsonBody(req)) as Record<string, unknown>;
  const { clientId, projectId } = params;
  if ("status" in body) return transitionProject(user, clientId, projectId, body);
  if (typeof body.opportunityId === "string") return linkOpportunity(user, clientId, projectId, body.opportunityId);
  return updateProject(user, clientId, projectId, body);
});
