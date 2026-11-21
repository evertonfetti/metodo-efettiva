import { apiRoute } from "@/lib/api";
import { listMetrics } from "@/features/metrics/service";

type P = { clientId: string };
/** Snapshots de KPIs (período, série mensal e análises) com fonte, versão de cálculo e qualidade. */
export const GET = apiRoute<P>(async ({ user, params }) => ({ items: await listMetrics(user, params.clientId) }));
