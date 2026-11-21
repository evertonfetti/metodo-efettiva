"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { refreshMetricsAction } from "@/features/imports/actions";

export function RefreshMetricsButton({ clientId }: { clientId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await refreshMetricsAction(clientId); setMsg(r.error ? { err: r.error } : { ok: r.message }); })}>
        {pending ? "Recalculando…" : "Recalcular indicadores"}
      </Button>
      {msg.ok ? <span role="status" className="text-xs font-semibold text-ok">✓ {msg.ok}</span> : null}
      {msg.err ? <span role="alert" className="text-xs font-semibold text-err">{msg.err}</span> : null}
    </span>
  );
}
