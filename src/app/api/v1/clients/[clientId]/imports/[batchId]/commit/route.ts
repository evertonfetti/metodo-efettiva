import { apiRoute } from "@/lib/api";
import { commitBatch } from "@/features/imports/service";

type P = { clientId: string; batchId: string };
/** Importação idempotente (job no worker). */
export const POST = apiRoute<P>(async ({ user, params }) => commitBatch(user, params.clientId, params.batchId), { status: 202 });
