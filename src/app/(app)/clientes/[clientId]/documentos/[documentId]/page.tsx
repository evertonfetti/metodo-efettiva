import type { Metadata } from "next";
import Link from "next/link";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { SectionEditor } from "@/components/documents/section-editor";
import { ExportPanel, RevisionActions } from "@/components/documents/doc-panels";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { getClientView } from "@/features/clients/service";
import { getDocument } from "@/features/documents/service";
import { aiStatus, listGenerations } from "@/features/ai/service";
import type { AiSuggestion } from "@/components/documents/ai-assist";
import { countPending, type Section } from "@/features/documents/content";
import { formatDateTime, formatShortDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Documento" };

const STATE_LINE: Record<Section["state"], { symbol: string; label: string; cls: string }> = {
  APPROVED: { symbol: "✓", label: "Aprovada", cls: "text-ok" },
  IN_REVIEW: { symbol: "◐", label: "Em revisão", cls: "text-info" },
  PENDING: { symbol: "○", label: "Pendente", cls: "text-text-subtle" },
};

export default async function DocumentEditorPage({ params, searchParams }: { params: Promise<{ clientId: string; documentId: string }>; searchParams: Promise<{ rev?: string; s?: string }> }) {
  const user = await requirePageUser();
  const { clientId, documentId } = await params;
  const sp = await searchParams;
  const [client, view, ai, gens] = await Promise.all([getClientView(user, clientId), orNotFound(getDocument(user, clientId, documentId, sp.rev)), aiStatus(clientId), orNotFound(listGenerations(user, clientId, documentId))]);
  const { doc, revision: rev, revisions, qa, exports, project } = view;
  const sections = rev.content.sections;
  const current = sections.find((s) => s.key === sp.s) ?? sections[0]!;
  const open = rev.state === "DRAFT" || rev.state === "READY_FOR_REVIEW";
  const canEdit = user.role !== "VIEWER";
  const latest = revisions[0]!;
  const lastApproved = revisions.find((r) => r.state === "APPROVED" || r.state === "PUBLISHED");
  const base = `/clientes/${clientId}/documentos/${documentId}`;
  type Out = { draft?: { assumptions: string[]; missingData: string[]; openQuestions: string[]; reviewRequests: string[]; confidence: string }; blocks?: AiSuggestion["blocks"]; cited?: string[] };
  const suggestions: AiSuggestion[] = gens
    .filter((g) => g.revisionId === rev.id && g.sectionKey === current.key)
    .map((g) => {
      const out = (g.outputJson ?? {}) as Out;
      const ev = ((g.inputJson as { local?: { evidence?: { ref: string; label: string }[] } }).local?.evidence ?? []).filter((e) => out.cited?.includes(e.ref));
      return {
        id: g.id,
        status: g.status,
        decision: g.decision,
        model: g.model,
        createdLabel: formatDateTime(g.createdAt),
        errorMessage: g.errorMessage,
        blocks: out.blocks ?? null,
        issues: (g.validationJson ?? []) as AiSuggestion["issues"],
        evidence: ev.map((e) => ({ ref: e.ref, label: e.label })),
        assumptions: out.draft?.assumptions ?? [],
        missingData: out.draft?.missingData ?? [],
        openQuestions: out.draft?.openQuestions ?? [],
        reviewRequests: out.draft?.reviewRequests ?? [],
        confidence: out.draft?.confidence ?? null,
        usage: g.tokensIn != null ? `${g.tokensIn.toLocaleString("pt-BR")} + ${(g.tokensOut ?? 0).toLocaleString("pt-BR")} tokens${g.costEstimate != null ? ` · US$ ${Number(g.costEstimate).toFixed(3)}` : ""}` : null,
      };
    });
  const href = (s: string) => `${base}?${new URLSearchParams({ ...(sp.rev ? { rev: sp.rev } : {}), s }).toString()}`;
  const notApproved = sections.filter((s) => s.state !== "APPROVED").length;
  const errors = qa.filter((q) => q.level === "error");
  const blockers = [...(notApproved ? [`${notApproved} ${notApproved === 1 ? "seção ainda não aprovada" : "seções ainda não aprovadas"}`] : []), ...errors.filter((e) => e.id !== "sections").map((e) => e.message)];
  const compareTarget = revisions.find((r) => r.id !== rev.id && (r.state === "APPROVED" || r.state === "PUBLISHED")) ?? revisions.find((r) => r.id !== rev.id);
  const sourceLine = `Gerado sem IA a partir de ${[rev.sources.assessmentLabel, rev.sources.processes.length ? `biblioteca (${rev.sources.processes.map((p) => `${p.code} v${p.version}`).join(", ")})` : null, project ? `projeto “${project.name}”` : null].filter(Boolean).join(", ")}${lastApproved && lastApproved.id !== rev.id ? ` · v${lastApproved.version} ${lastApproved.state === "PUBLISHED" ? "publicada" : "aprovada"} em ${formatShortDate(lastApproved.approvedAt)} permanece imutável` : ""}`;

  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, ...(project ? [{ label: project.name, href: `/clientes/${clientId}/projetos/${project.id}` }] : []), { label: "Documentos", href: `/clientes/${clientId}/documentos` }, { label: `${doc.type === "POP" ? "POP" : "Playbook"} · v${rev.version}` }]}>
        {open ? <span className="text-xs font-semibold text-text-muted">✓ Salvo às {formatTime(rev.updatedAt)}</span> : null}
      </Topbar>
      <PageContent wide>
        <PageHeader
          title={doc.title}
          badges={<><StatusBadge context="revision" value={rev.state} suffix={`· v${rev.version}`} /><DemoBadge show={doc.isDemo} /></>}
          subtitle={sourceLine}
          actions={
            <>
              {compareTarget ? <Button asChild variant="secondary"><Link href={`${base}/comparar?a=${compareTarget.id}&b=${rev.id}`}>Comparar com v{compareTarget.version}</Link></Button> : null}
              <RevisionActions clientId={clientId} documentId={documentId} revisionId={rev.id} state={rev.state} blockers={blockers} isLatest={rev.id === latest.id} canEdit={canEdit} />
            </>
          }
        />
        {rev.id !== latest.id ? (
          <p className="rounded-[8px] bg-warn-bg px-4 py-2 text-sm font-semibold text-warn">
            Você está vendo a v{rev.version}. <Link className="underline" href={base}>Abrir a versão mais recente (v{latest.version})</Link>
          </p>
        ) : null}
        <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
          <nav aria-label="Seções" className="h-fit rounded-[12px] border border-border bg-surface p-2 xl:sticky xl:top-20">
            <h2 className="px-2 py-1 text-xs font-bold tracking-[0.5px] text-text-muted uppercase">Seções</h2>
            <ol className="flex flex-col gap-0.5">
              {sections.map((s, i) => {
                const st = STATE_LINE[s.state];
                const pend = countPending(s);
                return (
                  <li key={s.key}>
                    <Link href={href(s.key)} aria-current={s.key === current.key ? "true" : undefined} className={cn("flex flex-col rounded-[8px] border-2 px-2.5 py-1.5 text-sm hover:bg-surface-sunken", s.key === current.key ? "border-navy" : "border-transparent")}>
                      <span className="font-bold text-text">{i + 1} · {s.title}</span>
                      <span className="text-xs">
                        <span className={st.cls}>{st.symbol} {st.label}</span>
                        <span className="text-text-subtle"> · </span>
                        {s.visibility === "INTERNO" ? <span className="font-bold text-blocked">INTERNO</span> : <span className="text-text-subtle">Cliente</span>}
                        {pend ? <span className="font-semibold text-amber-900"> · {pend} pend.</span> : null}
                        {s.aiGenerationId ? <span className="font-semibold text-info"> · ✦ IA</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>

          <SectionEditor
            key={`${rev.id}-${current.key}-${rev.lockVersion}`}
            clientId={clientId}
            documentId={documentId}
            revisionId={rev.id}
            section={current}
            lockVersion={rev.lockVersion}
            readOnly={!open || !canEdit}
            readOnlyReason={!canEdit ? "Perfil somente leitura." : !open ? `Versão ${rev.state === "PUBLISHED" ? "publicada" : "aprovada"}: imutável. Use “Nova versão” para alterar.` : undefined}
            ai={{ available: ai.available, reason: ai.reason, model: ai.model }}
            sections={sections.map((s, i) => ({ key: s.key, title: `${i + 1} · ${s.title}` }))}
            suggestions={suggestions}
          />

          <aside className="flex flex-col gap-4" aria-label="Painel do documento">
            <ExportPanel
              clientId={clientId}
              documentId={documentId}
              revisionId={rev.id}
              isDraft={open}
              canExport={canEdit}
              internalTitles={sections.filter((s) => s.visibility === "INTERNO").map((s) => `seção ${sections.indexOf(s) + 1}`)}
              exports={exports.filter((e) => e.revisionId === rev.id).map((e) => ({ id: e.id, format: e.format, audience: e.audience, isDraft: e.isDraft, status: e.status, version: e.revision.version, createdLabel: formatDateTime(e.createdAt), error: e.errorMessage }))}
            />
            <section aria-labelledby="qa-title" className="rounded-[12px] border border-border bg-surface p-4">
              <h2 id="qa-title" className="mb-2 text-[15px] font-extrabold text-navy">Checagem de qualidade</h2>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {qa.map((q) => (
                  <li key={q.id} className={cn("flex gap-1.5", q.level === "ok" ? "text-ok" : q.level === "error" ? "font-semibold text-err" : "text-warn")}>
                    <span aria-hidden="true">{q.level === "ok" ? "✓" : q.level === "error" ? "✕" : "!"}</span>
                    <span><span className="sr-only">{q.level === "ok" ? "OK: " : q.level === "error" ? "Bloqueio: " : "Alerta: "}</span>{q.message}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="ver-title" className="rounded-[12px] border border-border bg-surface p-4">
              <h2 id="ver-title" className="mb-2 text-[15px] font-extrabold text-navy">Versões</h2>
              <ol className="flex flex-col gap-1.5 text-[13px]">
                {revisions.map((r) => (
                  <li key={r.id}>
                    <Link href={r.id === latest.id ? base : `${base}?rev=${r.id}`} className={cn("flex justify-between gap-2 rounded-[6px] px-1.5 py-1 hover:bg-surface-sunken", r.id === rev.id && "bg-surface-sunken font-bold")}>
                      <span>v{r.version} · <StatusBadge context="revision" value={r.state} />{r.state === "APPROVED" || r.state === "PUBLISHED" ? <span className="text-text-subtle"> · imutável</span> : null}</span>
                      <span className="shrink-0 text-text-subtle">{formatShortDate(r.approvedAt ?? r.updatedAt)}{r.approverName ? ` · ${r.approverName.split(" ")[0]}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      </PageContent>
    </>
  );
}
