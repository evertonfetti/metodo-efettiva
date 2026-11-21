import { apiRoute } from "@/lib/api";
import { createRevision } from "@/features/documents/service";

type P = { clientId: string; documentId: string };
/** Nova versão a partir da última aprovada/publicada. */
export const POST = apiRoute<P>(async ({ user, params }) => createRevision(user, params.clientId, params.documentId), { status: 201 });
