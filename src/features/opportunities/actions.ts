"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/security/session";
import { actionError, formToObject, type ActionState } from "@/lib/actions";
import { createOpportunity, setOpportunityProcesses, transitionOpportunity, updateOpportunity } from "./service";

const base = (clientId: string) => `/clientes/${clientId}/oportunidades`;

export async function saveOpportunityAction(clientId: string, opportunityId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireUser();
    const data = formToObject(fd, ["processCodes"]);
    id = opportunityId ? (await updateOpportunity(user, clientId, opportunityId, data)).id : (await createOpportunity(user, clientId, data)).id;
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/clientes/${clientId}`, "layout");
  redirect(`${base(clientId)}?sel=${id}`);
}

export async function transitionOpportunityAction(clientId: string, opportunityId: string, status: string, reason?: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    await transitionOpportunity(user, clientId, opportunityId, { status, reason });
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(`/clientes/${clientId}`, "layout");
  return { ok: true };
}

export async function setProcessesAction(clientId: string, opportunityId: string, processCodes: string[]): Promise<ActionState> {
  try {
    const user = await requireUser();
    await setOpportunityProcesses(user, clientId, opportunityId, { processCodes });
  } catch (err) {
    return actionError(err);
  }
  revalidatePath(base(clientId));
  return { ok: true };
}
