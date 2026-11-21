"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Visão geral", seg: "" },
  { label: "Plano de ação", seg: "/acoes" },
  { label: "Indicadores", seg: "/indicadores", phase: 6 },
  { label: "Playbooks", seg: "/playbooks", phase: 3 },
  { label: "Reuniões", seg: "/reunioes", phase: 6 },
  { label: "Arquivos", seg: "/arquivos", phase: 6 },
];

/** Abas do projeto: sublinhado âmbar na ativa; abas de fases futuras desabilitadas com o motivo. */
export function ProjectTabs({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Seções do projeto" className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        const href = `${base}${t.seg}`;
        const active = t.seg === "" ? path === base : path.startsWith(href);
        if (t.phase)
          return (
            <span key={t.label} aria-disabled="true" title={`Disponível na Fase ${t.phase}`} className="flex shrink-0 items-center gap-1.5 border-b-[3px] border-transparent px-3 py-2.5 text-sm font-semibold whitespace-nowrap text-text-subtle">
              {t.label} <span className="rounded-[4px] bg-surface-sunken px-1 text-[10px] font-bold">Fase {t.phase}</span>
            </span>
          );
        return (
          <Link key={t.label} href={href} aria-current={active ? "page" : undefined} className={cn("shrink-0 border-b-[3px] px-3 py-2.5 text-sm font-bold whitespace-nowrap", active ? "border-amber text-navy" : "border-transparent text-text-muted hover:text-navy")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
