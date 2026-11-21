import { apiRoute, jsonBody, searchParams } from "@/lib/api";
import { createManualFinding, listFindings } from "@/features/assessments/service";

type P = { clientId: string };
export const GET = apiRoute<P>(async ({ req, user, params }) => listFindings(user, params.clientId, searchParams(req).assessmentId));
export const POST = apiRoute<P>(async ({ req, user, params }) => createManualFinding(user, params.clientId, await jsonBody(req)), { status: 201 });
