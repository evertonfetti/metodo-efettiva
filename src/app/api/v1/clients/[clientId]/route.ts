import { apiRoute, jsonBody } from "@/lib/api";
import { getClientView, updateClient } from "@/features/clients/service";

type P = { clientId: string };
export const GET = apiRoute<P>(async ({ user, params }) => getClientView(user, params.clientId));
export const PATCH = apiRoute<P>(async ({ req, user, params }) => {
  await updateClient(user, params.clientId, await jsonBody(req));
  return getClientView(user, params.clientId);
});
