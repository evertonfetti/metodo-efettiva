"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/security/session";
import { actionError, formToObject, type ActionState } from "@/lib/actions";
import {
  addProcessEvidence,
  addProjectProcesses,
  addTaskEvidence,
  createProject,
  createTask,
  deleteTask,
  generatePlan,
  linkOpportunity,
  transitionProject,
  updateProject,
  updateProjectProcess,
  updateTask,
} from "./service";

const base = (clientId: string) => `/clientes/${clientId}/projetos`;
const refresh = (clientId: string) => revalidatePath(`/clientes/${clientId}`, "layout");

export async function createProjectAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireUser();
    id = (await createProject(user, clientId, formToObject(fd, ["opportunityIds", "processCodes"]))).id;
  } catch (err) {
    return actionError(err);
  }
  refresh(clientId);
  redirect(`${base(clientId)}/${id}/acoes`);
}

export async function updateProjectAction(clientId: string, projectId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await updateProject(user, clientId, projectId, formToObject(fd));
  } catch (err) {
    return actionError(err);
  }
  refresh(clientId);
  redirect(`${base(clientId)}/${projectId}`);
}

/** Wrapper genérico para ações curtas disparadas por botões/diálogos (retorna estado, sem redirect). */
async function run(clientId: string, fn: (user: Awaited<ReturnType<typeof requireUser>>) => Promise<unknown>, message?: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    const r = await fn(user);
    refresh(clientId);
    const created = r && typeof r === "object" && "created" in r ? (r as { created: number }).created : null;
    return { ok: true, message: message ?? (created !== null ? `${created} tarefa(s) criada(s).` : undefined) };
  } catch (err) {
    return actionError(err);
  }
}

export async function transitionProjectAction(clientId: string, projectId: string, status: string, reason?: string) {
  return run(clientId, (u) => transitionProject(u, clientId, projectId, { status, reason }));
}
export async function linkOpportunityAction(clientId: string, projectId: string, opportunityId: string) {
  return run(clientId, (u) => linkOpportunity(u, clientId, projectId, opportunityId), "Oportunidade vinculada ao projeto.");
}
export async function addProjectProcessesAction(clientId: string, projectId: string, processCodes: string[]) {
  return run(clientId, (u) => addProjectProcesses(u, clientId, projectId, { processCodes }), "Processo adicionado.");
}
export async function generatePlanAction(clientId: string, projectId: string) {
  return run(clientId, (u) => generatePlan(u, clientId, projectId));
}
export async function updateProjectProcessAction(clientId: string, projectId: string, ppId: string, input: Record<string, unknown>) {
  return run(clientId, (u) => updateProjectProcess(u, clientId, projectId, ppId, input), "Status do processo atualizado.");
}
export async function addProcessEvidenceAction(clientId: string, projectId: string, ppId: string, input: Record<string, unknown>) {
  return run(clientId, (u) => addProcessEvidence(u, clientId, projectId, ppId, input), "Evidência registrada.");
}
export async function saveTaskAction(clientId: string, projectId: string, taskId: string | null, input: Record<string, unknown>) {
  return run(clientId, (u) => (taskId ? updateTask(u, clientId, projectId, taskId, input) : createTask(u, clientId, projectId, input)), taskId ? "Tarefa atualizada." : "Tarefa criada.");
}
export async function deleteTaskAction(clientId: string, projectId: string, taskId: string) {
  return run(clientId, (u) => deleteTask(u, clientId, projectId, taskId), "Tarefa excluída.");
}
export async function addTaskEvidenceAction(clientId: string, projectId: string, taskId: string, input: Record<string, unknown>) {
  return run(clientId, (u) => addTaskEvidence(u, clientId, projectId, taskId, input), "Evidência registrada.");
}
