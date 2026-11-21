"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Chip } from "@/components/status-badge";
import { BlocksView } from "./blocks-view";
import { regenerateSectionAction, saveSectionAction, setSectionStateAction } from "@/features/documents/actions";
import type { Block, Section } from "@/features/documents/content";
import { cn } from "@/lib/utils";

type Props = { clientId: string; documentId: string; revisionId: string; section: Section; lockVersion: number; readOnly: boolean; readOnlyReason?: string };

const NEW_BLOCK: Record<string, Block> = {
  paragraph: { type: "paragraph", text: "" },
  heading: { type: "heading", level: 3, text: "" },
  list: { type: "list", ordered: false, items: [""] },
  table: { type: "table", kind: "generic", headers: ["Coluna 1", "Coluna 2"], rows: [["", ""]] },
  callout: { type: "callout", tone: "info", text: "" },
};

export function SectionEditor({ clientId, documentId, revisionId, section, lockVersion, readOnly, readOnlyReason }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(section.title);
  const [visibility, setVisibility] = useState(section.visibility);
  const [blocks, setBlocks] = useState<Block[]>(section.blocks);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(true);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [confirmRegen, setConfirmRegen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const change = (fn: (b: Block[]) => Block[]) => {
    setBlocks(fn);
    setDirty(true);
  };
  const update = (i: number, b: Block) => change((bs) => bs.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => change((bs) => { const n = [...bs]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); return n; });
  const finish = (r: { error?: string; message?: string }) => {
    if (r.error) return setMsg({ err: r.error });
    setMsg({ ok: r.message });
    setDirty(false);
    router.refresh();
  };
  const save = () => start(async () => finish(await saveSectionAction(clientId, documentId, revisionId, section.key, { lockVersion, title, visibility, blocks: blocks.map((b) => (b.type === "list" ? { ...b, items: b.items.map((x) => x.trim()).filter(Boolean) } : b)) })));
  const setState = (s: "APPROVED" | "IN_REVIEW") => start(async () => finish(await setSectionStateAction(clientId, documentId, revisionId, section.key, s, lockVersion)));
  const regenerate = (confirm: boolean) =>
    start(async () => {
      const r = await regenerateSectionAction(clientId, documentId, revisionId, section.key, lockVersion, confirm);
      if (r.needsConfirmation) return setConfirmRegen(true);
      setConfirmRegen(false);
      finish(r);
    });

  return (
    <div className="flex min-w-0 flex-col rounded-[12px] border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <Chip tone={visibility === "INTERNO" ? "blocked" : "neutral"} symbol={visibility === "INTERNO" ? "⊘" : "○"}>Visibilidade: {visibility === "INTERNO" ? "INTERNO" : "Cliente"}</Chip>
        <Chip tone="neutral">Origem: {section.origin}</Chip>
        {section.manuallyEdited ? <Chip tone="info" symbol="✎">Editada manualmente</Chip> : null}
        <span className="ml-auto flex items-center gap-2">
          {!readOnly ? (
            <div className="flex rounded-[8px] border border-border p-0.5" role="group" aria-label="Modo">
              {[["Editar", false], ["Prévia", true]].map(([l, v]) => (
                <button key={String(l)} type="button" onClick={() => setPreview(v as boolean)} aria-pressed={preview === v} className={cn("rounded-[6px] px-2.5 py-1 text-xs font-bold", preview === v ? "bg-navy text-white" : "text-text-muted")}>{l as string}</button>
              ))}
            </div>
          ) : null}
          <Button size="sm" variant="secondary" disabled aria-describedby="ai-off"><Sparkles className="size-4" aria-hidden="true" /> Sugerir com IA</Button>
          <span id="ai-off" className="text-xs font-semibold text-text-subtle">IA desativada (Fase 5)</span>
        </span>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5">
        {readOnly && readOnlyReason ? <p className="rounded-[8px] bg-surface-sunken px-3 py-2 text-sm text-text-muted">{readOnlyReason}</p> : null}
        {preview ? (
          <>
            <h2 className="text-xl font-extrabold text-navy">{title}</h2>
            <BlocksView blocks={blocks} />
          </>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="flex flex-col gap-1">
                <Label htmlFor="sec-title">Título da seção</Label>
                <Input id="sec-title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="sec-vis">Visibilidade</Label>
                <Select id="sec-vis" value={visibility} onChange={(e) => { setVisibility(e.target.value as "INTERNO" | "CLIENTE"); setDirty(true); }}>
                  <option value="CLIENTE">Cliente</option>
                  <option value="INTERNO">INTERNO</option>
                </Select>
              </div>
            </div>
            {blocks.map((b, i) => (
              <div key={i} className="group flex gap-2 rounded-[8px] border border-transparent p-1 hover:border-border">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <BlockEditor block={b} onChange={(nb) => update(i, nb)} index={i} />
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <IconBtn label="Mover para cima" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></IconBtn>
                  <IconBtn label="Mover para baixo" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></IconBtn>
                  <IconBtn label="Remover bloco" onClick={() => change((bs) => bs.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></IconBtn>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {([["paragraph", "Parágrafo"], ["heading", "Subtítulo"], ["list", "Lista"], ["table", "Tabela"], ["callout", "Destaque"]] as const).map(([t, l]) => (
                <Button key={t} size="sm" variant="ghost" onClick={() => change((bs) => [...bs, structuredClone(NEW_BLOCK[t]!)])}><Plus className="size-3.5" aria-hidden="true" /> {l}</Button>
              ))}
            </div>
          </>
        )}
      </div>

      {!readOnly ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => regenerate(false)}>Regenerar seção do template</Button>
          <span className="flex-1" />
          {msg.err ? <span role="alert" className="text-sm font-semibold text-err">{msg.err}</span> : null}
          {msg.ok && !dirty ? <span role="status" className="text-sm font-semibold text-ok">✓ {msg.ok}</span> : null}
          {dirty ? <span className="text-sm font-semibold text-warn">Alterações não salvas</span> : null}
          <Button size="sm" variant="secondary" disabled={pending || !dirty} onClick={save}>{pending ? "Salvando…" : "Salvar seção"}</Button>
          {section.state === "APPROVED" ? (
            <Button size="sm" variant="ghost" disabled={pending || dirty} onClick={() => setState("IN_REVIEW")}>Reabrir revisão</Button>
          ) : (
            <Button size="sm" className="bg-ok hover:bg-ok/90" disabled={pending || dirty} title={dirty ? "Salve antes de aprovar" : undefined} onClick={() => setState("APPROVED")}>✓ Aprovar seção</Button>
          )}
        </div>
      ) : null}

      <Modal open={confirmRegen} onOpenChange={setConfirmRegen} title="Substituir edições manuais?" description="Esta seção foi editada à mão. Regenerar troca o conteúdo pelo gerado a partir dos dados atuais do diagnóstico, da biblioteca e do projeto.">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmRegen(false)}>Manter minhas edições</Button>
          <Button disabled={pending} onClick={() => regenerate(true)}>Substituir</Button>
        </div>
      </Modal>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex size-7 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-sunken disabled:opacity-30">
      {children}
    </button>
  );
}

const lines = (s: string) => s.split("\n");

function BlockEditor({ block: b, onChange, index }: { block: Block; onChange: (b: Block) => void; index: number }) {
  const id = `blk-${index}`;
  switch (b.type) {
    case "heading":
      return <Input id={id} aria-label="Subtítulo" value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} className="font-extrabold text-navy" />;
    case "paragraph":
      return <Textarea id={id} aria-label="Parágrafo" value={b.text} rows={Math.max(2, Math.ceil(b.text.length / 90))} onChange={(e) => onChange({ ...b, text: e.target.value })} />;
    case "callout":
      return (
        <div className="flex flex-col gap-1">
          <Select aria-label="Tipo de destaque" value={b.tone} onChange={(e) => onChange({ ...b, tone: e.target.value as "info" | "warn" })} className="min-h-8 w-40 text-xs">
            <option value="info">Destaque informativo</option>
            <option value="warn">Destaque de atenção</option>
          </Select>
          <Textarea aria-label="Texto do destaque" value={b.text} rows={2} onChange={(e) => onChange({ ...b, text: e.target.value })} className={b.tone === "warn" ? "bg-amber-50" : "bg-surface-sunken"} />
        </div>
      );
    case "list":
      return (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-xs font-semibold text-text-muted">
            <input type="checkbox" checked={b.ordered} onChange={(e) => onChange({ ...b, ordered: e.target.checked })} className="size-3.5 accent-navy" /> Lista numerada (passos) · um item por linha
          </label>
          <Textarea aria-label="Itens da lista" value={b.items.join("\n")} rows={Math.min(14, Math.max(3, b.items.length + 1))} onChange={(e) => onChange({ ...b, items: lines(e.target.value) })} />
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>{b.headers.map((h, j) => <th key={j} className="bg-navy p-1"><input aria-label={`Cabeçalho ${j + 1}`} value={h} onChange={(e) => onChange({ ...b, headers: b.headers.map((x, k) => (k === j ? e.target.value : x)) })} className="w-full bg-transparent px-1 text-xs font-bold text-white outline-none placeholder:text-white/60" /></th>)}<th className="w-8 bg-navy" /></tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border">
                  {b.headers.map((_, ci) => (
                    <td key={ci} className="p-1 align-top">
                      <textarea aria-label={`Linha ${ri + 1}, ${b.headers[ci]}`} value={r[ci] ?? ""} rows={Math.max(1, Math.ceil((r[ci] ?? "").length / 40))} onChange={(e) => onChange({ ...b, rows: b.rows.map((row, k) => (k === ri ? b.headers.map((__, c) => (c === ci ? e.target.value : (row[c] ?? ""))) : row)) })} className={cn("w-full resize-y rounded-[4px] border border-transparent px-1 py-0.5 text-sm hover:border-border focus:border-navy", /\[PENDENTE/.test(r[ci] ?? "") && "bg-amber-50 font-semibold")} />
                    </td>
                  ))}
                  <td className="p-1 align-top"><IconBtn label={`Remover linha ${ri + 1}`} onClick={() => onChange({ ...b, rows: b.rows.filter((_, k) => k !== ri) })}><Trash2 className="size-3.5" /></IconBtn></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...b, rows: [...b.rows, b.headers.map(() => "")] })}><Plus className="size-3.5" aria-hidden="true" /> Linha</Button>
        </div>
      );
  }
}
