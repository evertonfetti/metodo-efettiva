"use client";

import { PAGE_HELP } from "@/lib/help";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Info, Paperclip, StickyNote, Trash2, X } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { cn } from "@/lib/utils";
import { formatDecimal, formatTime } from "@/lib/format";
import { computeScores, type AnswerView, type QuestionView } from "@/features/assessments/compute";
import type { AnswerValue } from "@/features/assessments/conditions";
import { addEvidenceAction, createRevisionAction, finalizeAssessmentAction, removeEvidenceAction } from "@/features/assessments/actions";

type Props = {
  clientId: string;
  clientName: string;
  isDemo: boolean;
  assessment: { id: string; number: number; revision: number; status: string; segment: string; segmentLabel: string; periodLabel: string; templateLabel: string };
  domains: { code: string; name: string }[];
  questions: QuestionView[];
  initialAnswers: Record<string, AnswerView>;
  scaleLabels: string[];
  canEdit: boolean;
  initialArea?: string;
  /** Diagnóstico fechado: visibilidade e scores congelados do snapshot. */
  frozen?: ReturnType<typeof computeScores>;
};

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

const PAGE_SIZE = 4;

export function AssessmentRunner(props: Props) {
  const { clientId, assessment, domains, questions, scaleLabels } = props;
  const readOnly = assessment.status === "FINALIZED" || !props.canEdit;
  const [answers, setAnswers] = useState<Record<string, AnswerView>>(props.initialAnswers);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const failed = useRef(new Set<string>());
  // Área inicial pela URL (?area=DIAG04) para retomar de onde parou
  const [area, setArea] = useState(() => (props.initialArea && domains.some((d) => d.code === props.initialArea) ? props.initialArea : (domains[0]?.code ?? "")));
  const [page, setPage] = useState(0);

  const { visibility, domainScores, overall } = useMemo(() => props.frozen ?? computeScores(assessment.segment, questions, answers), [props.frozen, assessment.segment, questions, answers]);

  const visibleByDomain = useMemo(() => {
    const m = new Map<string, QuestionView[]>();
    for (const d of domains) m.set(d.code, questions.filter((q) => q.domainCode === d.code && visibility[q.code]?.visible));
    return m;
  }, [domains, questions, visibility]);

  const areaIdx = domains.findIndex((d) => d.code === area);
  const areaQuestions = visibleByDomain.get(area) ?? [];
  const pages = Math.max(1, Math.ceil(areaQuestions.length / PAGE_SIZE));
  const pageQuestions = areaQuestions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const areaScore = domainScores.find((d) => d.domainCode === area);

  const goArea = (code: string) => {
    setArea(code);
    setPage(0);
    const url = new URL(window.location.href);
    url.searchParams.set("area", code);
    window.history.replaceState(null, "", url);
    document.getElementById("area-title")?.focus();
  };

  const persist = useCallback(
    async (code: string, patch: { value?: AnswerValue | null; notes?: string | null; respondent?: string | null }) => {
      setSave({ kind: "saving" });
      try {
        const res = await fetch(`/api/v1/clients/${clientId}/assessments/${assessment.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionCode: code, ...patch }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message ?? "Erro ao salvar");
        failed.current.delete(code);
        setSave({ kind: "saved", at: body.savedAt ?? new Date().toISOString() });
      } catch (e) {
        failed.current.add(code);
        setSave({ kind: "error", message: e instanceof Error ? e.message : "Erro ao salvar" });
      }
    },
    [clientId, assessment.id],
  );

  const setValue = (q: QuestionView, value: AnswerValue | null) => {
    if (readOnly) return;
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === null) {
        const cur = next[q.code];
        if (cur && (cur.evidences.length || cur.notes)) return prev; // não perde evidência/nota
        delete next[q.code];
      } else {
        next[q.code] = { questionCode: q.code, value, confidence: prev[q.code]?.confidence ?? "REPORTED", respondent: prev[q.code]?.respondent ?? null, notes: prev[q.code]?.notes ?? null, updatedAt: new Date().toISOString(), evidences: prev[q.code]?.evidences ?? [] };
      }
      return next;
    });
    void persist(q.code, { value });
  };

  const setMeta = (q: QuestionView, field: "notes" | "respondent", val: string) => {
    const cur = answers[q.code];
    if (!cur || readOnly || (cur[field] ?? "") === val) return;
    setAnswers((prev) => ({ ...prev, [q.code]: { ...prev[q.code]!, [field]: val || null } }));
    void persist(q.code, { value: cur.value, [field]: val || null });
  };

  const retry = () => {
    for (const code of [...failed.current]) {
      const a = answers[code];
      void persist(code, { value: a ? a.value : null, notes: a?.notes ?? null, respondent: a?.respondent ?? null });
    }
  };

  const reloadEvidences = useCallback(async () => {
    const res = await fetch(`/api/v1/clients/${clientId}/assessments/${assessment.id}`);
    if (!res.ok) return;
    const data = (await res.json()) as { answers: Record<string, AnswerView> };
    setAnswers((prev) => {
      const next = { ...prev };
      for (const [code, a] of Object.entries(data.answers)) if (next[code]) next[code] = { ...next[code]!, evidences: a.evidences };
      return next;
    });
  }, [clientId, assessment.id]);

  const countAnswered = (code: string) => (visibleByDomain.get(code) ?? []).filter((q) => answers[q.code]).length;
  const totalVisible = [...visibleByDomain.values()].reduce((s, l) => s + l.length, 0);
  const totalAnswered = [...visibleByDomain.keys()].reduce((s, c) => s + countAnswered(c), 0);

  return (
    <>
      <Topbar crumbs={[{ label: props.clientName, href: `/clientes/${clientId}` }, { label: "Diagnósticos", href: `/clientes/${clientId}/diagnosticos` }, { label: `Diagnóstico #${assessment.number}${assessment.revision ? ` · rev. ${assessment.revision}` : ""}` }]}>
        <SaveIndicator state={save} onRetry={retry} readOnly={readOnly} />
      </Topbar>
      <PageContent>
        <PageHeader help={PAGE_HELP.diagnosticos}
          title={`Diagnóstico 360° · ${assessment.segmentLabel}`}
          badges={
            <>
              <StatusBadge context="assessment" value={assessment.status} suffix={assessment.revision && assessment.status !== "FINALIZED" ? `· revisão ${assessment.revision}` : undefined} />
              <DemoBadge show={props.isDemo} />
            </>
          }
          subtitle={`Modelo: ${assessment.templateLabel} · Período de referência: ${assessment.periodLabel} · Cobertura geral ${Math.round(overall.coverage * 100)}% (${overall.answeredCount}/${overall.applicableCount})`}
          actions={
            <>
              <Button asChild variant="secondary"><Link href={`/clientes/${clientId}/diagnosticos/${assessment.id}/resumo`}>Resumo e scores</Link></Button>
              {assessment.status === "FINALIZED" ? (
                props.canEdit ? <RevisionButton clientId={clientId} assessmentId={assessment.id} /> : null
              ) : props.canEdit ? (
                <FinalizeButton clientId={clientId} assessmentId={assessment.id} answered={overall.answeredCount} applicable={overall.applicableCount} unknown={overall.unknownCount} />
              ) : null}
            </>
          }
        />
        {readOnly && assessment.status === "FINALIZED" ? (
          <p role="status" className="rounded-[8px] bg-ok-bg px-4 py-3 text-sm font-semibold text-ok">✓ Diagnóstico fechado: respostas e scores congelados (snapshot imutável). Para corrigir, crie uma revisão.</p>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <label className="flex flex-col gap-1 text-[13px] font-bold text-text-muted lg:hidden">
            Área do diagnóstico ({totalAnswered}/{totalVisible} respondidas)
            <select value={area} onChange={(e) => goArea(e.target.value)} className="min-h-11 rounded-[8px] border border-border-strong bg-surface px-3 text-sm font-semibold text-text">
              {domains.map((d, i) => (
                <option key={d.code} value={d.code}>{String(i + 1).padStart(2, "0")} · {d.name} — {countAnswered(d.code)}/{visibleByDomain.get(d.code)?.length ?? 0}</option>
              ))}
            </select>
          </label>
          <Card className="hidden p-3 lg:sticky lg:top-24 lg:block">
            <nav aria-label="Áreas do diagnóstico" className="flex flex-col gap-1">
              <span className="px-2 pb-2 text-xs font-bold text-text-muted">12 áreas · {totalAnswered}/{totalVisible} perguntas respondidas</span>
              {domains.map((d, i) => {
                const n = countAnswered(d.code);
                const total = visibleByDomain.get(d.code)?.length ?? 0;
                const done = total > 0 && n === total;
                const current = d.code === area;
                return (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => goArea(d.code)}
                    aria-current={current ? "step" : undefined}
                    className={cn("flex flex-col gap-1.5 rounded-[8px] px-2 py-2.5 text-left text-sm hover:bg-surface-muted", current && "bg-surface-sunken outline-2 -outline-offset-2 outline-navy")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{String(i + 1).padStart(2, "0")} · {d.name}</span>
                      <span className={cn("text-xs font-bold", done ? "text-ok" : "text-text-muted")}>{n}/{total}</span>
                    </span>
                    <span className="h-1 rounded-full bg-surface-sunken" aria-hidden="true">
                      <span className={cn("block h-1 rounded-full", done ? "bg-ok" : "bg-navy")} style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                    </span>
                  </button>
                );
              })}
            </nav>
          </Card>

          <section aria-labelledby="area-title" className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="area-title" tabIndex={-1} className="text-[20px] font-extrabold text-navy outline-none">
                {String(areaIdx + 1).padStart(2, "0")} · {domains[areaIdx]?.name}
              </h2>
              <span className="text-sm text-text-muted">
                Perguntas {areaQuestions.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, areaQuestions.length)} de {areaQuestions.length} · score parcial da área:{" "}
                <b>{areaScore?.weightedScore == null ? "n/d" : formatDecimal(areaScore.weightedScore)}</b>
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-[8px] bg-surface-sunken px-3 py-2 text-xs text-text-muted" aria-label="Legenda da escala">
              {scaleLabels.map((l, i) => (
                <span key={i}><b className="text-navy">{i}</b> {l}</span>
              ))}
            </div>
            {pageQuestions.length === 0 ? (
              <Card className="p-6 text-sm text-text-muted">Nenhuma pergunta aplicável nesta área para o segmento e respostas atuais.</Card>
            ) : (
              pageQuestions.map((q) => (
                <QuestionCard
                  key={q.code}
                  q={q}
                  answer={answers[q.code]}
                  conditionalReason={!q.applicableByDefault ? visibility[q.code]?.reason : undefined}
                  readOnly={readOnly}
                  onValue={(v) => setValue(q, v)}
                  onMeta={(f, v) => setMeta(q, f, v)}
                  clientId={clientId}
                  assessmentId={assessment.id}
                  onEvidenceChange={reloadEvidences}
                />
              ))
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {page > 0 ? (
                <Button variant="secondary" onClick={() => setPage(page - 1)}>← Perguntas anteriores</Button>
              ) : areaIdx > 0 ? (
                <Button variant="secondary" onClick={() => goArea(domains[areaIdx - 1]!.code)}>← {String(areaIdx).padStart(2, "0")} · {domains[areaIdx - 1]!.name}</Button>
              ) : <span />}
              {page < pages - 1 ? (
                <Button variant="secondary" onClick={() => setPage(page + 1)}>Perguntas {(page + 1) * PAGE_SIZE + 1}–{Math.min((page + 2) * PAGE_SIZE, areaQuestions.length)} →</Button>
              ) : areaIdx < domains.length - 1 ? (
                <Button variant="secondary" onClick={() => goArea(domains[areaIdx + 1]!.code)}>{String(areaIdx + 2).padStart(2, "0")} · {domains[areaIdx + 1]!.name} →</Button>
              ) : null}
            </div>
          </section>
        </div>
      </PageContent>
    </>
  );
}

function SaveIndicator({ state, onRetry, readOnly }: { state: SaveState; onRetry: () => void; readOnly: boolean }) {
  if (readOnly) return <span className="text-sm font-semibold text-text-muted">Somente leitura</span>;
  return (
    <span role="status" aria-live="polite" className="text-sm font-semibold">
      {state.kind === "saving" ? <span className="text-text-muted">Salvando…</span> : null}
      {state.kind === "saved" ? <span className="text-ok">✓ Salvo automaticamente às {formatTime(state.at)}</span> : null}
      {state.kind === "error" ? (
        <span className="flex items-center gap-2 text-err">
          ✕ Erro ao salvar — {state.message}
          <Button size="sm" variant="danger" onClick={onRetry}>Tentar de novo</Button>
        </span>
      ) : null}
      {state.kind === "idle" ? <span className="text-text-muted">Respostas salvas automaticamente</span> : null}
    </span>
  );
}

const btnBase = "min-h-10 min-w-11 rounded-[8px] border px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed";

function QuestionCard(props: {
  q: QuestionView;
  answer?: AnswerView;
  conditionalReason?: string;
  readOnly: boolean;
  onValue: (v: AnswerValue | null) => void;
  onMeta: (field: "notes" | "respondent", v: string) => void;
  clientId: string;
  assessmentId: string;
  onEvidenceChange: () => Promise<void>;
}) {
  const { q, answer, readOnly } = props;
  const v = answer?.value;
  const [showNote, setShowNote] = useState(!!answer?.notes);
  const [showEvidence, setShowEvidence] = useState(false);
  const pick = (next: AnswerValue) => props.onValue(v && JSON.stringify(v) === JSON.stringify(next) ? null : next);

  const status = !v
    ? { text: "Sem resposta.", cls: "text-text-subtle" }
    : v.kind === "unknown"
      ? { text: "Não sei — vira lacuna de dados e não reduz o score.", cls: "text-warn" }
      : v.kind === "na"
        ? { text: "Não se aplica — excluída do cálculo desta área.", cls: "text-neutral" }
        : v.kind === "scale"
          ? { text: `Resposta registrada: ${v.value} de 5.`, cls: "text-ok" }
          : { text: q.weight > 0 ? "Resposta registrada." : "Resposta registrada (complementar, não entra no score).", cls: "text-ok" };

  return (
    <Card className="flex flex-col gap-3 p-5" aria-labelledby={`q-${q.code}`}>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-text-muted">{q.code}</span>
        <h3 id={`q-${q.code}`} className="text-base font-bold">{q.title}</h3>
        {props.conditionalReason ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-info"><Info className="size-3.5" aria-hidden="true" />{props.conditionalReason}</span>
        ) : null}
        {q.guidance ? <span className="text-xs text-text-subtle">{q.guidance}</span> : null}
      </div>

      <div role="group" aria-labelledby={`q-${q.code}`} className="flex flex-wrap gap-2">
        {q.type === "SCALE_0_5"
          ? [0, 1, 2, 3, 4, 5].map((n) => {
              const pressed = v?.kind === "scale" && v.value === n;
              return (
                <button key={n} type="button" disabled={readOnly} aria-pressed={pressed} onClick={() => pick({ kind: "scale", value: n })} className={cn(btnBase, pressed ? "border-navy bg-navy text-white" : "border-border-strong bg-surface hover:bg-surface-muted")}>
                  {n}
                </button>
              );
            })
          : null}
        {q.type === "SINGLE_CHOICE"
          ? (q.options ?? []).map((o) => {
              const pressed = v?.kind === "choice" && v.value === o;
              return (
                <button key={o} type="button" disabled={readOnly} aria-pressed={pressed} onClick={() => pick({ kind: "choice", value: o })} className={cn(btnBase, pressed ? "border-navy bg-navy text-white" : "border-border-strong bg-surface hover:bg-surface-muted")}>
                  {o}
                </button>
              );
            })
          : null}
        {q.type === "TEXT" ? <FreeInput kind="text" disabled={readOnly} initial={v?.kind === "text" ? v.value : ""} onCommit={(t) => props.onValue(t ? { kind: "text", value: t } : null)} label={q.title} /> : null}
        {q.type === "NUMBER" || q.type === "CURRENCY" || q.type === "PERCENT" ? (
          <FreeInput kind="number" disabled={readOnly} initial={v?.kind === "number" ? String(v.value) : ""} onCommit={(t) => props.onValue(t === "" ? null : { kind: "number", value: Number(t.replace(",", ".")) })} label={q.title} />
        ) : null}
        {q.allowUnknown ? (
          <button type="button" disabled={readOnly} aria-pressed={v?.kind === "unknown"} onClick={() => pick({ kind: "unknown" })} className={cn(btnBase, v?.kind === "unknown" ? "border-[#B45309] bg-warn-bg text-warn" : "border-border-strong bg-surface hover:bg-surface-muted")}>
            Não sei
          </button>
        ) : null}
        {q.allowNotApplicable ? (
          <button type="button" disabled={readOnly} aria-pressed={v?.kind === "na"} onClick={() => pick({ kind: "na" })} className={cn(btnBase, v?.kind === "na" ? "border-text-subtle bg-border text-text" : "border-border-strong bg-surface hover:bg-surface-muted")}>
            Não se aplica
          </button>
        ) : null}
      </div>
      <span className={cn("text-[13px] font-semibold", status.cls)}>{status.text}</span>

      {answer && (answer.evidences.length > 0 || answer.notes) ? (
        <div className="flex flex-col gap-1.5 rounded-[8px] bg-surface-muted p-3 text-[13px]">
          {answer.evidences.map((e) => (
            <span key={e.id} className="flex flex-wrap items-center gap-2">
              <Paperclip className="size-3.5 text-text-subtle" aria-hidden="true" />
              {e.file ? <a className="font-semibold text-navy underline" href={`/api/v1/clients/${props.clientId}/files/${e.file.id}`}>{e.file.name}</a> : null}
              {e.url ? <a className="font-semibold text-navy underline" href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.url}</a> : null}
              {e.note ? <span>{e.note}</span> : null}
              {!readOnly ? <RemoveEvidence clientId={props.clientId} assessmentId={props.assessmentId} evidenceId={e.id} onDone={props.onEvidenceChange} /> : null}
            </span>
          ))}
          {answer.notes && !showNote ? <span><b>Nota:</b> {answer.notes}</span> : null}
        </div>
      ) : null}

      {showNote && answer ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`note-${q.code}`} className="text-[13px] font-bold text-text-muted">Nota (salva ao sair do campo)</label>
          <Textarea id={`note-${q.code}`} disabled={readOnly} defaultValue={answer.notes ?? ""} onBlur={(e) => props.onMeta("notes", e.target.value.trim())} />
        </div>
      ) : null}
      {showEvidence && answer && !readOnly ? (
        <EvidenceForm clientId={props.clientId} assessmentId={props.assessmentId} questionCode={q.code} onClose={() => setShowEvidence(false)} onDone={props.onEvidenceChange} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[13px]">
        {!readOnly ? (
          <>
            <Button size="sm" variant="ghost" disabled={!answer || !q.allowEvidence} title={!answer ? "Responda a pergunta antes de anexar evidência" : undefined} onClick={() => setShowEvidence((s) => !s)}>
              <Paperclip aria-hidden="true" /> + Evidência
            </Button>
            <Button size="sm" variant="ghost" disabled={!answer || !q.allowNotes} title={!answer ? "Responda a pergunta antes de anotar" : undefined} onClick={() => setShowNote((s) => !s)}>
              <StickyNote aria-hidden="true" /> + Nota
            </Button>
          </>
        ) : null}
        <span className="ml-auto flex items-center gap-2 text-text-muted">
          <label htmlFor={`resp-${q.code}`}>Informado por:</label>
          {readOnly || !answer ? (
            <b className="text-text">{answer?.respondent ?? "Não informado"}</b>
          ) : (
            <Input id={`resp-${q.code}`} className="min-h-8 w-44" defaultValue={answer.respondent ?? ""} placeholder="Ex.: Gerente comercial" onBlur={(e) => props.onMeta("respondent", e.target.value.trim())} />
          )}
        </span>
      </div>
    </Card>
  );
}

function FreeInput({ kind, initial, onCommit, disabled, label }: { kind: "text" | "number"; initial: string; onCommit: (v: string) => void; disabled: boolean; label: string }) {
  const [val, setVal] = useState(initial);
  const commit = () => {
    if (val.trim() !== initial) onCommit(val.trim());
  };
  return kind === "text" ? (
    <Textarea aria-label={label} disabled={disabled} value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit} className="min-h-16 w-full" />
  ) : (
    <Input aria-label={label} disabled={disabled} inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} onBlur={commit} className="w-40" />
  );
}

function EvidenceForm({ clientId, assessmentId, questionCode, onClose, onDone }: { clientId: string; assessmentId: string; questionCode: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let fileAssetId: string | undefined;
      const file = fileRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/v1/clients/${clientId}/files`, { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message ?? "Falha no upload");
        fileAssetId = body.id;
      }
      const r = await addEvidenceAction(clientId, assessmentId, { questionCode, note: note || undefined, url: url || undefined, fileAssetId });
      if (r.error) throw new Error(r.fieldErrors ? Object.values(r.fieldErrors)[0] : r.error);
      await onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao anexar evidência");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[8px] border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-navy">Nova evidência</span>
        <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-1 hover:bg-surface-sunken"><X className="size-4" aria-hidden="true" /></button>
      </div>
      <label className="flex flex-col gap-1 text-[13px] font-bold text-text-muted">
        Arquivo (PDF, imagem, planilha, documento)
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt,.md" className="text-sm font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-bold text-text-muted">
        Link (opcional)
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-bold text-text-muted">
        Descrição
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: política de orçamentos enviada pelo gerente" />
      </label>
      {error ? <p role="alert" className="text-sm font-semibold text-err">{error}</p> : null}
      <div><Button size="sm" onClick={submit} disabled={busy}>{busy ? "Enviando…" : "Anexar evidência"}</Button></div>
    </div>
  );
}

function RemoveEvidence({ clientId, assessmentId, evidenceId, onDone }: { clientId: string; assessmentId: string; evidenceId: string; onDone: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Remover evidência"
      disabled={pending}
      onClick={() => start(async () => { await removeEvidenceAction(clientId, assessmentId, evidenceId); await onDone(); })}
      className="rounded p-1 text-err hover:bg-err-bg"
    >
      <Trash2 className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function FinalizeButton({ clientId, assessmentId, answered, applicable, unknown }: { clientId: string; assessmentId: string; answered: number; applicable: number; unknown: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={answered === 0} aria-describedby={answered === 0 ? "finalize-why" : undefined}>Fechar diagnóstico</Button>
      {answered === 0 ? <span id="finalize-why" className="w-full text-right text-xs font-semibold text-err">Responda ao menos uma pergunta para fechar.</span> : null}
      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="fin-title" className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="w-full max-w-md rounded-[12px] bg-surface p-6">
            <h2 id="fin-title" className="text-[17px] font-extrabold text-navy">Fechar diagnóstico?</h2>
            <p className="mt-2 text-sm text-text-muted">
              {answered} de {applicable} perguntas aplicáveis respondidas{unknown ? `, ${unknown} como "não sei"` : ""}. Ao fechar, respostas e scores ficam congelados. Ajustes posteriores exigem uma revisão.
            </p>
            {error ? <p role="alert" className="mt-3 text-sm font-semibold text-err">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
              <Button disabled={pending} onClick={() => start(async () => { const r = await finalizeAssessmentAction(clientId, assessmentId); if (r?.error) setError(r.error); })}>
                {pending ? "Fechando…" : "Fechar diagnóstico"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function RevisionButton({ clientId, assessmentId }: { clientId: string; assessmentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button disabled={pending} onClick={() => start(async () => { const r = await createRevisionAction(clientId, assessmentId); if (r?.error) setError(r.error); })}>
        {pending ? "Criando…" : "Criar revisão"}
      </Button>
      {error ? <span role="alert" className="w-full text-right text-xs font-semibold text-err">{error}</span> : null}
    </>
  );
}
