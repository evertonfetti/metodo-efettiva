"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { deleteClientAction } from "@/features/governance/actions";
import type { ActionState } from "@/lib/actions";

/** Exportação e exclusão assistida dos dados do cliente (RF-113), somente OWNER. */
export function ClientDataCard({ clientId, name }: { clientId: string; name: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteClientAction.bind(null, clientId), {});
  const e = state.fieldErrors ?? {};
  return (
    <section aria-labelledby="lgpd" className="flex max-w-[880px] flex-col gap-4 rounded-[12px] border border-border-alert bg-surface p-5">
      <h2 id="lgpd" className="text-[17px] font-extrabold text-navy">Dados do cliente (LGPD)</h2>
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-text-muted">Exporte todos os dados deste cliente (cadastro, diagnóstico, base comercial, oportunidades, projetos, documentos e resultados) em JSON.</p>
        <div><Button asChild variant="secondary"><a href={`/api/v1/clients/${clientId}/data-export`}>Exportar dados (JSON)</a></Button></div>
      </div>
      <form action={action} className="flex flex-col gap-3 border-t border-border pt-4 text-sm">
        <p className="font-semibold text-err">Excluir definitivamente: remove banco e arquivos deste cliente. Não há como desfazer; faça backup e exporte os dados antes. A trilha de auditoria registra a exclusão.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1"><Label htmlFor="del-name">Digite o nome exato: “{name}”</Label><Input id="del-name" name="confirmName" autoComplete="off" aria-invalid={!!e.confirmName} /><FieldError message={e.confirmName} /></div>
          <div className="flex flex-col gap-1"><Label htmlFor="del-reason">Motivo / base da exclusão</Label><Input id="del-reason" name="reason" aria-invalid={!!e.reason} /><FieldError message={e.reason} /></div>
        </div>
        {state.error ? <p role="alert" className="font-semibold text-err">{state.error}</p> : null}
        <div><Button type="submit" variant="ghost" className="border border-err text-err" disabled={pending}>{pending ? "Excluindo…" : "Excluir dados do cliente"}</Button></div>
      </form>
    </section>
  );
}
