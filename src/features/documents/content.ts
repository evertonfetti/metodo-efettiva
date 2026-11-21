import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Conteúdo de documento como AST de blocos (sem HTML): validado por Zod, renderizado
 * igualmente para editor, Markdown, HTML/PDF e DOCX. Texto puro; marcadores `[PENDENTE: …]`.
 */
const text = z.string().max(20_000);
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: z.string().max(300) }),
  z.object({ type: z.literal("paragraph"), text }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(z.string().max(2000)).max(200) }),
  z.object({
    type: z.literal("table"),
    kind: z.enum(["generic", "kpi", "raci", "responsibilities"]).default("generic"),
    headers: z.array(z.string().max(200)).min(1).max(12),
    rows: z.array(z.array(z.string().max(2000)).max(12)).max(300),
  }),
  z.object({ type: z.literal("callout"), tone: z.enum(["info", "warn"]), text }),
]);
export type Block = z.infer<typeof blockSchema>;

export const SECTION_STATES = ["PENDING", "IN_REVIEW", "APPROVED"] as const;
export type SectionState = (typeof SECTION_STATES)[number];

export const sectionSchema = z.object({
  key: z.string().regex(/^[a-z0-9:-]{2,60}$/),
  title: z.string().trim().min(2).max(200),
  visibility: z.enum(["INTERNO", "CLIENTE"]),
  state: z.enum(SECTION_STATES),
  origin: z.string().max(300),
  processCode: z.string().regex(/^[A-Z]\d{2}$/).optional(),
  manuallyEdited: z.boolean().default(false),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  /** Seção com conteúdo vindo de sugestão de IA revisada (8.1: mostrar IA × template). */
  aiGenerationId: z.string().optional(),
  blocks: z.array(blockSchema).max(400),
});
export type Section = z.infer<typeof sectionSchema>;

export const contentSchema = z.object({ sections: z.array(sectionSchema).min(1).max(80) });
export type DocContent = z.infer<typeof contentSchema>;

export type EvidenceSource = { ref: string; label: string; kind: string };
export type Sources = {
  clientId: string;
  clientName: string;
  projectId: string | null;
  assessmentId: string | null;
  assessmentLabel: string | null;
  processes: { code: string; version: number }[];
  opportunityIds: string[];
  evidence: EvidenceSource[];
  generatedAt: string;
  generator: string;
};

export const PENDING_RE = /\[PENDENTE(?::[^\]]*)?\]/g;

export function blockTexts(b: Block): string[] {
  switch (b.type) {
    case "heading":
    case "paragraph":
    case "callout":
      return [b.text];
    case "list":
      return b.items;
    case "table":
      return [...b.headers, ...b.rows.flat()];
  }
}

export const sectionText = (s: Section) => [s.title, ...s.blocks.flatMap(blockTexts)].join("\n");
export const countPending = (s: Section) => (sectionText(s).match(PENDING_RE) ?? []).length;

/** Filtro de audiência aplicado no servidor antes de qualquer renderização (RF-085). */
export function filterForAudience(content: DocContent, audience: "INTERNO" | "CLIENTE"): DocContent {
  return { sections: audience === "INTERNO" ? content.sections : content.sections.filter((s) => s.visibility === "CLIENTE") };
}

export function hashContent(c: DocContent): string {
  return createHash("sha256").update(JSON.stringify(c)).digest("hex");
}
