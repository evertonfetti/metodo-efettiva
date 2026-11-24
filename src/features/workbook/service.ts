import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import { FILE_TYPES, putFile, readClientFile } from "@/lib/storage";
import type { SessionUser } from "@/features/auth/service";
import { getSetting } from "@/features/settings/service";
import { addContact, updateClient } from "@/features/clients/service";
import { createAssessment, getActiveTemplate, saveAnswer } from "@/features/assessments/service";
import { createBatch, setMapping, validateBatch } from "@/features/imports/service";
import { IMPORT_TYPES, type Mapping } from "@/features/imports/fields";
import type { Cell } from "@/features/imports/parse";
import { analyzeWorkbook, readSheets, type Analysis, type CommercialResult, type Context } from "./read";

export type SectionResult = { section: string; ok: boolean; message: string; href?: string };

async function buildContext(clientId: string): Promise<Context> {
  const [client, contacts, template] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientId } }),
    prisma.clientContact.findMany({ where: { clientId }, select: { email: true, name: true } }),
    getActiveTemplate(),
  ]);
  const questions = await prisma.assessmentQuestion.findMany({ where: { templateId: template.id }, select: { questionCode: true, allowUnknown: true, allowNotApplicable: true } });
  return {
    client: { ...client },
    contacts,
    questions: questions.map((q) => ({ code: q.questionCode, allowUnknown: q.allowUnknown, allowNotApplicable: q.allowNotApplicable })),
  };
}

/** Passo 1: guarda a planilha devolvida (privada do cliente) e confere se é um XLSX legível. Nada é gravado no cadastro. */
export async function uploadWorkbook(user: SessionUser, clientId: string, file: { name: string; data: Buffer }) {
  await assertClientAccess(user, clientId, "EDIT");
  const { uploadMaxMb } = await getSetting("parameters");
  const asset = await putFile({ clientId, uploadedBy: user.id, originalName: file.name, data: file.data, maxBytes: uploadMaxMb * 1_048_576 });
  if (asset.mime !== FILE_TYPES.xlsx!.mime) throw new AppError("VALIDATION", "Envie a planilha em formato XLSX (a mesma que foi baixada do sistema).");
  try {
    const sheets = await readSheets(file.data);
    if (!sheets.has("Empresa") && !sheets.has("Contatos") && !sheets.has("Diagnóstico")) throw new Error("modelo");
  } catch (err) {
    if (err instanceof Error && /excede o limite/.test(err.message)) throw new AppError("VALIDATION", "Planilha grande demais depois de descompactada (limite de 200 MB).");
    throw new AppError("VALIDATION", "Este arquivo não parece o modelo do Efettiva OS. Baixe o modelo em “Planilha do cliente” e preencha-o sem renomear as abas.");
  }
  await audit({ actorUserId: user.id, clientId, entityType: "FileAsset", entityId: asset.id, action: "workbook.upload" });
  return asset;
}

/** Passo 2: relatório do que seria feito (sem gravar nada). */
export async function inspectWorkbook(user: SessionUser, clientId: string, fileId: string) {
  await assertClientAccess(user, clientId, "EDIT");
  if (!isUuid(fileId)) throw new AppError("NOT_FOUND", "Arquivo não encontrado.");
  const { file, data } = await readClientFile(clientId, fileId);
  const analysis = analyzeWorkbook(await readSheets(data), await buildContext(clientId));
  const applied = await prisma.auditEvent.findMany({ where: { clientId, action: "workbook.apply", entityId: fileId }, select: { meta: true } });
  const done = applied.map((a) => a.meta as { section?: string; batchId?: string; assessmentId?: string } | null).filter((m): m is NonNullable<typeof m> & { section: string } => !!m?.section);
  const appliedSections = done.map((m) => m.section);
  return { file: { id: file.id, name: file.originalName, uploadedAt: file.createdAt }, analysis, appliedSections, applied: done };
}

async function commercialBatch(user: SessionUser, clientId: string, fileName: string, c: CommercialResult, recordKind: string | undefined) {
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const toCell = (v: Cell) => (v === null || v === undefined || v === "" ? null : v instanceof Date ? { value: v, format: "dd/mm/yyyy" } : typeof v === "boolean" ? { value: v ? "sim" : "não" } : { value: v });
  const header = c.keys.map((k) => ({ value: k, fontWeight: "bold" as const }));
  const buf = await writeXlsxFile([header, ...c.rows.map((r) => r.map(toCell))] as never, { sheet: IMPORT_TYPES[c.type].file }).toBuffer();
  const batch = await createBatch(user, clientId, { type: c.type, sourceSystem: "Planilha do cliente", recordKind }, { name: `${fileName.replace(/\.xlsx$/i, "")}-${IMPORT_TYPES[c.type].file}.xlsx`, data: buf });
  await setMapping(user, clientId, batch.id, { mapping: batch.mappingJson as Mapping });
  const v = await validateBatch(user, clientId, batch.id);
  const s = v.summary as { willCreate: number; willUpdate: number; unchanged: number; rejected: number };
  return { id: batch.id, summary: s };
}

/** Passo 3: aplica as seções escolhidas. Cada seção só pode ser aplicada uma vez por arquivo (idempotência). */
export async function applyWorkbook(user: SessionUser, clientId: string, fileId: string, input: { sections: string[]; salesKind?: string }): Promise<SectionResult[]> {
  const { file, analysis, appliedSections } = await inspectWorkbook(user, clientId, fileId);
  const results: SectionResult[] = [];
  const wanted = new Set(input.sections);
  const run = async (section: string, fn: () => Promise<{ message: string; href?: string; meta?: Record<string, unknown> }>) => {
    if (!wanted.has(section)) return;
    if (appliedSections.includes(section)) return void results.push({ section, ok: false, message: "Esta parte desta planilha já foi aplicada." });
    try {
      const r = await fn();
      await audit({ actorUserId: user.id, clientId, entityType: "FileAsset", entityId: fileId, action: "workbook.apply", meta: { section, ...r.meta } });
      results.push({ section, ok: true, message: r.message, href: r.href });
    } catch (err) {
      results.push({ section, ok: false, message: err instanceof AppError ? err.message : "Falha inesperada ao aplicar esta parte." });
    }
  };
  const a: Analysis = analysis;

  await run("company", async () => {
    if (!a.company.input || a.company.issues.length) throw new AppError("VALIDATION", "Corrija os erros da aba Empresa e envie a planilha de novo.");
    await updateClient(user, clientId, a.company.input);
    return { message: `${a.company.changes.length} campo(s) atualizado(s).`, meta: { changes: a.company.changes.map((c) => c.key) } };
  });
  await run("contacts", async () => {
    for (const c of a.contacts.toCreate) await addContact(user, clientId, { name: c.name, role: c.role, email: c.email, phone: c.phone, dataProcessingNote: c.dataProcessingNote });
    return { message: `${a.contacts.toCreate.length} contato(s) criado(s); ${a.contacts.duplicates} já existia(m).`, meta: { created: a.contacts.toCreate.length } };
  });
  await run("diagnostic", async () => {
    if (!a.diagnostic.answers.length) throw new AppError("VALIDATION", "Nenhuma resposta válida encontrada na aba Diagnóstico.");
    const assessment = await createAssessment(user, clientId, {});
    for (const r of a.diagnostic.answers) await saveAnswer(user, clientId, assessment.id, { questionCode: r.code, value: r.value, respondent: r.respondent ?? null, notes: r.notes ?? null, confidence: r.confidence ?? "REPORTED" });
    return { message: `Diagnóstico nº ${assessment.number} criado como rascunho com ${a.diagnostic.answers.length} resposta(s). Revise e feche quando estiver conforme.`, href: `/clientes/${clientId}/diagnosticos/${assessment.id}`, meta: { assessmentId: assessment.id } };
  });
  for (const c of a.commercial) {
    await run(`commercial:${c.type}`, async () => {
      if (!c.rows.length) throw new AppError("VALIDATION", `A aba ${c.sheet} não tem linhas preenchidas.`);
      if (c.type === "SALES" && !["ORDER", "INVOICE"].includes(input.salesKind ?? "")) throw new AppError("VALIDATION", "Informe se as vendas são Pedidos ou Faturamento.");
      const b = await commercialBatch(user, clientId, file.name, c, c.type === "SALES" ? input.salesKind : undefined);
      return { message: `Lote criado e validado: ${b.summary.willCreate} novo(s), ${b.summary.willUpdate} a atualizar, ${b.summary.rejected} com erro. Confirme a importação para gravar.`, href: `/clientes/${clientId}/dados/importar/${b.id}`, meta: { batchId: b.id } };
    });
  }
  return results;
}
