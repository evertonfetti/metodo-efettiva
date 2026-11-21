"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { ActionState } from "@/lib/actions";

export type TransitionOption = { to: string; label: string; needsReason: boolean; variant?: "primary" | "secondary" | "ghost"; danger?: boolean };

/** Botões de transição de status; as que exigem motivo abrem um modal antes de confirmar. */
export function TransitionButtons({ action, transitions, size = "sm" }: { action: (to: string, reason?: string) => Promise<ActionState>; transitions: TransitionOption[]; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<TransitionOption | null>(null);
  const [reason, setReason] = useState("");
  const run = (t: TransitionOption, r?: string) =>
    start(async () => {
      const res = await action(t.to, r);
      setError(res.error ?? null);
      if (!res.error) {
        setAsk(null);
        setReason("");
      }
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          <Button key={t.to} size={size} variant={t.variant ?? "secondary"} className={t.danger ? "text-err" : undefined} disabled={pending} onClick={() => (t.needsReason ? setAsk(t) : run(t))}>
            {t.label}
          </Button>
        ))}
      </div>
      {error && !ask ? <p role="alert" className="text-sm font-semibold text-err">{error}</p> : null}
      <Modal open={!!ask} onOpenChange={(v) => !v && setAsk(null)} title={ask?.label ?? ""} description="O motivo fica registrado na auditoria.">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ask) run(ask, reason);
          }}
        >
          <Label htmlFor="transition-reason">Motivo *</Label>
          <Textarea id="transition-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} autoFocus />
          {error ? <p role="alert" className="text-sm font-semibold text-err">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAsk(null)}>Cancelar</Button>
            <Button type="submit" disabled={pending || reason.trim().length < 3}>{pending ? "Salvando…" : "Confirmar"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
