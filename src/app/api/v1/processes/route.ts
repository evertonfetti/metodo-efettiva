import { apiRoute, searchParams } from "@/lib/api";
import { listProcesses } from "@/features/processes/service";

export const GET = apiRoute(async ({ req }) => ({ items: await listProcesses(searchParams(req)) }));
