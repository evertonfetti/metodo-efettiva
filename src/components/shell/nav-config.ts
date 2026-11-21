import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Building2,
  ClipboardList,
  Database,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LineChart,
  SlidersHorizontal,
  Target,
  Telescope,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Quando definido, o item aparece desabilitado com "Disponível na Fase N". */
  availableInPhase?: number;
  /** Casa também sub-rotas (ex.: /clientes/... ) */
  matchPrefix?: boolean;
};

export const GLOBAL_NAV: NavItem[] = [
  { label: "Visão geral", href: "/dashboard", icon: LayoutDashboard },
  { label: "Clientes", href: "/clientes", icon: Building2, matchPrefix: false, availableInPhase: 1 },
  { label: "Biblioteca de processos", href: "/biblioteca", icon: BookOpen, matchPrefix: true, availableInPhase: 2 },
  { label: "Configurações", href: "/configuracoes", icon: SlidersHorizontal, matchPrefix: true },
];

export function clientNav(clientId: string): NavItem[] {
  const base = `/clientes/${clientId}`;
  return [
    { label: "Visão 360°", href: base, icon: Telescope },
    { label: "Diagnósticos", href: `${base}/diagnosticos`, icon: ClipboardList, matchPrefix: true },
    { label: "Dados e importações", href: `${base}/dados`, icon: Database, matchPrefix: true, availableInPhase: 4 },
    { label: "Oportunidades", href: `${base}/oportunidades`, icon: Target, matchPrefix: true, availableInPhase: 2 },
    { label: "Projetos", href: `${base}/projetos`, icon: FolderKanban, matchPrefix: true, availableInPhase: 2 },
    { label: "Documentos", href: `${base}/documentos`, icon: FileText, matchPrefix: true, availableInPhase: 3 },
    { label: "Relatórios", href: `${base}/relatorios`, icon: LineChart, matchPrefix: true, availableInPhase: 6 },
  ];
}
