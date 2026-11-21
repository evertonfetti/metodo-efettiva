"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Chip, StatusBadge } from "@/components/status-badge";
import { addTaskEvidenceAction, deleteTaskAction, saveTaskAction } from "@/features/projects/actions";
import { cn } from "@/lib/utils";

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dueDate: string | null; // AAAA-MM-DD
  dueLabel: string | null;
  completedLabel: string | null;
  overdueDays: number;
  processCode: string | null;
  projectProcessId: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  externalOwnerName: string | null;
  blockedReason: string | null;
  notes: string | null;
  checklist: { text: string; done: boolean }[];
  evidences: { id: string; label: string; href: string | null }[];
};

type Ctx = { clientId: string; projectId: string; users: { id: string; name: string }[]; processes: { id: string; code: string; name: string }[]; canEdit: boolean };

const COLUMNS: { status: BoardTask["status"]; label: string }[] = [
  { status: "TODO", label: "Pendente" },
  { status: "IN_PROGRESS", label: "Em andamento" },
  { status: "BLOCKED", label: "Bloqueada" },
  { status: "DONE", label: "Concluída" },
];
const COLUMN_LIMIT = 8;
const PRIORITY: Record<BoardTask["priority"], string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" };

function Owners({ t }: { t: BoardTask }) {
  return (
    <span className="flex flex-wrap gap-x-3 text-xs text-text-muted">
      {t.assigneeName ? <span>Efettiva: {t.assigneeName}</span> : null}
      {t.externalOwnerName ? <span>Cliente: {t.externalOwnerName}</span> : null}
    </span>
  );
}

export function TaskBoard({ tasks, view, ctx, openNew }: { tasks: BoardTask[]; view: "quadro" | "lista"; ctx: Ctx; openNew: boolean }) {
  const [editing, setEditing] = useState<BoardTask | "new" | null>(openNew && ctx.canEdit ? "new" : null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const close = () => {
    setEditing(null);
    if (openNew) router.replace(window.location.pathname + window.location.search.replace(/([?&])nova=1&?/, "$1").replace(/[?&]$/, ""), { scroll: false });
  };
  const current = editing && editing !== "new" ? (tasks.find((t) => t.id === editing.id) ?? editing) : editing;

  return (
    <>
      {ctx.canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden="true" /> Nova tarefa</Button>
        </div>
      ) : null}
      {view === "quadro" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const all = tasks.filter((t) => t.status === col.status);
            const items = expanded[col.status] ? all : all.slice(0, COLUMN_LIMIT);
            return (
              <section key={col.status} aria-label={`${col.label}: ${all.length}`} className="flex flex-col gap-2 rounded-[12px] bg-kanban p-3">
                <h3 className="px-1 text-sm font-extrabold text-navy">{col.label} · {all.length}</h3>
                {items.length === 0 ? <p className="px-1 py-4 text-center text-xs text-text-subtle">Nenhuma tarefa</p> : null}
                {items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setEditing(t)}
                    className={cn("flex flex-col gap-1.5 rounded-[8px] border bg-surface p-3 text-left hover:border-navy", t.overdueDays ? "border-border-alert" : "border-border")}
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      {t.processCode ? <span className="rounded-[4px] bg-navy px-1.5 font-mono text-[11px] font-bold text-white">{t.processCode}</span> : null}
                      {t.overdueDays ? <Chip tone="err" symbol="!">Vencida há {t.overdueDays} {t.overdueDays === 1 ? "dia" : "dias"}</Chip> : null}
                      {t.status === "BLOCKED" ? <Chip tone="blocked" symbol="⊘">Bloqueada</Chip> : null}
                      {t.status === "DONE" && t.completedLabel ? <Chip tone="ok" symbol="✓">Concluída em {t.completedLabel}</Chip> : null}
                      {t.priority === "HIGH" || t.priority === "CRITICAL" ? <Chip tone="warn" symbol="↑">{PRIORITY[t.priority]}</Chip> : null}
                    </span>
                    <span className="text-sm font-bold text-text">{t.title}</span>
                    {t.status === "BLOCKED" && t.blockedReason ? <span className="text-xs text-blocked">Impedimento: {t.blockedReason}</span> : null}
                    <Owners t={t} />
                    <span className="text-xs text-text-subtle">
                      {t.dueLabel ? `Prazo ${t.dueLabel}` : "Sem prazo"}
                      {t.checklist.length ? ` · checklist ${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : ""}
                      {t.evidences.length ? ` · ${t.evidences.length} evidência(s)` : ""}
                    </span>
                  </button>
                ))}
                {all.length > COLUMN_LIMIT ? (
                  <button type="button" className="rounded-[8px] px-2 py-1.5 text-xs font-bold text-navy hover:bg-surface" aria-expanded={!!expanded[col.status]} onClick={() => setExpanded((e) => ({ ...e, [col.status]: !e[col.status] }))}>
                    {expanded[col.status] ? "Mostrar menos" : `Mostrar mais ${all.length - COLUMN_LIMIT} (ordenadas por prazo)`}
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-border bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase">
                <th className="px-5 py-3 font-bold">Prazo</th>
                <th className="px-3 py-3 font-bold">Tarefa</th>
                <th className="px-3 py-3 font-bold">Processo</th>
                <th className="px-3 py-3 font-bold">Responsáveis</th>
                <th className="px-3 py-3 font-bold">Prioridade</th>
                <th className="px-3 py-3 font-bold">Checklist</th>
                <th className="px-5 py-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? <tr><td colSpan={7} className="px-5 py-8 text-center text-text-subtle">Nenhuma tarefa com esses filtros.</td></tr> : null}
              {tasks.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-surface-muted">
                  <td className="px-5 py-3 whitespace-nowrap">{t.dueLabel ?? "—"}{t.overdueDays ? <span className="block text-xs font-bold text-err">Vencida há {t.overdueDays} d</span> : null}</td>
                  <td className="px-3 py-3"><button type="button" className="text-left font-bold text-navy hover:underline" onClick={() => setEditing(t)}>{t.title}</button></td>
                  <td className="px-3 py-3 font-mono font-bold">{t.processCode ?? "—"}</td>
                  <td className="px-3 py-3"><Owners t={t} /></td>
                  <td className="px-3 py-3">{PRIORITY[t.priority]}</td>
                  <td className="px-3 py-3">{t.checklist.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : "—"}</td>
                  <td className="px-5 py-3"><StatusBadge context="task" value={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {current ? <TaskEditor key={current === "new" ? "new" : current.id} task={current === "new" ? null : current} ctx={ctx} onClose={close} /> : null}
    </>
  );
}

function TaskEditor({ task, ctx, onClose }: { task: BoardTask | null; ctx: Ctx; onClose: () => void }) {
  const ro = !ctx.canEdit;
  const [checklist, setChecklist] = useState(task?.checklist ?? []);
  const [status, setStatus] = useState<BoardTask["status"]>(task?.status ?? "TODO");
  const [item, setItem] = useState("");
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ error?: string; fieldErrors?: Record<string, string>; message?: string }>({});
  const [evText, setEvText] = useState("");
  const [evFile, setEvFile] = useState<File | null>(null);
  const err = state.fieldErrors ?? {};

  const save = (fd: FormData) =>
    start(async () => {
      const input = { ...Object.fromEntries(fd.entries()), checklist };
      const r = await saveTaskAction(ctx.clientId, ctx.projectId, task?.id ?? null, input);
      setState(r);
      if (!r.error) onClose();
    });
  const remove = () =>
    start(async () => {
      if (!task || !confirm("Excluir esta tarefa?")) return;
      const r = await deleteTaskAction(ctx.clientId, ctx.projectId, task.id);
      setState(r);
      if (!r.error) onClose();
    });
  const addEvidence = () =>
    start(async () => {
      if (!task) return;
      let fileAssetId: string | undefined;
      if (evFile) {
        const body = new FormData();
        body.set("file", evFile);
        const res = await fetch(`/api/v1/clients/${ctx.clientId}/files`, { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
        if (!res.ok || !json.id) return setState({ error: json.message ?? "Falha no envio do arquivo." });
        fileAssetId = json.id;
      }
      const t = evText.trim();
      const r = await addTaskEvidenceAction(ctx.clientId, ctx.projectId, task.id, { fileAssetId, ...(/^https?:\/\//i.test(t) ? { url: t } : t ? { text: t } : {}) });
      setState(r.error ? r : { message: "✓ Evidência registrada." });
      if (!r.error) {
        setEvText("");
        setEvFile(null);
      }
    });

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={task ? "Tarefa" : "Nova tarefa"} wide>
      <form action={save} className="flex flex-col gap-3" noValidate>
        <fieldset disabled={ro || pending} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="t-title">Título *</Label>
            <Input id="t-title" name="title" defaultValue={task?.title} aria-invalid={!!err.title} />
            <FieldError message={err.title} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="t-status">Status</Label>
              <Select id="t-status" name="status" value={status} onChange={(e) => setStatus(e.target.value as BoardTask["status"])}>
                {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="t-due">Prazo</Label>
              <Input id="t-due" type="date" name="dueDate" defaultValue={task?.dueDate ?? ""} aria-invalid={!!err.dueDate} />
              <FieldError message={err.dueDate} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="t-prio">Prioridade</Label>
              <Select id="t-prio" name="priority" defaultValue={task?.priority ?? "MEDIUM"}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
          {status === "BLOCKED" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="t-block">Impedimento *</Label>
              <Input id="t-block" name="blockedReason" defaultValue={task?.blockedReason ?? ""} aria-invalid={!!err.blockedReason} />
              <FieldError message={err.blockedReason} />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="t-proc">Processo</Label>
              <Select id="t-proc" name="projectProcessId" defaultValue={task?.projectProcessId ?? ""}>
                <option value="">Geral do projeto</option>
                {ctx.processes.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="t-assignee">Responsável Efettiva</Label>
              <Select id="t-assignee" name="assigneeUserId" defaultValue={task?.assigneeUserId ?? ""} aria-invalid={!!err.assigneeUserId}>
                <option value="">Nenhum</option>
                {ctx.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
              <FieldError message={err.assigneeUserId} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="t-ext">Responsável no cliente</Label>
              <Input id="t-ext" name="externalOwnerName" defaultValue={task?.externalOwnerName ?? ""} placeholder="Ex.: Gerente comercial" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="t-desc">Descrição</Label>
            <Textarea id="t-desc" name="description" rows={3} defaultValue={task?.description ?? ""} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-bold text-text-muted">Checklist</span>
            <ul className="flex flex-col gap-1">
              {checklist.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.done} onChange={(e) => setChecklist(checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} className="size-4 accent-navy" aria-label={c.text} />
                  <span className={cn("flex-1", c.done && "text-text-subtle line-through")}>{c.text}</span>
                  {!ro ? <button type="button" className="flex size-7 items-center justify-center rounded-[6px] text-text-muted hover:bg-surface-sunken" aria-label={`Remover item ${c.text}`} onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}><X className="size-3.5" aria-hidden="true" /></button> : null}
                </li>
              ))}
            </ul>
            {!ro ? (
              <div className="flex gap-2">
                <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Novo item" aria-label="Novo item do checklist" className="min-h-9"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (item.trim()) { setChecklist([...checklist, { text: item.trim(), done: false }]); setItem(""); } } }} />
                <Button type="button" size="sm" variant="secondary" disabled={!item.trim()} onClick={() => { setChecklist([...checklist, { text: item.trim(), done: false }]); setItem(""); }}>Adicionar</Button>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="t-notes">Observações</Label>
            <Textarea id="t-notes" name="notes" rows={2} defaultValue={task?.notes ?? ""} />
          </div>
        </fieldset>
        {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
        {!ro ? (
          <div className="flex flex-wrap justify-between gap-2">
            {task && task.status !== "DONE" && task.evidences.length === 0 ? (
              <Button type="button" variant="ghost" className="text-err" disabled={pending} onClick={remove}><Trash2 className="size-4" aria-hidden="true" /> Excluir</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? "Salvando…" : task ? "Salvar tarefa" : "Criar tarefa"}</Button>
            </div>
          </div>
        ) : null}
      </form>
      {task ? (
        <section className="mt-5 flex flex-col gap-2 border-t border-border pt-4" aria-labelledby="t-ev">
          <h3 id="t-ev" className="text-sm font-extrabold text-navy">Evidências de execução</h3>
          {task.evidences.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {task.evidences.map((e) => (
                <li key={e.id} className="flex items-center gap-2"><Paperclip className="size-3.5 text-text-subtle" aria-hidden="true" />{e.href ? <a href={e.href} className="text-navy underline" target={e.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{e.label}</a> : e.label}</li>
              ))}
            </ul>
          ) : <p className="text-sm text-text-subtle">Nenhuma evidência registrada.</p>}
          {!ro ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={evText} onChange={(e) => setEvText(e.target.value)} placeholder="Texto ou link (https://…)" aria-label="Texto ou link da evidência" />
              <Input type="file" aria-label="Arquivo da evidência" onChange={(e) => setEvFile(e.target.files?.[0] ?? null)} className="py-1.5 sm:max-w-[220px]" />
              <Button type="button" variant="secondary" disabled={pending || (!evText.trim() && !evFile)} onClick={addEvidence}>Registrar</Button>
            </div>
          ) : null}
          {state.message ? <p role="status" className="text-xs font-semibold text-ok">{state.message}</p> : null}
        </section>
      ) : null}
    </Modal>
  );
}
