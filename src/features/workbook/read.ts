import { clientUpdateSchema, contactSchema } from "@/features/clients/schema";
import { SEGMENTS, SIZES, UF, CHANNELS, SALES_MODELS } from "@/features/clients/catalog";
import { IMPORT_TYPES, type ImportTypeCode } from "@/features/imports/fields";
import { MAX_XLSX_UNCOMPRESSED, normalizeHeader, zipUncompressedSize, type Cell } from "@/features/imports/parse";
import { COMMERCIAL_SHEETS, COMPANY_FIELDS, CONFIDENCE_OPTIONS, CONTACT_COLUMNS, SHEETS, labelToCompanyKey, matchOption, splitList, type Option } from "./layout";

export type Issue = { sheet: string; row?: number; field?: string; message: string };
export type RawSheets = Map<string, Cell[][]>;

/** Lê todas as abas de um XLSX (com proteção contra “zip bomb”). */
export async function readSheets(buf: Buffer): Promise<RawSheets> {
  if (zipUncompressedSize(buf) > MAX_XLSX_UNCOMPRESSED) throw new Error("XLSX descompactado excede o limite de 200 MB");
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const sheets = await readXlsxFile(buf);
  return new Map(sheets.map((s) => [s.sheet, s.data as unknown as Cell[][]]));
}

const blank = (v: Cell | undefined) => v === null || v === undefined || String(v).trim() === "";
const str = (v: Cell | undefined): string => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const dmy = (v: Cell | undefined) => (v instanceof Date ? v.toISOString().slice(0, 10).split("-").reverse().join("/") : str(v));
const stripStar = (s: string) => normalizeHeader(s.replace(/\*/g, ""));

export type ClientCurrent = {
  name: string; legalName: string | null; industry: string; industryOther: string | null; size: string | null; city: string | null; state: string | null; timezone: string;
  salesModel: string | null; salesChannels: string[]; sellersCount: number | null; sourceSystem: string | null; salesCycle: string | null;
  typicalPurchaseFrequencyDays: number | null; mainChallenges: string | null; tags: string[];
};
export type QuestionRef = { code: string; allowUnknown: boolean; allowNotApplicable: boolean };
export type Context = { client: ClientCurrent; contacts: { email: string | null; name: string }[]; questions: QuestionRef[] };

export type CompanyResult = { present: boolean; changes: { key: string; label: string; from: string; to: string }[]; input: Record<string, unknown> | null; issues: Issue[] };
export type ContactsResult = { present: boolean; toCreate: { name: string; role?: string; email?: string; phone?: string; dataProcessingNote?: string; row: number }[]; duplicates: number; issues: Issue[] };
export type DiagAnswer = { code: string; value: { kind: "scale"; value: number } | { kind: "unknown" } | { kind: "na" }; respondent?: string; notes?: string; confidence?: "VERIFIED" | "REPORTED" | "ESTIMATED" };
export type DiagResult = { present: boolean; answers: DiagAnswer[]; issues: Issue[] };
export type CommercialResult = { present: boolean; type: ImportTypeCode; sheet: string; rows: Cell[][]; keys: string[]; issues: Issue[] };
export type Analysis = { sheetsFound: string[]; company: CompanyResult; contacts: ContactsResult; diagnostic: DiagResult; commercial: CommercialResult[] };

const label = (key: string) => COMPANY_FIELDS.find((f) => f.key === key)?.label ?? key;

function currentAsText(c: ClientCurrent, key: string): string {
  const pick = (list: readonly Option[], code: string | null) => list.find((o) => o.code === code)?.label ?? "";
  switch (key) {
    case "industry": return pick(SEGMENTS, c.industry);
    case "size": return pick(SIZES, c.size);
    case "salesModel": return pick(SALES_MODELS, c.salesModel);
    case "salesChannels": return c.salesChannels.map((x) => CHANNELS.find((o) => o.code === x)?.label ?? x).join("; ");
    case "tags": return c.tags.join("; ");
    case "taxId": return "";
    default: { const v = (c as unknown as Record<string, unknown>)[key]; return v === null || v === undefined ? "" : String(v); }
  }
}

function analyzeCompany(sheet: Cell[][] | undefined, ctx: Context): CompanyResult {
  const out: CompanyResult = { present: !!sheet, changes: [], input: null, issues: [] };
  if (!sheet) return out;
  const issue = (field: string, message: string) => out.issues.push({ sheet: SHEETS.company, field: label(field), message });
  const over: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const row of sheet.slice(1)) {
    const key = labelToCompanyKey.get(normalizeHeader(str(row[0])));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const raw = str(row[1]);
    if (!raw) continue;
    switch (key) {
      case "industry": { const m = matchOption(raw, SEGMENTS); if (m) over.industry = m; else issue(key, `“${raw}” não é uma opção válida.`); break; }
      case "size": { const m = matchOption(raw, SIZES); if (m) over.size = m; else issue(key, `“${raw}” não é uma opção válida.`); break; }
      case "salesModel": { const m = matchOption(raw, SALES_MODELS); if (m) over.salesModel = m; else issue(key, `“${raw}” não é uma opção válida.`); break; }
      case "salesChannels": {
        const codes: string[] = [];
        for (const part of splitList(raw)) { const m = matchOption(part, CHANNELS); if (m) codes.push(m); else issue(key, `Canal “${part}” não reconhecido.`); }
        over.salesChannels = [...new Set(codes)];
        break;
      }
      case "state": { const uf = raw.toUpperCase(); if ((UF as readonly string[]).includes(uf)) over.state = uf; else issue(key, `UF “${raw}” inválida (use a sigla, ex.: SP).`); break; }
      case "sellersCount":
      case "typicalPurchaseFrequencyDays": { const n = Number(raw.replace(",", ".")); if (Number.isInteger(n)) over[key] = n; else issue(key, `“${raw}” não é um número inteiro.`); break; }
      case "tags": over.tags = splitList(raw); break;
      default: over[key] = raw;
    }
  }
  {
    const base = {
      name: ctx.client.name, legalName: ctx.client.legalName ?? undefined, industry: ctx.client.industry, industryOther: ctx.client.industryOther ?? undefined,
      size: ctx.client.size ?? undefined, city: ctx.client.city ?? undefined, state: ctx.client.state ?? undefined, timezone: ctx.client.timezone,
      salesModel: ctx.client.salesModel ?? undefined, salesChannels: ctx.client.salesChannels, sellersCount: ctx.client.sellersCount ?? undefined,
      sourceSystem: ctx.client.sourceSystem ?? undefined, salesCycle: ctx.client.salesCycle ?? undefined,
      typicalPurchaseFrequencyDays: ctx.client.typicalPurchaseFrequencyDays ?? undefined, mainChallenges: ctx.client.mainChallenges ?? undefined, tags: ctx.client.tags,
    };
    const input = { ...base, ...over };
    const parsed = clientUpdateSchema.safeParse(input);
    if (!parsed.success) for (const i of parsed.error.issues) issue(String(i.path[0] ?? "name"), i.message);
    for (const [key, to] of Object.entries(over)) {
      const toText = key === "industry" ? SEGMENTS.find((o) => o.code === to)?.label : key === "size" ? SIZES.find((o) => o.code === to)?.label : key === "salesModel" ? SALES_MODELS.find((o) => o.code === to)?.label
        : key === "salesChannels" ? (to as string[]).map((x) => CHANNELS.find((o) => o.code === x)?.label ?? x).join("; ") : key === "tags" ? (to as string[]).join("; ") : key === "taxId" ? "(informado)" : String(to);
      const from = currentAsText(ctx.client, key);
      if (key === "taxId" || from !== toText) out.changes.push({ key, label: label(key), from, to: toText ?? "" });
    }
    if (!out.issues.length) out.input = input;
  }
  return out;
}

/** Mapeia cabeçalhos da planilha → índice de coluna. */
function headerIndex(header: Cell[]): Map<string, number> {
  return new Map(header.map((h, i) => [stripStar(str(h)), i] as const).filter(([k]) => k));
}

function analyzeContacts(sheet: Cell[][] | undefined, ctx: Context): ContactsResult {
  const out: ContactsResult = { present: !!sheet, toCreate: [], duplicates: 0, issues: [] };
  if (!sheet) return out;
  const idx = headerIndex(sheet[0] ?? []);
  const col = (k: string) => idx.get(stripStar(CONTACT_COLUMNS.find((c) => c.key === k)!.label));
  if (col("name") === undefined) { out.issues.push({ sheet: SHEETS.contacts, message: "Coluna “Nome” não encontrada. Não altere os cabeçalhos do modelo." }); return out; }
  const seen = new Set(ctx.contacts.map((c) => (c.email ? `e:${c.email.toLowerCase()}` : `n:${normalizeHeader(c.name)}`)));
  sheet.slice(2).forEach((row, i) => {
    const rowNo = i + 3;
    const get = (k: string) => { const c = col(k); return c === undefined ? "" : str(row[c]); };
    if (CONTACT_COLUMNS.every((c) => !get(c.key))) return;
    const parsed = contactSchema.safeParse({ name: get("name"), role: get("role"), email: get("email"), phone: get("phone"), dataProcessingNote: get("dataProcessingNote") });
    if (!parsed.success) { for (const e of parsed.error.issues) out.issues.push({ sheet: SHEETS.contacts, row: rowNo, field: String(e.path[0] ?? ""), message: e.message }); return; }
    const d = parsed.data;
    const key = d.email ? `e:${d.email.toLowerCase()}` : `n:${normalizeHeader(d.name)}`;
    if (seen.has(key)) { out.duplicates++; return; }
    seen.add(key);
    out.toCreate.push({ name: d.name, role: d.role, email: d.email, phone: d.phone, dataProcessingNote: d.dataProcessingNote, row: rowNo });
  });
  return out;
}

function analyzeDiagnostic(sheet: Cell[][] | undefined, ctx: Context): DiagResult {
  const out: DiagResult = { present: !!sheet, answers: [], issues: [] };
  if (!sheet) return out;
  const header = (sheet[0] ?? []).map((h) => normalizeHeader(str(h)));
  const find = (prefix: string) => header.findIndex((h) => h.startsWith(prefix));
  const c = { code: find("codigo"), answer: find("resposta"), respondent: find("quem_respondeu"), notes: find("observacao"), conf: find("como_sabe") };
  if (c.code < 0 || c.answer < 0) { out.issues.push({ sheet: SHEETS.diagnostic, message: "Colunas “Código” e “Resposta” não encontradas. Não altere os cabeçalhos do modelo." }); return out; }
  const byCode = new Map(ctx.questions.map((q) => [q.code, q]));
  const seen = new Set<string>();
  sheet.slice(2).forEach((row, i) => {
    const rowNo = i + 3;
    const code = str(row[c.code]).toUpperCase();
    const raw = str(row[c.answer]);
    if (!code || code === "EXEMPLO" || !raw) return;
    const q = byCode.get(code);
    const issue = (message: string, field = "Resposta") => out.issues.push({ sheet: SHEETS.diagnostic, row: rowNo, field, message });
    if (!q) return issue(`Código “${code}” não existe no questionário.`, "Código");
    if (seen.has(code)) return issue(`Pergunta ${code} repetida.`, "Código");
    seen.add(code);
    const n = normalizeHeader(raw);
    let value: DiagAnswer["value"] | null = null;
    if (n === "ns" || n === "nao_sei") { if (q.allowUnknown) value = { kind: "unknown" }; else return issue("Esta pergunta não aceita “não sei”."); }
    else if (n === "na" || n === "nao_se_aplica") { if (q.allowNotApplicable) value = { kind: "na" }; else return issue("Esta pergunta não aceita “não se aplica”."); }
    else {
      const num = Number(raw.replace(",", "."));
      if (Number.isInteger(num) && num >= 0 && num <= 5) value = { kind: "scale", value: num };
      else return issue(`“${raw}” inválido: use um número de 0 a 5, NS ou NA.`);
    }
    const confRaw = c.conf >= 0 ? str(row[c.conf]) : "";
    const conf = confRaw ? matchOption(confRaw, CONFIDENCE_OPTIONS) : null;
    if (confRaw && !conf) issue(`“${confRaw}” inválido: use Verificado, Informado ou Estimado.`, "Como sabe?");
    out.answers.push({
      code, value,
      respondent: c.respondent >= 0 ? str(row[c.respondent]) || undefined : undefined,
      notes: c.notes >= 0 ? str(row[c.notes]) || undefined : undefined,
      confidence: (conf as DiagAnswer["confidence"]) ?? undefined,
    });
  });
  return out;
}

function analyzeCommercial(type: ImportTypeCode, sheet: Cell[][] | undefined): CommercialResult {
  const name = COMMERCIAL_SHEETS[type];
  const out: CommercialResult = { present: !!sheet, type, sheet: name, rows: [], keys: [], issues: [] };
  if (!sheet) return out;
  const fields = IMPORT_TYPES[type].fields;
  const idx = headerIndex(sheet[0] ?? []);
  const cols = fields.map((f) => ({ f, i: idx.get(stripStar(f.label)) }));
  const missing = cols.filter((c) => c.i === undefined && c.f.required);
  if (missing.length) { out.issues.push({ sheet: name, message: `Coluna(s) obrigatória(s) não encontrada(s): ${missing.map((m) => m.f.label).join(", ")}. Não altere os cabeçalhos do modelo.` }); return out; }
  const used = cols.filter((c) => c.i !== undefined);
  out.keys = used.map((c) => c.f.key);
  for (const [n, row] of sheet.slice(2).entries()) {
    if (used.every((c) => blank(row[c.i!]))) continue;
    const cells = used.map((c) => row[c.i!] ?? null);
    const emptyReq = used.filter((c) => c.f.required && blank(row[c.i!]));
    if (emptyReq.length && out.issues.length < 20) out.issues.push({ sheet: name, row: n + 3, field: emptyReq.map((c) => c.f.label).join(", "), message: "Campo obrigatório em branco." });
    out.rows.push(cells);
  }
  return out;
}

export function analyzeWorkbook(sheets: RawSheets, ctx: Context): Analysis {
  return {
    sheetsFound: [...sheets.keys()],
    company: analyzeCompany(sheets.get(SHEETS.company), ctx),
    contacts: analyzeContacts(sheets.get(SHEETS.contacts), ctx),
    diagnostic: analyzeDiagnostic(sheets.get(SHEETS.diagnostic), ctx),
    commercial: (Object.keys(COMMERCIAL_SHEETS) as ImportTypeCode[]).map((t) => analyzeCommercial(t, sheets.get(COMMERCIAL_SHEETS[t]))),
  };
}

export { dmy };
