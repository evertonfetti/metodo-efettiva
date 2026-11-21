"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { updateProcessAction } from "@/features/processes/actions";
import type { ActionState } from "@/lib/actions";
import type { ProcessContent } from "@/features/processes/content";

type Props = { code: string; version: number; name: string; objective: string; active: boolean; content: ProcessContent | null };

const FIELDS: { key: keyof ProcessContent; label: string; hint?: string; rows?: number }[] = [
  { key: "trigger", label: "Gatilho" },
  { key: "inputs", label: "Entradas" },
  { key: "roles", label: "Responsáveis" },
  { key: "steps", label: "Passos", hint: "Um passo por linha.", rows: 8 },
  { key: "approach", label: "Exemplo de abordagem" },
  { key: "cadence", label: "Cadência" },
  { key: "kpis", label: "KPIs", hint: "Um indicador por linha.", rows: 5 },
  { key: "exceptions", label: "Exceções" },
  { key: "controls", label: "Controles" },
  { key: "validation", label: "Critério de validação", hint: "Separe critérios por ponto e vírgula: viram checklist da tarefa de validação." },
];

export function ProcessEditForm({ code, version, name, objective, active, content }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProcessAction.bind(null, code), {});
  const err = state.fieldErrors ?? {};
  const value = (k: keyof ProcessContent) => {
    const v = content?.[k];
    return Array.isArray(v) ? v.join("\n") : (v ?? "");
  };
  return (
    <form action={action} className="flex flex-col gap-4 p-6" noValidate>
      <input type="hidden" name="expectedVersion" value={version} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="p-name">Nome *</Label>
        <Input id="p-name" name="name" defaultValue={name} required aria-invalid={!!err.name} aria-describedby={err.name ? "e-name" : undefined} />
        <FieldError id="e-name" message={err.name} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="p-obj">Objetivo *</Label>
        <Textarea id="p-obj" name="objective" defaultValue={objective} required aria-invalid={!!err.objective} aria-describedby={err.objective ? "e-obj" : undefined} />
        <FieldError id="e-obj" message={err.objective} />
      </div>
      {FIELDS.map((f) => {
        const key = `content.${f.key}`;
        return (
          <div key={f.key} className="flex flex-col gap-1">
            <Label htmlFor={`p-${f.key}`}>{f.label}</Label>
            {f.hint ? <p id={`h-${f.key}`} className="text-xs text-text-subtle">{f.hint}</p> : null}
            <Textarea id={`p-${f.key}`} name={f.key} defaultValue={value(f.key)} rows={f.rows ?? 3} aria-describedby={f.hint ? `h-${f.key}` : undefined} aria-invalid={!!err[key]} />
            <FieldError message={err[key]} />
          </div>
        );
      })}
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="active" defaultChecked={active} className="size-4 accent-navy" /> Processo ativo (aparece em sugestões e seletores)
      </label>
      <div className="flex flex-col gap-1 rounded-[8px] border border-border bg-surface-muted p-4">
        <Label htmlFor="p-notes">O que mudou nesta versão? *</Label>
        <Input id="p-notes" name="changeNotes" required placeholder="Ex.: cadência ajustada ao ciclo de 30 dias" aria-invalid={!!err.changeNotes} aria-describedby={err.changeNotes ? "e-notes" : undefined} />
        <FieldError id="e-notes" message={err.changeNotes} />
        <p className="text-xs text-text-subtle">Salvar cria a versão {version + 1}. A versão {version} continua no histórico e projetos existentes não mudam.</p>
      </div>
      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : `Salvar versão ${version + 1}`}</Button>
        <Button asChild variant="secondary"><Link href={`/biblioteca/${code}`}>Cancelar</Link></Button>
      </div>
    </form>
  );
}
