"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { uploadImportAction } from "@/features/imports/actions";
import type { ActionState } from "@/lib/actions";

type T = { code: string; label: string; description: string };

export function UploadForm({ clientId, types, defaultType, maxMb }: { clientId: string; types: T[]; defaultType: string; maxMb: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadImportAction.bind(null, clientId), {});
  const [type, setType] = useState(defaultType);
  const err = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5 p-6" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-extrabold text-navy">1 · Tipo de arquivo</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => (
            <label key={t.code} className={`flex cursor-pointer flex-col gap-0.5 rounded-[8px] border-2 p-3 text-sm ${type === t.code ? "border-navy bg-surface-muted" : "border-border"}`}>
              <span className="flex items-center gap-2 font-bold"><input type="radio" name="type" value={t.code} checked={type === t.code} onChange={() => setType(t.code)} className="size-4 accent-navy" /> {t.label}</span>
              <span className="text-xs text-text-muted">{t.description}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-text-subtle">Ordem recomendada: clientes → produtos → vendas → itens de venda → orçamentos (vendas e orçamentos referenciam clientes; itens referenciam vendas e produtos).</p>
      </fieldset>
      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-1 text-sm font-extrabold text-navy">2 · Arquivo</legend>
        <div className="flex flex-col gap-1">
          <Label htmlFor="i-src">Sistema de origem *</Label>
          <Input id="i-src" name="sourceSystem" placeholder="Ex.: ERP Sankhya, planilha comercial" aria-invalid={!!err.sourceSystem} />
          <span className="text-xs text-text-subtle">Origem + ID externo identificam cada registro: reimportar não duplica.</span>
          <FieldError message={err.sourceSystem} />
        </div>
        {type === "SALES" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="i-kind">O arquivo representa *</Label>
            <Select id="i-kind" name="recordKind" defaultValue="" aria-invalid={!!err.recordKind}>
              <option value="" disabled>Selecione</option>
              <option value="ORDER">Pedidos (valor comercial registrado)</option>
              <option value="INVOICE">Faturamento (notas emitidas)</option>
            </Select>
            <span className="text-xs text-text-subtle">Pedido não é chamado de receita líquida nos indicadores.</span>
            <FieldError message={err.recordKind} />
          </div>
        ) : null}
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label htmlFor="i-file">Arquivo CSV ou XLSX * (até {maxMb} MB)</Label>
          <Input id="i-file" name="file" type="file" accept=".csv,.txt,.xlsx" className="py-1.5" aria-invalid={!!err.file} />
          <span className="text-xs text-text-subtle">CSV com “;” ou “,”, UTF-8 ou Latin-1; números como 1.234,56 e datas como 31/12/2025. XLSX: só valores (macros são rejeitadas).</span>
          <FieldError message={err.file} />
        </div>
      </fieldset>
      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Lendo arquivo…" : "Enviar e mapear colunas"}</Button></div>
    </form>
  );
}
