import { apiRoute, jsonBody } from "@/lib/api";
import { createMeeting, listMeetings } from "@/features/results/service";

type P = { clientId: string; projectId: string };
export const GET = apiRoute<P>(async ({ user, params }) => ({ items: await listMeetings(user, params.clientId, params.projectId) }));
export const POST = apiRoute<P>(async ({ req, user, params }) => createMeeting(user, params.clientId, params.projectId, await jsonBody(req)), { status: 201 });
