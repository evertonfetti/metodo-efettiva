import { apiRoute } from "@/lib/api";
import { refreshMetricsForUser } from "@/features/metrics/service";

type P = { clientId: string };
export const POST = apiRoute<P>(async ({ user, params }) => refreshMetricsForUser(user, params.clientId));
