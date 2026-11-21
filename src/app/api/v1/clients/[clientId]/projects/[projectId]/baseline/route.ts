import { apiRoute, jsonBody } from "@/lib/api";
import { freezeBaseline } from "@/features/results/service";

type P = { clientId: string; projectId: string };
/** Congela o baseline; com `{ reason }` registra nova revisão auditada. */
export const POST = apiRoute<P>(async ({ req, user, params }) => freezeBaseline(user, params.clientId, params.projectId, await jsonBody(req)), { status: 201 });
