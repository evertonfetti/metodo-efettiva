import * as React from "react";
import { cn } from "@/lib/utils";
import { HelpTip, type HelpContent } from "./help-tip";
import { FIELD_HELP } from "@/lib/help";

export const inputClass =
  "min-h-10 w-full rounded-[8px] border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle aria-[invalid=true]:border-err disabled:bg-surface-muted";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClass, "pr-8", className)} {...props} />;
}

/** Rótulo de campo. Mostra um “?” que explica o campo: via `help` ou, automaticamente, pelo `htmlFor` em `FIELD_HELP` (lib/help.ts). */
export function Label({ className, help: helpProp, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { help?: HelpContent | false }) {
  const help = helpProp === false ? undefined : (helpProp ?? (props.htmlFor ? FIELD_HELP[props.htmlFor] : undefined));
  if (!help) return <label className={cn("text-[13px] font-bold text-text-muted", className)} {...props}>{children}</label>;
  const text = typeof children === "string" ? children.replace(/\s*\*$/, "") : "Campo";
  return (
    <span className="flex items-center gap-1">
      <label className={cn("text-[13px] font-bold text-text-muted", className)} {...props}>{children}</label>
      <HelpTip label={text} help={help} />
    </span>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-[13px] font-semibold text-err">
      {message}
    </p>
  );
}
