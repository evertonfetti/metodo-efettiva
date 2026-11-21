import { apiRoute, jsonBody, searchParams } from "@/lib/api";
import { createOpportunity, listOpportunities } from "@/features/opportunities/service";

type P = { clientId: string };
export const GET = apiRoute<P>(async ({ req, user, params }) => ({ items: await listOpportunities(user, params.clientId, searchParams(req)) }));
export const POST = apiRoute<P>(async ({ req, user, params }) => createOpportunity(user, params.clientId, await jsonBody(req)), { status: 201 });
