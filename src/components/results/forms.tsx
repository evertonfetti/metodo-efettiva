"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { auditAction, createReportAction, eventAction, freezeBaselineAction, manualValueAction, meetingAction, snapshotAction } from "@/features/results/actions";
import type { ActionState } from "@/lib/actions";

function Msg({ s }: { s: ActionState }) {
  if (s.error) return <p role="alert" className="text-sm font-semibold text-err">{s.error}</p>;
  if (s.ok) return <p role="status" className="text-sm font-semibold text-ok">✓ {s.message}</p>;
  return null;
}

function useResetOnOk(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

/** Congelar/revisar baseline e registrar snapshot do período. */
export function BaselineActions({ clientId, projectId, locked, defaultEnd }: { clientId: string; projectId: string; locked: boolean; defaultEnd: string }) {
  const [pending, start] = useTransition();
  const [s, setS] = useState<ActionState>({});
  const [revise, setRevise] = useState(false);
  const [reason, setReason] = useState("");
  const [end, setEnd] = useState(defaultEnd);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {locked ? (
          <Button variant="secondary" disabled={pending} onClick={() => setRevise(true)}>Revisar baseline</Button>
        ) : (
          <Button disabled={pending} onClick={() => start(async () => setS(await freezeBaselineAction(clientId, projectId)))}>Congelar baseline</Button>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="snap-end">Snapshot até</Label>
          <Input id="snap-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="min-h-9 w-44" />
        </div>
        <Button variant="secondary" disabled={pending || !locked} title={locked ? undefined : "Congele o baseline antes"} onClick={() => start(async () => setS(await snapshotAction(clientId, projectId, end)))}>Registrar snapshot</Button>
      </div>
      <Msg s={s} />
      <Modal open={revise} onOpenChange={setRevise} title="Revisar baseline" description="O baseline congelado não é alterado: uma nova revisão é registrada com o motivo, a data e o responsável.">
        <div className="flex flex-col gap-3">
          <Label htmlFor="rev-reason">Motivo da revisão *</Label>
          <Textarea id="rev-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevise(false)}>Cancelar</Button>
            <Button disabled={pending || reason.trim().length < 5} onClick={() => start(async () => { const r = await freezeBaselineAction(clientId, projectId, reason.trim()); setS(r); if (!r.error) { setRevise(false); setReason(""); } })}>Registrar revisão</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

type Opt = { value: string; label: string };

export function ManualValueForm({ clientId, projectId, metrics }: { clientId: string; projectId: string; metrics: Opt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(manualValueAction.bind(null, clientId, projectId), {});
  const ref = useResetOnOk(state);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-1"><Label htmlFor="mv-code">Indicador</Label><Select id="mv-code" name="metricCode">{metrics.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1"><Label htmlFor="mv-val">Valor</Label><Input id="mv-val" name="value" inputMode="decimal" aria-invalid={!!e.value} /><FieldError message={e.value} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor="mv-end">Até</Label><Input id="mv-end" name="endDate" type="date" aria-invalid={!!e.endDate} /><FieldError message={e.endDate} /></div>
      </div>
      <div className="flex flex-col gap-1"><Label htmlFor="mv-src">Fonte *</Label><Input id="mv-src" name="source" aria-invalid={!!e.source} /><FieldError message={e.source} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor="mv-just">Justificativa *</Label><Input id="mv-just" name="justification" aria-invalid={!!e.justification} /><FieldError message={e.justification} /></div>
      <div className="flex items-center gap-3 md:col-span-2"><Button type="submit" variant="secondary" disabled={pending}>Registrar valor manual</Button><Msg s={state} /></div>
    </form>
  );
}

export function EventForm({ clientId, projectId, kinds }: { clientId: string; projectId: string; kinds: Opt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(eventAction.bind(null, clientId, projectId), {});
  const ref = useResetOnOk(state);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="grid gap-3 md:grid-cols-[160px_200px_1fr]">
      <div className="flex flex-col gap-1"><Label htmlFor="ev-date">Data</Label><Input id="ev-date" name="occurredAt" type="date" aria-invalid={!!e.occurredAt} /><FieldError message={e.occurredAt} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor="ev-kind">Tipo</Label><Select id="ev-kind" name="kind">{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></div>
      <div className="flex flex-col gap-1"><Label htmlFor="ev-desc">Descrição</Label><Input id="ev-desc" name="description" aria-invalid={!!e.description} /><FieldError message={e.description} /></div>
      <div className="flex items-center gap-3 md:col-span-3"><Button type="submit" variant="secondary" disabled={pending}>Registrar evento</Button><Msg s={state} /></div>
    </form>
  );
}

export function AuditForm({ clientId, projectId, processes }: { clientId: string; projectId: string; processes: Opt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(auditAction.bind(null, clientId, projectId), {});
  const ref = useResetOnOk(state);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="grid gap-3 md:grid-cols-[1fr_150px_110px_110px]">
      <div className="flex flex-col gap-1"><Label htmlFor="au-pp">Processo</Label><Select id="au-pp" name="projectProcessId">{processes.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></div>
      <div className="flex flex-col gap-1"><Label htmlFor="au-date">Data</Label><Input id="au-date" name="auditedAt" type="date" aria-invalid={!!e.auditedAt} /><FieldError message={e.auditedAt} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor="au-chk">Auditados</Label><Input id="au-chk" name="itemsChecked" type="number" min={1} aria-invalid={!!e.itemsChecked} /><FieldError message={e.itemsChecked} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor="au-ok">Conformes</Label><Input id="au-ok" name="itemsConforming" type="number" min={0} aria-invalid={!!e.itemsConforming} /><FieldError message={e.itemsConforming} /></div>
      <div className="flex flex-col gap-1 md:col-span-4"><Label htmlFor="au-notes">O que foi verificado (amostra, evidências, não conformidades)</Label><Input id="au-notes" name="notes" aria-invalid={!!e.notes} /><FieldError message={e.notes} /></div>
      <div className="flex items-center gap-3 md:col-span-4"><Button type="submit" variant="secondary" disabled={pending}>Registrar auditoria</Button><Msg s={state} /></div>
    </form>
  );
}

export function MeetingForm({ clientId, projectId }: { clientId: string; projectId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(meetingAction.bind(null, clientId, projectId), {});
  const ref = useResetOnOk(state);
  const e = state.fieldErrors ?? {};
  const area = (name: string, label: string) => (
    <div className="flex flex-col gap-1"><Label htmlFor={`mt-${name}`}>{label}</Label><Textarea id={`mt-${name}`} name={name} rows={3} placeholder="Um item por linha" /></div>
  );
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 p-5">
      <div className="grid gap-3 md:grid-cols-[170px_1fr]">
        <div className="flex flex-col gap-1"><Label htmlFor="mt-date">Data *</Label><Input id="mt-date" name="occurredAt" type="date" aria-invalid={!!e.occurredAt} /><FieldError message={e.occurredAt} /></div>
        <div className="flex flex-col gap-1"><Label htmlFor="mt-title">Título *</Label><Input id="mt-title" name="title" placeholder="Ex.: Revisão semanal de vendas" aria-invalid={!!e.title} /><FieldError message={e.title} /></div>
      </div>
      <div className="flex flex-col gap-1"><Label htmlFor="mt-sum">Resumo *</Label><Textarea id="mt-sum" name="summary" rows={3} aria-invalid={!!e.summary} /><FieldError message={e.summary} /></div>
      <div className="grid gap-3 md:grid-cols-2">
        {area("attendees", "Participantes (papéis ou nomes)")}
        {area("decisions", "Decisões")}
        {area("nextSteps", "Próximos passos / pendências do cliente")}
        {area("impediments", "Impedimentos")}
        {area("trainings", "Treinamentos e entregas")}
      </div>
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Registrar reunião"}</Button><Msg s={state} /></div>
    </form>
  );
}

export function ReportForm({ clientId, projects, defaults }: { clientId: string; projects: Opt[]; defaults: { start: string; end: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createReportAction.bind(null, clientId), {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-3 p-5 md:grid-cols-[1fr_170px_170px_auto] md:items-end">
      <div className="flex flex-col gap-1"><Label htmlFor="rp-proj">Projeto</Label><Select id="rp-proj" name="projectId">{projects.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></div>
      <div className="flex flex-col gap-1"><Label htmlFor="rp-start">Início</Label><Input id="rp-start" name="periodStart" type="date" defaultValue={defaults.start} aria-invalid={!!e.periodStart} /></div>
      <div className="flex flex-col gap-1"><Label htmlFor="rp-end">Fim</Label><Input id="rp-end" name="periodEnd" type="date" defaultValue={defaults.end} aria-invalid={!!e.periodEnd} /></div>
      <Button type="submit" disabled={pending}>{pending ? "Gerando…" : "Gerar relatório"}</Button>
      <div className="md:col-span-4"><FieldError message={e.periodEnd ?? e.periodStart} /><Msg s={state} /></div>
    </form>
  );
}
