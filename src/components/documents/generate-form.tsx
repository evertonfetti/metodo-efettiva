"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Select } from "@/components/ui/input";
import { generateDocumentAction } from "@/features/documents/actions";
import type { ActionState } from "@/lib/actions";

type Proj = { id: string; name: string; processes: { code: string; name: string }[] };

export function GenerateDocumentForm({ clientId, projects, defaultProjectId }: { clientId: string; projects: Proj[]; defaultProjectId?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(generateDocumentAction.bind(null, clientId), {});
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [type, setType] = useState("PLAYBOOK");
  const procs = projects.find((p) => p.id === projectId)?.processes ?? [];
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="g-proj">Projeto</Label>
          <Select id="g-proj" name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-invalid={!!err.projectId}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <FieldError message={err.projectId} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="g-type">Documento</Label>
          <Select id="g-type" name="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="PLAYBOOK">Playbook completo do cliente</option>
            <option value="POP">POP de um processo</option>
          </Select>
        </div>
        {type === "POP" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="g-proc">Processo</Label>
            <Select id="g-proc" name="processCode" aria-invalid={!!err.processCode}>
              {procs.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
            </Select>
            <FieldError message={err.processCode} />
          </div>
        ) : null}
      </div>
      <p className="text-sm text-text-muted">
        Gerado sem IA a partir do cadastro, do último diagnóstico fechado, das oportunidades, do projeto e das fichas versionadas da biblioteca. Lacunas aparecem como [PENDENTE: …] para você completar.
      </p>
      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      <div><Button type="submit" disabled={pending || !projectId}>{pending ? "Gerando…" : "Gerar documento"}</Button></div>
    </form>
  );
}
