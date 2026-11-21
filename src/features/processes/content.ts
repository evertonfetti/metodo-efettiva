import { z } from "zod";

/** Ficha de processo (Anexo C / RF-061). Campos opcionais: processos BASIC só têm objetivo. */
export const processContentSchema = z.object({
  trigger: z.string().trim().max(2000).optional(),
  inputs: z.string().trim().max(2000).optional(),
  roles: z.string().trim().max(2000).optional(),
  steps: z.array(z.string().trim().min(1).max(1000)).max(40).default([]),
  approach: z.string().trim().max(3000).optional(),
  cadence: z.string().trim().max(2000).optional(),
  kpis: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  /** Fórmula por nome de KPI (seção 9.4: KPI sem fórmula bloqueia a publicação). */
  kpiFormulas: z.record(z.string(), z.string().trim().max(500)).default({}),
  exceptions: z.string().trim().max(2000).optional(),
  controls: z.string().trim().max(2000).optional(),
  validation: z.string().trim().max(2000).optional(),
});
export type ProcessContent = z.infer<typeof processContentSchema>;

/** Conteúdo completo versionado (o que vai para ProcessRevision.contentJson e para o snapshot do projeto). */
export type ProcessSnapshot = { code: string; domainCode: string; name: string; objective: string; content: ProcessContent | null };

export function parseContent(v: unknown): ProcessContent | null {
  if (v == null) return null;
  const r = processContentSchema.safeParse(v);
  return r.success ? r.data : null;
}

export const SHEET_SECTIONS: { key: Exclude<keyof ProcessContent, "kpiFormulas">; label: string; list?: boolean }[] = [
  { key: "trigger", label: "Gatilho" },
  { key: "inputs", label: "Entradas" },
  { key: "roles", label: "Responsáveis" },
  { key: "steps", label: "Passos", list: true },
  { key: "approach", label: "Abordagem" },
  { key: "cadence", label: "Cadência" },
  { key: "kpis", label: "KPIs", list: true },
  { key: "exceptions", label: "Exceções" },
  { key: "controls", label: "Controles" },
  { key: "validation", label: "Validação" },
];
