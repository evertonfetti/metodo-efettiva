import { apiRoute, jsonBody, searchParams } from "@/lib/api";
import { createTask, listTasks } from "@/features/projects/service";

type P = { clientId: string; projectId: string };
export const GET = apiRoute<P>(async ({ req, user, params }) => ({ items: await listTasks(user, params.clientId, params.projectId, searchParams(req)) }));
export const POST = apiRoute<P>(async ({ req, user, params }) => createTask(user, params.clientId, params.projectId, await jsonBody(req)), { status: 201 });
