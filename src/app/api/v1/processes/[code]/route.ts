import { apiRoute, jsonBody, searchParams } from "@/lib/api";
import { getProcess, getProcessRevision, updateProcess } from "@/features/processes/service";

type P = { code: string };
/** Ficha versionada; `?version=N` devolve o conteúdo de uma revisão específica. */
export const GET = apiRoute<P>(async ({ req, params }) => {
  const v = Number(searchParams(req).version);
  return Number.isInteger(v) && v > 0 ? getProcessRevision(params.code, v) : getProcess(params.code);
});
export const PATCH = apiRoute<P>(async ({ req, user, params }) => updateProcess(user, params.code, await jsonBody(req)));
