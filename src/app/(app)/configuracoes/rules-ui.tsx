"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { saveRuleAction, toggleRuleAction, type FormState } from "@/features/settings/actions";
import { SEGMENTS } from "@/features/clients/catalog";

type Q = { questionCode: string; title: string; type: string };
export type RuleDefaults = {
  id?: string;
  targetQuestionCode?: string;
  effect?: "SHOW" | "HIDE";
  conditionType?: "SEGMENT" | "ANSWER";
  segments?: string[];
  answerQuestionCode?: string;
  operator?: string;
  value?: number;
  reason?: string;
  active?: boolean;
};

export function RuleForm({ questions, defaults = {} }: { questions: Q[]; defaults?: RuleDefaults }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRuleAction, {});
  const [type, setType] = useState(defaults.conditionType ?? "SEGMENT");
  const scale = questions.filter((q) => q.type === "SCALE_0_5");
  return (
    <form action={action} className="flex flex-col gap-4" key={defaults.id ?? "new"}>
      <input type="hidden" name="id" value={defaults.id ?? ""} />
      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="r-target">Pergunta-alvo</Label>
          <Select id="r-target" name="targetQuestionCode" defaultValue={defaults.targetQuestionCode ?? ""} required>
            <option value="">Selecione…</option>
            {questions.map((q) => <option key={q.questionCode} value={q.questionCode}>{q.questionCode} · {q.title.slice(0, 80)}</option>)}
          </Select>
          <FieldError message={state.fieldErrors?.targetQuestionCode} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="r-effect">Efeito</Label>
          <Select id="r-effect" name="effect" defaultValue={defaults.effect ?? "SHOW"}>
            <option value="SHOW">Exibir quando</option>
            <option value="HIDE">Ocultar quando</option>
          </Select>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-bold text-text-muted">Condição</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="conditionType" value="SEGMENT" checked={type === "SEGMENT"} onChange={() => setType("SEGMENT")} className="accent-navy" /> Por segmento</label>
          <label className="flex items-center gap-2"><input type="radio" name="conditionType" value="ANSWER" checked={type === "ANSWER"} onChange={() => setType("ANSWER")} className="accent-navy" /> Por resposta anterior</label>
        </div>
        {type === "SEGMENT" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {SEGMENTS.map((s) => (
              <label key={s.code} className="flex min-h-10 items-center gap-2 rounded-[8px] border border-border px-3 text-sm">
                <input type="checkbox" name="segments" value={s.code} defaultChecked={defaults.segments?.includes(s.code)} className="size-4 accent-navy" /> {s.label}
              </label>
            ))}
            <FieldError message={state.fieldErrors?.segments} />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_160px_100px]">
            <Select name="answerQuestionCode" aria-label="Pergunta de origem" defaultValue={defaults.answerQuestionCode ?? ""}>
              <option value="">Pergunta de origem…</option>
              {scale.map((q) => <option key={q.questionCode} value={q.questionCode}>{q.questionCode} · {q.title.slice(0, 70)}</option>)}
            </Select>
            <Select name="operator" aria-label="Operador" defaultValue={defaults.operator ?? "lessThan"}>
              <option value="lessThan">nota menor que</option>
              <option value="greaterThan">nota maior que</option>
              <option value="equals">nota igual a</option>
            </Select>
            <Input name="value" aria-label="Valor (0 a 5)" type="number" min={0} max={5} defaultValue={defaults.value ?? 3} />
            <FieldError message={state.fieldErrors?.answerQuestionCode} />
          </div>
        )}
      </fieldset>
      <div className="flex flex-col gap-1">
        <Label htmlFor="r-reason">Motivo exibido ao consultor</Label>
        <Input id="r-reason" name="reason" defaultValue={defaults.reason ?? ""} placeholder="Ex.: Pergunta exibida porque o segmento é Distribuição" required />
        <FieldError message={state.fieldErrors?.reason} />
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={defaults.active ?? true} className="size-4 accent-navy" /> Regra ativa</label>
      {state.error ? <p role="alert" className="rounded-[8px] bg-err-bg px-3 py-2 text-sm font-semibold text-err">{state.error}</p> : null}
      {state.ok ? <p role="status" className="rounded-[8px] bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">✓ {state.message}</p> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Salvando…" : defaults.id ? "Salvar regra" : "Criar regra"}</Button></div>
    </form>
  );
}

export function RuleToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => void (await toggleRuleAction(id, !active)))}>
      {active ? "Desativar" : "Ativar"}
    </Button>
  );
}
