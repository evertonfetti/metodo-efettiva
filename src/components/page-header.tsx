/** Cabeçalho de página: h1 + selos + subtítulo à esquerda; até 1 primário e 2 secundários à direita. */
export function PageHeader({ title, badges, subtitle, actions }: { title: string; badges?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[26px] leading-tight font-extrabold text-navy">{title}</h1>
          {badges}
        </div>
        {subtitle ? <div className="text-sm text-text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
