"use client";

import { createContext, useContext, useState } from "react";
import { Dialog } from "radix-ui";
import { Menu, X } from "lucide-react";
import { AppSidebar, type SidebarProps } from "./app-sidebar";

const MobileNavContext = createContext<() => void>(() => {});

/** Shell: sidebar fixa ≥1024 px; abaixo disso, gaveta aberta pelo botão da topbar. */
export function AppShell({ sidebar, children }: { sidebar: Omit<SidebarProps, "onNavigate">; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavContext.Provider value={() => setOpen(true)}>
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 bg-navy lg:block">
          <div className="sticky top-0 h-screen overflow-y-auto">
            <AppSidebar {...sidebar} />
          </div>
        </aside>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/40 lg:hidden" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] overflow-y-auto lg:hidden" aria-describedby={undefined}>
              <Dialog.Title className="sr-only">Menu de navegação</Dialog.Title>
              <Dialog.Close className="absolute top-3 right-3 z-10 flex size-10 items-center justify-center rounded-[8px] text-white hover:bg-navy-700" aria-label="Fechar menu">
                <X className="size-5" aria-hidden="true" />
              </Dialog.Close>
              <AppSidebar {...sidebar} onNavigate={() => setOpen(false)} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </MobileNavContext.Provider>
  );
}

export function MobileMenuButton() {
  const openNav = useContext(MobileNavContext);
  return (
    <button type="button" onClick={openNav} aria-label="Abrir menu" className="flex size-10 items-center justify-center rounded-[8px] text-navy hover:bg-surface-sunken lg:hidden">
      <Menu className="size-5" aria-hidden="true" />
    </button>
  );
}
