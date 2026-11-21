import { apiRoute } from "@/lib/api";
import { finalizeAssessment } from "@/features/assessments/service";

type P = { clientId: string; assessmentId: string };
export const POST = apiRoute<P>(async ({ user, params }) => finalizeAssessment(user, params.clientId, params.assessmentId));
