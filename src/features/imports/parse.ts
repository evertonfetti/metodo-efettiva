import { parseDateOnly } from "@/lib/dates";

/** Leitura de CSV/XLSX e conversão de valores pt-BR — funções puras, testadas (seção 6.2, RF-034). */

export type Cell = string | number | boolean | Date | null;
export type Table = { headers: string[]; rows: Cell[][] };

/** UTF-8 (com ou sem BOM); se inválido, Windows-1252 (exportações comuns de ERPs brasileiros). */
export function decodeText(buf: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1252").decode(buf);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Detecta `;` ou `,` (fora de aspas) na linha de cabeçalho. */
export function detectDelimiter(text: string): ";" | "," {
  let semi = 0, comma = 0, quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ";") semi++;
    else if (!quoted && ch === ",") comma++;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
  }
  return semi >= comma && semi > 0 ? ";" : ",";
}

/** CSV RFC 4180 (aspas, aspas duplas escapadas, quebras de linha em campo, CRLF). */
export function parseCsv(text: string): Table {
  const d = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"' && field === "") q = true;
    else if (ch === d) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((c) => c.trim() !== "")) rows.push(row); }
  const [headers = [], ...body] = rows;
  return { headers: headers.map((h) => h.trim()), rows: body };
}

export async function readXlsx(buf: Buffer, sheet?: string): Promise<Table & { sheets: string[]; sheet: string }> {
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const sheets = await readXlsxFile(buf);
  if (!sheets.length) throw new Error("Planilha vazia");
  const chosen = sheets.find((s) => s.sheet === sheet) ?? sheets[0]!;
  // cabeçalho = primeira linha com ao menos 2 células preenchidas
  const data = chosen.data as unknown as Cell[][];
  const hi = data.findIndex((r) => r.filter((c) => c !== null && String(c).trim() !== "").length >= 2);
  if (hi < 0) return { headers: [], rows: [], sheets: sheets.map((s) => s.sheet), sheet: chosen.sheet };
  return {
    headers: data[hi]!.map((h) => String(h ?? "").trim()),
    rows: data.slice(hi + 1).filter((r) => r.some((c) => c !== null && String(c).trim() !== "")),
    sheets: sheets.map((s) => s.sheet),
    sheet: chosen.sheet,
  };
}

export const normalizeHeader = (h: string) =>
  h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export type Parsed<T> = { ok: true; value: T | null } | { ok: false; reason: string };
const empty = (v: Cell) => v === null || (typeof v === "string" && v.trim() === "");

/**
 * Número pt-BR: "1.234,56", "R$ 1.234,56", "-50,00", "(50,00)", "1234.56".
 * Com vírgula → vírgula decimal e pontos de milhar. Sem vírgula: "1.234" (grupos de 3) é milhar.
 */
export function parseNumberBR(v: Cell): Parsed<number> {
  if (empty(v)) return { ok: true, value: null };
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, value: v } : { ok: false, reason: "número inválido" };
  let s = String(v).trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (s.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(s)) return { ok: false, reason: "número inválido" };
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, reason: "número inválido" };
  const n = Number(s);
  return Number.isFinite(n) ? { ok: true, value: neg ? -n : n } : { ok: false, reason: "número inválido" };
}

/** Data de evento: "31/12/2025", "31/12/2025 14:30", "2025-12-31", célula de data do XLSX. Resultado: dia (UTC 00:00). */
export function parseDateBR(v: Cell, tz = "America/Sao_Paulo"): Parsed<Date> {
  if (empty(v)) return { ok: true, value: null };
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { ok: false, reason: "data inválida" };
    // datas de planilha vêm sem fuso (meia-noite UTC); datas com hora são levadas ao dia no fuso do cliente
    const iso = v.getUTCHours() === 0 && v.getUTCMinutes() === 0 ? v.toISOString().slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(v);
    return { ok: true, value: parseDateOnly(iso) };
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (m) {
    const d = parseDateOnly(`${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
    return d ? { ok: true, value: d } : { ok: false, reason: "data inválida" };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  if (m) {
    const d = parseDateOnly(`${m[1]}-${m[2]}-${m[3]}`);
    return d ? { ok: true, value: d } : { ok: false, reason: "data inválida" };
  }
  return { ok: false, reason: "data inválida (use dd/mm/aaaa ou aaaa-mm-dd)" };
}

export function parseBoolBR(v: Cell): Parsed<boolean> {
  if (empty(v)) return { ok: true, value: null };
  if (typeof v === "boolean") return { ok: true, value: v };
  const s = normalizeHeader(String(v));
  if (["sim", "s", "true", "1", "ativo", "yes", "y"].includes(s)) return { ok: true, value: true };
  if (["nao", "n", "false", "0", "inativo", "no"].includes(s)) return { ok: true, value: false };
  return { ok: false, reason: "use sim ou não" };
}

export function cellText(v: Cell): string | null {
  if (empty(v)) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}
