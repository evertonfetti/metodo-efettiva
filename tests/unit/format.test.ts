import { describe, expect, it } from "vitest";
import { formatBRL, formatMetric, formatDate, formatPercent, daysBetween, UNAVAILABLE } from "@/lib/format";

describe("format pt-BR", () => {
  it("null nunca vira zero", () => {
    expect(formatBRL(null)).toBe(UNAVAILABLE);
    expect(formatMetric(null, "integer")).toBe(UNAVAILABLE);
    expect(formatMetric(undefined, "percent")).toBe(UNAVAILABLE);
  });
  it("moeda e percentual em pt-BR", () => {
    expect(formatBRL(1234.56).replace(/ /g, " ")).toBe("R$ 1.234,56");
    expect(formatPercent(12.5)).toBe("12,5%");
    expect(formatMetric(0, "integer")).toBe("0");
  });
  it("data dd/mm/aaaa no fuso de São Paulo", () => {
    expect(formatDate("2026-01-01T02:00:00Z")).toBe("31/12/2025");
  });
  it("dias de calendário entre datas", () => {
    expect(daysBetween(new Date("2026-11-01T12:00:00Z"), new Date("2026-11-21T12:00:00Z"))).toBe(20);
  });
});
