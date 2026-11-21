import { apiRoute } from "@/lib/api";
import { validateBatch } from "@/features/imports/service";

type P = { clientId: string; batchId: string };
export const POST = apiRoute<P>(async ({ user, params }) => validateBatch(user, params.clientId, params.batchId));
