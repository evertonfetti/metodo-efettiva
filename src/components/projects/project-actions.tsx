"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { TransitionButtons, type TransitionOption } from "@/components/transition-buttons";
import { addProcessEvidenceAction, addProjectProcessesAction, generatePlanAction, transitionProjectAction, updateProjectProcessAction } from "@/features/projects/actions";
import { STATUS_MAP } from "@/lib/status";

export function ProjectStatusActions({ clientId, projectId, transitions }: { clientId: string; projectId: string; transitions: TransitionOption[] }) {
  return <TransitionButtons action={transitionProjectAction.bind(null, clientId, projectId)} transitions={transitions} />;
}

export function GeneratePlanButton({ clientId, projectId, hasTasks }: { clientId: string; projectId: string; hasTasks: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  return (
    <span className="flex flex-col items-start gap-1">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await generatePlanAction(clientId, projectId); setMsg(r.error ? { err: r.error } : { ok: r.message }); })}>
        {pending ? "Gerando…" : hasTasks ? "Completar plano 30/60/90" : "Gerar plano 30/60/90"}
      </Button>
      {msg.ok ? <span role="status" className="text-xs font-semibold text-ok">✓ {msg.ok}</span> : null}
      {msg.err ? <span role="alert" className="text-xs font-semibold text-err">{msg.err}</span> : null}
    </span>
  );
}

export function AddProcessForm({ clientId, projectId, catalog }: { clientId: string; projectId: string; catalog: { code: string; name: string }[] }) {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => { const r = await addProjectProcessesAction(clientId, projectId, [code.trim().toUpperCase()]); setErr(r.error ?? null); if (!r.error) setCode(""); });
      }}
    >
      <div className="flex gap-2">
        <Input list="pp-catalog" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Adicionar processo (ex.: C04)" aria-label="Código do processo" className="min-h-9" />
        <datalist id="pp-catalog">{catalog.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</datalist>
        <Button size="sm" variant="secondary" disabled={pending || !code.trim()}>Adicionar</Button>
      </div>
      {err ? <p role="alert" className="text-xs font-semibold text-err">{err}</p> : null}
    </form>
  );
}

type PP = {
  id: string;
  code: string;
  name: string;
  status: string;
  ownerName: string | null;
  tasksTotal: number;
  tasksOpen: number;
  evidenceCount: number;
  validation: { indicatorsChecked?: boolean; indicatorsNote?: string; clientOwnerTrained?: boolean; auditDate?: string; auditNote?: string };
};

const statusOptions = Object.entries(STATUS_MAP.processImpl).map(([value, def]) => ({ value, label: def.label }));

/** Mudança de status de implantação com os critérios explícitos de Validado/Sustentado (RF-076). */
export function ProcessStatusDialog({ clientId, projectId, pp }: { clientId: string; projectId: string; pp: PP }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(pp.status);
  const [pending, start] = useTransition();
  const [issues, setIssues] = useState<string | null>(null);
  const [ev, setEv] = useState("");
  const [evMsg, setEvMsg] = useState<string | null>(null);
  const submit = (fd: FormData) =>
    start(async () => {
      const r = await updateProjectProcessAction(clientId, projectId, pp.id, Object.fromEntries(fd.entries()));
      setIssues(r.error ?? null);
      if (!r.error) setOpen(false);
    });
  const addEv = () =>
    start(async () => {
      const r = await addProcessEvidenceAction(clientId, projectId, pp.id, /^https?:\/\//i.test(ev.trim()) ? { url: ev.trim() } : { text: ev.trim() });
      setEvMsg(r.error ?? "✓ Evidência registrada.");
      if (!r.error) setEv("");
    });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Atualizar status de ${pp.code}`}>Atualizar</Button>
      <Modal open={open} onOpenChange={setOpen} title={`${pp.code} · ${pp.name}`} description="Validado e Sustentado exigem critérios explícitos." wide>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-[8px] bg-surface-sunken p-2"><div className="text-xs text-text-subtle">Tarefas em aberto</div><div className="font-extrabold text-navy">{pp.tasksOpen} de {pp.tasksTotal}</div></div>
          <div className="rounded-[8px] bg-surface-sunken p-2"><div className="text-xs text-text-subtle">Evidências</div><div className="font-extrabold text-navy">{pp.evidenceCount}</div></div>
          <div className="rounded-[8px] bg-surface-sunken p-2"><div className="text-xs text-text-subtle">Responsável cliente</div><div className="truncate font-extrabold text-navy">{pp.ownerName ?? "—"}</div></div>
        </div>
        <form action={submit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`st-${pp.id}`}>Novo status</Label>
              <Select id={`st-${pp.id}`} name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`own-${pp.id}`}>Responsável do cliente</Label>
              <Input id={`own-${pp.id}`} name="ownerName" defaultValue={pp.ownerName ?? ""} placeholder="Ex.: Gerente comercial" />
            </div>
          </div>
          {status === "VALIDATED" ? (
            <fieldset className="flex flex-col gap-2 rounded-[8px] border border-border p-3">
              <legend className="px-1 text-sm font-bold text-navy">Critérios de Validado</legend>
              <p className="text-xs text-text-muted">Processo executado (todas as tarefas vinculadas concluídas) + indicadores verificados + ao menos uma evidência.</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="indicatorsChecked" defaultChecked={pp.validation.indicatorsChecked} className="size-4 accent-navy" /> Indicadores verificados</label>
              <Label htmlFor={`ind-${pp.id}`}>Resultado dos indicadores *</Label>
              <Textarea id={`ind-${pp.id}`} name="indicatorsNote" defaultValue={pp.validation.indicatorsNote ?? ""} rows={2} />
            </fieldset>
          ) : null}
          {status === "SUSTAINED" ? (
            <fieldset className="flex flex-col gap-2 rounded-[8px] border border-border p-3">
              <legend className="px-1 text-sm font-bold text-navy">Critérios de Sustentado</legend>
              <p className="text-xs text-text-muted">Processo Validado + responsável do cliente treinado + auditoria posterior à validação.</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="clientOwnerTrained" defaultChecked={pp.validation.clientOwnerTrained} className="size-4 accent-navy" /> Responsável do cliente treinado</label>
              <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`aud-${pp.id}`}>Data da auditoria *</Label>
                  <Input id={`aud-${pp.id}`} type="date" name="auditDate" defaultValue={pp.validation.auditDate ?? ""} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`audn-${pp.id}`}>Resultado da auditoria *</Label>
                  <Input id={`audn-${pp.id}`} name="auditNote" defaultValue={pp.validation.auditNote ?? ""} />
                </div>
              </div>
            </fieldset>
          ) : null}
          {status === "BLOCKED" || status === "CANCELLED" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`rs-${pp.id}`}>Motivo *</Label>
              <Textarea id={`rs-${pp.id}`} name="reason" rows={2} />
            </div>
          ) : null}
          {issues ? <p role="alert" className="rounded-[8px] bg-err-bg px-3 py-2 text-sm font-semibold text-err">{issues}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Fechar</Button>
            <Button type="submit" disabled={pending || status === pp.status}>{pending ? "Salvando…" : "Salvar status"}</Button>
          </div>
        </form>
        <div className="mt-4 flex flex-col gap-1 border-t border-border pt-4">
          <Label htmlFor={`ev-${pp.id}`}>Registrar evidência do processo (texto ou link)</Label>
          <div className="flex gap-2">
            <Input id={`ev-${pp.id}`} value={ev} onChange={(e) => setEv(e.target.value)} placeholder="Ex.: ata da revisão semanal de 18/11 ou https://…" />
            <Button type="button" variant="secondary" disabled={pending || ev.trim().length < 3} onClick={addEv}>Registrar</Button>
          </div>
          {evMsg ? <p role="status" className="text-xs font-semibold text-text-muted">{evMsg}</p> : null}
        </div>
      </Modal>
    </>
  );
}
