"use client";

import { segmentLabel } from "@/features/clients/catalog";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SwitcherClient = { id: string; name: string; industry: string; isDemo: boolean };

/** Seletor do cliente ativo com busca (UI_LAYOUT §3.1). */
export function ClientSwitcher({ active, clients, onNavigate }: { active: SwitcherClient | null; clients: SwitcherClient[]; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("pt-BR");
    return term ? clients.filter((c) => c.name.toLocaleLowerCase("pt-BR").includes(term)) : clients;
  }, [q, clients]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {active ? (
          <button type="button" className="flex min-h-12 items-center justify-between gap-2 rounded-[8px] bg-navy-700 px-3 text-left">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold">{active.name}</span>
              <span className="truncate text-xs font-semibold text-amber">
                {active.isDemo ? "DEMO · " : ""}
                {segmentLabel(active.industry)}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-on-navy-label" aria-hidden="true" />
            <span className="sr-only">Trocar cliente</span>
          </button>
        ) : (
          <button type="button" className="flex min-h-12 items-center justify-between gap-2 rounded-[8px] border border-dashed border-navy-border px-3 text-left text-sm font-semibold text-on-navy-item">
            Selecionar cliente
            <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" align="start" sideOffset={8} className="z-50 w-72 rounded-[12px] border border-border bg-surface p-2 text-text">
          <label className="flex min-h-10 items-center gap-2 rounded-[8px] border border-border-strong bg-surface-muted px-3">
            <Search className="size-4 text-text-subtle" aria-hidden="true" />
            <span className="sr-only">Buscar cliente</span>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente" className="flex-1 bg-transparent text-sm outline-none" />
          </label>
          <ul className="mt-2 max-h-72 overflow-y-auto" role="listbox" aria-label="Clientes">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-text-muted">
                {clients.length === 0 ? "Nenhum cliente cadastrado ainda." : "Nenhum cliente encontrado."}
              </li>
            ) : (
              filtered.map((c) => (
                <li key={c.id} role="option" aria-selected={active?.id === c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onNavigate?.();
                      router.push(`/clientes/${c.id}`);
                    }}
                    className={cn("flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left hover:bg-surface-sunken", active?.id === c.id && "bg-surface-sunken")}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-bold">{c.name}</span>
                      <span className="truncate text-xs text-text-muted">
                        {c.isDemo ? "DEMO · " : ""}
                        {segmentLabel(c.industry)}
                      </span>
                    </span>
                    {active?.id === c.id ? <Check className="size-4 text-navy" aria-hidden="true" /> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
          {clients.length > 0 ? (
            <div className="mt-2 border-t border-border pt-2">
              <Link href="/clientes" onClick={() => { setOpen(false); onNavigate?.(); }} className="block rounded-[8px] px-3 py-2 text-sm font-bold text-navy hover:bg-surface-sunken">
                Ver todos os clientes
              </Link>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
