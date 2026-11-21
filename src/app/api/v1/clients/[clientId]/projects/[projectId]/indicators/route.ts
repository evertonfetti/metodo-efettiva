import { apiRoute } from "@/lib/api";
import { getIndicators } from "@/features/results/service";

type P = { clientId: string; projectId: string };
export const GET = apiRoute<P>(async ({ user, params }) => {
  const r = await getIndicators(user, params.clientId, params.projectId);
  return { rows: r.rows, events: r.events, baselineLocked: r.baselineLocked };
});
