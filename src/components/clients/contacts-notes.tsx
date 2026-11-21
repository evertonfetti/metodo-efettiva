"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { addContactAction, addNoteAction, removeContactAction } from "@/features/clients/actions";
import type { ActionState } from "@/lib/actions";

export function ContactForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addContactAction.bind(null, clientId), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 border-t border-border p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-name">Nome *</Label>
          <Input id="c-name" name="name" required aria-invalid={!!state.fieldErrors?.name} />
          <FieldError message={state.fieldErrors?.name} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-role">Cargo</Label>
          <Input id="c-role" name="role" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-email">E-mail</Label>
          <Input id="c-email" name="email" type="email" aria-invalid={!!state.fieldErrors?.email} />
          <FieldError message={state.fieldErrors?.email} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="c-phone">Telefone</Label>
          <Input id="c-phone" name="phone" type="tel" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="c-lgpd">Base de tratamento / consentimento (opcional)</Label>
        <Input id="c-lgpd" name="dataProcessingNote" placeholder="Ex.: contato fornecido pelo cliente para execução do contrato" />
      </div>
      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Salvando…" : "+ Adicionar contato"}</Button>
      </div>
    </form>
  );
}

export function RemoveContactButton({ clientId, contactId, name }: { clientId: string; contactId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Remover contato ${name}`}
      onClick={() => {
        if (confirm(`Remover o contato ${name}?`)) start(async () => void (await removeContactAction(clientId, contactId)));
      }}
      className="text-err"
    >
      Remover
    </Button>
  );
}

export function NoteForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addNoteAction.bind(null, clientId), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 border-t border-border p-5">
      <Label htmlFor="n-body">Nova nota</Label>
      <Textarea id="n-body" name="body" required aria-invalid={!!state.fieldErrors?.body} />
      <FieldError message={state.fieldErrors?.body} />
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="n-vis" className="sr-only">Visibilidade</Label>
        <Select id="n-vis" name="visibility" defaultValue="INTERNO" className="w-48">
          <option value="INTERNO">Interna (Efettiva)</option>
          <option value="CLIENTE">Pode ir ao cliente</option>
        </Select>
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Salvando…" : "Registrar nota"}</Button>
      </div>
      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
    </form>
  );
}
