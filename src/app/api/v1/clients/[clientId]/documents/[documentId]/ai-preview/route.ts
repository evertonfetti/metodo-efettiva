import { apiRoute, jsonBody } from "@/lib/api";
import { previewGeneration } from "@/features/ai/service";

type P = { clientId: string; documentId: string };
/** Prévia exata do que seria enviado ao provedor (dados minimizados e pseudonimizados) e custo estimado. */
export const POST = apiRoute<P>(async ({ req, user, params }) => {
  const body = (await jsonBody(req)) as { revisionId?: string };
  return previewGeneration(user, params.clientId, params.documentId, String(body.revisionId ?? ""), body);
});
