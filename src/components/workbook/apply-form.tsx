"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { applyWorkbookAction } from "@/features/workbook/actions";
import type { ActionState } from "@/lib/actions";

export type SectionView = {
  id: string;
  title: string;
  summary: string[];
  issues: { where: string; message: string }[];
  empty: boolean;
  appliedHref?: string | null;
  applied: boolean;
  needsSalesKind?: boolean;
};

export function ApplyForm({ clientId, fileId, sections }: { clientId: string; fileId: string; sections: SectionView[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(applyWorkbookAction.bind(null, clientId, fileId), {});
  const selectable = sections.filter((s) => !s.applied && !s.empty && s.issues.length === 0);
  return (
    <form action={action} className="flex flex-col gap-4">
      {sections.map((s) => {
        const blocked = s.issues.length > 0;
        return (
          <section key={s.id} aria-labelledby={`sec-${s.id}`} className={`rounded-[12px] border bg-surface ${blocked ? "border-border-alert" : "border-border"}`}>
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
              <input
                type="checkbox"
                name="section"
                value={s.id}
                id={`chk-${s.id}`}
                defaultChecked={!s.applied && !s.empty && !blocked}
                disabled={s.applied || s.empty || blocked}
                className="size-4 accent-navy"
              />
              <h2 id={`sec-${s.id}`} className="text-[15px] font-extrabold text-navy"><label htmlFor={`chk-${s.id}`}>{s.title}</label></h2>
              {s.applied ? <span className="rounded-[4px] bg-ok-bg px-2 py-0.5 text-xs font-bold text-ok">✓ Já aplicado</span> : null}
              {s.empty && !s.applied ? <span className="rounded-[4px] bg-neutral-bg px-2 py-0.5 text-xs font-bold text-neutral">Nada preenchido</span> : null}
              {blocked ? <span className="rounded-[4px] bg-err-bg px-2 py-0.5 text-xs font-bold text-err">{s.issues.length} problema(s) a corrigir</span> : null}
              {s.appliedHref ? <Link href={s.appliedHref} className="ml-auto text-sm font-bold text-navy underline">Abrir</Link> : null}
            </div>
            <div className="flex flex-col gap-2 px-5 py-3 text-sm">
              {s.summary.map((l) => <p key={l}>{l}</p>)}
              {s.needsSalesKind && !s.applied && !s.empty ? (
                <div className="flex max-w-sm flex-col gap-1">
                  <Label htmlFor="salesKind" help={{ what: "Diz se as linhas da aba Vendas são pedidos (valor comercial registrado) ou faturamento (notas emitidas). Pedido não é tratado como receita líquida nos indicadores." }}>As vendas representam *</Label>
                  <Select id="salesKind" name="salesKind" defaultValue="">
                    <option value="" disabled>Selecione</option>
                    <option value="ORDER">Pedidos</option>
                    <option value="INVOICE">Faturamento</option>
                  </Select>
                </div>
              ) : null}
              {s.issues.length ? (
                <ul className="mt-1 flex flex-col gap-1 rounded-[8px] bg-err-bg/50 p-3 text-[13px] text-err">
                  {s.issues.slice(0, 25).map((i, n) => <li key={n}><b>{i.where}</b> {i.message}</li>)}
                  {s.issues.length > 25 ? <li>… e mais {s.issues.length - 25}.</li> : null}
                </ul>
              ) : null}
            </div>
          </section>
        );
      })}
      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm font-semibold text-ok">{state.message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || selectable.length === 0}>{pending ? "Aplicando…" : "Aplicar partes marcadas"}</Button>
        <Button asChild variant="secondary"><Link href={`/clientes/${clientId}/planilha`}>Voltar</Link></Button>
      </div>
      <p className="text-xs text-text-subtle">Partes com problema ficam bloqueadas: corrija na planilha e envie de novo. Cada parte só pode ser aplicada uma vez por arquivo.</p>
    </form>
  );
}
