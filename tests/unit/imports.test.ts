import { describe, expect, it } from "vitest";
import { decodeText, detectDelimiter, parseCsv, parseDateBR, parseNumberBR } from "@/features/imports/parse";
import { suggestMapping, mappingIssues } from "@/features/imports/fields";
import { validateRows } from "@/features/imports/validate";
import { toISODate } from "@/lib/dates";

describe("valores pt-BR (teste 3: moeda 1.234,56)", () => {
  it("números", () => {
    expect(parseNumberBR("1.234,56")).toEqual({ ok: true, value: 1234.56 });
    expect(parseNumberBR("R$ 1.234.567,8")).toEqual({ ok: true, value: 1234567.8 });
    expect(parseNumberBR("-50,00")).toEqual({ ok: true, value: -50 });
    expect(parseNumberBR("(50,00)")).toEqual({ ok: true, value: -50 });
    expect(parseNumberBR("1234.56")).toEqual({ ok: true, value: 1234.56 });
    expect(parseNumberBR("1.234")).toEqual({ ok: true, value: 1234 });
    expect(parseNumberBR(950)).toEqual({ ok: true, value: 950 });
    expect(parseNumberBR("")).toEqual({ ok: true, value: null });
    expect(parseNumberBR("12,34,5").ok).toBe(false);
    expect(parseNumberBR("abc").ok).toBe(false);
  });
  it("datas", () => {
    const d = (v: Parameters<typeof parseDateBR>[0]) => { const r = parseDateBR(v); return r.ok && r.value ? toISODate(r.value) : r.ok ? null : "ERR"; };
    expect(d("31/12/2025")).toBe("2025-12-31");
    expect(d("1/2/2026 14:30")).toBe("2026-02-01");
    expect(d("2026-10-12")).toBe("2026-10-12");
    expect(d(new Date(Date.UTC(2026, 9, 12)))).toBe("2026-10-12");
    expect(d("31/02/2026")).toBe("ERR");
    expect(d("12-10-2026")).toBe("ERR");
  });
});

describe("CSV", () => {
  it("BOM, separador ;, aspas e quebra de linha", () => {
    const t = parseCsv(decodeText(new TextEncoder().encode('﻿id;nome;valor\r\n1;"Comercial; Ltda";"1.000,00"\r\n2;"Linha\nquebrada";5\r\n\r\n')));
    expect(t.headers).toEqual(["id", "nome", "valor"]);
    expect(t.rows).toEqual([["1", "Comercial; Ltda", "1.000,00"], ["2", "Linha\nquebrada", "5"]]);
    expect(detectDelimiter('a,b,"c;d"\n')).toBe(",");
  });
  it("Latin-1 (Windows-1252) de ERPs", () => {
    expect(decodeText(Uint8Array.from([0x6f, 0x72, 0xe7, 0x61, 0x6d, 0x65, 0x6e, 0x74, 0x6f]))).toBe("orçamento");
  });
});

describe("validação das linhas (6.2)", () => {
  const sales = parseCsv(
    [
      "id_externo;id_cliente;data;status;tipo_registro;valor_bruto;descontos;deducoes;valor_liquido;vendedor",
      'PED1;CLI1;12/10/2026;confirmado;PEDIDO;"1.000,00";"50,00";;"950,00";V1',
      "PED2;CLI1;13/10/2026;cancelado;PEDIDO;500;;;500;V1",
      "PED3;CLI1;14/10/2026;confirmado;PEDIDO;800;100;;;V1",
      "PED4;CLI1;15/10/2026;confirmado;PEDIDO;;;;-100;V1",
      "PED5;CLI1;15/10/2026;devolvido;PEDIDO;;;;100;V1",
      ";CLI1;15/10/2026;confirmado;PEDIDO;;;;100;V1",
      "PED6;CLI1;15/10/2026;em trânsito;PEDIDO;;;;100;V1",
      "PED1;CLI1;12/10/2026;confirmado;PEDIDO;1000;50;;950;V1",
      "PED1;CLI1;12/10/2026;confirmado;PEDIDO;1000;50;;999;V1",
      "PED7;CLI1;16/10/2026;confirmado;FATURAMENTO;;;;100;V1",
    ].join("\n"),
  );
  const res = validateRows("SALES", sales, suggestMapping("SALES", sales.headers), { recordKind: "ORDER" });
  const errFor = (row: number) => res.errors.filter((e) => e.row === row).map((e) => `${e.field}: ${e.reason}`);
  it("aceita válidas, cancelada e líquido derivado", () => {
    const by = Object.fromEntries(res.records.map((r) => [r.key, r.data]));
    expect(by.PED1!.net).toBe(950);
    expect(by.PED2!.status).toBe("CANCELLED");
    expect(by.PED3).toMatchObject({ net: 700, netDerived: true });
    expect(by.PED5).toMatchObject({ status: "RETURN", net: -100 });
  });
  it("rejeita negativo fora de devolução, sem external_id, status desconhecido, tipo misturado e conflito", () => {
    expect(errFor(5)[0]).toMatch(/negativo/);
    expect(errFor(7)[0]).toMatch(/id_externo: obrigatório/);
    expect(errFor(8)[0]).toMatch(/status desconhecido/);
    expect(errFor(10)[0]).toMatch(/repetido.*linha 2/);
    expect(errFor(11)[0]).toMatch(/não misturar/);
    expect(res.duplicates).toBe(1);
  });
  it("mapeamento sugerido por sinônimos e checagem de obrigatórios", () => {
    const m = suggestMapping("CUSTOMERS", ["Código", "Razão Social", "Representante"]);
    expect(m).toMatchObject({ id_externo: "Código", nome: "Razão Social", vendedor: "Representante" });
    expect(mappingIssues("SALES", ["a"], { id_externo: "a" })).toContain("Campo obrigatório sem coluna: ID do cliente");
  });
});
