import type { Metadata } from "next";
import { LineChart } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Chip } from "@/components/status-badge";
import { DataQualityBanner } from "@/components/data-banner";
import { KpiLine } from "@/components/results/line-chart";
import { AuditForm, BaselineActions, EventForm, ManualValueForm } from "@/components/results/forms";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { getIndicators, EVENT_KINDS, EXECUTION_METRICS, PROJECT_METRICS } from "@/features/results/service";
import { getProject } from "@/features/projects/service";
import { CLASS_LABEL, NON_CAUSALITY } from "@/features/results/rules";
import { formatMetricValue } from "@/features/documents/generate";
import { formatDateTime, formatDay, formatDecimal } from "@/lib/format";
import { todayDateOnly, toISODate } from "@/lib/dates";

export const metadata: Metadata = { title: "Indicadores do projeto" };

export default async function IndicatorsPage({ params }: { params: Promise<{ clientId: string; projectId: string }> }) {
  const user = await requirePageUser();
  const { clientId, projectId } = await params;
  const [ind, proj] = await Promise.all([orNotFound(getIndicators(user, clientId, projectId)), orNotFound(getProject(user, clientId, projectId))]);
  const canEdit = user.role !== "VIEWER" && !["COMPLETED", "CANCELLED"].includes(proj.status);
  const val = (v: number | null | undefined, unit: string) => (v == null ? "Indisponível" : formatMetricValue({ value: v, unit }));
  const tone = { OBSERVED: "ok", ESTIMATED: "info", TARGET: "navy", NOT_MEASURED: "neutral" } as const;
  const hasSeries = ind.rows.some((r) => r.series.length);
  return (
    <div className="flex flex-col gap-5">
      {canEdit ? <Card className="p-5"><BaselineActions clientId={clientId} projectId={projectId} locked={ind.baselineLocked} defaultEnd={toISODate(todayDateOnly())} /></Card> : null}
      {ind.events.length ? (
        <DataQualityBanner>
          <span>Notas de comparabilidade: {ind.events.map((e) => `${formatDay(e.occurredAt)} · ${EVENT_KINDS[e.kind] ?? e.kind}: ${e.description}`).join(" · ")}</span>
        </DataQualityBanner>
      ) : null}
      {!ind.baselineLocked && !hasSeries ? (
        <Card><EmptyState icon={LineChart} title="Baseline ainda não congelado" description="Congele o baseline (90 dias antes do início do projeto, mesma fórmula e fonte) e registre snapshots periódicos para comparar antes × depois." /></Card>
      ) : (
        <Card aria-labelledby="kpi-t">
          <CardHeader id="kpi-t" title="Baseline × atual" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead><tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase"><th className="px-5 py-2">Indicador</th><th className="px-2 py-2">Baseline (congelado)</th><th className="px-2 py-2">Atual</th><th className="px-2 py-2 text-right">Variação</th><th className="px-2 py-2 text-right">Var. %</th><th className="px-2 py-2">Classificação</th><th className="px-5 py-2">Fonte</th></tr></thead>
              <tbody>
                {ind.rows.map((r) => (
                  <tr key={r.code} className="border-t border-border align-top">
                    <td className="px-5 py-2.5 font-bold">{r.label}</td>
                    <td className="px-2 py-2.5">{r.baseline ? <>{val(r.baseline.value, r.unit)}<span className="block text-xs text-text-subtle">{r.baseline.period} · congelado {formatDateTime(r.baseline.lockedAt)}{r.baseline.revision > 1 ? ` · revisão ${r.baseline.revision}: ${r.baseline.reason}` : ""}</span>{r.baseline.unavailable ? <span className="block text-xs text-text-subtle">{r.baseline.unavailable}</span> : null}</> : <span className="text-text-subtle">{(EXECUTION_METRICS as readonly string[]).includes(r.code) ? "Não aplicável" : "Não congelado"}</span>}</td>
                    <td className="px-2 py-2.5">{r.current ? <>{val(r.current.value, r.unit)}<span className="block text-xs text-text-subtle">até {formatDay(r.current.periodEnd)}{r.current.manual ? " · manual" : ""}</span>{r.current.unavailable ? <span className="block text-xs text-text-subtle">{r.current.unavailable}</span> : null}</> : <span className="text-text-subtle">Sem snapshot</span>}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{r.abs == null ? "—" : `${r.abs > 0 ? "+" : ""}${val(r.abs, r.unit)}`}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{r.pct == null ? "—" : `${r.pct > 0 ? "+" : ""}${formatDecimal(r.pct)}%`}</td>
                    <td className="px-2 py-2.5"><Chip tone={tone[r.classification]}>{CLASS_LABEL[r.classification]}</Chip></td>
                    <td className="px-5 py-2.5 text-xs text-text-muted">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border px-5 py-2 text-xs text-text-subtle">Janelas de 90 dias com a mesma fórmula; valores manuais aparecem como Estimado. {NON_CAUSALITY}</p>
        </Card>
      )}
      {hasSeries ? (
        <section aria-label="Evolução" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ind.rows.filter((r) => r.series.length).map((r) => <KpiLine key={r.code} label={r.label} unit={r.unit} baseline={r.baseline?.value ?? null} points={r.series} source={r.source} />)}
        </section>
      ) : null}
      {canEdit ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card aria-labelledby="aud"><CardHeader id="aud" title="Auditoria de aderência ao processo" /><div className="p-5"><AuditForm clientId={clientId} projectId={projectId} processes={proj.processes.map((p) => ({ value: p.id, label: `${p.process.code} — ${p.snapshot.name}` }))} /></div></Card>
          <Card aria-labelledby="evt"><CardHeader id="evt" title="Evento externo (nota de comparabilidade)" /><div className="p-5"><EventForm clientId={clientId} projectId={projectId} kinds={Object.entries(EVENT_KINDS).map(([value, label]) => ({ value, label }))} /></div></Card>
          <Card aria-labelledby="man" className="xl:col-span-2"><CardHeader id="man" title="Valor informado manualmente" /><div className="p-5"><ManualValueForm clientId={clientId} projectId={projectId} metrics={[...PROJECT_METRICS, ...EXECUTION_METRICS].map((c) => ({ value: c, label: ind.rows.find((r) => r.code === c)?.label ?? c }))} /></div></Card>
        </div>
      ) : null}
    </div>
  );
}
