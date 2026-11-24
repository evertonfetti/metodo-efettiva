"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/security/session";
import { actionError, type ActionState } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { applyWorkbook, uploadWorkbook } from "./service";

export async function uploadWorkbookAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireUser();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "Selecione a planilha preenchida.", { file: "Selecione a planilha preenchida." });
    id = (await uploadWorkbook(user, clientId, { name: file.name, data: Buffer.from(await file.arrayBuffer()) })).id;
  } catch (err) {
    const s = actionError(err);
    if (err instanceof AppError && err.details && typeof err.details === "object" && !Array.isArray(err.details)) s.fieldErrors = err.details as Record<string, string>;
    return s;
  }
  redirect(`/clientes/${clientId}/planilha/${id}`);
}

export async function applyWorkbookAction(clientId: string, fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const sections = fd.getAll("section").map(String);
    if (!sections.length) throw new AppError("VALIDATION", "Marque ao menos uma parte para aplicar.");
    const results = await applyWorkbook(user, clientId, fileId, { sections, salesKind: String(fd.get("salesKind") ?? "") });
    revalidatePath(`/clientes/${clientId}`, "layout");
    const failed = results.filter((r) => !r.ok);
    if (failed.length) return { error: failed.map((f) => f.message).join(" "), message: results.filter((r) => r.ok).map((r) => r.message).join(" ") || undefined };
    return { ok: true, message: "Aplicado com sucesso." };
  } catch (err) {
    return actionError(err);
  }
}
