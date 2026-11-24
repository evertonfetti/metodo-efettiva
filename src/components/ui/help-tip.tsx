"use client";

import { Popover } from "radix-ui";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

export type HelpContent = {
  /** O que o campo/tela faz, em uma ou duas frases. */
  what: string;
  /** Exemplo concreto (opcional). */
  example?: string;
  /** Observação ou regra importante (opcional). */
  note?: string;
};

function Body({ help }: { help: HelpContent }) {
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-text">
      <p>{help.what}</p>
      {help.example ? (
        <p className="rounded-[6px] bg-surface-sunken px-2.5 py-1.5 text-text-muted">
          <b className="text-navy">Exemplo: </b>
          {help.example}
        </p>
      ) : null}
      {help.note ? <p className="text-xs text-text-subtle">{help.note}</p> : null}
    </div>
  );
}

/** Botão “?” que abre um balão de ajuda. Acessível por teclado; Esc fecha. */
export function HelpTip({ label, help, className }: { label: string; help: HelpContent; className?: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        aria-label={`Ajuda: ${label}`}
        className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-navy/60 hover:bg-surface-sunken hover:text-navy", className)}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-[min(340px,calc(100vw-24px))] rounded-[10px] border border-border bg-surface p-3 shadow-lg"
        >
          <p className="mb-1.5 text-[13px] font-extrabold text-navy">{label}</p>
          <Body help={help} />
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Botão “Ajuda” de tela inteira (cabeçalho da página). */
export function PageHelp({ title, help }: { title: string; help: HelpContent & { steps?: string[] } }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-border-strong bg-surface px-3 text-[13px] font-bold text-navy hover:bg-surface-sunken"
      >
        <CircleHelp className="size-4" aria-hidden="true" />
        Ajuda
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-[70vh] w-[min(420px,calc(100vw-24px))] overflow-y-auto rounded-[10px] border border-border bg-surface p-4 shadow-lg"
        >
          <p className="mb-2 text-sm font-extrabold text-navy">{title}</p>
          <Body help={help} />
          {help.steps?.length ? (
            <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-text">
              {help.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
