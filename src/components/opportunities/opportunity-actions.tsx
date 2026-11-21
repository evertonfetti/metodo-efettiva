"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { TransitionButtons, type TransitionOption } from "@/components/transition-buttons";
import { Modal } from "@/components/ui/modal";
import { ProcessCodeChip } from "@/components/processes/process-chip";
import { setProcessesAction, transitionOpportunityAction } from "@/features/opportunities/actions";
import { linkOpportunityAction } from "@/features/projects/actions";

export function OpportunityStatusActions({ clientId, opportunityId, transitions }: { clientId: string; opportunityId: string; transitions: TransitionOption[] }) {
  return <TransitionButtons action={transitionOpportunityAction.bind(null, clientId, opportunityId)} transitions={transitions} />;
}

type Proc = { code: string; name: string; selected: boolean; suggested: boolean };

/** Processos vinculados (selecionados) e sugeridos; seleção manual por código do catálogo. */
export function ProcessPicker({ clientId, opportunityId, processes, catalog, editable }: { clientId: string; opportunityId: string; processes: Proc[]; catalog: { code: string; name: string }[]; editable: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const selected = processes.filter((p) => p.selected).map((p) => p.code);
  const save = (codes: string[]) =>
    start(async () => {
      const r = await setProcessesAction(clientId, opportunityId, codes);
      setError(r.error ?? null);
      if (!r.error) setCode("");
    });
  const listId = `catalog-${opportunityId}`;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {processes.length === 0 ? <li className="text-sm text-text-subtle">Nenhum processo vinculado.</li> : null}
        {processes.map((p) => (
          <li key={p.code} className="flex items-center gap-2 text-sm">
            <ProcessCodeChip code={p.code} className={p.selected ? undefined : "bg-surface-sunken text-navy"} />
            <Link href={`/biblioteca/${p.code}`} className="min-w-0 flex-1 truncate hover:underline">{p.name}{!p.selected ? <span className="text-text-subtle"> (sugerido)</span> : null}</Link>
            {editable ? (
              p.selected ? (
                <button type="button" className="flex size-8 items-center justify-center rounded-[8px] text-text-muted hover:bg-surface-sunken" aria-label={`Remover ${p.code}`} disabled={pending} onClick={() => save(selected.filter((c) => c !== p.code))}>
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : (
                <button type="button" className="flex size-8 items-center justify-center rounded-[8px] text-navy hover:bg-surface-sunken" aria-label={`Vincular ${p.code}`} disabled={pending} onClick={() => save([...selected, p.code])}>
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim().toUpperCase().slice(0, 3);
            if (c) save([...selected.filter((x) => x !== c), c]);
          }}
        >
          <Input list={listId} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Adicionar por código (ex.: C04)" aria-label="Código do processo" className="min-h-9" />
          <datalist id={listId}>{catalog.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</datalist>
          <Button size="sm" variant="secondary" type="submit" disabled={pending || !code.trim()}>Adicionar</Button>
        </form>
      ) : null}
      {error ? <p role="alert" className="text-sm font-semibold text-err">{error}</p> : null}
    </div>
  );
}

/** "Vincular a projeto": projeto existente (aberto) ou novo projeto já com a oportunidade marcada. */
export function LinkToProject({ clientId, opportunityId, projects, disabledReason }: { clientId: string; opportunityId: string; projects: { id: string; name: string }[]; disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState(projects[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const newHref = `/clientes/${clientId}/projetos/novo?opp=${opportunityId}`;
  if (disabledReason)
    return (
      <span className="flex flex-col gap-1">
        <Button size="sm" disabled aria-describedby={`why-${opportunityId}`}>Vincular a projeto</Button>
        <span id={`why-${opportunityId}`} className="text-xs font-semibold text-err">{disabledReason}</span>
      </span>
    );
  if (projects.length === 0) return <Button size="sm" asChild><Link href={newHref}>Criar projeto com esta oportunidade</Link></Button>;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Vincular a projeto</Button>
      <Modal open={open} onOpenChange={setOpen} title="Vincular a projeto" description="Os processos selecionados entram no projeto com a versão atual da ficha.">
        <div className="flex flex-col gap-3">
          <Label htmlFor="proj">Projeto em aberto</Label>
          <Select id="proj" value={pid} onChange={(e) => setPid(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          {error ? <p role="alert" className="text-sm font-semibold text-err">{error}</p> : null}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" asChild><Link href={newHref}>Criar novo projeto</Link></Button>
            <Button disabled={pending || !pid} onClick={() => start(async () => { const r = await linkOpportunityAction(clientId, pid, opportunityId); setError(r.error ?? null); if (!r.error) setOpen(false); })}>
              {pending ? "Vinculando…" : "Vincular"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
