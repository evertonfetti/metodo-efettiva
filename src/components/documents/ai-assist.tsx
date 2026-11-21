"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Chip } from "@/components/status-badge";
import { BlocksView } from "./blocks-view";
import { decideAiAction, previewAiAction, requestAiAction } from "@/features/ai/actions";
import type { Block } from "@/features/documents/content";
import { cn } from "@/lib/utils";

export type AiSuggestion = {
  id: string;
  status: string;
  decision: string;
  model: string;
  createdLabel: string;
  errorMessage: string | null;
  blocks: Block[] | null;
  issues: { level: "error" | "warn"; code: string; message: string }[];
  evidence: { ref: string; label: string }[];
  assumptions: string[];
  missingData: string[];
  openQuestions: string[];
  reviewRequests: string[];
  confidence: string | null;
  usage: string | null;
};

type Common = { clientId: string; documentId: string; revisionId: string };

/** Botão "Sugerir com IA": escolhe seções, mostra exatamente o que será enviado e só então enfileira. */
export function AiRequestButton({ ctx, status, sections, currentKey }: { ctx: Common; status: { available: boolean; reason: string | null; model: string }; sections: { key: string; title: string }[]; currentKey: string }) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<string[]>([currentKey]);
  const [instruction, setInstruction] = useState("");
  const [financial, setFinancial] = useState(false);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewAiAction>> | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const router = useRouter();
  if (!status.available)
    return (
      <span className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled aria-describedby="ai-off"><Sparkles className="size-4" aria-hidden="true" /> Sugerir com IA</Button>
        <span id="ai-off" className="max-w-[260px] text-xs font-semibold text-text-subtle">{status.reason}</span>
      </span>
    );
  const input = { sectionKeys: keys, includeFinancial: financial, instruction: instruction.trim() || undefined };
  const items = preview && "preview" in preview && preview.preview ? preview.preview.items : [];
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => { setOpen(true); setKeys([currentKey]); setPreview(null); setMsg({}); }}><Sparkles className="size-4" aria-hidden="true" /> Sugerir com IA</Button>
      <Modal open={open} onOpenChange={setOpen} title="Sugestão com IA (rascunho)" description={`Modelo ${status.model}. A IA só sugere: nada é aplicado sem sua revisão, e números ou evidências sem fonte bloqueiam o aceite.`} wide>
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1">
            <legend className="text-[13px] font-bold text-text-muted">Seções (até 8)</legend>
            <div className="grid max-h-40 gap-1 overflow-y-auto rounded-[8px] border border-border p-2 sm:grid-cols-2">
              {sections.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-navy" checked={keys.includes(s.key)} disabled={!keys.includes(s.key) && keys.length >= 8} onChange={(e) => { setKeys(e.target.checked ? [...keys, s.key] : keys.filter((k) => k !== s.key)); setPreview(null); }} />
                  {s.title}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ai-instr">Orientação para a IA (opcional)</Label>
            <Textarea id="ai-instr" rows={2} maxLength={1000} value={instruction} onChange={(e) => { setInstruction(e.target.value); setPreview(null); }} placeholder="Ex.: priorizar execução simples para equipe de quatro vendedores" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-navy" checked={financial} onChange={(e) => { setFinancial(e.target.checked); setPreview(null); }} />
            <span>Enviar valores financeiros agregados (R$)<span className="block text-xs text-text-subtle">Desmarcado: valores em R$ saem como “[valor omitido]”. Nomes da empresa e de pessoas sempre seguem pseudonimizados.</span></span>
          </label>
          {items.length ? (
            <div className="flex flex-col gap-2 rounded-[8px] border border-border bg-surface-muted p-3 text-sm">
              <p className="font-bold">O que será enviado ao provedor ({items.length} seção(ões))</p>
              {items.map((it) => (
                <details key={it.sectionKey} className="rounded-[6px] bg-surface p-2">
                  <summary className="cursor-pointer font-semibold">{it.title} · ~{it.estimatedInputTokens.toLocaleString("pt-BR")} tokens de entrada{it.estimatedCostUsd != null ? ` · custo máx. estimado US$ ${it.estimatedCostUsd.toFixed(2)}` : ""}</summary>
                  <p className="mt-1 text-xs text-text-muted">Pseudônimos: {it.pseudonymized.join(", ") || "nenhum"}{it.sensitive.length ? ` · Atenção: inclui ${it.sensitive.join("; ")}` : ""}</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-[4px] bg-surface-sunken p-2 text-[11px] whitespace-pre-wrap">{JSON.stringify(it.payload, null, 2)}</pre>
                </details>
              ))}
              {preview && "preview" in preview && preview.preview?.providerNotes ? <p className="text-xs text-text-muted">Provedor: {preview.preview.providerNotes}</p> : null}
            </div>
          ) : null}
          {msg.err || (preview && "error" in preview && preview.error) ? <p role="alert" className="text-sm font-semibold text-err">{msg.err ?? (preview as { error?: string }).error}</p> : null}
          {msg.ok ? <p role="status" className="text-sm font-semibold text-ok">✓ {msg.ok}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={pending || !keys.length} onClick={() => start(async () => setPreview(await previewAiAction(ctx.clientId, ctx.documentId, ctx.revisionId, input)))}>{pending && !items.length ? "Montando…" : "Ver o que será enviado"}</Button>
            <Button disabled={pending || !items.length} title={!items.length ? "Veja a prévia antes de enviar" : undefined} onClick={() => start(async () => { const r = await requestAiAction(ctx.clientId, ctx.documentId, ctx.revisionId, input); if (r.error) setMsg({ err: r.error }); else { setMsg({ ok: r.message }); setOpen(false); router.refresh(); } })}>
              Enviar ao provedor
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Painel da sugestão: antes/depois, problemas de validação, evidências usadas, dados ausentes; Aceitar · Editar · Rejeitar. */
export function AiSuggestionPanel({ ctx, current, suggestions, canEdit, onEdit }: { ctx: Common; current: Block[]; suggestions: AiSuggestion[]; canEdit: boolean; onEdit: (s: AiSuggestion) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const running = suggestions.some((s) => s.status === "QUEUED" || s.status === "RUNNING");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [running, router]);
  const pendingOnes = suggestions.filter((s) => s.decision === "PENDING");
  const history = suggestions.filter((s) => s.decision !== "PENDING");
  if (!suggestions.length) return null;
  return (
    <section aria-label="Sugestões de IA" className="flex flex-col gap-3 border-t border-border px-6 py-4">
      {pendingOnes.map((s) => {
        const errors = s.issues.filter((i) => i.level === "error");
        return (
          <div key={s.id} className="flex flex-col gap-3 rounded-[10px] border-2 border-info/30 bg-info-bg/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="info" symbol="✦">Sugestão IA</Chip>
              <span className="text-xs text-text-muted">{s.model} · {s.createdLabel}{s.usage ? ` · ${s.usage}` : ""}</span>
              {s.confidence ? <Chip tone={s.confidence === "HIGH" ? "ok" : s.confidence === "LOW" ? "warn" : "neutral"}>Confiança {s.confidence === "HIGH" ? "alta" : s.confidence === "LOW" ? "baixa" : "média"}</Chip> : null}
            </div>
            {s.status === "QUEUED" || s.status === "RUNNING" ? <p role="status" className="text-sm text-text-muted">Gerando rascunho… a página atualiza sozinha.</p> : null}
            {s.status === "FAILED" ? <p role="alert" className="text-sm font-semibold text-err">Falhou: {s.errorMessage}</p> : null}
            {s.status === "COMPLETED" && s.blocks ? (
              <>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="max-h-[520px] overflow-auto rounded-[8px] border border-border bg-surface p-3" tabIndex={0} aria-label="Conteúdo atual"><p className="mb-2 text-xs font-bold tracking-[0.5px] text-text-subtle uppercase">Antes</p><BlocksView blocks={current} className="text-sm" /></div>
                  <div className="max-h-[520px] overflow-auto rounded-[8px] border border-ok/40 bg-surface p-3" tabIndex={0} aria-label="Conteúdo sugerido"><p className="mb-2 text-xs font-bold tracking-[0.5px] text-ok uppercase">Depois (sugestão)</p><BlocksView blocks={s.blocks} className="text-sm" /></div>
                </div>
                {s.issues.length ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {s.issues.map((i, k) => <li key={k} className={cn(i.level === "error" ? "font-semibold text-err" : "text-warn")}>{i.level === "error" ? "✕" : "!"} {i.message}</li>)}
                  </ul>
                ) : <p className="text-sm text-ok">✓ Referências, códigos de processo e números conferidos com os dados enviados.</p>}
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div><p className="text-xs font-bold tracking-[0.5px] text-text-muted uppercase">Evidências usadas</p>{s.evidence.length ? <ul className="mt-1 list-disc pl-5">{s.evidence.map((e) => <li key={e.ref}><span className="font-mono text-xs font-bold">{e.ref}</span> {e.label}</li>)}</ul> : <p className="text-text-subtle">Nenhuma.</p>}</div>
                  <div className="flex flex-col gap-2">
                    {[["Dados ausentes", s.missingData], ["Suposições", s.assumptions], ["Perguntas em aberto", s.openQuestions], ["Pedidos de revisão", s.reviewRequests]].map(([t, list]) => (list as string[]).length ? <div key={t as string}><p className="text-xs font-bold tracking-[0.5px] text-text-muted uppercase">{t as string}</p><ul className="list-disc pl-5">{(list as string[]).map((x, k) => <li key={k}>{x}</li>)}</ul></div> : null)}
                  </div>
                </div>
              </>
            ) : null}
            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2">
                {s.status === "COMPLETED" ? (
                  <>
                    <Button size="sm" className="bg-ok hover:bg-ok/90" disabled={pending || errors.length > 0} aria-describedby={errors.length ? `why-${s.id}` : undefined} onClick={() => start(async () => { const r = await decideAiAction(ctx.clientId, ctx.documentId, s.id, { decision: "ACCEPT" }); setErr(r.error ?? null); })}>Aceitar</Button>
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => onEdit(s)}>Editar</Button>
                  </>
                ) : null}
                <Button size="sm" variant="ghost" className="text-err" disabled={pending} onClick={() => setRejecting(s.id)}>Rejeitar</Button>
                {errors.length ? <span id={`why-${s.id}`} className="text-xs font-semibold text-err">Aceite bloqueado: corrija em “Editar” ou rejeite.</span> : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {err ? <p role="alert" className="text-sm font-semibold text-err">{err}</p> : null}
      {history.length ? (
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer font-semibold">Histórico de sugestões desta seção ({history.length})</summary>
          <ul className="mt-1 flex flex-col gap-0.5">{history.map((h) => <li key={h.id}>{h.createdLabel} · {h.model} · {h.decision === "ACCEPTED" ? "aceita" : h.decision === "EDITED" ? "aceita com edição" : "rejeitada"}{h.usage ? ` · ${h.usage}` : ""}</li>)}</ul>
        </details>
      ) : null}
      <Modal open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)} title="Rejeitar sugestão" description="O conteúdo atual da seção não muda.">
        <div className="flex flex-col gap-3">
          <Label htmlFor="rej-note">Motivo (opcional)</Label>
          <Textarea id="rej-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejecting(null)}>Cancelar</Button>
            <Button disabled={pending} onClick={() => start(async () => { const r = await decideAiAction(ctx.clientId, ctx.documentId, rejecting!, { decision: "REJECT", note: note.trim() || undefined }); setErr(r.error ?? null); setRejecting(null); setNote(""); })}>Rejeitar</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
