import { describe, expect, it } from "vitest";
import { abcCurve, computeKpis, inactiveCustomers, staleQuotes, type SaleRow } from "@/features/metrics/engine";

const s = (id: string, customerId: string, date: string, net: number, status: SaleRow["status"] = "VALID", extra: Partial<SaleRow> = {}): SaleRow => ({ id, customerId, date, kind: "ORDER", status, gross: null, discounts: null, deductions: null, net, netDerived: false, ...extra });
const P = { start: "2026-01-01", end: "2026-12-31" };
const val = (ms: ReturnType<typeof computeKpis>, c: string) => ms.find((m) => m.code === c)!;

describe("KPIs (seção 7)", () => {
  it("teste 4: cancelamentos não inflam vendas; devolução abate", () => {
    const ms = computeKpis({ sales: [s("1", "a", "2026-03-01", 1000), s("2", "a", "2026-03-02", 5000, "CANCELLED"), s("3", "b", "2026-03-03", -200, "RETURN"), s("4", "b", "2026-04-01", 600)], items: [], quotes: [], period: P, topN: 10 });
    expect(val(ms, "SALES_VALUE").value).toBe(1400);
    expect(val(ms, "ACTIVE_CUSTOMERS").value).toBe(2);
    expect(val(ms, "AVG_ORDER_VALUE").value).toBe(700);
  });
  it("teste 5: ausência de custo → margem indisponível (null com motivo)", () => {
    const sales = [s("1", "a", "2026-03-01", 1000), s("2", "a", "2026-03-05", 500)];
    const noCost = computeKpis({ sales, items: [{ saleId: "1", productId: "p", total: 1000, costTotal: 600 }, { saleId: "2", productId: "p", total: 500, costTotal: null }], quotes: [], period: P, topN: 10 });
    expect(val(noCost, "CONTRIBUTION_MARGIN")).toMatchObject({ value: null, reason: expect.stringMatching(/Custo variável ausente/) });
    const noItems = computeKpis({ sales, items: [], quotes: [], period: P, topN: 10 });
    expect(val(noItems, "CONTRIBUTION_MARGIN").value).toBeNull();
    const ok = computeKpis({ sales, items: [{ saleId: "1", productId: "p", total: 1000, costTotal: 600 }, { saleId: "2", productId: "p", total: 500, costTotal: 200 }], quotes: [], period: P, topN: 10 });
    expect(val(ok, "CONTRIBUTION_MARGIN").value).toBe(700);
    expect(val(ok, "CONTRIBUTION_MARGIN_PCT").value).toBe(46.67);
  });
  it("receita líquida só com faturamento e deduções; desconto ponderado; pedido + nota não somam", () => {
    const sales = [s("1", "a", "2026-03-01", 900, "VALID", { kind: "INVOICE", gross: 1000, discounts: 100, deductions: 0 }), s("2", "a", "2026-03-01", 900, "VALID", { kind: "ORDER" })];
    const ms = computeKpis({ sales, items: [], quotes: [], period: P, topN: 10 });
    expect(val(ms, "SALES_VALUE").value).toBe(900);
    expect(val(ms, "NET_REVENUE").value).toBe(900);
    expect(val(ms, "DISCOUNT_RATE").value).toBe(10);
    expect(val(computeKpis({ sales: [s("1", "a", "2026-03-01", 900)], items: [], quotes: [], period: P, topN: 10 }), "NET_REVENUE")).toMatchObject({ value: null, reason: expect.stringMatching(/pedido/) });
  });
  it("conversão de orçamentos ignora abertos; sem vendas = null", () => {
    const q = (id: string, status: "OPEN" | "WON" | "LOST") => ({ id, customerId: "a", issuedAt: "2026-05-01", validUntil: null, status, amount: 100, lastInteractionAt: null });
    const ms = computeKpis({ sales: [], items: [], quotes: [q("1", "WON"), q("2", "LOST"), q("3", "LOST"), q("4", "OPEN")], period: P, topN: 10 });
    expect(val(ms, "QUOTE_CONVERSION").value).toBe(33.33);
    expect(val(ms, "SALES_VALUE").value).toBeNull();
  });
});

describe("inatividade (7.1), ABC (7.2) e orçamentos parados", () => {
  const prm = { minDays: 30, factor: 1.5, fallbackDays: 60, minIntervals: 3 };
  const cust = (id: string, extra: object = {}) => ({ id, externalId: id, name: id, active: null, typicalIntervalDays: null, ...extra });
  it("mediana × fator com histórico; periodicidade informada; janela fixa; encerrado excluído", () => {
    const sales = [
      ...["2026-01-01", "2026-01-21", "2026-02-10", "2026-03-02"].map((d, i) => s(`a${i}`, "a", d, 100)), // intervalos 20 → limite max(30, 30)=30
      s("b1", "b", "2026-03-01", 100), // sem histórico: 60
      s("c1", "c", "2026-01-01", 100), // periodicidade 10 → max(30,15)=30
      s("d1", "d", "2026-01-01", 100), // encerrado
    ];
    const r = inactiveCustomers(sales, [cust("a"), cust("b"), cust("c", { typicalIntervalDays: 10 }), cust("d", { active: false })], "2026-04-15", prm);
    expect(r.map((x) => [x.customerId, x.confidence, x.threshold])).toEqual(expect.arrayContaining([["a", "ALTA", 30], ["c", "MÉDIA", 30]]));
    expect(r.find((x) => x.customerId === "b")).toBeUndefined(); // 45 dias < 60
    expect(r.find((x) => x.customerId === "d")).toBeUndefined();
  });
  it("ABC 80/95", () => {
    const r = abcCurve(new Map([["x", 70], ["y", 20], ["z", 6], ["w", 4]]), 80, 95);
    expect(r.map((x) => x.cls)).toEqual(["A", "A", "B", "C"]);
  });
  it("orçamento aberto sem ação acima do limite", () => {
    const r = staleQuotes([{ id: "1", customerId: "a", issuedAt: "2026-04-01", validUntil: null, status: "OPEN", amount: 10, lastInteractionAt: "2026-04-05" }, { id: "2", customerId: "a", issuedAt: "2026-04-10", validUntil: null, status: "OPEN", amount: 10, lastInteractionAt: null }, { id: "3", customerId: "a", issuedAt: "2026-01-01", validUntil: null, status: "WON", amount: 10, lastInteractionAt: null }], "2026-04-25", 15);
    expect(r.map((x) => x.quoteId)).toEqual(["1"]);
  });
});
