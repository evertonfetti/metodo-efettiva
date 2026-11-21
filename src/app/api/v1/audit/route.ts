import { apiRoute, searchParams } from "@/lib/api";
import { listAuditEvents } from "@/features/governance/service";

/** Trilha de auditoria (OWNER): `?action=&clientId=&page=`. */
export const GET = apiRoute(async ({ req, user }) => listAuditEvents(user, searchParams(req)));
