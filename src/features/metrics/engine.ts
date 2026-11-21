/**
 * Motor de métricas (seção 7): funções puras e determinísticas, sem IA.
 * Regra geral: sem dado suficiente → `value: null` + motivo; nunca zero inventado.
 */
export const CALC_VERSION = "kpi-1.0";

export type SaleRow = { id: string; customerId: string; date: string; kind: "ORDER" | "INVOICE"; status: "VALID" | "CANCELLED" | "RETURN"; gross: number | null; discounts: number | null; deductions: number | null; net: number; netDerived: boolean };
export type ItemRow = { saleId: string; productId: string | null; total: number; costTotal: number | null };
export type QuoteRow = { id: string; customerId: string; issuedAt: string; validUntil: string | null; status: "OPEN" | "WON" | "LOST" | "EXPIRED"; amount: number; lastInteractionAt: string | null };
export type CustomerRow = { id: string; externalId: string; name: string; active: boolean | null; typicalIntervalDays: number | null };
export type Period = { start: string; end: string }; // AAAA-MM-DD inclusivo

export type Metric = { code: string; label: string; value: number | null; unit: "BRL" | "COUNT" | "PERCENT" | "DAYS" | "RATIO"; reason?: string; basis?: string };

const inP = (d: string, p: Period) => d >= p.start && d <= p.end;
const r = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const DAY = 86_400_000;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Base escolhida: faturamento se houver; senão pedido. Nunca soma pedido + nota (mesma venda em dois registros). */
export function primaryKind(sales: SaleRow[]): "ORDER" | "INVOICE" | null {
  if (sales.some((s) => s.kind === "INVOICE")) return "INVOICE";
  return sales.length ? "ORDER" : null;
}
export const kindLabel = (k: "ORDER" | "INVOICE") => (k === "INVOICE" ? "faturamento" : "pedidos");

/** Vendas da base no período: válidas somam; devoluções (negativas) abatem; canceladas nunca entram. */
export function periodSales(sales: SaleRow[], p: Period, kind: "ORDER" | "INVOICE") {
  return sales.filter((s) => s.kind === kind && s.status !== "CANCELLED" && inP(s.date, p));
}

export function computeKpis(input: { sales: SaleRow[]; items: ItemRow[]; quotes: QuoteRow[]; period: Period; topN: number }): Metric[] {
  const { period: p } = input;
  const kind = primaryKind(input.sales);
  const out: Metric[] = [];
  if (!kind) {
    for (const [code, label, unit] of [["SALES_VALUE", "Valor comercial", "BRL"], ["ACTIVE_CUSTOMERS", "Clientes ativos", "COUNT"], ["AVG_ORDER_VALUE", "Ticket médio", "BRL"]] as const)
      out.push({ code, label, value: null, unit, reason: "Sem vendas importadas" });
  } else {
    const rows = periodSales(input.sales, p, kind);
    const valid = rows.filter((s) => s.status === "VALID");
    const value = r(rows.reduce((t, s) => t + s.net, 0));
    const basis = `Base: ${kindLabel(kind)}; canceladas excluídas; devoluções abatidas`;
    const label = kind === "INVOICE" ? "Valor faturado registrado" : "Valor comercial registrado (pedidos)";
    out.push({ code: "SALES_VALUE", label, value: rows.length ? value : null, unit: "BRL", basis, reason: rows.length ? undefined : "Sem vendas no período" });
    const customers = new Set(valid.map((s) => s.customerId));
    out.push({ code: "ACTIVE_CUSTOMERS", label: "Clientes ativos", value: customers.size, unit: "COUNT", basis: "Clientes distintos com venda válida no período" });
    out.push({ code: "AVG_ORDER_VALUE", label: "Ticket médio", value: valid.length ? r(value / valid.length) : null, unit: "BRL", basis: "Valor do período ÷ vendas válidas", reason: valid.length ? undefined : "Sem vendas válidas" });
    out.push({ code: "SALES_FREQUENCY", label: "Frequência de compra", value: customers.size ? r(valid.length / customers.size) : null, unit: "RATIO", basis: "Vendas válidas ÷ clientes ativos no período", reason: customers.size ? undefined : "Sem clientes ativos" });

    // Receita líquida: só faturamento com deduções informadas em todas as vendas válidas
    const complete = kind === "INVOICE" && valid.length > 0 && valid.every((s) => s.deductions != null);
    out.push({ code: "NET_REVENUE", label: "Receita líquida", value: complete ? value : null, unit: "BRL", reason: complete ? undefined : kind === "ORDER" ? "Base é pedido, não faturamento" : "Deduções/impostos não informados em todas as vendas", basis: "Faturamento menos deduções e devoluções" });

    // Desconto médio ponderado
    const withGross = valid.filter((s) => s.gross != null && s.gross > 0);
    const grossSum = withGross.reduce((t, s) => t + s.gross!, 0);
    out.push({ code: "DISCOUNT_RATE", label: "Desconto médio ponderado", value: grossSum > 0 ? r((withGross.reduce((t, s) => t + (s.discounts ?? 0), 0) / grossSum) * 100) : null, unit: "PERCENT", basis: "Σ descontos ÷ Σ valor bruto × 100", reason: grossSum > 0 ? undefined : "Valor bruto não informado" });

    // Margem de contribuição: exige itens com custo variável em todas as vendas válidas do período
    const saleIds = new Set(valid.map((s) => s.id));
    const items = input.items.filter((i) => saleIds.has(i.saleId));
    const salesWithItems = new Set(items.map((i) => i.saleId));
    const missingItems = valid.filter((s) => !salesWithItems.has(s.id)).length;
    const missingCost = items.filter((i) => i.costTotal == null).length;
    if (!valid.length || missingItems || missingCost) {
      const reason = !valid.length ? "Sem vendas válidas" : missingItems ? `${missingItems} venda(s) sem itens importados` : `Custo variável ausente em ${missingCost} de ${items.length} itens`;
      out.push({ code: "CONTRIBUTION_MARGIN", label: "Margem de contribuição", value: null, unit: "BRL", reason: `Margem indisponível: ${reason}` });
      out.push({ code: "CONTRIBUTION_MARGIN_PCT", label: "Margem de contribuição %", value: null, unit: "PERCENT", reason: `Margem indisponível: ${reason}` });
    } else {
      const rev = items.reduce((t, i) => t + i.total, 0);
      const mc = rev - items.reduce((t, i) => t + i.costTotal!, 0);
      out.push({ code: "CONTRIBUTION_MARGIN", label: "Margem de contribuição", value: r(mc), unit: "BRL", basis: "Σ valor dos itens − Σ custo variável informado (não é lucro)" });
      out.push({ code: "CONTRIBUTION_MARGIN_PCT", label: "Margem de contribuição %", value: rev > 0 ? r((mc / rev) * 100) : null, unit: "PERCENT", basis: "MC ÷ valor dos itens × 100" });
    }

    // Concentração top N
    const byCustomer = new Map<string, number>();
    for (const s of rows) byCustomer.set(s.customerId, (byCustomer.get(s.customerId) ?? 0) + s.net);
    const sorted = [...byCustomer.values()].sort((a, b) => b - a);
    const top = sorted.slice(0, input.topN).reduce((t, v) => t + v, 0);
    out.push({ code: "CUSTOMER_CONCENTRATION", label: `Concentração nos ${input.topN} maiores clientes`, value: value > 0 ? r((top / value) * 100) : null, unit: "PERCENT", basis: `Participação dos ${input.topN} maiores no valor do período`, reason: value > 0 ? undefined : "Sem valor no período" });
  }

  // Conversão de orçamentos: ganhos ÷ (ganhos + perdidos) emitidos no período; abertos não contam como perda
  const q = input.quotes.filter((x) => inP(x.issuedAt, p));
  const won = q.filter((x) => x.status === "WON").length, lost = q.filter((x) => x.status === "LOST").length;
  out.push({ code: "QUOTE_CONVERSION", label: "Conversão de orçamentos", value: won + lost ? r((won / (won + lost)) * 100) : null, unit: "PERCENT", basis: "Ganhos ÷ (ganhos + perdidos), por data de emissão", reason: won + lost ? undefined : input.quotes.length ? "Nenhum orçamento com desfecho no período" : "Sem orçamentos importados" });
  return out;
}

export type InactivityParams = { minDays: number; factor: number; fallbackDays: number; minIntervals: number };
export type InactiveCustomer = { customerId: string; externalId: string; name: string; lastPurchase: string; daysSince: number; threshold: number; confidence: "ALTA" | "MÉDIA" | "BAIXA"; basis: string; value12m: number };

/**
 * Inatividade (7.1): com ≥ N intervalos, limite = max(mínimo, mediana × fator) [confiança alta];
 * senão periodicidade informada [média]; senão janela fixa [baixa]. Cliente marcado inativo/encerrado é excluído.
 */
export function inactiveCustomers(sales: SaleRow[], customers: CustomerRow[], refDate: string, prm: InactivityParams): InactiveCustomer[] {
  const kind = primaryKind(sales);
  if (!kind) return [];
  const dates = new Map<string, Set<string>>();
  const value = new Map<string, number>();
  const yearAgo = new Date(Date.parse(`${refDate}T00:00:00Z`) - 365 * DAY).toISOString().slice(0, 10);
  for (const s of sales) {
    if (s.kind !== kind || s.status !== "VALID" || s.date > refDate) continue;
    if (!dates.has(s.customerId)) dates.set(s.customerId, new Set());
    dates.get(s.customerId)!.add(s.date);
    if (s.date > yearAgo) value.set(s.customerId, (value.get(s.customerId) ?? 0) + s.net);
  }
  const out: InactiveCustomer[] = [];
  for (const c of customers) {
    if (c.active === false) continue;
    const ds = [...(dates.get(c.id) ?? [])].sort();
    if (!ds.length) continue;
    const intervals = ds.slice(1).map((d, i) => daysBetween(ds[i]!, d)).filter((x) => x > 0);
    let threshold: number, confidence: InactiveCustomer["confidence"], basis: string;
    if (intervals.length >= prm.minIntervals) {
      const m = median(intervals)!;
      threshold = Math.max(prm.minDays, Math.round(m * prm.factor));
      confidence = "ALTA";
      basis = `mediana de ${intervals.length} intervalos = ${m} dias × ${prm.factor}`;
    } else if (c.typicalIntervalDays) {
      threshold = Math.max(prm.minDays, Math.round(c.typicalIntervalDays * prm.factor));
      confidence = "MÉDIA";
      basis = `periodicidade informada ${c.typicalIntervalDays} dias × ${prm.factor}`;
    } else {
      threshold = prm.fallbackDays;
      confidence = "BAIXA";
      basis = `histórico curto: janela fixa de ${prm.fallbackDays} dias`;
    }
    const last = ds.at(-1)!;
    const since = daysBetween(last, refDate);
    if (since > threshold) out.push({ customerId: c.id, externalId: c.externalId, name: c.name, lastPurchase: last, daysSince: since, threshold, confidence, basis, value12m: r(value.get(c.id) ?? 0) });
  }
  return out.sort((a, b) => b.value12m - a.value12m || b.daysSince - a.daysSince);
}

export type AbcRow = { id: string; value: number; share: number; cumulative: number; cls: "A" | "B" | "C" };

/** Curva ABC (7.2) por valor comercial — segmentação por valor, não prova de rentabilidade. */
export function abcCurve(values: Map<string, number>, aPct: number, bPct: number): AbcRow[] {
  const entries = [...values.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((t, [, v]) => t + v, 0);
  let acc = 0;
  return entries.map(([id, v]) => {
    const before = acc;
    acc += v;
    const cumulative = total ? (acc / total) * 100 : 0;
    const cls = before / (total || 1) * 100 < aPct ? "A" : before / (total || 1) * 100 < bPct ? "B" : "C";
    return { id, value: r(v), share: total ? r((v / total) * 100) : 0, cumulative: r(cumulative), cls };
  });
}

export type StaleQuote = { quoteId: string; customerId: string; amount: number; issuedAt: string; lastAction: string; daysWithoutAction: number; expired: boolean };

/** Orçamentos abertos sem ação há mais de X dias (RF-043). */
export function staleQuotes(quotes: QuoteRow[], refDate: string, days: number): StaleQuote[] {
  return quotes
    .filter((q) => q.status === "OPEN")
    .map((q) => {
      const last = q.lastInteractionAt && q.lastInteractionAt > q.issuedAt ? q.lastInteractionAt : q.issuedAt;
      return { quoteId: q.id, customerId: q.customerId, amount: q.amount, issuedAt: q.issuedAt, lastAction: last, daysWithoutAction: daysBetween(last, refDate), expired: !!q.validUntil && q.validUntil < refDate };
    })
    .filter((q) => q.daysWithoutAction > days)
    .sort((a, b) => b.amount - a.amount);
}
