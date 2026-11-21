import { apiRoute } from "@/lib/api";
import { publishRevision } from "@/features/documents/service";

type P = { clientId: string; documentId: string; revisionId: string };
export const POST = apiRoute<P>(async ({ user, params }) => publishRevision(user, params.clientId, params.documentId, params.revisionId));
