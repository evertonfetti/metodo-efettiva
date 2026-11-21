"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/security/session";
import { actionError, formToObject, type ActionState } from "@/lib/actions";
import { addContact, addNote, createClient, removeContact, updateClient } from "./service";

function parseClientForm(fd: FormData) {
  const o = formToObject(fd, ["salesChannels"]);
  o.tags = String(o.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return o;
}

export async function createClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const user = await requireUser();
    id = (await createClient(user, parseClientForm(fd))).id;
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/", "layout");
  redirect(`/clientes/${id}`);
}

export async function updateClientAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await updateClient(user, clientId, parseClientForm(fd));
  } catch (err) {
    return actionError(err);
  }
  revalidatePath("/", "layout");
  redirect(`/clientes/${clientId}`);
}

export async function addContactAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await addContact(user, clientId, formToObject(fd));
    revalidatePath(`/clientes/${clientId}`);
    return { ok: true, message: "Contato adicionado." };
  } catch (err) {
    return actionError(err);
  }
}

export async function removeContactAction(clientId: string, contactId: string): Promise<ActionState> {
  try {
    const user = await requireUser();
    await removeContact(user, clientId, contactId);
    revalidatePath(`/clientes/${clientId}`);
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}

export async function addNoteAction(clientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    await addNote(user, clientId, formToObject(fd));
    revalidatePath(`/clientes/${clientId}`);
    return { ok: true, message: "Nota registrada." };
  } catch (err) {
    return actionError(err);
  }
}
