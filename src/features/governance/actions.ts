"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/security/session";
import { actionError, formToObject, type ActionState } from "@/lib/actions";
import { deleteClientData } from "./service";

export async function deleteClientAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await deleteClientData(await requireUser(), clientId, formToObject(fd));
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/", "layout");
  redirect("/clientes?excluido=1");
}
