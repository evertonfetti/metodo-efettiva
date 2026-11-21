import type { MetricFormat } from "@/lib/format";
import { formatDay } from "@/lib/format";

type Snap = { metricCode: string; valueDecimal: unknown; unit: string; periodStart: Date; periodEnd: Date; unavailableReason: string | null; sourceJson: unknown };

const FORMAT: Record<string, MetricFormat> = { BRL: "brl", COUNT: "integer", PERCENT: "percent", DAYS: "days", RATIO: "decimal" };

/** Converte snapshot em props do MetricCardWithSource (fonte + período sempre visíveis). */
export function cardProps(s: Snap | undefined, fallbackLabel: string) {
  if (!s) return { label: fallbackLabel, value: null, source: "dados importados", period: "—", unavailableReason: "indicadores ainda não calculados: importe os dados" };
  const j = (s.sourceJson ?? {}) as { label?: string; source?: { label?: string } | null; basis?: string | null };
  const same = s.periodStart.getTime() === s.periodEnd.getTime();
  const value = s.valueDecimal == null ? null : Number(s.valueDecimal);
  return {
    label: j.label ?? fallbackLabel,
    value,
    format: FORMAT[s.unit] ?? "decimal",
    source: j.source?.label ?? "sem arquivo de origem",
    period: same ? `referência ${formatDay(s.periodStart)}` : `${formatDay(s.periodStart)}–${formatDay(s.periodEnd)}`,
    unavailableReason: s.unavailableReason ?? undefined,
  };
}
