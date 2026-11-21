/** Formatação pt-BR única do sistema (UI_LAYOUT §7). `null` nunca vira 0. */

export const DEFAULT_TZ = "America/Sao_Paulo";
export const UNAVAILABLE = "Indisponível";

type Num = number | string | { toString(): string } | null | undefined;

function toNumber(v: Num): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

export function formatBRL(v: Num, empty = UNAVAILABLE): string {
  const n = toNumber(v);
  if (n === null) return empty;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

export function formatInteger(v: Num, empty = UNAVAILABLE): string {
  const n = toNumber(v);
  if (n === null) return empty;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

export function formatDecimal(v: Num, digits = 1, empty = UNAVAILABLE): string {
  const n = toNumber(v);
  if (n === null) return empty;
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** `v` em pontos percentuais (38 → "38%", 12.5 → "12,5%"). */
export function formatPercent(v: Num, empty = UNAVAILABLE): string {
  const n = toNumber(v);
  if (n === null) return empty;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n)}%`;
}

export function formatDays(v: Num, empty = UNAVAILABLE): string {
  const n = toNumber(v);
  if (n === null) return empty;
  return `${formatInteger(n)} ${Math.abs(n) === 1 ? "dia" : "dias"}`;
}

export type MetricFormat = "integer" | "brl" | "percent" | "days" | "decimal";

export function formatMetric(v: Num, format: MetricFormat, empty = UNAVAILABLE): string {
  switch (format) {
    case "brl":
      return formatBRL(v, empty);
    case "percent":
      return formatPercent(v, empty);
    case "days":
      return formatDays(v, empty);
    case "decimal":
      return formatDecimal(v, 1, empty);
    default:
      return formatInteger(v, empty);
  }
}

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** dd/mm/aaaa */
export function formatDate(d: Date | string | null | undefined, tz = DEFAULT_TZ, empty = UNAVAILABLE): string {
  const date = toDate(d);
  if (!date) return empty;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** dd/mm quando o ano é o corrente; senão dd/mm/aaaa. */
export function formatShortDate(d: Date | string | null | undefined, tz = DEFAULT_TZ, empty = UNAVAILABLE): string {
  const date = toDate(d);
  if (!date) return empty;
  const year = (x: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: tz, year: "numeric" }).format(x);
  if (year(date) !== year(new Date())) return formatDate(date, tz, empty);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined, tz = DEFAULT_TZ, empty = UNAVAILABLE): string {
  const date = toDate(d);
  if (!date) return empty;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatTime(d: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  const date = toDate(d);
  if (!date) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(date);
}

/** "Sexta-feira, 20 de novembro de 2026" */
export function formatLongDate(d: Date | string, tz = DEFAULT_TZ): string {
  const date = toDate(d) ?? new Date();
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Diferença em dias de calendário entre duas datas no fuso informado (b − a). */
export function daysBetween(a: Date, b: Date, tz = DEFAULT_TZ): number {
  const key = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const da = Date.parse(`${key(a)}T00:00:00Z`);
  const db = Date.parse(`${key(b)}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Colunas `@db.Date` (UTC 00:00): formatar sem conversão de fuso para não exibir o dia anterior. */
export const formatDay = (d: Date | string | null | undefined, empty = UNAVAILABLE) => formatDate(d, "UTC", empty);
export const formatShortDay = (d: Date | string | null | undefined, empty = UNAVAILABLE) => formatShortDate(d, "UTC", empty);
