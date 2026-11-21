"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Modal acessível (foco preso, Esc fecha, título obrigatório). */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/40" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[12px] bg-surface p-6 shadow-xl",
            wide ? "max-w-2xl" : "max-w-md",
          )}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-[17px] font-extrabold text-navy">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-text-muted">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="flex size-9 shrink-0 items-center justify-center rounded-[8px] text-text-muted hover:bg-surface-sunken" aria-label="Fechar">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
