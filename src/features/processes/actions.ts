"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/security/session";
import { actionError, formToObject, type ActionState } from "@/lib/actions";
import { processEditFromForm, updateProcess } from "./service";

export async function updateProcessAction(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await updateProcess(user, code, processEditFromForm(formToObject(fd)));
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/biblioteca", "layout");
  redirect(`/biblioteca/${code}?salvo=1`);
}
