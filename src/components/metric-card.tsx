import { cn } from "@/lib/utils";
import { formatMetric, type MetricFormat } from "@/lib/format";

type Props = {
  label: string;
  value: number | null;
  format?: MetricFormat;
  /** Ex.: "cadastro de clientes" ou "vendas.csv · lote 3" */
  source: string;
  /** Ex.: "agora", "últimas 24 h", "01/10–31/10/2026" */
  period: string;
  unavailableReason?: string;
  alert?: boolean;
  badge?: React.ReactNode;
};

/** Card de indicador com fonte e período obrigatórios. `null` → "Indisponível" + motivo (nunca 0). */
export function MetricCardWithSource({ label, value, format = "integer", source, period, unavailableReason, alert, badge }: Props) {
  const unavailable = value === null;
  const isAlert = !unavailable && alert;
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-[12px] border bg-surface p-[18px]",
        unavailable ? "border-dashed border-border-strong" : isAlert ? "border-border-alert" : "border-border",
      )}
    >
      <span className="text-[13px] font-semibold text-text-muted">{label}</span>
      {unavailable ? (
        <>
          <span className="text-xl font-extrabold text-text-subtle">Indisponível</span>
          <span className="text-xs text-text-subtle">Motivo: {unavailableReason ?? "dados insuficientes"}</span>
        </>
      ) : (
        <>
          <span className={cn("flex flex-wrap items-center gap-2 text-[30px] leading-tight font-extrabold", isAlert ? "text-err" : "text-navy")}>
            {formatMetric(value, format)}
            {isAlert ? <span className="rounded-full bg-err-bg px-2 py-0.5 text-xs font-bold text-err">Atenção</span> : null}
            {badge}
          </span>
          <span className="text-xs text-text-subtle">
            Fonte: {source} · {period}
          </span>
        </>
      )}
    </div>
  );
}
