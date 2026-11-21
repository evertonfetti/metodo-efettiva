import { apiRoute, jsonBody } from "@/lib/api";
import { assertClientAccess } from "@/lib/security/access";
import { aiStatus, setExternalAi } from "@/features/ai/service";

type P = { clientId: string };
/** Situação da IA para o cliente (sem chave/desativada/não autorizado). */
export const GET = apiRoute<P>(async ({ user, params }) => {
  await assertClientAccess(user, params.clientId, "VIEW");
  const s = await aiStatus(params.clientId);
  return { available: s.available, reason: s.reason, model: s.model };
});
/** `{ allowed, acknowledged }` autoriza/revoga envio ao provedor externo para este cliente. */
export const PATCH = apiRoute<P>(async ({ req, user, params }) => setExternalAi(user, params.clientId, await jsonBody(req)));
