import { apiRoute, jsonBody } from "@/lib/api";
import { getBatch, setMapping, setSourceValidated } from "@/features/imports/service";

type P = { clientId: string; batchId: string };
/** Resultado, erros (até 200), prévia e progresso do lote. */
export const GET = apiRoute<P>(async ({ user, params }) => getBatch(user, params.clientId, params.batchId));
/** `{ mapping, sheet? }` confirma mapeamento · `{ sourceValidated: boolean }` marca a fonte como validada com o cliente. */
export const PATCH = apiRoute<P>(async ({ req, user, params }) => {
  const body = (await jsonBody(req)) as Record<string, unknown>;
  if (typeof body.sourceValidated === "boolean") return setSourceValidated(user, params.clientId, params.batchId, body.sourceValidated);
  return setMapping(user, params.clientId, params.batchId, body);
});
