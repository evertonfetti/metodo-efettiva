"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { uploadWorkbookAction } from "@/features/workbook/actions";
import type { ActionState } from "@/lib/actions";

export function UploadWorkbookForm({ clientId, maxMb }: { clientId: string; maxMb: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadWorkbookAction.bind(null, clientId), {});
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1">
        <Label htmlFor="wb-file" help={{ what: "A planilha XLSX que o cliente devolveu preenchida, sem renomear as abas. Nada é gravado agora: você verá primeiro um relatório do que será feito.", note: `Até ${maxMb} MB.` }}>
          Planilha preenchida (XLSX, até {maxMb} MB)
        </Label>
        <Input id="wb-file" name="file" type="file" accept=".xlsx" className="py-1.5" aria-invalid={!!state.fieldErrors?.file} />
        <FieldError message={state.fieldErrors?.file} />
      </div>
      {state.error && !state.fieldErrors?.file ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Lendo planilha…" : "Enviar e conferir"}</Button>
      </div>
    </form>
  );
}
