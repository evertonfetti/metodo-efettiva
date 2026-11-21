import { apiRoute, jsonBody } from "@/lib/api";
import { generateDocument, listDocuments } from "@/features/documents/service";

type P = { clientId: string; projectId: string };
export const GET = apiRoute<P>(async ({ user, params }) => ({ items: await listDocuments(user, params.clientId, params.projectId) }));
/** Gera playbook (`type: PLAYBOOK`) ou POP (`type: POP, processCode`) determinístico, sem IA. */
export const POST = apiRoute<P>(async ({ req, user, params }) => generateDocument(user, params.clientId, { ...((await jsonBody(req)) as object), projectId: params.projectId }), { status: 201 });
