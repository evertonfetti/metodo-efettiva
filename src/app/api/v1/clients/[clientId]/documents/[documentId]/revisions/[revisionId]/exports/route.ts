import { apiRoute, jsonBody } from "@/lib/api";
import { requestExport } from "@/features/documents/service";

type P = { clientId: string; documentId: string; revisionId: string };
/** Enfileira exportação `{ format: DOCX|PDF|MD, audience: CLIENTE|INTERNO }` (job no worker). */
export const POST = apiRoute<P>(async ({ req, user, params }) => requestExport(user, params.clientId, params.documentId, params.revisionId, await jsonBody(req)), { status: 202 });
