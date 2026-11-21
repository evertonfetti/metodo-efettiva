"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/status-badge";
import { setExternalAiAction } from "@/features/ai/actions";

/** Autorização por cliente para enviar dados minimizados ao provedor de IA (8.6: padrão desligado). */
export function ExternalAiCard({ clientId, allowed, providerNotes, canEdit }: { clientId: string; allowed: boolean; providerNotes: string; canEdit: boolean }) {
  const [ack, setAck] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  return (
    <section aria-labelledby="ia-ext" className="flex max-w-[880px] flex-col gap-3 rounded-[12px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ia-ext" className="text-[17px] font-extrabold text-navy">IA externa para este cliente</h2>
        {allowed ? <Chip tone="ok" symbol="✓">Autorizada</Chip> : <Chip tone="neutral" symbol="○">Não autorizada</Chip>}
      </div>
      <p className="text-sm text-text-muted">
        Com autorização, trechos minimizados (agregados, sem base de vendas, com nomes da empresa e de pessoas pseudonimizados) podem ser enviados ao provedor de IA para gerar rascunhos.
        A IA não altera indicadores nem publica nada; cada sugestão passa por revisão. Antes de autorizar, confirme que o contrato com o cliente e a política interna permitem o envio{providerNotes ? ` (${providerNotes})` : ""}.
      </p>
      {canEdit ? (
        allowed ? (
          <div><Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await setExternalAiAction(clientId, false, false); setMsg(r.error ? { err: r.error } : { ok: r.message }); })}>Remover autorização</Button></div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-navy" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Confirmo que o envio de dados minimizados deste cliente ao provedor de IA está autorizado pela política interna e pelas condições acordadas com o cliente.</label>
            <div><Button disabled={pending || !ack} onClick={() => start(async () => { const r = await setExternalAiAction(clientId, true, ack); setMsg(r.error ? { err: r.error } : { ok: r.message }); })}>Autorizar IA externa</Button></div>
          </div>
        )
      ) : null}
      {msg.ok ? <p role="status" className="text-sm font-semibold text-ok">✓ {msg.ok}</p> : null}
      {msg.err ? <p role="alert" className="text-sm font-semibold text-err">{msg.err}</p> : null}
    </section>
  );
}
