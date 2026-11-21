"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/security/session";
import { actionError, formToObject, type ActionState } from "@/lib/actions";
import { createEvent, createMeeting, freezeBaseline, recordManualValue, recordProcessAudit, recordSnapshot } from "./service";
import { createReport } from "./report";

const proj = (c: string, p: string) => `/clientes/${c}/projetos/${p}`;

async function run(path: string, fn: (u: Awaited<ReturnType<typeof requireUser>>) => Promise<unknown>, message: string): Promise<ActionState> {
  try {
    await fn(await requireUser());
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(path, "layout");
  return { ok: true, message };
}

export async function freezeBaselineAction(clientId: string, projectId: string, reason?: string) {
  return run(proj(clientId, projectId), (u) => freezeBaseline(u, clientId, projectId, reason ? { reason } : {}), reason ? "Nova revisão do baseline registrada." : "Baseline congelado.");
}
export async function snapshotAction(clientId: string, projectId: string, endDate?: string) {
  return run(proj(clientId, projectId), (u) => recordSnapshot(u, clientId, projectId, endDate ? { endDate } : {}), "Snapshot registrado.");
}
export async function manualValueAction(clientId: string, projectId: string, _: ActionState, fd: FormData) {
  return run(proj(clientId, projectId), (u) => recordManualValue(u, clientId, projectId, formToObject(fd)), "Valor manual registrado (classificado como Estimado).");
}
export async function eventAction(clientId: string, projectId: string, _: ActionState, fd: FormData) {
  return run(proj(clientId, projectId), (u) => createEvent(u, clientId, projectId, formToObject(fd)), "Evento registrado como nota de comparabilidade.");
}
export async function auditAction(clientId: string, projectId: string, _: ActionState, fd: FormData) {
  const o = formToObject(fd);
  return run(proj(clientId, projectId), (u) => recordProcessAudit(u, clientId, projectId, String(o.projectProcessId), o), "Auditoria registrada.");
}
export async function meetingAction(clientId: string, projectId: string, _: ActionState, fd: FormData) {
  return run(proj(clientId, projectId), (u) => createMeeting(u, clientId, projectId, formToObject(fd)), "Reunião registrada.");
}
export async function createReportAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let docId: string;
  try {
    docId = (await createReport(await requireUser(), clientId, formToObject(fd))).documentId!;
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/clientes/${clientId}`, "layout");
  redirect(`/clientes/${clientId}/documentos/${docId}`);
}
