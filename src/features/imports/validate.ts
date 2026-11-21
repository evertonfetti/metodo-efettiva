import { createHash } from "node:crypto";
import { toISODate } from "@/lib/dates";
import { IMPORT_TYPES, quoteStatus, RECORD_KIND, saleStatus, type ImportTypeCode, type Mapping } from "./fields";
import { cellText, normalizeHeader, parseBoolBR, parseDateBR, parseNumberBR, type Cell, type Table } from "./parse";

export type RowError = { row: number; field: string | null; reason: string; raw: string | null };
export type NormalizedRow = { row: number; key: string; data: Record<string, string | number | boolean | null>; hash: string };
export type ValidationResult = { records: NormalizedRow[]; errors: RowError[]; duplicates: number; total: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const safe = (v: Cell) => {
  const t = cellText(v);
  return t == null ? null : t.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 80);
};
export const hashRecord = (data: Record<string, unknown>) =>
  createHash("sha256").update(JSON.stringify(Object.keys(data).sort().map((k) => [k, data[k]]))).digest("hex");

/**
 * Valida e normaliza linhas (seção 6.2): obrigatórios, tipos pt-BR, status conhecidos, negativos só em devolução,
 * `external_id` obrigatório, líquido derivado com marcação, duplicatas conflitantes no arquivo.
 * Nº da linha = linha do arquivo (cabeçalho = 1).
 */
export function validateRows(type: ImportTypeCode, table: Table, mapping: Mapping, opts: { recordKind?: "ORDER" | "INVOICE" | null; tz?: string } = {}): ValidationResult {
  const idx: Record<string, number> = {};
  for (const fd of IMPORT_TYPES[type].fields) {
    const h = mapping[fd.key];
    idx[fd.key] = h ? table.headers.indexOf(h) : -1;
  }
  const errors: RowError[] = [];
  const records: NormalizedRow[] = [];
  const seen = new Map<string, { row: number; hash: string }>();
  let duplicates = 0;

  table.rows.forEach((cells, i) => {
    const row = i + 2;
    const rowErrors: RowError[] = [];
    const get = (k: string): Cell => (idx[k]! >= 0 ? (cells[idx[k]!] ?? null) : null);
    const err = (field: string, reason: string) => rowErrors.push({ row, field, reason, raw: safe(get(field)) });
    const text = (k: string, required = false, max = 200) => {
      const t = cellText(get(k));
      if (!t) { if (required) err(k, "obrigatório"); return null; }
      if (t.length > max) { err(k, `texto acima de ${max} caracteres`); return null; }
      return t;
    };
    const num = (k: string, required = false) => {
      const p = parseNumberBR(get(k));
      if (!p.ok) { err(k, p.reason); return null; }
      if (p.value == null && required) err(k, "obrigatório");
      return p.value;
    };
    const date = (k: string, required = false) => {
      const p = parseDateBR(get(k), opts.tz);
      if (!p.ok) { err(k, p.reason); return null; }
      if (p.value == null && required) err(k, "obrigatório");
      return p.value ? toISODate(p.value) : null;
    };
    const bool = (k: string) => {
      const p = parseBoolBR(get(k));
      if (!p.ok) { err(k, p.reason); return null; }
      return p.value;
    };

    let key = "";
    let data: NormalizedRow["data"] = {};
    switch (type) {
      case "CUSTOMERS": {
        const id = text("id_externo", true, 80);
        const days = num("intervalo_compra_dias");
        if (days != null && (!Number.isInteger(days) || days <= 0 || days > 3650)) err("intervalo_compra_dias", "inteiro entre 1 e 3650");
        key = id ?? "";
        data = { externalId: id, name: text("nome", true), segment: text("segmento"), sellerRef: text("vendedor", false, 80), typicalIntervalDays: days, active: bool("ativo") };
        break;
      }
      case "PRODUCTS": {
        const id = text("id_externo", true, 80);
        key = id ?? "";
        data = { externalId: id, sku: text("sku", false, 80), name: text("nome", true), category: text("categoria"), active: bool("ativo") };
        break;
      }
      case "SALES": {
        const id = text("id_externo", true, 80);
        const statusRaw = text("status", true, 60);
        const status = statusRaw ? saleStatus(statusRaw) : null;
        if (statusRaw && !status) err("status", "status desconhecido (ex.: confirmado, faturado, cancelado, devolvido)");
        const kindRaw = text("tipo_registro", false, 30);
        if (kindRaw) {
          const k = RECORD_KIND[normalizeHeader(kindRaw)];
          if (!k) err("tipo_registro", "use PEDIDO ou FATURAMENTO");
          else if (opts.recordKind && k !== opts.recordKind) err("tipo_registro", `arquivo enviado como ${opts.recordKind === "ORDER" ? "PEDIDO" : "FATURAMENTO"}: não misturar tipos`);
        }
        const gross = num("valor_bruto"), discounts = num("descontos"), deductions = num("deducoes");
        let net = num("valor_liquido");
        let derived = false;
        if (net == null && gross != null) { net = gross - (discounts ?? 0) - (deductions ?? 0); derived = true; }
        if (net == null && gross == null && !rowErrors.some((e) => e.field === "valor_liquido" || e.field === "valor_bruto")) err("valor_liquido", "informe valor_liquido ou valor_bruto");
        if (discounts != null && discounts < 0) err("descontos", "desconto negativo");
        if (deductions != null && deductions < 0) err("deducoes", "dedução negativa");
        const negative = (net != null && net < 0) || (gross != null && gross < 0);
        if (negative && status !== "RETURN") err(net != null && net < 0 ? "valor_liquido" : "valor_bruto", "valor negativo só é aceito em devolução/estorno");
        // convenção: devolução sempre negativa
        if (status === "RETURN" && net != null) net = -Math.abs(net);
        key = id ?? "";
        data = {
          externalId: id, customerExt: text("id_cliente", true, 80), occurredAt: date("data", true), statusRaw, status,
          gross: gross == null ? null : r2(gross), discounts: discounts == null ? null : r2(discounts), deductions: deductions == null ? null : r2(deductions),
          net: net == null ? null : r2(net), netDerived: derived, sellerRef: text("vendedor", false, 80),
        };
        break;
      }
      case "SALE_ITEMS": {
        const sale = text("id_venda", true, 80), line = text("id_linha", true, 40);
        const q = num("quantidade", true), p = num("preco_unitario", true), d = num("desconto"), c = num("custo_variavel_unitario");
        if (q != null && q <= 0) err("quantidade", "quantidade deve ser maior que zero");
        if (p != null && p < 0) err("preco_unitario", "preço negativo");
        if (d != null && d < 0) err("desconto", "desconto negativo");
        if (c != null && c < 0) err("custo_variavel_unitario", "custo negativo");
        key = sale && line ? `${sale}#${line}` : "";
        const total = q != null && p != null ? r2(q * p - (d ?? 0)) : null;
        if (total != null && total < 0) err("desconto", "desconto maior que o valor da linha");
        data = { saleExt: sale, lineId: line, productExt: text("id_produto", false, 80), quantity: q, unitPrice: p, discount: d == null ? null : r2(d), unitCost: c, total, costTotal: c != null && q != null ? r2(c * q) : null };
        break;
      }
      case "QUOTES": {
        const id = text("id_externo", true, 80);
        const statusRaw = text("status", true, 60);
        const status = statusRaw ? quoteStatus(statusRaw) : null;
        if (statusRaw && !status) err("status", "status desconhecido (ex.: aberto, ganho, perdido, vencido)");
        const amount = num("valor", true);
        if (amount != null && amount < 0) err("valor", "valor negativo");
        const issued = date("data_emissao", true), valid = date("data_validade");
        if (issued && valid && valid < issued) err("data_validade", "validade anterior à emissão");
        key = id ?? "";
        data = { externalId: id, customerExt: text("id_cliente", true, 80), issuedAt: issued, validUntil: valid, statusRaw, status, amount: amount == null ? null : r2(amount), ownerRef: text("vendedor", false, 80), lastInteractionAt: date("ultimo_contato"), lostReason: text("motivo_perda", false, 500) };
        break;
      }
    }

    if (rowErrors.length) { errors.push(...rowErrors); return; }
    const hash = hashRecord(data);
    const prev = seen.get(key);
    if (prev) {
      if (prev.hash === hash) duplicates++;
      else errors.push({ row, field: null, reason: `ID repetido no arquivo com dados diferentes (linha ${prev.row})`, raw: key.slice(0, 80) });
      return;
    }
    seen.set(key, { row, hash });
    records.push({ row, key, data, hash });
  });
  return { records, errors, duplicates, total: table.rows.length };
}
