import { apiRoute, jsonBody } from "@/lib/api";
import { decideGeneration } from "@/features/ai/service";

type P = { clientId: string; generationId: string };
/** `{ decision: ACCEPT|REJECT, blocks?, note? }` — com `blocks`, registra aceite editado. */
export const PATCH = apiRoute<P>(async ({ req, user, params }) => decideGeneration(user, params.clientId, params.generationId, await jsonBody(req)));
