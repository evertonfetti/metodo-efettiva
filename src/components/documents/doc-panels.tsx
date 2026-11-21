"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { approveRevisionAction, createRevisionAction, publishRevisionAction, requestExportAction } from "@/features/documents/actions";

type Exp = { id: string; format: string; audience: string; isDraft: boolean; status: string; version: number; createdLabel: string; error: string | null };

/** Painel de exportação: audiência, formatos, exclusões e lista com status/progresso (atualiza sozinho). */
export function ExportPanel({ clientId, documentId, revisionId, isDraft, internalTitles, exports, canExport }: { clientId: string; documentId: string; revisionId: string; isDraft: boolean; internalTitles: string[]; exports: Exp[]; canExport: boolean }) {
  const router = useRouter();
  const [audience, setAudience] = useState<"CLIENTE" | "INTERNO">("CLIENTE");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const running = exports.some((e) => e.status === "QUEUED" || e.status === "RUNNING");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [running, router]);
  const go = (format: string) => start(async () => { const r = await requestExportAction(clientId, documentId, revisionId, format, audience); setErr(r.error ?? null); router.refresh(); });
  return (
    <section aria-labelledby="exp-title" className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface p-4">
      <h2 id="exp-title" className="text-[15px] font-extrabold text-navy">Exportar</h2>
      {canExport ? (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="aud">Audiência</Label>
            <Select id="aud" value={audience} onChange={(e) => setAudience(e.target.value as "CLIENTE" | "INTERNO")}>
              <option value="CLIENTE">Cliente</option>
              <option value="INTERNO">Interno Efettiva</option>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["DOCX", "PDF", "MD"].map((f) => <Button key={f} size="sm" variant="secondary" disabled={pending} onClick={() => go(f)}>{f}</Button>)}
          </div>
          <p className="text-xs text-text-muted">
            {audience === "CLIENTE" ? (internalTitles.length ? `Arquivo para o cliente sai sem: ${internalTitles.join(", ")} (interna).` : "Nenhuma seção interna neste documento.") : "Arquivo interno inclui todas as seções."}{" "}
            {isDraft ? "Versão não aprovada sai com marca d'água “RASCUNHO”." : "Versão aprovada: arquivo final."}
          </p>
          {err ? <p role="alert" className="text-xs font-semibold text-err">{err}</p> : null}
        </>
      ) : <p className="text-xs text-text-muted">Perfil somente leitura: exportação indisponível.</p>}
      {exports.length ? (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {exports.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-2 text-xs">
              <span className="min-w-0 flex-1">
                <span className="font-bold">{e.format} · v{e.version} · {e.audience === "CLIENTE" ? "Cliente" : "Interno"}{e.isDraft ? " · rascunho" : ""}</span>
                <span className="block text-text-subtle">{e.createdLabel}{e.error ? ` · ${e.error}` : ""}</span>
              </span>
              {e.status === "COMPLETED" ? (
                <a href={`/api/v1/clients/${clientId}/exports/${e.id}/download`} className="flex size-8 items-center justify-center rounded-[8px] text-navy hover:bg-surface-sunken" aria-label={`Baixar ${e.format} v${e.version}`}><Download className="size-4" aria-hidden="true" /></a>
              ) : (
                <StatusBadge context="job" value={e.status} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Ações da versão: aprovar (desabilitado com motivo), publicar e criar nova versão. */
export function RevisionActions({ clientId, documentId, revisionId, state, blockers, isLatest, canEdit }: { clientId: string; documentId: string; revisionId: string; state: string; blockers: string[]; isLatest: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  if (!canEdit) return null;
  const run = (fn: () => Promise<{ error?: string; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.error ? { err: r.error } : { ok: r.message }); });
  const open = state === "DRAFT" || state === "READY_FOR_REVIEW";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {open ? (
          <Button disabled={pending || blockers.length > 0} aria-describedby={blockers.length ? "approve-why" : undefined} onClick={() => run(() => approveRevisionAction(clientId, documentId, revisionId))}>Aprovar versão</Button>
        ) : null}
        {state === "APPROVED" ? <Button variant="secondary" disabled={pending} onClick={() => run(() => publishRevisionAction(clientId, documentId, revisionId))}>Publicar</Button> : null}
        {!open && isLatest ? <Button variant={state === "APPROVED" ? "ghost" : "secondary"} disabled={pending} onClick={() => run(() => createRevisionAction(clientId, documentId))}>Nova versão</Button> : null}
      </div>
      {open && blockers.length ? <span id="approve-why" className="max-w-md text-right text-xs font-semibold text-err">{blockers.join(" · ")}</span> : null}
      {msg.err ? <span role="alert" className="max-w-md text-right text-xs font-semibold text-err">{msg.err}</span> : null}
      {msg.ok ? <span role="status" className="text-xs font-semibold text-ok">✓ {msg.ok}</span> : null}
    </div>
  );
}

export function CompareLink({ href, label }: { href: string; label: string }) {
  return <Button asChild variant="secondary"><Link href={href}>{label}</Link></Button>;
}
