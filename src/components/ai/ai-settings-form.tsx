"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { saveAiSettingsAction } from "@/features/ai/actions";
import type { ActionState } from "@/lib/actions";

type S = { enabled: boolean; model: string; effort: string; maxOutputTokens: number; maxRequestsPerHour: number; maxCostUsdPerTask: number; timeoutSeconds: number; providerNotes: string };

export function AiSettingsForm({ s, canEdit }: { s: S; canEdit: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveAiSettingsAction, {});
  const e = state.fieldErrors ?? {};
  const num = (name: keyof S, label: string, help: string, step = "1") => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`ai-${name}`}>{label}</Label>
      <Input id={`ai-${name}`} name={name} type="number" step={step} defaultValue={String(s[name])} aria-invalid={!!e[name]} />
      <span className="text-xs text-text-subtle">{help}</span>
      <FieldError message={e[name]} />
    </div>
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={!canEdit} className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm font-semibold md:col-span-2"><input type="checkbox" name="enabled" defaultChecked={s.enabled} className="size-4 accent-navy" /> IA habilitada (ainda exige chave e autorização por cliente)</label>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ai-model">Modelo</Label>
          <Select id="ai-model" name="model" defaultValue={s.model}>
            <option value="claude-opus-5-5">Claude Opus 5.5 (padrão, mais capaz)</option>
            <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (mais econômico)</option>
            <option value="claude-haiku-5-5">Claude Haiku 5.5 (mais rápido)</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ai-effort">Esforço</Label>
          <Select id="ai-effort" name="effort" defaultValue={s.effort}>
            <option value="low">Baixo</option>
            <option value="medium">Médio (padrão)</option>
            <option value="high">Alto</option>
          </Select>
          <span className="text-xs text-text-subtle">Mais esforço: rascunhos mais cuidadosos, mais tokens.</span>
        </div>
        {num("maxOutputTokens", "Máximo de tokens de saída", "Por seção (1.000 a 32.000).")}
        {num("maxCostUsdPerTask", "Custo máximo por tarefa (US$)", "Pedido com custo estimado acima é bloqueado antes do envio.", "0.01")}
        {num("maxRequestsPerHour", "Gerações por hora por usuário", "Limite de requisições.")}
        {num("timeoutSeconds", "Tempo limite (s)", "Por chamada ao provedor.")}
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label htmlFor="ai-notes">Provedor contratado e condições de tratamento</Label>
          <Textarea id="ai-notes" name="providerNotes" rows={2} defaultValue={s.providerNotes} placeholder="Ex.: Anthropic, API comercial; dados não usados para treinamento; retenção conforme contrato" />
          <span className="text-xs text-text-subtle">Exibido na prévia de envio e na autorização por cliente.</span>
        </div>
      </fieldset>
      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm font-semibold text-ok">✓ {state.message}</p> : null}
      {canEdit ? <div><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar configuração de IA"}</Button></div> : null}
    </form>
  );
}
