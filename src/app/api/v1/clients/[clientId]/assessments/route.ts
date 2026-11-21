import { apiRoute, jsonBody } from "@/lib/api";
import { createAssessment, listAssessments } from "@/features/assessments/service";

type P = { clientId: string };
export const GET = apiRoute<P>(async ({ user, params }) => listAssessments(user, params.clientId));
export const POST = apiRoute<P>(async ({ req, user, params }) => createAssessment(user, params.clientId, await jsonBody(req)), { status: 201 });
