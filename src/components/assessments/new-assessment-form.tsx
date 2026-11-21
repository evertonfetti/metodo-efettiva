"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { SEGMENTS } from "@/features/clients/catalog";
import { createAssessmentAction } from "@/features/assessments/actions";
import type { ActionState } from "@/lib/actions";

export function NewAssessmentForm({ clientId, defaultSegment, templateName }: { clientId: string; defaultSegment: string; templateName: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createAssessmentAction.bind(null, clientId), {});
  return (
    <form action={action} className="flex flex-col gap-4 p-5">
      <p className="text-sm text-text-muted">Modelo: <b>{templateName}</b>. As perguntas condicionais se ajustam ao segmento escolhido e às respostas.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="segment">Perfil de segmento</Label>
          <Select id="segment" name="segment" defaultValue={defaultSegment}>
            {SEGMENTS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="periodStart">Período de referência — início</Label>
          <Input id="periodStart" name="periodStart" type="date" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="periodEnd">Período de referência — fim</Label>
          <Input id="periodEnd" name="periodEnd" type="date" />
        </div>
      </div>
      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Criando…" : "Iniciar diagnóstico"}</Button></div>
    </form>
  );
}
