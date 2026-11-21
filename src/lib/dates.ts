/**
 * Datas "somente dia" (colunas @db.Date) representadas como Date em UTC 00:00.
 * Feriados nacionais brasileiros fixos e móveis (Carnaval, Sexta-feira Santa, Corpus Christi).
 */
import { DEFAULT_TZ } from "./format";

export const MS_DAY = 86_400_000;

export function dateOnly(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

/** "2026-11-21" → Date UTC; inválido → null. */
export function parseDateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = dateOnly(Number(m[1]), Number(m[2]), Number(m[3]));
  return d.getUTCDate() === Number(m[3]) && d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

export const toISODate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * MS_DAY);
export const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / MS_DAY);

/** Hoje no fuso de operação, como data UTC 00:00. */
export function todayDateOnly(tz = DEFAULT_TZ, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parseDateOnly(parts)!;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateOnly(year, month, day);
}

const FIXED = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
const cache = new Map<number, Set<string>>();

export function holidays(year: number): Set<string> {
  let s = cache.get(year);
  if (!s) {
    const e = easter(year);
    s = new Set([...FIXED.map((md) => `${year}-${md}`), ...[-48, -47, -2, 60].map((n) => toISODate(addDays(e, n)))]);
    cache.set(year, s);
  }
  return s;
}

export function isBusinessDay(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays(d.getUTCFullYear()).has(toISODate(d));
}

/** Último dia útil em ou antes de `d` (sem passar de `floor`, se informado). */
export function businessDayOnOrBefore(d: Date, floor?: Date): Date {
  let x = d;
  while (!isBusinessDay(x) && (!floor || x > floor)) x = addDays(x, -1);
  if (!isBusinessDay(x)) return businessDayOnOrAfter(d);
  return x;
}

export function businessDayOnOrAfter(d: Date): Date {
  let x = d;
  while (!isBusinessDay(x)) x = addDays(x, 1);
  return x;
}
