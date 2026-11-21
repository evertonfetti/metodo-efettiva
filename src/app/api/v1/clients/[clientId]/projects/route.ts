import { apiRoute, jsonBody } from "@/lib/api";
import { createProject, listProjects } from "@/features/projects/service";

type P = { clientId: string };
export const GET = apiRoute<P>(async ({ user, params }) => ({ items: await listProjects(user, params.clientId) }));
export const POST = apiRoute<P>(async ({ req, user, params }) => createProject(user, params.clientId, await jsonBody(req)), { status: 201 });
