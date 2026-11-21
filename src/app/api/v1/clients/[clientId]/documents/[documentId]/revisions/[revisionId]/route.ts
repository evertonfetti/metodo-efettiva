import { z } from "zod";
import { apiRoute, jsonBody } from "@/lib/api";
import { regenerateSection, saveSection, setSectionState } from "@/features/documents/service";

type P = { clientId: string; documentId: string; revisionId: string };
const op = z.object({ sectionKey: z.string().min(2).max(60), action: z.enum(["save", "state", "regenerate"]) });

/**
 * Edita revisão em rascunho, por seção:
 * `{ sectionKey, action: "save", lockVersion, title, visibility, blocks }` ·
 * `{ sectionKey, action: "state", state: APPROVED|IN_REVIEW, lockVersion }` ·
 * `{ sectionKey, action: "regenerate", confirm?, lockVersion }`.
 */
export const PATCH = apiRoute<P>(async ({ req, user, params }) => {
  const body = (await jsonBody(req)) as Record<string, unknown>;
  const { sectionKey, action } = op.parse(body);
  const args = [user, params.clientId, params.documentId, params.revisionId, sectionKey, body] as const;
  if (action === "state") return setSectionState(...args);
  if (action === "regenerate") return regenerateSection(...args);
  return saveSection(...args);
});
