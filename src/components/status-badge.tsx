import { cn } from "@/lib/utils";
import { statusDef, TONE_CLASSES, type StatusContext, type Tone } from "@/lib/status";

/** Chip de status: sempre símbolo + texto pt-BR + cor (nunca só cor). */
export function StatusBadge({ context, value, suffix, className }: { context: StatusContext; value: string; suffix?: string; className?: string }) {
  const def = statusDef(context, value);
  return (
    <Chip tone={def.tone} symbol={def.symbol} className={cn(def.strike && "line-through", className)}>
      {def.label}
      {suffix ? ` ${suffix}` : ""}
    </Chip>
  );
}

export function Chip({ tone, symbol, children, className }: { tone: Tone; symbol?: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", TONE_CLASSES[tone], className)}>
      {symbol ? <span aria-hidden="true">{symbol}</span> : null}
      {children}
    </span>
  );
}
