import { z } from "zod";
import { CHANNELS, SALES_MODELS, SEGMENT_CODES, SIZES, UF } from "./catalog";

/** Schemas compartilhados (navegador e servidor). O servidor sempre revalida. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(min).max(max).optional());

export const clientInputSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome da empresa.").max(160),
    legalName: optionalText(200),
    taxId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v.replace(/\D/g, "") : undefined))
      .refine((v) => !v || v.length === 11 || v.length === 14, "CPF/CNPJ deve ter 11 ou 14 dígitos."),
    industry: z.enum(SEGMENT_CODES, { error: "Selecione o segmento." }),
    industryOther: optionalText(120),
    size: z.enum(SIZES.map((s) => s.code) as [string, ...string[]]).optional().or(z.literal("").transform(() => undefined)),
    city: optionalText(120),
    state: z.enum(UF).optional().or(z.literal("").transform(() => undefined)),
    timezone: z.string().trim().min(3).max(60).default("America/Sao_Paulo"),
    salesModel: z.enum(SALES_MODELS.map((s) => s.code) as [string, ...string[]]).optional().or(z.literal("").transform(() => undefined)),
    salesChannels: z.array(z.enum(CHANNELS.map((c) => c.code) as [string, ...string[]])).default([]),
    sellersCount: optionalInt(0, 100000),
    sourceSystem: optionalText(120),
    salesCycle: optionalText(120),
    typicalPurchaseFrequencyDays: optionalInt(1, 3650),
    mainChallenges: optionalText(2000),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    contactName: optionalText(120),
    contactRole: optionalText(120),
    contactEmail: z.email("E-mail inválido.").optional().or(z.literal("").transform(() => undefined)),
    contactPhone: optionalText(40),
  })
  .refine((v) => v.industry !== "OUTRO" || !!v.industryOther, { message: "Descreva o segmento.", path: ["industryOther"] });

export type ClientInput = z.input<typeof clientInputSchema>;

export const clientUpdateSchema = clientInputSchema.safeExtend({
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  role: optionalText(120),
  email: z.email("E-mail inválido.").optional().or(z.literal("").transform(() => undefined)),
  phone: optionalText(40),
  dataProcessingNote: optionalText(300),
});

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Escreva a nota.").max(5000),
  visibility: z.enum(["INTERNO", "CLIENTE"]).default("INTERNO"),
});


/** Validação leve no navegador (campos que o usuário mais erra); o servidor aplica o schema completo. */
export const clientFormSchema = z
  .looseObject({
    name: z.string().trim().min(2, "Informe o nome da empresa.").max(160),
    industry: z.enum(SEGMENT_CODES, { error: "Selecione o segmento." }),
    industryOther: z.string().optional(),
    sellersCount: optionalInt(0, 100000),
    typicalPurchaseFrequencyDays: optionalInt(1, 3650),
  })
  .refine((v) => v.industry !== "OUTRO" || !!v.industryOther?.trim(), { message: "Descreva o segmento.", path: ["industryOther"] });
