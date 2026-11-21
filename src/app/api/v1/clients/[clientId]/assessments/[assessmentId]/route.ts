import { apiRoute, jsonBody } from "@/lib/api";
import { getAssessmentDetail, saveAnswer } from "@/features/assessments/service";

type P = { clientId: string; assessmentId: string };
export const GET = apiRoute<P>(async ({ user, params }) => getAssessmentDetail(user, params.clientId, params.assessmentId));
/** Responder em rascunho (autosave de uma resposta). */
export const PATCH = apiRoute<P>(async ({ req, user, params }) => saveAnswer(user, params.clientId, params.assessmentId, await jsonBody(req)));
