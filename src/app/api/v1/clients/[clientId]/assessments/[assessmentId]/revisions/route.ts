import { apiRoute } from "@/lib/api";
import { createRevision } from "@/features/assessments/service";

type P = { clientId: string; assessmentId: string };
export const POST = apiRoute<P>(async ({ user, params }) => createRevision(user, params.clientId, params.assessmentId), { status: 201 });
