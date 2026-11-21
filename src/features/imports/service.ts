import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import { enqueueJob } from "@/lib/jobs/queue";
import { FILE_TYPES, putFile, readClientFile } from "@/lib/storage";
import { parseDateOnly } from "@/lib/dates";
import { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/service";
import { getSetting } from "@/features/settings/service";
import { IMPORT_TYPES, mappingIssues, suggestMapping, type ImportTypeCode, type Mapping } from "./fields";
import { decodeText, parseCsv, readXlsx, type Table } from "./parse";
import { validateRows, type NormalizedRow, type RowError } from "./validate";

export const MAX_ROWS = 200_000;
const CHUNK = 500;
type Tx = Prisma.TransactionClient;

export const uploadSchema = z.object({
  type: z.enum(["CUSTOMERS", "PRODUCTS", "SALES", "SALE_ITEMS", "QUOTES"]),
  sourceSystem: z.string().trim().min(2, "Informe o sistema de origem (ex.: ERP, planilha comercial).").max(60),
  recordKind: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["ORDER", "INVOICE"]).optional()),
});

async function loadTable(clientId: string, fileAssetId: string, sheet?: string | null): Promise<Table & { sheets?: string[]; sheet?: string }> {
  const { file, data } = await readClientFile(clientId, fileAssetId);
  if (file.mime === FILE_TYPES.xlsx!.mime) return readXlsx(data, sheet ?? undefined);
  if (file.mime === FILE_TYPES.csv!.mime || file.mime === FILE_TYPES.txt!.mime) return parseCsv(decodeText(data));
  throw new AppError("VALIDATION", "Envie um arquivo CSV ou XLSX.");
}

async function loadBatch(clientId: string, batchId: string) {
  if (!isUuid(batchId)) throw notFound("Importação");
  const b = await prisma.importBatch.findFirst({ where: { id: batchId, clientId } });
  if (!b) throw notFound("Importação");
  return b;
}

/** Passo 1–2: arquivo privado do cliente + leitura do cabeçalho + mapeamento sugerido (perfil salvo tem prioridade). */
export async function createBatch(user: SessionUser, clientId: string, input: unknown, file: { name: string; data: Buffer }) {
  await assertClientAccess(user, clientId, "EDIT");
  const d = uploadSchema.parse(input);
  if (d.type === "SALES" && !d.recordKind) throw new AppError("VALIDATION", "Informe se o arquivo de vendas representa PEDIDO ou FATURAMENTO.", { recordKind: "Informe pedido ou faturamento." });
  const { uploadMaxMb } = await getSetting("parameters");
  const asset = await putFile({ clientId, uploadedBy: user.id, originalName: file.name, data: file.data, maxBytes: uploadMaxMb * 1_048_576 });
  if (![FILE_TYPES.csv!.mime, FILE_TYPES.xlsx!.mime, FILE_TYPES.txt!.mime].includes(asset.mime)) throw new AppError("VALIDATION", "Envie um arquivo CSV ou XLSX.");
  let table: Awaited<ReturnType<typeof loadTable>>;
  try {
    table = await loadTable(clientId, asset.id);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("VALIDATION", "Não foi possível ler o arquivo. Verifique se é um CSV ou XLSX válido.");
  }
  if (table.headers.filter(Boolean).length < 2) throw new AppError("VALIDATION", "Cabeçalho não encontrado: a primeira linha deve ter os nomes das colunas.");
  if (table.rows.length === 0) throw new AppError("VALIDATION", "Arquivo sem linhas de dados.");
  if (table.rows.length > MAX_ROWS) throw new AppError("VALIDATION", `Arquivo com mais de ${MAX_ROWS.toLocaleString("pt-BR")} linhas: divida em partes.`);
  const profile = await prisma.importMappingProfile.findUnique({ where: { clientId_type: { clientId, type: d.type } } });
  const mapping = suggestMapping(d.type, table.headers, profile?.mappingJson as Mapping | undefined);
  const batch = await prisma.importBatch.create({
    data: {
      clientId,
      type: d.type,
      fileAssetId: asset.id,
      originalName: asset.originalName,
      sourceSystem: d.sourceSystem,
      recordKind: d.type === "SALES" ? d.recordKind : null,
      sheetName: table.sheet ?? null,
      headersJson: table.headers,
      mappingJson: mapping,
      summaryJson: { sheets: table.sheets ?? [], fromProfile: !!profile && Object.entries(mapping).some(([k, h]) => h && (profile.mappingJson as Mapping)[k] === h) },
      totalRows: table.rows.length,
      createdBy: user.id,
    },
  });
  await audit({ actorUserId: user.id, clientId, entityType: "ImportBatch", entityId: batch.id, action: "import.upload", meta: { type: d.type, rows: table.rows.length } });
  return batch;
}

export const mappingSchema = z.object({ mapping: z.record(z.string(), z.string().nullable()), sheet: z.string().max(100).optional() });

/** Passo 3: confirma mapeamento (salva perfil por cliente+tipo). */
export async function setMapping(user: SessionUser, clientId: string, batchId: string, input: unknown) {
  await assertClientAccess(user, clientId, "EDIT");
  const b = await loadBatch(clientId, batchId);
  if (!["UPLOADED", "MAPPED", "VALIDATED"].includes(b.status)) throw new AppError("INVALID_STATE", "Lote já importado: envie o arquivo de novo para reimportar.");
  const d = mappingSchema.parse(input);
  let headers = b.headersJson as string[];
  let sheet = b.sheetName;
  if (d.sheet && d.sheet !== b.sheetName) {
    const t = await loadTable(clientId, b.fileAssetId, d.sheet);
    headers = t.headers;
    sheet = t.sheet ?? d.sheet;
  }
  const mapping: Mapping = {};
  for (const fd of IMPORT_TYPES[b.type].fields) mapping[fd.key] = d.mapping[fd.key] || null;
  const issues = mappingIssues(b.type, headers, mapping);
  if (issues.length) throw new AppError("VALIDATION", issues[0]!, { issues });
  await prisma.$transaction([
    prisma.importBatch.update({ where: { id: b.id }, data: { mappingJson: mapping, headersJson: headers, sheetName: sheet, status: "MAPPED", previewJson: Prisma.DbNull } }),
    prisma.importMappingProfile.upsert({ where: { clientId_type: { clientId, type: b.type } }, create: { clientId, type: b.type, mappingJson: mapping }, update: { mappingJson: mapping } }),
  ]);
  await audit({ actorUserId: user.id, clientId, entityType: "ImportBatch", entityId: b.id, action: "import.map" });
  return { id: b.id, status: "MAPPED" };
}

type Plan = { create: NormalizedRow[]; update: (NormalizedRow & { id: string })[]; unchanged: number; refErrors: RowError[]; refs: Map<string, string> };

/** Classifica cada registro válido contra o banco: novo, alterado (mesma origem/ID) ou sem alteração; resolve referências. */
async function plan(db: Tx | typeof prisma, clientId: string, type: ImportTypeCode, sourceSystem: string, records: NormalizedRow[]): Promise<Plan> {
  const refErrors: RowError[] = [];
  const refs = new Map<string, string>();
  const keys = records.map((r) => r.key);
  let existing: { id: string; key: string; rowHash: string }[] = [];
  const valid: NormalizedRow[] = [];

  const lookup = async (kind: "customer" | "product" | "sale", ext: string[]) => {
    const uniq = [...new Set(ext)];
    for (let i = 0; i < uniq.length; i += 5000) {
      const part = uniq.slice(i, i + 5000);
      const rows =
        kind === "customer"
          ? await db.customer.findMany({ where: { clientId, externalId: { in: part } }, select: { id: true, externalId: true } })
          : kind === "product"
            ? await db.product.findMany({ where: { clientId, externalId: { in: part } }, select: { id: true, externalId: true } })
            : await db.sale.findMany({ where: { clientId, sourceSystem, externalId: { in: part } }, select: { id: true, externalId: true } });
      for (const r of rows) refs.set(`${kind}:${r.externalId}`, r.id);
    }
  };

  if (type === "SALES" || type === "QUOTES") await lookup("customer", records.map((r) => String(r.data.customerExt)));
  if (type === "SALE_ITEMS") {
    await lookup("sale", records.map((r) => String(r.data.saleExt)));
    await lookup("product", records.map((r) => r.data.productExt).filter((x): x is string => typeof x === "string"));
  }
  for (const r of records) {
    if ((type === "SALES" || type === "QUOTES") && !refs.has(`customer:${r.data.customerExt}`)) { refErrors.push({ row: r.row, field: "id_cliente", reason: "cliente não encontrado: importe o arquivo de clientes antes", raw: String(r.data.customerExt) }); continue; }
    if (type === "SALE_ITEMS") {
      if (!refs.has(`sale:${r.data.saleExt}`)) { refErrors.push({ row: r.row, field: "id_venda", reason: `venda não encontrada na origem “${sourceSystem}”`, raw: String(r.data.saleExt) }); continue; }
      if (r.data.productExt && !refs.has(`product:${r.data.productExt}`)) { refErrors.push({ row: r.row, field: "id_produto", reason: "produto não encontrado: importe o arquivo de produtos antes", raw: String(r.data.productExt) }); continue; }
    }
    valid.push(r);
  }

  for (let i = 0; i < keys.length; i += 5000) {
    const part = keys.slice(i, i + 5000);
    if (type === "CUSTOMERS") existing.push(...(await db.customer.findMany({ where: { clientId, externalId: { in: part } }, select: { id: true, externalId: true, rowHash: true } })).map((x) => ({ id: x.id, key: x.externalId, rowHash: x.rowHash })));
    if (type === "PRODUCTS") existing.push(...(await db.product.findMany({ where: { clientId, externalId: { in: part } }, select: { id: true, externalId: true, rowHash: true } })).map((x) => ({ id: x.id, key: x.externalId, rowHash: x.rowHash })));
    if (type === "SALES") existing.push(...(await db.sale.findMany({ where: { clientId, sourceSystem, externalId: { in: part } }, select: { id: true, externalId: true, rowHash: true } })).map((x) => ({ id: x.id, key: x.externalId, rowHash: x.rowHash })));
    if (type === "QUOTES") existing.push(...(await db.quote.findMany({ where: { clientId, sourceSystem, externalId: { in: part } }, select: { id: true, externalId: true, rowHash: true } })).map((x) => ({ id: x.id, key: x.externalId, rowHash: x.rowHash })));
  }
  if (type === "SALE_ITEMS") {
    const saleIds = [...new Set(valid.map((r) => refs.get(`sale:${r.data.saleExt}`)!))];
    const sales = await db.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, externalId: true } });
    const extById = new Map(sales.map((s) => [s.id, s.externalId]));
    for (let i = 0; i < saleIds.length; i += 5000) {
      const items = await db.saleItem.findMany({ where: { clientId, saleId: { in: saleIds.slice(i, i + 5000) } }, select: { id: true, saleId: true, externalLineId: true, rowHash: true } });
      existing.push(...items.map((x) => ({ id: x.id, key: `${extById.get(x.saleId)}#${x.externalLineId}`, rowHash: x.rowHash })));
    }
  }
  const byKey = new Map(existing.map((e) => [e.key, e]));
  const out: Plan = { create: [], update: [], unchanged: 0, refErrors, refs };
  for (const r of valid) {
    const e = byKey.get(r.key);
    if (!e) out.create.push(r);
    else if (e.rowHash !== r.hash) out.update.push({ ...r, id: e.id });
    else out.unchanged++;
  }
  existing = [];
  return out;
}

const PREVIEW_ROWS = 20;

/** Passo 4: valida tudo antes de confirmar (erros por linha/célula, prévia de 20 linhas, contagem novos/atualizados/sem alteração). */
export async function validateBatch(user: SessionUser, clientId: string, batchId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const b = await loadBatch(clientId, batchId);
  if (!["MAPPED", "VALIDATED"].includes(b.status)) throw new AppError("INVALID_STATE", b.status === "UPLOADED" ? "Confirme o mapeamento antes de validar." : "Lote já importado.");
  const table = await loadTable(clientId, b.fileAssetId, b.sheetName);
  const { timezone } = await getSetting("parameters");
  const res = validateRows(b.type, table, b.mappingJson as Mapping, { recordKind: b.recordKind, tz: timezone });
  const p = await plan(prisma, clientId, b.type, b.sourceSystem, res.records);
  const errors = [...res.errors, ...p.refErrors].sort((x, y) => x.row - y.row);
  const errorRows = new Set(errors.map((e) => e.row));
  const mapping = b.mappingJson as Mapping;
  const fields = IMPORT_TYPES[b.type].fields.filter((fd) => mapping[fd.key]);
  const preview = {
    columns: fields.map((fd) => ({ key: fd.key, label: fd.label, header: mapping[fd.key] })),
    rows: table.rows.slice(0, PREVIEW_ROWS).map((cells, i) => ({
      row: i + 2,
      values: fields.map((fd) => { const v = cells[table.headers.indexOf(mapping[fd.key]!)]; return v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 80); }),
      errors: errors.filter((e) => e.row === i + 2).map((e) => ({ field: e.field, reason: e.reason })),
    })),
  };
  const byReason = new Map<string, number>();
  for (const e of errors) byReason.set(`${e.field ?? "linha"}: ${e.reason}`, (byReason.get(`${e.field ?? "linha"}: ${e.reason}`) ?? 0) + 1);
  const summary = {
    ...(b.summaryJson as object),
    total: res.total,
    willCreate: p.create.length,
    willUpdate: p.update.length,
    unchanged: p.unchanged,
    duplicatesInFile: res.duplicates,
    rejected: errorRows.size,
    errorsByType: [...byReason.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15).map(([reason, count]) => ({ reason, count })),
  };
  // arquivo de erros exportável (RF-035)
  let errorFileAssetId: string | null = null;
  if (errors.length) {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = "﻿linha;campo;motivo;valor\n" + errors.map((e) => [e.row, e.field ?? "", e.reason, e.raw ?? ""].map((x) => esc(String(x))).join(";")).join("\n");
    errorFileAssetId = (await putFile({ clientId, uploadedBy: user.id, originalName: `erros-${IMPORT_TYPES[b.type].file}-${b.id.slice(0, 8)}.csv`, data: Buffer.from(csv, "utf8"), maxBytes: 50 * 1_048_576, forcedType: FILE_TYPES.csv! })).id;
  }
  await prisma.$transaction(async (tx) => {
    await tx.importRowError.deleteMany({ where: { batchId: b.id } });
    for (let i = 0; i < errors.length && i < 50_000; i += 1000)
      await tx.importRowError.createMany({ data: errors.slice(i, i + 1000).map((e) => ({ clientId, batchId: b.id, rowNumber: e.row, field: e.field, reason: e.reason, rawValueSafe: e.raw })) });
    await tx.importBatch.update({
      where: { id: b.id },
      data: { status: "VALIDATED", totalRows: res.total, rejectedRows: errorRows.size, acceptedRows: p.create.length + p.update.length + p.unchanged, summaryJson: summary as Prisma.InputJsonValue, previewJson: preview as Prisma.InputJsonValue, errorFileAssetId },
    });
  });
  await audit({ actorUserId: user.id, clientId, entityType: "ImportBatch", entityId: b.id, action: "import.validate", meta: { rejected: errorRows.size, create: p.create.length, update: p.update.length } });
  return { id: b.id, summary };
}

/** Passo 5: confirma; a gravação roda no worker (idempotente por origem + ID externo). */
export async function commitBatch(user: SessionUser, clientId: string, batchId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  const b = await loadBatch(clientId, batchId);
  if (b.status !== "VALIDATED") throw new AppError("INVALID_STATE", "Valide o lote antes de importar.");
  if (b.acceptedRows === 0) throw new AppError("VALIDATION", "Nenhuma linha válida para importar.");
  const res = await prisma.importBatch.updateMany({ where: { id: b.id, status: "VALIDATED" }, data: { status: "IMPORTING", startedAt: new Date() } });
  if (res.count === 0) throw new AppError("CONFLICT", "Este lote já está sendo importado.");
  const job = await enqueueJob({ operation: "import.commit", clientId, createdBy: user.id, idempotencyKey: `import.commit:${b.id}`, payload: { batchId: b.id } });
  await prisma.importBatch.update({ where: { id: b.id }, data: { jobId: job.id } });
  await audit({ actorUserId: user.id, clientId, entityType: "ImportBatch", entityId: b.id, action: "import.commit.request" });
  return { id: b.id, status: "IMPORTING", jobId: job.id };
}

const dec = (v: unknown) => (v == null ? null : new Prisma.Decimal(v as number));
const day = (v: unknown) => (v ? parseDateOnly(String(v)) : null);

function recordData(type: ImportTypeCode, r: NormalizedRow, refs: Map<string, string>) {
  const d = r.data;
  switch (type) {
    case "CUSTOMERS":
      return { name: String(d.name), segment: (d.segment as string) ?? null, sellerRef: (d.sellerRef as string) ?? null, active: (d.active as boolean) ?? null, typicalIntervalDays: (d.typicalIntervalDays as number) ?? null };
    case "PRODUCTS":
      return { sku: (d.sku as string) ?? null, name: String(d.name), category: (d.category as string) ?? null, active: (d.active as boolean) ?? null };
    case "SALES":
      return { customerId: refs.get(`customer:${d.customerExt}`)!, occurredAt: day(d.occurredAt)!, status: d.status as "VALID", statusRaw: String(d.statusRaw), grossAmount: dec(d.gross), discounts: dec(d.discounts), deductions: dec(d.deductions), netAmount: dec(d.net)!, netDerived: !!d.netDerived, sellerRef: (d.sellerRef as string) ?? null };
    case "SALE_ITEMS":
      return { productId: d.productExt ? refs.get(`product:${d.productExt}`)! : null, quantity: dec(d.quantity)!, unitPrice: dec(d.unitPrice)!, discount: dec(d.discount), unitVariableCost: dec(d.unitCost), totalAmount: dec(d.total)!, variableCostTotal: dec(d.costTotal) };
    case "QUOTES":
      return { customerId: refs.get(`customer:${d.customerExt}`)!, issuedAt: day(d.issuedAt)!, validUntil: day(d.validUntil), status: d.status as "OPEN", statusRaw: String(d.statusRaw), amount: dec(d.amount)!, ownerRef: (d.ownerRef as string) ?? null, lastInteractionAt: day(d.lastInteractionAt), lostReason: (d.lostReason as string) ?? null };
  }
}

/**
 * Worker: relê o arquivo, revalida e grava em lotes transacionais de 500 linhas.
 * Idempotente: novos são criados, alterados atualizados (mesma origem/ID), iguais ignorados — retry não duplica.
 */
export async function runCommit(batchId: string, jobClientId: string | null) {
  const b = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!b) throw new Error("Lote não encontrado");
  if (b.clientId !== jobClientId) throw new Error("clientId do job diverge do lote");
  if (b.status === "COMPLETED" || b.status === "PARTIAL") return { status: b.status };
  const clientId = b.clientId;
  try {
    const table = await loadTable(clientId, b.fileAssetId, b.sheetName);
    const { timezone } = await getSetting("parameters");
    const res = validateRows(b.type, table, b.mappingJson as Mapping, { recordKind: b.recordKind, tz: timezone });
    const p = await plan(prisma, clientId, b.type, b.sourceSystem, res.records);
    const base = { clientId, rowHash: "", batchId: b.id };
    for (let i = 0; i < p.create.length; i += CHUNK) {
      const part = p.create.slice(i, i + CHUNK);
      await prisma.$transaction(async (tx) => {
        const rows = part.map((r) => ({ ...base, rowHash: r.hash, ...recordData(b.type, r, p.refs) }));
        if (b.type === "CUSTOMERS") await tx.customer.createMany({ data: rows.map((x, j) => ({ ...(x as object), externalId: String(part[j]!.data.externalId) }) as never), skipDuplicates: true });
        if (b.type === "PRODUCTS") await tx.product.createMany({ data: rows.map((x, j) => ({ ...(x as object), externalId: String(part[j]!.data.externalId) }) as never), skipDuplicates: true });
        if (b.type === "SALES") await tx.sale.createMany({ data: rows.map((x, j) => ({ ...(x as object), sourceSystem: b.sourceSystem, recordKind: b.recordKind!, externalId: String(part[j]!.data.externalId) }) as never), skipDuplicates: true });
        if (b.type === "QUOTES") await tx.quote.createMany({ data: rows.map((x, j) => ({ ...(x as object), sourceSystem: b.sourceSystem, externalId: String(part[j]!.data.externalId) }) as never), skipDuplicates: true });
        if (b.type === "SALE_ITEMS") await tx.saleItem.createMany({ data: rows.map((x, j) => ({ ...(x as object), saleId: p.refs.get(`sale:${part[j]!.data.saleExt}`)!, externalLineId: String(part[j]!.data.lineId) }) as never), skipDuplicates: true });
      });
    }
    for (let i = 0; i < p.update.length; i += CHUNK) {
      const part = p.update.slice(i, i + CHUNK);
      await prisma.$transaction(async (tx) => {
        for (const r of part) {
          const data = { rowHash: r.hash, batchId: b.id, ...recordData(b.type, r, p.refs) } as never;
          if (b.type === "CUSTOMERS") await tx.customer.update({ where: { id: r.id }, data });
          if (b.type === "PRODUCTS") await tx.product.update({ where: { id: r.id }, data });
          if (b.type === "SALES") await tx.sale.update({ where: { id: r.id }, data });
          if (b.type === "QUOTES") await tx.quote.update({ where: { id: r.id }, data });
          if (b.type === "SALE_ITEMS") await tx.saleItem.update({ where: { id: r.id }, data });
        }
      });
    }
    const rejected = new Set([...res.errors, ...p.refErrors].map((e) => e.row)).size;
    const status = rejected > 0 ? "PARTIAL" : "COMPLETED";
    // indicadores recalculados antes de marcar o lote como concluído: "concluído" = dados e métricas prontos.
    // Falha no cálculo não desfaz dados gravados (o botão "Recalcular indicadores" refaz).
    try {
      const { refreshMetrics } = await import("@/features/metrics/service");
      await refreshMetrics(clientId, b.createdBy);
    } catch (err) {
      const { logger } = await import("@/lib/logger");
      logger.error({ err, batchId: b.id }, "falha ao recalcular indicadores após importação");
    }
    await prisma.importBatch.update({
      where: { id: b.id },
      data: { status, createdRows: p.create.length, updatedRows: p.update.length, unchangedRows: p.unchanged + res.duplicates, rejectedRows: rejected, acceptedRows: p.create.length + p.update.length + p.unchanged, finishedAt: new Date(), errorMessage: null },
    });
    await audit({ actorUserId: b.createdBy, clientId, entityType: "ImportBatch", entityId: b.id, action: "import.commit", meta: { created: p.create.length, updated: p.update.length, unchanged: p.unchanged, rejected } });
    return { status, created: p.create.length, updated: p.update.length, unchanged: p.unchanged };
  } catch (err) {
    await prisma.importBatch.update({ where: { id: b.id }, data: { status: "FAILED", errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 300), finishedAt: new Date() } });
    throw err;
  }
}

export async function listBatches(user: SessionUser, clientId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  return prisma.importBatch.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function getBatch(user: SessionUser, clientId: string, batchId: string) {
  await assertClientAccess(user, clientId, "VIEW");
  const b = await loadBatch(clientId, batchId);
  const errors = await prisma.importRowError.findMany({ where: { batchId: b.id, clientId }, orderBy: [{ rowNumber: "asc" }], take: 200 });
  return { ...b, errors };
}

export async function setSourceValidated(user: SessionUser, clientId: string, batchId: string, validated: boolean) {
  await assertClientAccess(user, clientId, "EDIT");
  const b = await loadBatch(clientId, batchId);
  await prisma.importBatch.update({ where: { id: b.id }, data: { sourceValidated: validated } });
  await audit({ actorUserId: user.id, clientId, entityType: "ImportBatch", entityId: b.id, action: validated ? "import.source_validated" : "import.source_unvalidated" });
  return { id: b.id, sourceValidated: validated };
}
