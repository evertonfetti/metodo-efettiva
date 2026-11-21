import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { accessibleClientsWhere, assertCanEdit, assertClientAccess } from "@/lib/security/access";
import { encryptSecret, decryptSecret, maskTaxId } from "@/lib/security/crypto";
import type { SessionUser } from "@/features/auth/service";
import type { Prisma } from "@/generated/prisma/client";
import { CHANNELS, SALES_MODELS, SEGMENT_CODES, SIZES, UF } from "./catalog";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const optionalInt = (min: number, max: number) =>
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

export const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  segment: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

/** Lista paginada com busca e filtros, sempre restrita aos clientes acessíveis. */
export async function listClients(user: SessionUser, params: z.input<typeof listSchema>) {
  const p = listSchema.parse(params);
  const where: Prisma.ClientWhereInput = {
    ...accessibleClientsWhere(user),
    ...(p.status ? { status: p.status } : { status: { not: "ARCHIVED" } }),
    ...(p.segment && SEGMENT_CODES.includes(p.segment as never) ? { industry: p.segment } : {}),
    ...(p.q ? { OR: [{ name: { contains: p.q, mode: "insensitive" } }, { legalName: { contains: p.q, mode: "insensitive" } }, { city: { contains: p.q, mode: "insensitive" } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      select: {
        id: true, name: true, industry: true, industryOther: true, city: true, state: true, status: true, isDemo: true, createdAt: true,
        assessments: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, finalizedAt: true } },
      },
    }),
  ]);
  return { items, total, page: p.page, pageSize: p.pageSize, pages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

/** Cria a empresa-cliente (área isolada) e, se informado, o contato responsável. */
export async function createClient(user: SessionUser, input: unknown) {
  assertCanEdit(user);
  const d = clientInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        name: d.name, legalName: d.legalName, taxIdEncrypted: d.taxId ? encryptSecret(d.taxId) : null,
        industry: d.industry, industryOther: d.industry === "OUTRO" ? d.industryOther : null,
        size: d.size, city: d.city, state: d.state, timezone: d.timezone, salesModel: d.salesModel,
        salesChannels: d.salesChannels, sellersCount: d.sellersCount, sourceSystem: d.sourceSystem, salesCycle: d.salesCycle,
        typicalPurchaseFrequencyDays: d.typicalPurchaseFrequencyDays, mainChallenges: d.mainChallenges, tags: d.tags,
        ownerUserId: user.id,
        access: user.role === "OWNER" ? undefined : { create: { userId: user.id, permission: "EDIT" } },
      },
    });
    if (d.contactName) {
      await tx.clientContact.create({ data: { clientId: client.id, name: d.contactName, role: d.contactRole, email: d.contactEmail, phone: d.contactPhone } });
    }
    await audit({ actorUserId: user.id, clientId: client.id, entityType: "Client", entityId: client.id, action: "client.create" }, tx);
    return client;
  });
}

export async function updateClient(user: SessionUser, clientId: string, input: unknown) {
  const before = await assertClientAccess(user, clientId, "EDIT");
  const d = clientUpdateSchema.parse(input);
  const updated = await prisma.client.update({
    where: { id: before.id },
    data: {
      name: d.name, legalName: d.legalName ?? null,
      ...(d.taxId !== undefined ? { taxIdEncrypted: d.taxId ? encryptSecret(d.taxId) : null } : {}),
      industry: d.industry, industryOther: d.industry === "OUTRO" ? d.industryOther : null,
      size: d.size ?? null, city: d.city ?? null, state: d.state ?? null, timezone: d.timezone, salesModel: d.salesModel ?? null,
      salesChannels: d.salesChannels, sellersCount: d.sellersCount ?? null, sourceSystem: d.sourceSystem ?? null, salesCycle: d.salesCycle ?? null,
      typicalPurchaseFrequencyDays: d.typicalPurchaseFrequencyDays ?? null, mainChallenges: d.mainChallenges ?? null, tags: d.tags,
      ...(d.status ? { status: d.status } : {}),
    },
  });
  await audit({ actorUserId: user.id, clientId, entityType: "Client", entityId: clientId, action: "client.update", before, after: updated });
  return updated;
}

/** Visão de leitura do cliente com CPF/CNPJ mascarado (nunca o valor completo na UI). */
export async function getClientView(user: SessionUser, clientId: string) {
  const c = await assertClientAccess(user, clientId, "VIEW");
  const taxId = c.taxIdEncrypted ? decryptSecret(c.taxIdEncrypted) : null;
  const { taxIdEncrypted: _omit, access: _a, ...rest } = c;
  void _omit;
  void _a;
  return { ...rest, taxIdMasked: maskTaxId(taxId) };
}

// ── Contatos e notas (RF-011, RF-013) ──

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  role: optionalText(120),
  email: z.email("E-mail inválido.").optional().or(z.literal("").transform(() => undefined)),
  phone: optionalText(40),
  dataProcessingNote: optionalText(300),
});

export async function addContact(user: SessionUser, clientId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const d = contactSchema.parse(input);
  const contact = await prisma.clientContact.create({ data: { clientId, ...d } });
  await audit({ actorUserId: user.id, clientId, entityType: "ClientContact", entityId: contact.id, action: "contact.create" });
  return contact;
}

export async function removeContact(user: SessionUser, clientId: string, contactId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const { count } = await prisma.clientContact.deleteMany({ where: { id: contactId, clientId } });
  if (count) await audit({ actorUserId: user.id, clientId, entityType: "ClientContact", entityId: contactId, action: "contact.delete" });
  return count;
}

export const noteSchema = z.object({
  body: z.string().trim().min(1, "Escreva a nota.").max(5000),
  visibility: z.enum(["INTERNO", "CLIENTE"]).default("INTERNO"),
});

export async function addNote(user: SessionUser, clientId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const d = noteSchema.parse(input);
  const note = await prisma.clientNote.create({ data: { clientId, authorId: user.id, ...d } });
  await audit({ actorUserId: user.id, clientId, entityType: "ClientNote", entityId: note.id, action: "note.create" });
  return note;
}
