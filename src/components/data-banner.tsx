import { TriangleAlert } from "lucide-react";

/** Faixa de alerta de qualidade de dados / ambiente DEMO. */
export function DataQualityBanner({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-warn-bg px-4 py-3 text-sm font-semibold text-warn">
      <span className="flex items-center gap-2">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {children}
      </span>
      {action}
    </div>
  );
}
