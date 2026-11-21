"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/security/session";
import { actionError, type ActionState } from "@/lib/actions";
import { updateSetting } from "@/features/settings/service";
import { decideGeneration, previewGeneration, requestGeneration, setExternalAi } from "./service";

const docPath = (clientId: string, documentId: string) => `/clientes/${clientId}/documentos/${documentId}`;

export async function previewAiAction(clientId: string, documentId: string, revisionId: string, input: { sectionKeys: string[]; includeFinancial: boolean; instruction?: string }) {
  try {
    return { ok: true, preview: await previewGeneration(await requireUser(), clientId, documentId, revisionId, input) };
  } catch (err) {
    return actionError(err);
  }
}

export async function requestAiAction(clientId: string, documentId: string, revisionId: string, input: { sectionKeys: string[]; includeFinancial: boolean; instruction?: string }): Promise<ActionState> {
  try {
    const r = await requestGeneration(await requireUser(), clientId, documentId, revisionId, input);
    revalidatePath(docPath(clientId, documentId));
    return { ok: true, message: `${r.items.length} sugestão(ões) na fila.` };
  } catch (err) {
    return actionError(err);
  }
}

export async function decideAiAction(clientId: string, documentId: string, generationId: string, input: { decision: "ACCEPT" | "REJECT"; blocks?: unknown[]; note?: string }): Promise<ActionState> {
  try {
    await decideGeneration(await requireUser(), clientId, generationId, input);
    revalidatePath(docPath(clientId, documentId));
    return { ok: true, message: input.decision === "REJECT" ? "Sugestão rejeitada." : "Sugestão aplicada: revise e aprove a seção." };
  } catch (err) {
    return actionError(err);
  }
}

export async function setExternalAiAction(clientId: string, allowed: boolean, acknowledged: boolean): Promise<ActionState> {
  try {
    await setExternalAi(await requireUser(), clientId, { allowed, acknowledged });
    revalidatePath(`/clientes/${clientId}`, "layout");
    return { ok: true, message: allowed ? "IA externa autorizada para este cliente." : "Autorização de IA externa removida." };
  } catch (err) {
    return actionError(err);
  }
}

export async function saveAiSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await updateSetting(user, "ai", {
      enabled: fd.get("enabled") === "on",
      model: fd.get("model"),
      effort: fd.get("effort"),
      maxOutputTokens: fd.get("maxOutputTokens"),
      maxRequestsPerHour: fd.get("maxRequestsPerHour"),
      maxCostUsdPerTask: fd.get("maxCostUsdPerTask"),
      timeoutSeconds: fd.get("timeoutSeconds"),
      providerNotes: fd.get("providerNotes") ?? "",
    });
    revalidatePath("/configuracoes");
    return { ok: true, message: "Configuração de IA salva." };
  } catch (err) {
    return actionError(err);
  }
}
