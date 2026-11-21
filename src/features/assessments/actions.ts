"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/security/session";
import { actionError, formToObject, type ActionState } from "@/lib/actions";
import {
  addEvidence,
  createAssessment,
  createManualFinding,
  createRevision,
  finalizeAssessment,
  generateRuleFindings,
  removeEvidence,
  updateFindingStatus,
} from "./service";

const base = (clientId: string) => `/clientes/${clientId}/diagnosticos`;

export async function createAssessmentAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireUser();
    id = (await createAssessment(user, clientId, formToObject(fd))).id;
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/clientes/${clientId}`, "layout");
  redirect(`${base(clientId)}/${id}`);
}

export async function finalizeAssessmentAction(clientId: string, assessmentId: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    await finalizeAssessment(user, clientId, assessmentId);
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/clientes/${clientId}`, "layout");
  redirect(`${base(clientId)}/${assessmentId}/resumo`);
}

export async function createRevisionAction(clientId: string, assessmentId: string): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireUser();
    id = (await createRevision(user, clientId, assessmentId)).id;
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/clientes/${clientId}`, "layout");
  redirect(`${base(clientId)}/${id}`);
}

export async function addEvidenceAction(clientId: string, assessmentId: string, input: { questionCode: string; note?: string; url?: string; fileAssetId?: string }): Promise<ActionState> {
  try {
    const user = await requireUser();
    await addEvidence(user, clientId, assessmentId, input);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function removeEvidenceAction(clientId: string, assessmentId: string, evidenceId: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    await removeEvidence(user, clientId, assessmentId, evidenceId);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function generateFindingsAction(clientId: string, assessmentId: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { created } = await generateRuleFindings(user, clientId, assessmentId);
    revalidatePath(`${base(clientId)}/${assessmentId}/resumo`);
    return { ok: true, message: created ? `${created} achado(s) preliminar(es) gerado(s) por regra.` : "Nenhum achado novo: as regras já foram aplicadas ou nenhuma área atende aos critérios." };
  } catch (err) {
    return actionError(err);
  }
}

export async function createFindingAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const o = formToObject(fd);
    if (!o.assessmentId) delete o.assessmentId;
    await createManualFinding(user, clientId, o);
    revalidatePath(`/clientes/${clientId}`, "layout");
    return { ok: true, message: "Achado registrado." };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateFindingStatusAction(clientId: string, findingId: string, status: "REVIEWED" | "APPROVED" | "DISMISSED", reason?: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    await updateFindingStatus(user, clientId, findingId, { status, reason });
    revalidatePath(`/clientes/${clientId}`, "layout");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
