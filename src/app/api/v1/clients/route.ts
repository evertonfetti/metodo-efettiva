import { apiRoute, jsonBody, searchParams } from "@/lib/api";
import { createClient, listClients } from "@/features/clients/service";

export const GET = apiRoute(async ({ req, user }) => listClients(user, searchParams(req)));
export const POST = apiRoute(async ({ req, user }) => createClient(user, await jsonBody(req)), { status: 201 });
