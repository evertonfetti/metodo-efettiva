import { z } from "zod";

/** Fases do método EFETTIVA (Anexo D) — configuráveis em Configurações. */
export const methodPhasesSchema = z
  .array(z.object({ code: z.string().min(1).max(20), name: z.string().min(2).max(40), gate: z.string().min(2).max(200) }))
  .length(5, "São exatamente 5 fases.");

export const DEFAULT_METHOD_PHASES: z.infer<typeof methodPhasesSchema> = [
  { code: "DIAGNOSE", name: "Diagnosticar", gate: "Diagnóstico revisado e baseline/limitações registradas" },
  { code: "ACTIVATE", name: "Ativar", gate: "Ao menos uma intervenção prioritária planejada e em piloto" },
  { code: "STRUCTURE", name: "Estruturar", gate: "Processo documentado, responsável, treinamento, controle e evidência" },
  { code: "SCALE", name: "Escalar", gate: "Piloto validado e expansão aprovada" },
  { code: "SUSTAIN", name: "Sustentar", gate: "Equipe do cliente opera e indicadores/auditoria comprovam aderência" },
];

/** Rótulos da escala 0–5 do diagnóstico (UI_LAYOUT §4 QuestionCard). */
export const scaleLabelsSchema = z.array(z.string().min(2).max(40)).length(6, "São 6 rótulos (0 a 5).");
export const DEFAULT_SCALE_LABELS = ["Inexistente", "Informal", "Iniciado", "Definido", "Praticado e medido", "Otimizado"];

/** Parâmetros analíticos e operacionais (RF-112). Valores de exemplo, não regras universais. */
export const parametersSchema = z.object({
  timezone: z.string().min(3).max(60),
  inactivityMinDays: z.coerce.number().int().min(1).max(730),
  inactivityAlertFactor: z.coerce.number().min(1).max(5),
  inactivityFallbackDays: z.coerce.number().int().min(1).max(730),
  minIntervalsForMedian: z.coerce.number().int().min(2).max(24),
  staleQuoteDays: z.coerce.number().int().min(1).max(365),
  abcAThreshold: z.coerce.number().min(50).max(95),
  abcBThreshold: z.coerce.number().min(60).max(99),
  topNConcentration: z.coerce.number().int().min(1).max(100),
  uploadMaxMb: z.coerce.number().int().min(1).max(100),
}).refine((p) => p.abcBThreshold > p.abcAThreshold, { message: "Limite B deve ser maior que o limite A.", path: ["abcBThreshold"] });

export type Parameters = z.infer<typeof parametersSchema>;

export const DEFAULT_PARAMETERS: Parameters = {
  timezone: "America/Sao_Paulo",
  inactivityMinDays: 30,
  inactivityAlertFactor: 1.5,
  inactivityFallbackDays: 60,
  minIntervalsForMedian: 3,
  staleQuoteDays: 15,
  abcAThreshold: 80,
  abcBThreshold: 95,
  topNConcentration: 10,
  uploadMaxMb: 20,
};

/** Identidade visual dos documentos exportados (RF-084/RF-110). Cores fixas da marca; logo opcional. */
export const brandSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(160).default(""),
  footerText: z.string().trim().max(200).default(""),
  confidentiality: z.string().trim().min(3).max(80),
  logoFileId: z.uuid().nullable().default(null),
});
export const DEFAULT_BRAND: z.infer<typeof brandSchema> = {
  companyName: "Efettiva Gestão",
  tagline: "Gestão comercial com método",
  footerText: "Documento elaborado pela Efettiva Gestão",
  confidentiality: "Confidencial",
  logoFileId: null,
};

export const SETTINGS = {
  methodPhases: { key: "method.phases", schema: methodPhasesSchema, default: DEFAULT_METHOD_PHASES },
  scaleLabels: { key: "assessment.scaleLabels", schema: scaleLabelsSchema, default: DEFAULT_SCALE_LABELS },
  parameters: { key: "system.parameters", schema: parametersSchema, default: DEFAULT_PARAMETERS },
  brand: { key: "brand.identity", schema: brandSchema, default: DEFAULT_BRAND },
} as const;

export type SettingName = keyof typeof SETTINGS;
