"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { saveMethodAction, saveParametersAction, pingQueueAction, type FormState } from "@/features/settings/actions";
import type { Parameters } from "@/features/settings/defaults";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded-[8px] bg-err-bg px-3 py-2 text-sm font-semibold text-err">{state.error}</p>;
  if (state.ok) return <p role="status" className="rounded-[8px] bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">✓ {state.message}</p>;
  return null;
}

export function MethodForm({ phases, labels, canEdit }: { phases: { code: string; name: string; gate: string }[]; labels: string[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveMethodAction, {});
  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3" disabled={!canEdit}>
        <legend className="mb-2 text-[15px] font-extrabold text-navy">Fases do método EFETTIVA</legend>
        {phases.map((p, i) => (
          <div key={p.code} className="grid gap-2 rounded-[8px] border border-border p-3 md:grid-cols-[160px_1fr]">
            <input type="hidden" name={`phase.${i}.code`} value={p.code} />
            <div className="flex flex-col gap-1">
              <Label htmlFor={`phase-${i}-name`}>Fase {i + 1}</Label>
              <Input id={`phase-${i}-name`} name={`phase.${i}.name`} defaultValue={p.name} required maxLength={40} />
              <FieldError message={state.fieldErrors?.[`${i}.name`]} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`phase-${i}-gate`}>Gate mínimo de saída</Label>
              <Input id={`phase-${i}-gate`} name={`phase.${i}.gate`} defaultValue={p.gate} required maxLength={200} />
              <FieldError message={state.fieldErrors?.[`${i}.gate`]} />
            </div>
          </div>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-3" disabled={!canEdit}>
        <legend className="mb-2 text-[15px] font-extrabold text-navy">Rótulos da escala 0–5 do diagnóstico</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {labels.map((l, i) => (
            <div key={i} className="flex flex-col gap-1">
              <Label htmlFor={`scale-${i}`}>Nota {i}</Label>
              <Input id={`scale-${i}`} name={`scale.${i}`} defaultValue={l} required maxLength={40} />
            </div>
          ))}
        </div>
      </fieldset>
      <Feedback state={state} />
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar fases e escala"}</Button>
        </div>
      ) : (
        <p className="text-sm text-text-muted">Somente o perfil OWNER altera configurações.</p>
      )}
    </form>
  );
}

const PARAM_FIELDS: { name: keyof Parameters; label: string; help: string; step?: string }[] = [
  { name: "timezone", label: "Fuso horário padrão", help: "Ex.: America/Sao_Paulo" },
  { name: "inactivityMinDays", label: "Inatividade: limite mínimo (dias)", help: "Piso do sinal de inatividade (exemplo da especificação: 30)." },
  { name: "inactivityAlertFactor", label: "Inatividade: fator sobre a mediana", help: "Exemplo: 1,5 × intervalo típico.", step: "0.1" },
  { name: "inactivityFallbackDays", label: "Inatividade: janela sem histórico (dias)", help: "Usada quando há menos intervalos que o mínimo." },
  { name: "minIntervalsForMedian", label: "Intervalos mínimos para mediana", help: "Padrão 3 intervalos históricos válidos." },
  { name: "staleQuoteDays", label: "Orçamento parado após (dias)", help: "Sem interação registrada." },
  { name: "abcAThreshold", label: "Curva ABC: limite A (%)", help: "Participação acumulada (padrão 80)." },
  { name: "abcBThreshold", label: "Curva ABC: limite B (%)", help: "Participação acumulada (padrão 95)." },
  { name: "topNConcentration", label: "Concentração: top N clientes", help: "N usado no KPI de concentração." },
  { name: "uploadMaxMb", label: "Limite de upload (MB)", help: "Tamanho máximo por arquivo importado." },
];

export function ParametersForm({ params, canEdit }: { params: Parameters; canEdit: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveParametersAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset disabled={!canEdit} className="grid gap-4 md:grid-cols-2">
        {PARAM_FIELDS.map((f) => (
          <div key={f.name} className="flex flex-col gap-1">
            <Label htmlFor={`p-${f.name}`}>{f.label}</Label>
            <Input
              id={`p-${f.name}`}
              name={f.name}
              type={f.name === "timezone" ? "text" : "number"}
              step={f.step}
              defaultValue={String(params[f.name])}
              aria-describedby={`p-${f.name}-help`}
              aria-invalid={!!state.fieldErrors?.[f.name]}
              required
            />
            <span id={`p-${f.name}-help`} className="text-xs text-text-subtle">{f.help}</span>
            <FieldError message={state.fieldErrors?.[f.name]} />
          </div>
        ))}
      </fieldset>
      <Feedback state={state} />
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar parâmetros"}</Button>
        </div>
      ) : null}
    </form>
  );
}

export function PingQueueButton() {
  const [state, action, pending] = useActionState<FormState>(pingQueueAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Enviando…" : "Testar fila de processamento"}</Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
