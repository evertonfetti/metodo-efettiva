import { cn } from "@/lib/utils";

/** Código fixo do processo (ex.: C05) em chip monoespaçado navy. */
export function ProcessCodeChip({ code, className }: { code: string; className?: string }) {
  return <span className={cn("inline-flex min-w-[42px] justify-center rounded-[4px] bg-navy px-1.5 py-0.5 font-mono text-xs font-bold text-white", className)}>{code}</span>;
}
