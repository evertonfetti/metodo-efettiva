"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/security/session";
import { actionError, type ActionState } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { commitBatch, createBatch, setMapping, setSourceValidated, validateBatch } from "./service";
import { refreshMetricsForUser } from "@/features/metrics/service";

const base = (clientId: string) => `/clientes/${clientId}/dados`;

export async function uploadImportAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireUser();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Selecione o arquivo.", { file: "Selecione o arquivo." });
    id = (await createBatch(user, clientId, { type: fd.get("type"), sourceSystem: fd.get("sourceSystem"), recordKind: fd.get("recordKind") ?? undefined }, { name: file.name, data: Buffer.from(await file.arrayBuffer()) })).id;
  } catch (err) {
    const s = actionError(err);
    if (err instanceof AppError && err.details && typeof err.details === "object" && !Array.isArray(err.details)) s.fieldErrors = err.details as Record<string, string>;
    return s;
  }
  redirect(`${base(clientId)}/importar/${id}`);
}

async function run(clientId: string, batchId: string, fn: () => Promise<unknown>, message: string): Promise<ActionState> {
  try {
    await fn();
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`${base(clientId)}/importar/${batchId}`);
  revalidatePath(base(clientId));
  return { ok: true, message };
}

export async function saveMappingAction(clientId: string, batchId: string, mapping: Record<string, string | null>, sheet?: string) {
  return run(clientId, batchId, async () => {
    const user = await requireUser();
    await setMapping(user, clientId, batchId, { mapping, sheet });
    await validateBatch(user, clientId, batchId);
  }, "Mapeamento salvo e arquivo validado.");
}
export async function revalidateBatchAction(clientId: string, batchId: string) {
  return run(clientId, batchId, async () => validateBatch(await requireUser(), clientId, batchId), "Arquivo validado novamente.");
}
export async function commitBatchAction(clientId: string, batchId: string) {
  return run(clientId, batchId, async () => commitBatch(await requireUser(), clientId, batchId), "Importação na fila.");
}
export async function sourceValidatedAction(clientId: string, batchId: string, validated: boolean) {
  return run(clientId, batchId, async () => setSourceValidated(await requireUser(), clientId, batchId, validated), validated ? "Fonte marcada como validada." : "Validação da fonte removida.");
}
export async function refreshMetricsAction(clientId: string): Promise<ActionState> {
  try {
    const r = await refreshMetricsForUser(await requireUser(), clientId);
    revalidatePath(`/clientes/${clientId}`, "layout");
    return { ok: true, message: `${r.snapshots} indicadores recalculados.` };
  } catch (err) {
    return actionError(err);
  }
}
