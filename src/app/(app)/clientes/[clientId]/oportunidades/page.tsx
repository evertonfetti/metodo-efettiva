import type { Metadata } from "next";
import Link from "next/link";
import { Target } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { Chip, StatusBadge } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { ProcessCodeChip } from "@/components/processes/process-chip";
import { PriorityMatrix } from "@/components/opportunities/priority-matrix";
import { LinkToProject, OpportunityStatusActions, ProcessPicker } from "@/components/opportunities/opportunity-actions";
import { requirePageUser } from "@/lib/security/session";
import { getClientView } from "@/features/clients/service";
import { listOpportunities, opportunityFilterSchema, type OpportunityView } from "@/features/opportunities/service";
import { OPPORTUNITY_TRANSITIONS, formatCode, transitionNeedsReason } from "@/features/opportunities/scoring";
import { listProjects } from "@/features/projects/service";
import { processCatalog } from "@/features/processes/service";
import { PROCESS_DOMAINS, processDomainName } from "@/features/processes/mapping";
import { formatBRL, formatDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Oportunidades" };

const TRANSITION_LABEL: Record<string, string> = { REVIEWED: "Marcar revisada", APPROVED: "Aprovar", DISMISSED: "Descartar com motivo", DETECTED: "Reabrir" };
const ESTIMATE_LABEL: Record<string, string> = { OBSERVED: "Observado", ESTIMATED: "Estimado", TARGET: "Meta" };

type Ev = { kind?: string; text?: string; title?: string; questionCode?: string; domainCode?: string; score?: number | null; coverage?: number; value?: number };
function evidenceText(e: Ev): string {
  if (e.kind === "NOTE") return e.text ?? "";
  if (e.kind === "FINDING") return `Achado de origem: ${e.title}`;
  if (e.kind === "ASSESSMENT_SCORE") return `Diagnóstico, área ${e.domainCode}: score ${e.score == null ? "indisponível" : formatDecimal(e.score)} · cobertura ${Math.round((e.coverage ?? 0) * 100)}%`;
  if (e.kind === "ASSESSMENT_ANSWER") return `Pergunta ${e.questionCode} respondida com ${e.value}: ${e.title}`;
  return e.text ?? e.title ?? "Evidência registrada";
}

export default async function OpportunitiesPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser();
  const { clientId } = await params;
  const sp = await searchParams;
  const filters = opportunityFilterSchema.parse(sp);
  const [client, items, all, projects, catalog] = await Promise.all([
    getClientView(user, clientId),
    listOpportunities(user, clientId, filters),
    listOpportunities(user, clientId),
    listProjects(user, clientId),
    processCatalog(),
  ]);
  const canEdit = user.role !== "VIEWER";
  const selected: OpportunityView | undefined = items.find((o) => o.id === sp.sel) ?? items[0];
  const base = `/clientes/${clientId}/oportunidades`;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, sel: sp.sel, ...patch })) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const openProjects = projects.filter((p) => !["COMPLETED", "CANCELLED"].includes(p.status)).map((p) => ({ id: p.id, name: p.name }));
  const hasFilters = Object.values(filters).some((v) => v !== undefined);

  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Oportunidades" }]} />
      <PageContent wide>
        <PageHeader
          title="Mapa de oportunidades"
          badges={<DemoBadge show={client.isDemo} />}
          subtitle="Score = Impacto × Confiança ÷ Esforço (1–5 cada, máx. 25). Valor auxiliar: risco crítico prevalece sobre o ranking."
          actions={canEdit ? <Button asChild><Link href={`${base}/nova`}>+ Registrar achado</Link></Button> : null}
        />
        {all.length === 0 ? (
          <Card>
            <EmptyState
              icon={Target}
              title="Nenhuma oportunidade registrada"
              description="Registre achados do diagnóstico como oportunidades, priorize por impacto, confiança e esforço e vincule processos da biblioteca."
              action={canEdit ? <Button asChild><Link href={`${base}/nova`}>+ Registrar achado</Link></Button> : undefined}
            />
          </Card>
        ) : (
          <>
            <form className="flex flex-wrap items-end gap-3" aria-label="Filtros">
              <div className="flex flex-col gap-1">
                <Label htmlFor="f-area">Área</Label>
                <Select id="f-area" name="area" defaultValue={filters.area ?? ""} className="w-56">
                  <option value="">Todas</option>
                  {PROCESS_DOMAINS.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="f-origin">Origem</Label>
                <Select id="f-origin" name="origin" defaultValue={filters.origin ?? ""} className="w-40">
                  <option value="">Todas</option>
                  <option value="RULE">Regra</option>
                  <option value="CONSULTANT">Consultor</option>
                  <option value="AI_SUGGESTION">Sugestão IA</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="f-status">Status</Label>
                <Select id="f-status" name="status" defaultValue={filters.status ?? ""} className="w-40">
                  <option value="">Todos</option>
                  <option value="DETECTED">Detectada</option>
                  <option value="REVIEWED">Revisada</option>
                  <option value="APPROVED">Aprovada</option>
                  <option value="LINKED_TO_PROJECT">Em projeto</option>
                  <option value="DISMISSED">Descartada</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="f-conf">Confiança mínima</Label>
                <Select id="f-conf" name="conf" defaultValue={filters.conf ? String(filters.conf) : ""} className="w-32">
                  <option value="">Qualquer</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                  <option value="5">5</option>
                </Select>
              </div>
              <Button type="submit" variant="secondary">Filtrar</Button>
              {hasFilters ? <Button asChild variant="ghost"><Link href={base}>Limpar</Link></Button> : null}
            </form>

            {items.length === 0 ? (
              <Card><EmptyState icon={Target} title="Nenhuma oportunidade com esses filtros" description="Ajuste ou limpe os filtros." action={<Button asChild variant="secondary"><Link href={base}>Limpar filtros</Link></Button>} /></Card>
            ) : (
              <>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <Card aria-labelledby="matrix">
                    <CardHeader id="matrix" title="Impacto × Esforço" />
                    <div className="p-5"><PriorityMatrix items={items} selectedId={selected?.id} hrefFor={(id) => qs({ sel: id })} /></div>
                  </Card>
                  {selected ? <Detail o={selected} clientId={clientId} canEdit={canEdit} projects={openProjects} catalog={catalog} /> : null}
                </div>
                <Card aria-label="Todas as oportunidades">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase">
                          <th className="px-5 py-3 font-bold">Código</th>
                          <th className="px-3 py-3 font-bold">Oportunidade</th>
                          <th className="px-3 py-3 font-bold">Origem</th>
                          <th className="px-2 py-3 text-center font-bold" title="Impacto">I</th>
                          <th className="px-2 py-3 text-center font-bold" title="Confiança">C</th>
                          <th className="px-2 py-3 text-center font-bold" title="Esforço">E</th>
                          <th className="px-3 py-3 text-right font-bold">Score</th>
                          <th className="px-3 py-3 font-bold">Status</th>
                          <th className="px-5 py-3 font-bold">Processos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((o) => (
                          <tr key={o.id} className={cn("border-t border-border hover:bg-surface-muted", o.id === selected?.id && "bg-surface-muted")}>
                            <td className="px-5 py-3 font-mono font-bold">{formatCode(o.number)}</td>
                            <td className="px-3 py-3">
                              <Link href={qs({ sel: o.id })} className="font-bold text-navy hover:underline" aria-current={o.id === selected?.id ? "true" : undefined}>{o.title}</Link>
                              {o.criticalRisk ? <Chip tone="err" symbol="!" className="ml-2">RISCO CRÍTICO</Chip> : null}
                            </td>
                            <td className="px-3 py-3"><StatusBadge context="origin" value={o.origin} /></td>
                            <td className="px-2 py-3 text-center">{o.impactScore}</td>
                            <td className="px-2 py-3 text-center">{o.confidenceScore}</td>
                            <td className="px-2 py-3 text-center">{o.effortScore}</td>
                            <td className="px-3 py-3 text-right font-bold tabular-nums">{formatDecimal(o.priorityScore)}</td>
                            <td className="px-3 py-3"><StatusBadge context="opportunity" value={o.status} /></td>
                            <td className="px-5 py-3">{o.processes.filter((p) => p.selected).map((p) => p.process.code).join(" · ") || <span className="text-text-subtle">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </PageContent>
    </>
  );
}

function Detail({ o, clientId, canEdit, projects, catalog }: { o: OpportunityView; clientId: string; canEdit: boolean; projects: { id: string; name: string }[]; catalog: { code: string; name: string }[] }) {
  const evidence = (Array.isArray(o.evidenceJson) ? (o.evidenceJson as Ev[]) : []).map(evidenceText).filter(Boolean);
  const assumptions = Array.isArray(o.assumptionsJson) ? (o.assumptionsJson as string[]) : [];
  const selectedCount = o.processes.filter((p) => p.selected).length;
  const transitions = (OPPORTUNITY_TRANSITIONS[o.status] ?? []).map((to) => ({
    to,
    label: o.status === "APPROVED" && to === "REVIEWED" ? "Retirar aprovação" : TRANSITION_LABEL[to]!,
    needsReason: transitionNeedsReason(o.status, to),
    variant: (to === "APPROVED" ? "primary" : to === "DISMISSED" ? "ghost" : "secondary") as "primary" | "secondary" | "ghost",
    danger: to === "DISMISSED",
  }));
  return (
    <Card aria-labelledby="detail" className="flex flex-col">
      <div className="flex flex-col gap-2 border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-text-muted">{formatCode(o.number)}</span>
          <StatusBadge context="opportunity" value={o.status} />
          <span className="text-xs text-text-subtle">Origem: {o.origin === "RULE" ? "Regra" : o.origin === "AI_SUGGESTION" ? "Sugestão IA" : "Consultor"} · {processDomainName(o.domainCode)}</span>
          {o.criticalRisk ? <Chip tone="err" symbol="!">RISCO CRÍTICO</Chip> : null}
        </div>
        <h2 id="detail" className="text-[19px] font-extrabold text-navy">{o.title}</h2>
        <p className="text-sm text-text-muted">{o.explanation}</p>
        {o.criticalRisk && o.criticalRiskReason ? <p className="text-sm font-semibold text-err">Risco crítico: {o.criticalRiskReason}</p> : null}
        {o.statusReason ? <p className="text-xs text-text-subtle">Motivo registrado: {o.statusReason}</p> : null}
      </div>
      <dl className="grid grid-cols-4 border-b border-border text-center">
        {[["Impacto", o.impactScore], ["Confiança", o.confidenceScore], ["Esforço", o.effortScore], ["Score", formatDecimal(o.priorityScore)]].map(([k, v]) => (
          <div key={k} className="border-r border-border px-2 py-3 last:border-r-0">
            <dt className="text-[11px] font-bold tracking-[0.5px] text-text-subtle uppercase">{k}</dt>
            <dd className="text-xl font-extrabold text-navy tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-4 px-5 py-4 text-sm">
        <section>
          <h3 className="text-xs font-bold tracking-[0.5px] text-text-muted uppercase">Evidências</h3>
          {evidence.length ? <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">{evidence.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="mt-1 text-text-subtle">Nenhuma evidência registrada.</p>}
        </section>
        <section>
          <h3 className="text-xs font-bold tracking-[0.5px] text-text-muted uppercase">Valor e premissas</h3>
          <p className="mt-1">
            {o.estimatedValue != null ? `${formatBRL(Number(o.estimatedValue))} · ${ESTIMATE_LABEL[o.estimateType ?? ""] ?? "sem classificação"}` : "Valor não calculado: sem premissa aprovada."}
          </p>
          {assumptions.length ? <ul className="mt-1 list-disc pl-5 text-text-muted">{assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul> : null}
          {o.missingData ? <p className="mt-1 rounded-[8px] bg-warn-bg px-3 py-2 text-warn">Dados ausentes: {o.missingData}</p> : null}
        </section>
        <section>
          <h3 className="mb-1 text-xs font-bold tracking-[0.5px] text-text-muted uppercase">Processos vinculados</h3>
          {o.project ? <p className="mb-2">Em projeto: <Link className="font-bold text-navy hover:underline" href={`/clientes/${clientId}/projetos/${o.project.id}`}>{o.project.name}</Link></p> : null}
          <ProcessPicker
            clientId={clientId}
            opportunityId={o.id}
            processes={o.processes.map((p) => ({ code: p.process.code, name: p.process.name, selected: p.selected, suggested: p.suggested }))}
            catalog={catalog}
            editable={canEdit && !["LINKED_TO_PROJECT", "DISMISSED"].includes(o.status)}
          />
        </section>
      </div>
      {canEdit ? (
        <div className="mt-auto flex flex-wrap items-start gap-2 border-t border-border px-5 py-4">
          {o.status === "APPROVED" ? (
            <LinkToProject clientId={clientId} opportunityId={o.id} projects={projects} disabledReason={selectedCount === 0 ? "Selecione ao menos um processo antes de vincular." : undefined} />
          ) : null}
          {o.status !== "DISMISSED" ? <Button size="sm" variant="secondary" asChild><Link href={`/clientes/${clientId}/oportunidades/${o.id}/editar`}>Editar estimativa</Link></Button> : null}
          {transitions.length ? <OpportunityStatusActions clientId={clientId} opportunityId={o.id} transitions={transitions} /> : null}
        </div>
      ) : null}
    </Card>
  );
}
