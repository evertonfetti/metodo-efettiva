import { z } from "zod";

/**
 * Saída da IA para uma seção (RF-091/093). Blocos "planos" (campos anuláveis) para caber nas
 * restrições de structured outputs; convertidos e revalidados no schema de blocos do documento.
 */
export const OUTPUT_SCHEMA_VERSION = "section-draft-1.0";

export const flatBlockSchema = z.object({
  type: z.enum(["heading", "paragraph", "list", "table", "callout"]),
  text: z.string().nullable(),
  ordered: z.boolean().nullable(),
  items: z.array(z.string()).nullable(),
  headers: z.array(z.string()).nullable(),
  rows: z.array(z.array(z.string())).nullable(),
  tone: z.enum(["info", "warn"]).nullable(),
});

export const sectionDraftSchema = z.object({
  blocks: z.array(flatBlockSchema),
  evidenceRefs: z.array(z.string()),
  processCodes: z.array(z.string()),
  assumptions: z.array(z.string()),
  missingData: z.array(z.string()),
  openQuestions: z.array(z.string()),
  reviewRequests: z.array(z.string()),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
export type SectionDraft = z.infer<typeof sectionDraftSchema>;
