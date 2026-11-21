import { apiRoute, jsonBody } from "@/lib/api";
import { listGenerations, requestGeneration } from "@/features/ai/service";

type P = { clientId: string; documentId: string };
export const GET = apiRoute<P>(async ({ user, params }) => ({ items: await listGenerations(user, params.clientId, params.documentId) }));
/** Job de rascunho com IA: `{ revisionId, sectionKeys[], includeFinancial?, instruction? }` → 202 com os jobs. Nada é publicado sem revisão. */
export const POST = apiRoute<P>(async ({ req, user, params }) => {
  const body = (await jsonBody(req)) as { revisionId?: string };
  return requestGeneration(user, params.clientId, params.documentId, String(body.revisionId ?? ""), body);
}, { status: 202 });
