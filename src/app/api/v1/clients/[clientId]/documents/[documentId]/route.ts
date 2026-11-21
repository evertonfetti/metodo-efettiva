import { apiRoute, searchParams } from "@/lib/api";
import { getDocument } from "@/features/documents/service";

type P = { clientId: string; documentId: string };
/** Documento com a revisão pedida (`?revision=`) ou a mais recente, QA e exportações. */
export const GET = apiRoute<P>(async ({ req, user, params }) => getDocument(user, params.clientId, params.documentId, searchParams(req).revision));
