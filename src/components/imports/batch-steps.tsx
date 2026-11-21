"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { commitBatchAction, revalidateBatchAction, saveMappingAction, sourceValidatedAction } from "@/features/imports/actions";
import { cn } from "@/lib/utils";

type Field = { key: string; label: string; required: boolean; example: string };

export function MappingForm({ clientId, batchId, fields, headers, mapping, sheets, sheet, fromProfile }: { clientId: string; batchId: string; fields: Field[]; headers: string[]; mapping: Record<string, string | null>; sheets: string[]; sheet: string | null; fromProfile: boolean }) {
  const [m, setM] = useState(mapping);
  const [sh, setSh] = useState(sheet ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const missing = fields.filter((f) => f.required && !m[f.key]);
  return (
    <div className="flex flex-col gap-4 p-6">
      <p className="text-sm text-text-muted">{fromProfile ? "Mapeamento sugerido a partir do perfil salvo deste cliente." : "Mapeamento sugerido pelos nomes das colunas."} Confira cada campo; o mapeamento fica salvo para os próximos envios.</p>
      {sheets.length > 1 ? (
        <div className="flex max-w-sm flex-col gap-1">
          <Label htmlFor="sheet">Aba da planilha</Label>
          <Select id="sheet" value={sh} onChange={(e) => setSh(e.target.value)}>{sheets.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          <span className="text-xs text-text-subtle">Trocar a aba relê o cabeçalho ao salvar.</span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase"><th className="py-2 pr-3">Campo do sistema</th><th className="py-2 pr-3">Coluna do arquivo</th><th className="py-2">Exemplo esperado</th></tr></thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.key} className="border-t border-border">
                <td className="py-2 pr-3"><label htmlFor={`map-${f.key}`} className="font-bold">{f.label}{f.required ? " *" : ""}</label></td>
                <td className="py-2 pr-3">
                  <Select id={`map-${f.key}`} value={m[f.key] ?? ""} onChange={(e) => setM({ ...m, [f.key]: e.target.value || null })} aria-invalid={f.required && !m[f.key]} className={cn("min-h-9", f.required && !m[f.key] && "border-err")}>
                    <option value="">{f.required ? "Selecione…" : "Não importar"}</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </td>
                <td className="py-2 font-mono text-xs text-text-muted">{f.example || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err ? <p role="alert" className="text-sm font-semibold text-err">{err}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending || missing.length > 0} aria-describedby={missing.length ? "map-why" : undefined} onClick={() => start(async () => { const r = await saveMappingAction(clientId, batchId, m, sh || undefined); setErr(r.error ?? null); })}>
          {pending ? "Validando todas as linhas…" : "Salvar mapeamento e validar"}
        </Button>
        {missing.length ? <span id="map-why" className="text-xs font-semibold text-err">Obrigatórios sem coluna: {missing.map((f) => f.label).join(", ")}</span> : null}
      </div>
    </div>
  );
}

export function ValidatedActions({ clientId, batchId, accepted, rejected }: { clientId: string; batchId: string; accepted: number; rejected: number }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={pending || accepted === 0} onClick={() => setOpen(true)}>Importar {accepted.toLocaleString("pt-BR")} linha(s) válida(s)</Button>
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await revalidateBatchAction(clientId, batchId); setErr(r.error ?? null); })}>Validar de novo</Button>
      {err ? <span role="alert" className="text-sm font-semibold text-err">{err}</span> : null}
      <Modal open={open} onOpenChange={setOpen} title="Confirmar importação?" description={rejected ? `${rejected.toLocaleString("pt-BR")} linha(s) com erro serão ignoradas (baixe o arquivo de erros para corrigir e reenviar).` : "Todas as linhas passaram na validação."}>
        <p className="mb-4 text-sm text-text-muted">A gravação roda em segundo plano e é idempotente: registros iguais não são duplicados e alterados são atualizados pela origem + ID externo. Os indicadores são recalculados ao final.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={pending} onClick={() => start(async () => { const r = await commitBatchAction(clientId, batchId); setErr(r.error ?? null); setOpen(false); })}>{pending ? "Enviando…" : "Importar"}</Button>
        </div>
      </Modal>
    </div>
  );
}

/** Atualiza a página enquanto o lote está sendo gravado pelo worker. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

export function SourceValidatedToggle({ clientId, batchId, value }: { clientId: string; batchId: string; value: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={value} disabled={pending} onChange={(e) => start(async () => { await sourceValidatedAction(clientId, batchId, e.target.checked); })} className="size-4 accent-navy" />
      Fonte validada com o cliente (remove o alerta FONTE_NAO_VALIDADA)
    </label>
  );
}
