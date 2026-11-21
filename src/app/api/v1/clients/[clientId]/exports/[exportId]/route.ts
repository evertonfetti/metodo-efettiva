import { apiRoute } from "@/lib/api";
import { getExport } from "@/features/documents/service";

type P = { clientId: string; exportId: string };
export const GET = apiRoute<P>(async ({ user, params }) => getExport(user, params.clientId, params.exportId));
