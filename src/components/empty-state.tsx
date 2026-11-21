import type { LucideIcon } from "lucide-react";

/** Estado vazio: ícone de linha, título, próxima ação e (opcional) botão. */
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icon className="size-8 text-text-subtle" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-[15px] font-bold text-navy">{title}</p>
      <p className="max-w-md text-sm text-text-muted">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
