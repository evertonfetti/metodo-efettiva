"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { ProcessCodeChip } from "@/components/processes/process-chip";
import { createProjectAction, updateProjectAction } from "@/features/projects/actions";
import type { ActionState } from "@/lib/actions";

type Opp = { id: string; code: string; title: string; processes: string[] };
export type ProjectFormValues = { name: string; scope: string; objectives: string; startDate: string; targetDate: string; sponsorName: string; ownerUserId: string };

const plus90 = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + 90);
  return d.toISOString().slice(0, 10);
};

export function ProjectForm({
  clientId,
  projectId,
  initial,
  users,
  opportunities = [],
  preselected = [],
  catalog = [],
}: {
  clientId: string;
  projectId?: string;
  initial: ProjectFormValues;
  users: { id: string; name: string }[];
  opportunities?: Opp[];
  preselected?: string[];
  catalog?: { code: string; name: string }[];
}) {
  const bound = projectId ? updateProjectAction.bind(null, clientId, projectId) : createProjectAction.bind(null, clientId);
  const [state, action, pending] = useActionState<ActionState, FormData>(bound, {});
  const [v, setV] = useState(initial);
  const [targetTouched, setTargetTouched] = useState(!!projectId);
  const [sel, setSel] = useState<string[]>(preselected);
  const err = state.fieldErrors ?? {};
  const fp = (k: string) => ({ "aria-invalid": !!err[k], "aria-describedby": err[k] ? `e-${k}` : undefined });
  const procs = [...new Set(opportunities.filter((o) => sel.includes(o.id)).flatMap((o) => o.processes))];

  return (
    <form action={action} className="flex flex-col gap-6 p-6" noValidate>
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-extrabold text-navy">Projeto</legend>
        <div className="flex flex-col gap-1">
          <Label htmlFor="p-name">Nome *</Label>
          <Input id="p-name" name="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex.: Implantação Comercial 90 dias" {...fp("name")} />
          <FieldError id="e-name" message={err.name} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="p-scope">Escopo</Label>
          <Textarea id="p-scope" name="scope" value={v.scope} onChange={(e) => setV({ ...v, scope: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="p-obj">Objetivos (um por linha)</Label>
          <Textarea id="p-obj" name="objectives" rows={3} value={v.objectives} onChange={(e) => setV({ ...v, objectives: e.target.value })} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-start">Início *</Label>
            <Input id="p-start" type="date" name="startDate" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value, targetDate: targetTouched ? v.targetDate : plus90(e.target.value) })} {...fp("startDate")} />
            <FieldError id="e-startDate" message={err.startDate} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-target">Data-alvo</Label>
            <Input id="p-target" type="date" name="targetDate" value={v.targetDate} onChange={(e) => { setTargetTouched(true); setV({ ...v, targetDate: e.target.value }); }} {...fp("targetDate")} />
            <span className="text-xs text-text-subtle">Padrão: 90 dias após o início. As janelas 30/60/90 são proporcionais à duração.</span>
            <FieldError id="e-targetDate" message={err.targetDate} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-owner">Responsável Efettiva</Label>
            <Select id="p-owner" name="ownerUserId" value={v.ownerUserId} onChange={(e) => setV({ ...v, ownerUserId: e.target.value })} {...fp("ownerUserId")}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <FieldError id="e-ownerUserId" message={err.ownerUserId} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-sponsor">Patrocinador no cliente</Label>
            <Input id="p-sponsor" name="sponsorName" value={v.sponsorName} onChange={(e) => setV({ ...v, sponsorName: e.target.value })} placeholder="Ex.: Diretor comercial" />
          </div>
        </div>
      </fieldset>

      {!projectId ? (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-extrabold text-navy">Oportunidades aprovadas</legend>
            {opportunities.length === 0 ? (
              <p className="rounded-[8px] bg-surface-sunken px-4 py-3 text-sm text-text-muted">
                Nenhuma oportunidade aprovada disponível. Aprove oportunidades em <Link className="font-bold text-navy underline" href={`/clientes/${clientId}/oportunidades`}>Oportunidades</Link> ou informe processos abaixo.
              </p>
            ) : (
              opportunities.map((o) => (
                <label key={o.id} className="flex items-start gap-3 rounded-[8px] border border-border p-3 text-sm hover:bg-surface-muted">
                  <input type="checkbox" name="opportunityIds" value={o.id} checked={sel.includes(o.id)} onChange={(e) => setSel(e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id))} className="mt-0.5 size-4 accent-navy" />
                  <span className="flex flex-col gap-1">
                    <span><span className="font-mono font-bold">{o.code}</span> · <span className="font-bold text-navy">{o.title}</span></span>
                    <span className="flex flex-wrap gap-1">{o.processes.length ? o.processes.map((c) => <ProcessCodeChip key={c} code={c} />) : <span className="text-xs font-semibold text-err">Sem processo selecionado</span>}</span>
                  </span>
                </label>
              ))
            )}
            <FieldError message={err.opportunityIds} />
          </fieldset>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-extrabold text-navy">Processos</legend>
            {procs.length ? <p className="text-sm text-text-muted">Pelas oportunidades: {procs.join(", ")}</p> : null}
            <Label htmlFor="p-codes">Processos adicionais (códigos separados por vírgula)</Label>
            <Input id="p-codes" name="processCodes" list="p-catalog" placeholder="Ex.: A03" {...fp("processCodes")} />
            <datalist id="p-catalog">{catalog.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</datalist>
            <FieldError id="e-processCodes" message={err.processCodes} />
          </fieldset>
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input type="checkbox" name="generatePlan" defaultChecked className="mt-0.5 size-4 accent-navy" />
            <span>Gerar plano 30/60/90 com tarefas a partir das fichas dos processos<span className="block text-xs font-normal text-text-subtle">Prazos em dias úteis (fins de semana e feriados nacionais). Tudo editável depois.</span></span>
          </label>
        </>
      ) : null}

      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : projectId ? "Salvar alterações" : "Criar projeto"}</Button>
        <Button asChild variant="secondary"><Link href={projectId ? `/clientes/${clientId}/projetos/${projectId}` : `/clientes/${clientId}/projetos`}>Cancelar</Link></Button>
      </div>
    </form>
  );
}
