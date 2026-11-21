import { apiRoute, attachment } from "@/lib/api";
import { exportClientData } from "@/features/governance/service";

type P = { clientId: string };
/** Exportação completa dos dados do cliente em JSON (OWNER, auditada). */
export const GET = apiRoute<P>(async ({ user, params }) => {
  const data = await exportClientData(user, params.clientId);
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": attachment(`dados-cliente-${params.clientId.slice(0, 8)}.json`), "Cache-Control": "private, no-store" } });
});
