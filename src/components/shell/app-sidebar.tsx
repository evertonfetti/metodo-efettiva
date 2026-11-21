"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { logoutAction } from "@/features/auth/actions";
import { GLOBAL_NAV, clientNav, type NavItem } from "./nav-config";
import { ClientSwitcher, type SwitcherClient } from "./client-switcher";

export type SidebarProps = {
  user: { name: string; role: string };
  clients: SwitcherClient[];
  onNavigate?: () => void;
};

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href) return true;
  return !!item.matchPrefix && pathname.startsWith(item.href + "/");
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const Icon = item.icon;
  if (item.availableInPhase) {
    return (
      <span
        aria-disabled="true"
        title={`Disponível na Fase ${item.availableInPhase}`}
        className="flex min-h-11 cursor-not-allowed items-center gap-2.5 rounded-[8px] px-3 text-sm font-semibold text-on-navy-label/70"
      >
        <Icon className="size-[18px]" aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        <span className="text-[11px] font-bold">Fase {item.availableInPhase}</span>
      </span>
    );
  }
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-[8px] px-3 text-sm",
        active ? "bg-navy-700 font-bold text-white" : "font-semibold text-on-navy-item hover:bg-navy-700/60",
      )}
    >
      <Icon className={cn("size-[18px]", active ? "text-amber" : "")} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

/** Menu lateral navy de 248 px (UI_LAYOUT §3.1). */
export function AppSidebar({ user, clients, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  // Cliente ativo derivado da rota (/clientes/[clientId]/...); a autorização é feita no layout do cliente.
  const activeId = /^\/clientes\/([0-9a-f-]{36})(\/|$)/i.exec(pathname)?.[1];
  const activeClient = activeId ? (clients.find((c) => c.id === activeId) ?? null) : null;
  return (
    <div className="flex h-full flex-col gap-7 bg-navy px-4 py-6 text-white">
      <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-2">
        <span aria-hidden="true" className="flex size-[34px] items-center justify-center rounded-[8px] bg-amber text-[17px] font-extrabold text-navy">
          E
        </span>
        <span className="flex flex-col">
          <span className="text-base font-extrabold">Efettiva OS</span>
          <span className="text-xs text-on-navy-label">Uso interno</span>
        </span>
      </Link>

      <nav aria-label="Principal" className="flex flex-col gap-0.5">
        {GLOBAL_NAV.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="flex flex-col gap-2">
        <span className="px-3 text-[11px] font-bold tracking-[0.8px] text-on-navy-label uppercase">Cliente ativo</span>
        <ClientSwitcher active={activeClient} clients={clients} onNavigate={onNavigate} />
        {activeClient ? (
          <nav aria-label={`Navegação do cliente ${activeClient.name}`} className="flex flex-col gap-0.5 pl-5">
            {clientNav(activeClient.id).map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
            ))}
          </nav>
        ) : (
          <span className="px-3 text-xs leading-relaxed text-on-navy-label">Escolha uma empresa para ver diagnóstico, dados, oportunidades e projetos.</span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-navy-600 p-3">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-navy-600 text-[13px] font-bold">
          {initials(user.name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-bold">{user.name}</span>
          <span className="text-xs text-on-navy-label">{user.role}</span>
        </span>
        <form action={logoutAction}>
          <button type="submit" aria-label="Sair" title="Sair" className="flex size-10 items-center justify-center rounded-[8px] text-on-navy-item hover:bg-navy-700">
            <LogOut className="size-[18px]" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
