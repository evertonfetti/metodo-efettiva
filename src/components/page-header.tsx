import { PageHelp } from "@/components/ui/help-tip";

/** Cabeçalho de página: h1 + selos + subtítulo à esquerda; até 1 primário e 2 secundários à direita. */
export function PageHeader({ title, badges, subtitle, actions, help }: { title: string; badges?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; help?: React.ComponentProps<typeof PageHelp>["help"] }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[26px] leading-tight font-extrabold text-navy">{title}</h1>
          {badges}
        </div>
        {subtitle ? <div className="text-sm text-text-muted">{subtitle}</div> : null}
      </div>
      {actions || help ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {help ? <PageHelp title={`Ajuda: ${title}`} help={help} /> : null}
        </div>
      ) : null}
    </div>
  );
}
