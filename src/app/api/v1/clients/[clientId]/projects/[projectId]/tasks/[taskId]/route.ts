import { apiRoute, jsonBody } from "@/lib/api";
import { addTaskEvidence, deleteTask, updateTask } from "@/features/projects/service";

type P = { clientId: string; projectId: string; taskId: string };
/** `{ evidence: { text?, url?, fileAssetId? } }` registra evidência; demais campos atualizam a tarefa. */
export const PATCH = apiRoute<P>(async ({ req, user, params }) => {
  const body = (await jsonBody(req)) as Record<string, unknown>;
  const { clientId, projectId, taskId } = params;
  if (body.evidence) return addTaskEvidence(user, clientId, projectId, taskId, body.evidence);
  return updateTask(user, clientId, projectId, taskId, body);
});
export const DELETE = apiRoute<P>(async ({ user, params }) => deleteTask(user, params.clientId, params.projectId, params.taskId));
