import { apiRoute } from "@/lib/api";
import { generatePlan } from "@/features/projects/service";

type P = { clientId: string; projectId: string };
export const POST = apiRoute<P>(async ({ user, params }) => generatePlan(user, params.clientId, params.projectId));
