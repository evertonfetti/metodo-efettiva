"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/security/session";
import { actionError, formToObject, type ActionState } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { approveRevision, createRevision, generateDocument, publishRevision, regenerateSection, requestExport, saveSection, setSectionState } from "./service";

const base = (clientId: string) => `/clientes/${clientId}/documentos`;
type Result = ActionState & { lockVersion?: number; needsConfirmation?: boolean };

export async function generateDocumentAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireUser();
    id = (await generateDocument(user, clientId, formToObject(fd))).id;
  } catch (err) {
    if (err instanceof AppError && err.code === "CONFLICT" && (err.details as { documentId?: string })?.documentId) redirect(`${base(clientId)}/${(err.details as { documentId: string }).documentId}`);
    return actionError(err);
  }
  revalidatePath(`/clientes/${clientId}`, "layout");
  redirect(`${base(clientId)}/${id}`);
}

async function run(clientId: string, documentId: string, fn: (u: Awaited<ReturnType<typeof requireUser>>) => Promise<{ lockVersion?: number } | unknown>, message?: string): Promise<Result> {
  try {
    const user = await requireUser();
    const r = (await fn(user)) as { lockVersion?: number };
    revalidatePath(`${base(clientId)}/${documentId}`);
    return { ok: true, message, lockVersion: r?.lockVersion };
  } catch (err) {
    if (err instanceof AppError && (err.details as { needsConfirmation?: boolean })?.needsConfirmation) return { error: err.message, needsConfirmation: true };
    return actionError(err);
  }
}

export async function saveSectionAction(clientId: string, documentId: string, revisionId: string, key: string, input: unknown) {
  return run(clientId, documentId, (u) => saveSection(u, clientId, documentId, revisionId, key, input), "Seção salva.");
}
export async function setSectionStateAction(clientId: string, documentId: string, revisionId: string, key: string, state: "APPROVED" | "IN_REVIEW", lockVersion: number) {
  return run(clientId, documentId, (u) => setSectionState(u, clientId, documentId, revisionId, key, { state, lockVersion }), state === "APPROVED" ? "Seção aprovada." : "Seção reaberta para revisão.");
}
export async function regenerateSectionAction(clientId: string, documentId: string, revisionId: string, key: string, lockVersion: number, confirm: boolean) {
  return run(clientId, documentId, (u) => regenerateSection(u, clientId, documentId, revisionId, key, { lockVersion, confirm }), "Seção regenerada com os dados atuais.");
}
export async function approveRevisionAction(clientId: string, documentId: string, revisionId: string) {
  return run(clientId, documentId, (u) => approveRevision(u, clientId, documentId, revisionId), "Versão aprovada: agora é imutável.");
}
export async function publishRevisionAction(clientId: string, documentId: string, revisionId: string) {
  return run(clientId, documentId, (u) => publishRevision(u, clientId, documentId, revisionId), "Versão publicada.");
}
export async function createRevisionAction(clientId: string, documentId: string): Promise<Result> {
  let id: string;
  try {
    const user = await requireUser();
    id = (await createRevision(user, clientId, documentId)).id;
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`${base(clientId)}/${documentId}`);
  redirect(`${base(clientId)}/${documentId}?rev=${id}`);
}
export async function requestExportAction(clientId: string, documentId: string, revisionId: string, format: string, audience: string) {
  return run(clientId, documentId, (u) => requestExport(u, clientId, documentId, revisionId, { format, audience }), "Exportação na fila.");
}
