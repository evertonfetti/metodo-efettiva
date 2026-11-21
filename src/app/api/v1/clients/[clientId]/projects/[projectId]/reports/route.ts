import { apiRoute, jsonBody } from "@/lib/api";
import { createReport, listReports } from "@/features/results/report";

type P = { clientId: string; projectId: string };
export const GET = apiRoute<P>(async ({ user, params }) => ({ items: (await listReports(user, params.clientId)).filter((r) => r.projectId === params.projectId) }));
/** `{ periodStart, periodEnd }` cria relatório (documento REPORT v1 em rascunho). */
export const POST = apiRoute<P>(async ({ req, user, params }) => createReport(user, params.clientId, { ...((await jsonBody(req)) as object), projectId: params.projectId }), { status: 201 });
