import type { Metadata } from "next";
import Link from "next/link";
import { Database, Download } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Chip, StatusBadge } from "@/components/status-badge";
import { DemoBadge } from "@/components/demo-badge";
import { DataQualityBanner } from "@/components/data-banner";
import { MetricCardWithSource } from "@/components/metric-card";
import { MonthlyBars } from "@/components/imports/bar-chart";
import { RefreshMetricsButton } from "@/components/imports/refresh-button";
import { requirePageUser } from "@/lib/security/session";
import { prisma } from "@/lib/db";
import { getClientView } from "@/features/clients/service";
import { getMetricsOverview } from "@/features/metrics/service";
import { cardProps } from "@/features/metrics/view";
import { IMPORT_TYPES, type ImportTypeCode } from "@/features/imports/fields";
import { formatBRL, formatDateTime, formatDay, formatInteger } from "@/lib/format";

export const metadata: Metadata = { title: "Dados e importações" };

const ORDER: ImportTypeCode[] = ["CUSTOMERS", "PRODUCTS", "SALES", "SALE_ITEMS", "QUOTES"];
const KPI_ORDER = ["SALES_VALUE", "ACTIVE_CUSTOMERS", "AVG_ORDER_VALUE", "SALES_FREQUENCY", "NET_REVENUE", "DISCOUNT_RATE", "CONTRIBUTION_MARGIN", "CONTRIBUTION_MARGIN_PCT", "CUSTOMER_CONCENTRATION", "QUOTE_CONVERSION"];

export default async function DataPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await requirePageUser();
  const { clientId } = await params;
  const [client, m, batches, findings] = await Promise.all([
    getClientView(user, clientId),
    getMetricsOverview(user, clientId),
    prisma.importBatch.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.finding.findMany({ where: { clientId, ruleKey: { startsWith: "DATA:" }, status: { not: "DISMISSED" } }, include: { opportunities: { select: { id: true, number: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const canEdit = user.role !== "VIEWER";
  const base = `/clientes/${clientId}/dados`;
  const lastOf = (t: ImportTypeCode) => batches.find((b) => b.type === t && ["COMPLETED", "PARTIAL"].includes(b.status));
  const inactive = m.analyses.INACTIVE_CUSTOMERS;
  const inactiveList = ((inactive?.sourceJson as { list?: { externalId: string; name: string; lastPurchase: string; daysSince: number; threshold: number; confidence: string; value12m: number }[] })?.list ?? []).slice(0, 15);
  const stale = m.analyses.STALE_QUOTES;
  const staleJson = (stale?.sourceJson ?? {}) as { list?: { customer: string; amount: number; issuedAt: string; daysWithoutAction: number; expired: boolean }[]; amount?: number; open?: number };
  const abc = m.analyses.ABC_CUSTOMERS;
  const abcJson = (abc?.sourceJson ?? {}) as { classes?: { cls: string; count: number; share: number }[]; basis?: string };
  const hasData = Object.values(m.counts).some((n) => n > 0);

  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Dados e importações" }]} />
      <PageContent wide>
        <PageHeader
          title="Dados e importações"
          badges={<DemoBadge show={client.isDemo} />}
          subtitle={m.period ? `Indicadores de ${formatDay(m.period.start)} a ${formatDay(m.period.end)} · base: ${m.quality.kind === "INVOICE" ? "faturamento" : m.quality.kind === "ORDER" ? "pedidos" : "—"} · calculados em ${formatDateTime(m.computedAt)}` : "Importe clientes, produtos, vendas, itens e orçamentos para calcular indicadores com fonte e período."}
          actions={canEdit ? <>{hasData ? <RefreshMetricsButton clientId={clientId} /> : null}<Button asChild><Link href={`${base}/importar`}>Importar arquivo</Link></Button></> : null}
        />
        {m.quality.alerts.map((a) => <DataQualityBanner key={a.code}><span><span className="font-extrabold">{a.code}</span> · {a.message}</span></DataQualityBanner>)}

        <section aria-label="Cobertura por tipo de arquivo" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ORDER.map((t) => {
            const b = lastOf(t);
            return (
              <Card key={t} className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-extrabold text-navy">{IMPORT_TYPES[t].label}</h2>
                  <span className="text-2xl font-extrabold text-navy tabular-nums">{formatInteger(m.counts[t])}</span>
                </div>
                <p className="text-xs text-text-muted">{IMPORT_TYPES[t].description}</p>
                {b ? (
                  <p className="text-xs text-text-muted">
                    Último lote: {b.originalName} · {formatDay(b.finishedAt)} · {formatInteger(b.acceptedRows)} válidas{b.rejectedRows ? <span className="font-bold text-err"> · {formatInteger(b.rejectedRows)} rejeitadas</span> : null}
                    {b.sourceValidated ? <span className="text-ok"> · fonte validada</span> : null}
                  </p>
                ) : <p className="text-xs text-text-subtle">Nenhum lote importado.</p>}
                {t === "SALE_ITEMS" && m.quality.completeness.itemsWithCost != null ? <p className="text-xs text-text-muted">Custos variáveis informados em {m.quality.completeness.itemsWithCost}% dos itens.</p> : null}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {canEdit ? <Button asChild size="sm" variant="secondary"><Link href={`${base}/importar?tipo=${t}`}>Importar</Link></Button> : null}
                  <a className="flex items-center gap-1 text-xs font-bold text-navy hover:underline" href={`/api/v1/import-templates/${t}?format=csv`}><Download className="size-3.5" aria-hidden="true" /> Modelo CSV</a>
                  <a className="flex items-center gap-1 text-xs font-bold text-navy hover:underline" href={`/api/v1/import-templates/${t}?format=xlsx`}><Download className="size-3.5" aria-hidden="true" /> XLSX</a>
                </div>
              </Card>
            );
          })}
        </section>

        {hasData ? (
          <>
            <section aria-label="Indicadores do período" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {KPI_ORDER.map((code) => {
                const p = cardProps(m.kpis.find((k) => k.metricCode === code), code);
                return <MetricCardWithSource key={code} {...p} />;
              })}
            </section>
            {m.monthly.some((s) => s.metricCode === "SALES_VALUE") ? (
              <Card aria-labelledby="serie">
                <CardHeader id="serie" title="Valor comercial por mês" />
                <div className="p-5">
                  <MonthlyBars points={m.monthly.filter((s) => s.metricCode === "SALES_VALUE").map((s) => ({ start: s.periodStart, value: s.valueDecimal == null ? null : Number(s.valueDecimal) }))} caption={`Fonte: ${cardProps(m.kpis.find((k) => k.metricCode === "SALES_VALUE"), "").source} · base ${m.quality.kind === "INVOICE" ? "faturamento" : "pedidos"}, canceladas excluídas`} />
                </div>
              </Card>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-2">
              <Card aria-labelledby="inat">
                <CardHeader id="inat" title={`Clientes com sinal de inatividade${inactive?.valueDecimal != null ? ` · ${Number(inactive.valueDecimal)}` : ""}`} />
                {inactiveList.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead><tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase"><th className="px-5 py-2">Cliente</th><th className="px-2 py-2">Última compra</th><th className="px-2 py-2 text-right">Dias</th><th className="px-2 py-2 text-right">Limite</th><th className="px-2 py-2">Confiança</th><th className="px-5 py-2 text-right">Valor 12 m</th></tr></thead>
                      <tbody>{inactiveList.map((c) => <tr key={c.externalId} className="border-t border-border"><td className="px-5 py-2 whitespace-nowrap">{c.externalId} · {c.name}</td><td className="px-2 py-2">{formatDay(new Date(`${c.lastPurchase}T00:00:00Z`))}</td><td className="px-2 py-2 text-right tabular-nums">{c.daysSince}</td><td className="px-2 py-2 text-right tabular-nums">{c.threshold}</td><td className="px-2 py-2"><Chip tone={c.confidence === "ALTA" ? "ok" : c.confidence === "MÉDIA" ? "info" : "neutral"}>{c.confidence}</Chip></td><td className="px-5 py-2 text-right tabular-nums">{formatBRL(c.value12m)}</td></tr>)}</tbody>
                    </table>
                  </div>
                ) : <p className="px-5 py-4 text-sm text-text-muted">{inactive?.unavailableReason ?? "Nenhum cliente acima do limite de inatividade."}</p>}
                <p className="border-t border-border px-5 py-2 text-xs text-text-subtle">{(inactive?.sourceJson as { basis?: string } | undefined)?.basis ?? ""}. Parâmetros em Configurações → Parâmetros.</p>
              </Card>
              <div className="flex flex-col gap-5">
                <Card aria-labelledby="abc">
                  <CardHeader id="abc" title="Curva ABC de clientes" />
                  {abcJson.classes ? (
                    <div className="grid grid-cols-3 gap-3 p-5 text-center">
                      {abcJson.classes.map((c) => <div key={c.cls} className="rounded-[8px] bg-surface-sunken p-3"><div className="text-xs font-bold text-text-subtle">Classe {c.cls}</div><div className="text-xl font-extrabold text-navy">{c.count} clientes</div><div className="text-xs text-text-muted">{String(c.share).replace(".", ",")}% do valor</div></div>)}
                    </div>
                  ) : <p className="px-5 py-4 text-sm text-text-muted">Indisponível: sem vendas no período.</p>}
                  <p className="border-t border-border px-5 py-2 text-xs text-text-subtle">{(abc?.sourceJson as { basis?: string } | undefined)?.basis ?? ""}</p>
                </Card>
                <Card aria-labelledby="orc">
                  <CardHeader id="orc" title={`Orçamentos abertos sem ação${stale?.valueDecimal != null ? ` · ${Number(stale.valueDecimal)} de ${staleJson.open ?? 0}` : ""}`} />
                  {staleJson.list?.length ? (
                    <ul className="divide-y divide-border text-sm">{staleJson.list.slice(0, 8).map((q, i) => <li key={i} className="flex justify-between gap-3 px-5 py-2"><span>{q.customer} · emitido {formatDay(new Date(`${q.issuedAt}T00:00:00Z`))}{q.expired ? " · vencido" : ""}</span><span className="shrink-0 font-bold tabular-nums">{formatBRL(q.amount)} · {q.daysWithoutAction} d</span></li>)}</ul>
                  ) : <p className="px-5 py-4 text-sm text-text-muted">{stale?.unavailableReason ?? "Nenhum orçamento parado."}</p>}
                </Card>
              </div>
            </div>

            <Card aria-labelledby="achados">
              <CardHeader id="achados" title="Achados por regra a partir dos dados" />
              {findings.length ? (
                <ul className="divide-y divide-border">
                  {findings.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <span className="min-w-0 flex-1"><span className="font-bold">{f.title}</span><span className="block text-xs text-text-muted">{f.description}</span><span className="block text-xs text-text-subtle">Fonte: {((f.evidenceJson as { text?: string }[] | null) ?? []).map((e) => e.text).join(" · ")}</span></span>
                      <StatusBadge context="origin" value={f.origin} />
                      {f.opportunities[0] ? <Link className="text-xs font-bold text-navy hover:underline" href={`/clientes/${clientId}/oportunidades?sel=${f.opportunities[0].id}`}>Ver O-{String(f.opportunities[0].number).padStart(2, "0")}</Link> : canEdit ? <Button asChild size="sm" variant="secondary"><Link href={`/clientes/${clientId}/oportunidades/nova?achado=${f.id}`}>Gerar oportunidade</Link></Button> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="px-5 py-4 text-sm text-text-muted">Nenhum achado por regra com os dados atuais.</p>}
            </Card>
          </>
        ) : (
          <Card><EmptyState icon={Database} title="Nenhum dado importado" description="Comece pelos clientes, depois produtos, vendas (pedido ou faturamento), itens e orçamentos. Baixe os modelos acima." action={canEdit ? <Button asChild><Link href={`${base}/importar`}>Importar arquivo</Link></Button> : undefined} /></Card>
        )}

        <Card aria-labelledby="lotes">
          <CardHeader id="lotes" title="Histórico de importações" />
          {batches.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase"><th className="px-5 py-2">Arquivo</th><th className="px-2 py-2">Tipo</th><th className="px-2 py-2">Origem</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Resultado</th><th className="px-5 py-2">Enviado</th></tr></thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-t border-border hover:bg-surface-muted">
                      <td className="px-5 py-2"><Link className="font-bold text-navy hover:underline" href={`${base}/importar/${b.id}`}>{b.originalName}</Link></td>
                      <td className="px-2 py-2">{IMPORT_TYPES[b.type].label}{b.recordKind ? ` (${b.recordKind === "ORDER" ? "pedido" : "faturamento"})` : ""}</td>
                      <td className="px-2 py-2">{b.sourceSystem}</td>
                      <td className="px-2 py-2"><StatusBadge context="importBatch" value={b.status} /></td>
                      <td className="px-2 py-2 text-xs">{["COMPLETED", "PARTIAL"].includes(b.status) ? `${b.createdRows} novos · ${b.updatedRows} atualizados · ${b.unchangedRows} sem alteração · ${b.rejectedRows} rejeitados` : `${b.totalRows} linhas`}</td>
                      <td className="px-5 py-2 text-xs">{formatDateTime(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="px-5 py-4 text-sm text-text-muted">Nenhum envio ainda.</p>}
        </Card>
      </PageContent>
    </>
  );
}
