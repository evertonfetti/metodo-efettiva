import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertClientAccess } from "@/lib/security/access";
import { addDays, parseDateOnly, toISODate, todayDateOnly } from "@/lib/dates";
import { formatDay } from "@/lib/format";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/service";
import { getSetting } from "@/features/settings/service";
import { abcCurve, CALC_VERSION, computeKpis, inactiveCustomers, kindLabel, median, primaryKind, staleQuotes, type Metric, type Period, type SaleRow } from "./engine";

const n = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));
const FILE_LABEL: Record<string, string> = { CUSTOMERS: "clientes", PRODUCTS: "produtos", SALES: "vendas", SALE_ITEMS: "itens de venda", QUOTES: "orçamentos" };

async function loadData(clientId: string) {
  const [sales, items, quotes, customers, batches] = await Promise.all([
    prisma.sale.findMany({ where: { clientId }, select: { id: true, customerId: true, occurredAt: true, recordKind: true, status: true, grossAmount: true, discounts: true, deductions: true, netAmount: true, netDerived: true } }),
    prisma.saleItem.findMany({ where: { clientId }, select: { saleId: true, productId: true, totalAmount: true, variableCostTotal: true } }),
    prisma.quote.findMany({ where: { clientId }, select: { id: true, customerId: true, issuedAt: true, validUntil: true, status: true, amount: true, lastInteractionAt: true } }),
    prisma.customer.findMany({ where: { clientId }, select: { id: true, externalId: true, name: true, active: true, typicalIntervalDays: true } }),
    prisma.importBatch.findMany({ where: { clientId, status: { in: ["COMPLETED", "PARTIAL"] } }, select: { id: true, type: true, sourceSystem: true, originalName: true, finishedAt: true, sourceValidated: true, recordKind: true }, orderBy: { finishedAt: "desc" } }),
  ]);
  return {
    sales: sales.map((s): SaleRow => ({ id: s.id, customerId: s.customerId, date: toISODate(s.occurredAt), kind: s.recordKind, status: s.status, gross: n(s.grossAmount), discounts: n(s.discounts), deductions: n(s.deductions), net: Number(s.netAmount), netDerived: s.netDerived })),
    items: items.map((i) => ({ saleId: i.saleId, productId: i.productId, total: Number(i.totalAmount), costTotal: n(i.variableCostTotal) })),
    quotes: quotes.map((q) => ({ id: q.id, customerId: q.customerId, issuedAt: toISODate(q.issuedAt), validUntil: q.validUntil ? toISODate(q.validUntil) : null, status: q.status, amount: Number(q.amount), lastInteractionAt: q.lastInteractionAt ? toISODate(q.lastInteractionAt) : null })),
    customers,
    batches,
  };
}

const latestBatch = (batches: Awaited<ReturnType<typeof loadData>>["batches"], type: string) => batches.find((b) => b.type === type) ?? null;
const sourceRef = (b: { id: string; type: string; originalName: string; sourceSystem: string; finishedAt: Date | null } | null) =>
  b ? { batchId: b.id, label: `${b.originalName} (${FILE_LABEL[b.type]}, ${b.sourceSystem}) · lote ${b.id.slice(0, 8)} · ${formatDay(b.finishedAt)}` } : null;

/** Período principal: 12 meses terminando na última venda importada (ou hoje, se mais cedo). */
export function mainPeriod(sales: SaleRow[], today: string): Period {
  const last = sales.reduce((m, s) => (s.date > m ? s.date : m), "");
  const end = last && last < today ? last : today;
  return { start: toISODate(addDays(parseDateOnly(end)!, -364)), end };
}

/**
 * Recalcula snapshots (KPIs do período, série mensal, inatividade, ABC, orçamentos parados) com
 * fonte, período, versão da fórmula e qualidade de entrada. Substitui snapshots não vinculados a projeto
 * da mesma versão de cálculo (baselines de projeto ficam em tabela própria na Fase 6).
 */
export async function refreshMetrics(clientId: string, userId: string | null) {
  const data = await loadData(clientId);
  const prm = await getSetting("parameters");
  const today = toISODate(todayDateOnly(prm.timezone));
  const period = mainPeriod(data.sales, today);
  const kind = primaryKind(data.sales);
  const salesSrc = sourceRef(latestBatch(data.batches, "SALES"));
  const quality = dataQuality(data, today);
  const inputQuality = quality.alerts.some((a) => a.code === "DADOS_INSUFICIENTES") ? "INSUFICIENTE" : quality.alerts.length ? "PARCIAL" : "OK";
  const kpis = computeKpis({ sales: data.sales, items: data.items, quotes: data.quotes, period, topN: prm.topNConcentration });
  const rows: Prisma.MetricSnapshotCreateManyInput[] = [];
  const add = (m: Metric, p: Period, extra: object = {}) =>
    rows.push({
      clientId,
      metricCode: m.code,
      periodStart: parseDateOnly(p.start)!,
      periodEnd: parseDateOnly(p.end)!,
      valueDecimal: m.value == null ? null : new Prisma.Decimal(m.value),
      unit: m.unit,
      calculationVersion: CALC_VERSION,
      unavailableReason: m.reason ?? null,
      inputQuality,
      recordedBy: userId,
      sourceJson: { label: m.label, basis: m.basis ?? null, recordKind: kind, source: m.code === "QUOTE_CONVERSION" ? sourceRef(latestBatch(data.batches, "QUOTES")) : salesSrc, ...extra } as Prisma.InputJsonValue,
    });
  for (const m of kpis) add(m, period, { scope: "PERIOD" });

  // Série mensal (até 24 meses) para gráficos
  if (kind) {
    const months = [...new Set(data.sales.filter((s) => s.kind === kind).map((s) => s.date.slice(0, 7)))].sort().slice(-24);
    for (const ym of months) {
      const start = `${ym}-01`;
      const end = toISODate(addDays(parseDateOnly(toISODate(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1))))!, -1));
      for (const m of computeKpis({ sales: data.sales, items: [], quotes: [], period: { start, end }, topN: prm.topNConcentration }).filter((x) => ["SALES_VALUE", "ACTIVE_CUSTOMERS", "AVG_ORDER_VALUE"].includes(x.code))) add(m, { start, end }, { scope: "MONTH" });
    }
  }

  // Inatividade, recência, ABC e orçamentos parados (data de referência = hoje)
  const inactive = inactiveCustomers(data.sales, data.customers, today, { minDays: prm.inactivityMinDays, factor: prm.inactivityAlertFactor, fallbackDays: prm.inactivityFallbackDays, minIntervals: prm.minIntervalsForMedian });
  const custWithSales = new Set(data.sales.filter((s) => s.status === "VALID").map((s) => s.customerId)).size;
  add({ code: "INACTIVE_CUSTOMERS", label: "Clientes com sinal de inatividade", value: kind ? inactive.length : null, unit: "COUNT", reason: kind ? undefined : "Sem vendas importadas", basis: `Recência > max(${prm.inactivityMinDays} dias, mediana dos intervalos × ${prm.inactivityAlertFactor}); referência ${formatDay(parseDateOnly(today))}` }, { start: today, end: today }, { scope: "ANALYSIS", eligible: custWithSales, list: inactive.slice(0, 200), valueAtRisk: Math.round(inactive.reduce((t, c) => t + c.value12m, 0) * 100) / 100 });

  const lastByCustomer = new Map<string, string>();
  for (const s of data.sales) if (s.status === "VALID" && s.kind === kind && s.date > (lastByCustomer.get(s.customerId) ?? "")) lastByCustomer.set(s.customerId, s.date);
  const rec = median([...lastByCustomer.values()].map((d) => Math.max(0, Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000))));
  add({ code: "DAYS_SINCE_LAST_PURCHASE", label: "Recência mediana", value: rec, unit: "DAYS", reason: rec == null ? "Sem vendas" : undefined, basis: "Mediana de dias desde a última compra válida por cliente" }, { start: today, end: today }, { scope: "ANALYSIS" });

  if (kind) {
    const byCustomer = new Map<string, number>();
    for (const s of data.sales) if (s.kind === kind && s.status !== "CANCELLED" && s.date >= period.start && s.date <= period.end) byCustomer.set(s.customerId, (byCustomer.get(s.customerId) ?? 0) + s.net);
    const abc = abcCurve(byCustomer, prm.abcAThreshold, prm.abcBThreshold);
    const names = new Map(data.customers.map((c) => [c.id, `${c.externalId} · ${c.name}`]));
    const classes = (["A", "B", "C"] as const).map((c) => ({ cls: c, count: abc.filter((x) => x.cls === c).length, share: Math.round(abc.filter((x) => x.cls === c).reduce((t, x) => t + x.share, 0) * 100) / 100 }));
    add({ code: "ABC_CUSTOMERS", label: "Curva ABC de clientes (por valor)", value: abc.length, unit: "COUNT", basis: `A até ${prm.abcAThreshold}% · B até ${prm.abcBThreshold}% do valor acumulado; segmentação por valor, não por margem` }, period, { scope: "ANALYSIS", classes, top: abc.slice(0, 50).map((x) => ({ ...x, name: names.get(x.id) ?? x.id })) });

    const saleOk = new Set(data.sales.filter((s) => s.kind === kind && s.status !== "CANCELLED" && s.date >= period.start && s.date <= period.end).map((s) => s.id));
    const byProduct = new Map<string, number>();
    for (const i of data.items) if (i.productId && saleOk.has(i.saleId)) byProduct.set(i.productId, (byProduct.get(i.productId) ?? 0) + i.total);
    if (byProduct.size) {
      const pabc = abcCurve(byProduct, prm.abcAThreshold, prm.abcBThreshold);
      const prods = new Map((await prisma.product.findMany({ where: { clientId, id: { in: pabc.slice(0, 50).map((x) => x.id) } }, select: { id: true, externalId: true, name: true } })).map((p) => [p.id, `${p.externalId} · ${p.name}`]));
      add({ code: "ABC_PRODUCTS", label: "Curva ABC de produtos (por valor)", value: pabc.length, unit: "COUNT", basis: "Valor dos itens no período" }, period, { scope: "ANALYSIS", source: sourceRef(latestBatch(data.batches, "SALE_ITEMS")), classes: (["A", "B", "C"] as const).map((c) => ({ cls: c, count: pabc.filter((x) => x.cls === c).length, share: Math.round(pabc.filter((x) => x.cls === c).reduce((t, x) => t + x.share, 0) * 100) / 100 })), top: pabc.slice(0, 50).map((x) => ({ ...x, name: prods.get(x.id) ?? x.id })) });
    }
  }
  const stale = staleQuotes(data.quotes, today, prm.staleQuoteDays);
  const custName = new Map(data.customers.map((c) => [c.id, `${c.externalId} · ${c.name}`]));
  add({ code: "STALE_QUOTES", label: "Orçamentos abertos sem ação", value: data.quotes.length ? stale.length : null, unit: "COUNT", reason: data.quotes.length ? undefined : "Sem orçamentos importados", basis: `Abertos sem interação há mais de ${prm.staleQuoteDays} dias` }, { start: today, end: today }, { scope: "ANALYSIS", source: sourceRef(latestBatch(data.batches, "QUOTES")), open: data.quotes.filter((q) => q.status === "OPEN").length, amount: Math.round(stale.reduce((t, q) => t + q.amount, 0) * 100) / 100, list: stale.slice(0, 200).map((q) => ({ ...q, customer: custName.get(q.customerId) ?? "" })) });

  await prisma.$transaction(async (tx) => {
    await tx.metricSnapshot.deleteMany({ where: { clientId, projectId: null, calculationVersion: CALC_VERSION } });
    for (let i = 0; i < rows.length; i += 500) await tx.metricSnapshot.createMany({ data: rows.slice(i, i + 500) });
  });
  await upsertDataFindings(clientId, userId);
  await audit({ actorUserId: userId, clientId, entityType: "MetricSnapshot", action: "metrics.refresh", meta: { snapshots: rows.length, period: `${period.start}..${period.end}` } });
  return { snapshots: rows.length, period };
}

export type QualityAlert = { code: "DADOS_INSUFICIENTES" | "PERIODO_CURTO" | "FONTE_NAO_VALIDADA" | "DADOS_DESATUALIZADOS"; message: string };

/** Qualidade por fonte (6.3): completude, consistência, atualidade, cobertura temporal + alertas. */
export function dataQuality(data: Awaited<ReturnType<typeof loadData>>, today: string) {
  const alerts: QualityAlert[] = [];
  const kind = primaryKind(data.sales);
  const valid = data.sales.filter((s) => s.status === "VALID" && s.kind === kind);
  const months = new Set(valid.map((s) => s.date.slice(0, 7))).size;
  const lastSale = valid.reduce((m, s) => (s.date > m ? s.date : m), "");
  const salesBatch = latestBatch(data.batches, "SALES");
  if (valid.length < 30 || data.customers.length < 10) alerts.push({ code: "DADOS_INSUFICIENTES", message: `Base pequena: ${valid.length} vendas válidas e ${data.customers.length} clientes. Indicadores podem não representar a operação.` });
  if (valid.length && months < 6) alerts.push({ code: "PERIODO_CURTO", message: `Histórico cobre ${months} ${months === 1 ? "mês" : "meses"}: tendências e inatividade têm baixa confiança.` });
  if (salesBatch && !salesBatch.sourceValidated) alerts.push({ code: "FONTE_NAO_VALIDADA", message: `Fonte de vendas (${salesBatch.sourceSystem}) ainda não validada com o cliente.` });
  const stale = (lastSale && (Date.parse(today) - Date.parse(lastSale)) / 86_400_000 > 45) || (salesBatch?.finishedAt && (Date.now() - salesBatch.finishedAt.getTime()) / 86_400_000 > 45);
  if (stale) alerts.push({ code: "DADOS_DESATUALIZADOS", message: `Última venda em ${lastSale ? formatDay(parseDateOnly(lastSale)) : "—"}; última importação em ${formatDay(salesBatch?.finishedAt)}.` });
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  return {
    alerts,
    kind,
    months,
    lastSale: lastSale || null,
    completeness: {
      salesWithGross: pct(valid.filter((s) => s.gross != null).length, valid.length),
      salesDerivedNet: pct(valid.filter((s) => s.netDerived).length, valid.length),
      itemsWithCost: pct(data.items.filter((i) => i.costTotal != null).length, data.items.length),
      salesWithItems: pct(new Set(data.items.map((i) => i.saleId)).size, data.sales.length),
      cancelled: pct(data.sales.filter((s) => s.status === "CANCELLED").length, data.sales.length),
    },
  };
}

/** Achados preliminares por regra a partir dos dados (origem RULE, com fonte). Idempotentes por (cliente, ruleKey). */
async function upsertDataFindings(clientId: string, userId: string | null) {
  const snaps = await prisma.metricSnapshot.findMany({ where: { clientId, projectId: null, metricCode: { in: ["INACTIVE_CUSTOMERS", "STALE_QUOTES", "CUSTOMER_CONCENTRATION", "CONTRIBUTION_MARGIN"] }, sourceJson: { path: ["scope"], not: "MONTH" } } });
  const get = (c: string) => snaps.find((s) => s.metricCode === c);
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { isDemo: true } });
  const rules: { key: string; domain: string; type: "PROBLEM" | "RISK" | "DATA_GAP"; title: string; description: string; evidence: string; severity: "LOW" | "MEDIUM" | "HIGH" }[] = [];
  const src = (s: (typeof snaps)[number]) => ((s.sourceJson as { source?: { label?: string } }).source?.label ?? "dados importados");
  const inc = get("INACTIVE_CUSTOMERS");
  if (inc?.valueDecimal && Number(inc.valueDecimal) > 0) {
    const j = inc.sourceJson as { eligible?: number; valueAtRisk?: number; basis?: string };
    rules.push({ key: "DATA:INACTIVE", domain: "DIAG05", type: "PROBLEM", severity: "HIGH", title: `${Number(inc.valueDecimal)} clientes com sinal de inatividade`, description: `Regra de inatividade disparou em ${Number(inc.valueDecimal)} de ${j.eligible ?? "?"} clientes com compra válida (valor dos últimos 12 meses desses clientes: R$ ${(j.valueAtRisk ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}). Preliminar: validar exclusões (encerrados, bloqueados, sazonais).`, evidence: `Regra de inatividade (${(inc.sourceJson as { basis?: string }).basis ?? ""}) · ${src(inc)}` });
  }
  const sq = get("STALE_QUOTES");
  if (sq?.valueDecimal && Number(sq.valueDecimal) > 0) {
    const j = sq.sourceJson as { open?: number; amount?: number };
    rules.push({ key: "DATA:STALE_QUOTES", domain: "DIAG04", type: "PROBLEM", severity: "MEDIUM", title: `${Number(sq.valueDecimal)} de ${j.open ?? "?"} orçamentos abertos sem follow-up`, description: `Orçamentos abertos sem interação registrada acima do limite configurado, somando R$ ${(j.amount ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Preliminar: confirmar se o registro de contatos está completo.`, evidence: `Regra de orçamentos parados · ${src(sq)}` });
  }
  const cc = get("CUSTOMER_CONCENTRATION");
  if (cc?.valueDecimal && Number(cc.valueDecimal) >= 50) rules.push({ key: "DATA:CONCENTRATION", domain: "DIAG05", type: "RISK", severity: "MEDIUM", title: `Alta concentração: ${String(Number(cc.valueDecimal)).replace(".", ",")}% do valor nos maiores clientes`, description: "Concentração elevada aumenta o risco de perda de receita com a saída de poucos clientes. Preliminar: avaliar contratos e relacionamento.", evidence: `Concentração de clientes · ${src(cc)}` });
  const mc = get("CONTRIBUTION_MARGIN");
  if (mc && mc.valueDecimal == null && inc?.valueDecimal != null) rules.push({ key: "DATA:NO_MARGIN", domain: "DIAG07", type: "DATA_GAP", severity: "LOW", title: "Margem de contribuição indisponível", description: `${mc.unavailableReason ?? "Custos variáveis não informados"}. Sem custo confiável não há margem nem ABC por margem.`, evidence: `Cálculo de margem · ${src(mc)}` });

  for (const r of rules) {
    const existing = await prisma.finding.findFirst({ where: { clientId, ruleKey: r.key, assessmentId: null } });
    const evidenceJson = [{ kind: "DATA_RULE", text: r.evidence }];
    if (existing) {
      if (existing.status === "DISMISSED") continue;
      await prisma.finding.update({ where: { id: existing.id }, data: { title: r.title, description: r.description, evidenceJson } });
    } else {
      await prisma.finding.create({ data: { clientId, ruleKey: r.key, type: r.type, domainCode: r.domain, title: r.title, description: r.description, severity: r.severity, confidence: "MEDIUM", origin: "RULE", evidenceJson, createdBy: userId, isDemo: client.isDemo } });
    }
  }
}

// ───────────────────────── leitura ─────────────────────────

export async function getMetricsOverview(user: SessionUser, clientId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  const prm = await getSetting("parameters");
  const today = toISODate(todayDateOnly(prm.timezone));
  const [snaps, data, counts] = await Promise.all([
    prisma.metricSnapshot.findMany({ where: { clientId, projectId: null, calculationVersion: CALC_VERSION }, orderBy: { periodStart: "asc" } }),
    loadData(clientId),
    Promise.all([prisma.customer.count({ where: { clientId } }), prisma.product.count({ where: { clientId } }), prisma.sale.count({ where: { clientId } }), prisma.saleItem.count({ where: { clientId } }), prisma.quote.count({ where: { clientId } })]),
  ]);
  const scope = (s: (typeof snaps)[number]) => (s.sourceJson as { scope?: string }).scope;
  return {
    period: snaps.find((s) => scope(s) === "PERIOD") ? { start: snaps.find((s) => scope(s) === "PERIOD")!.periodStart, end: snaps.find((s) => scope(s) === "PERIOD")!.periodEnd } : null,
    kpis: snaps.filter((s) => scope(s) === "PERIOD"),
    monthly: snaps.filter((s) => scope(s) === "MONTH"),
    analyses: Object.fromEntries(snaps.filter((s) => scope(s) === "ANALYSIS").map((s) => [s.metricCode, s])),
    computedAt: snaps[0]?.createdAt ?? null,
    quality: dataQuality(data, today),
    counts: { CUSTOMERS: counts[0], PRODUCTS: counts[1], SALES: counts[2], SALE_ITEMS: counts[3], QUOTES: counts[4] },
    batches: data.batches,
  };
}

export async function refreshMetricsForUser(user: SessionUser, clientId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  return refreshMetrics(clientId, user.id);
}

/** Série/valores agregados para a API (GET /metrics). */
export async function listMetrics(user: SessionUser, clientId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  return prisma.metricSnapshot.findMany({ where: { clientId, projectId: null, calculationVersion: CALC_VERSION }, orderBy: [{ metricCode: "asc" }, { periodStart: "asc" }] });
}
