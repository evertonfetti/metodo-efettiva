"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { createFindingAction, generateFindingsAction, updateFindingStatusAction } from "@/features/assessments/actions";
import type { ActionState } from "@/lib/actions";

export function GenerateFindingsButton({ clientId, assessmentId }: { clientId: string; assessmentId: string }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => setState(await generateFindingsAction(clientId, assessmentId)))}>
        {pending ? "Aplicando regras…" : "Gerar achados por regra"}
      </Button>
      {state.message ? <span role="status" className="text-xs font-semibold text-ok">{state.message}</span> : null}
      {state.error ? <span role="alert" className="text-xs font-semibold text-err">{state.error}</span> : null}
    </div>
  );
}

export function FindingActions({ clientId, findingId, status }: { clientId: string; findingId: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (s: "REVIEWED" | "APPROVED" | "DISMISSED") =>
    start(async () => {
      let reason: string | undefined;
      if (s === "DISMISSED") {
        reason = prompt("Motivo do descarte (obrigatório):")?.trim();
        if (!reason) return;
      }
      const r = await updateFindingStatusAction(clientId, findingId, s, reason);
      setError(r.error ?? null);
    });
  if (status === "DISMISSED") return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {status === "DETECTED" ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("REVIEWED")}>Marcar revisado</Button> : null}
      {status !== "APPROVED" ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("APPROVED")}>Aprovar</Button> : null}
      <Button size="sm" variant="ghost" className="text-err" disabled={pending} onClick={() => run("DISMISSED")}>Descartar</Button>
      {error ? <span role="alert" className="text-xs font-semibold text-err">{error}</span> : null}
    </span>
  );
}

export function ManualFindingForm({ clientId, assessmentId, domains }: { clientId: string; assessmentId: string; domains: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createFindingAction.bind(null, clientId), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 p-5">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-type">Tipo</Label>
          <Select id="f-type" name="type" defaultValue="PROBLEM">
            <option value="PROBLEM">Problema</option>
            <option value="OPPORTUNITY">Oportunidade</option>
            <option value="RISK">Risco</option>
            <option value="DATA_GAP">Lacuna de dados</option>
            <option value="STRENGTH">Ponto forte</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-domain">Área</Label>
          <Select id="f-domain" name="domainCode">
            {domains.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-sev">Severidade</Label>
            <Select id="f-sev" name="severity" defaultValue="MEDIUM">
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Média</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="f-conf">Confiança</Label>
            <Select id="f-conf" name="confidence" defaultValue="MEDIUM">
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Média</option>
              <option value="HIGH">Alta</option>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-title">Título *</Label>
        <Input id="f-title" name="title" required aria-invalid={!!state.fieldErrors?.title} />
        <FieldError message={state.fieldErrors?.title} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-desc">Descrição *</Label>
        <Textarea id="f-desc" name="description" required aria-invalid={!!state.fieldErrors?.description} />
        <FieldError message={state.fieldErrors?.description} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="f-ev">Evidência (fonte, documento, fala registrada)</Label>
        <Input id="f-ev" name="evidence" />
      </div>
      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      {state.ok ? <p role="status" className="text-sm font-semibold text-ok">✓ {state.message}</p> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Registrar achado"}</Button></div>
    </form>
  );
}
