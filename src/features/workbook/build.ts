import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertClientAccess } from "@/lib/security/access";
import type { SessionUser } from "@/features/auth/service";
import { decryptSecret } from "@/lib/security/crypto";
import { getSetting } from "@/features/settings/service";
import { getActiveTemplate } from "@/features/assessments/service";
import { answerValueSchema } from "@/features/assessments/conditions";
import { channelLabel, salesModelLabel, segmentLabel, sizeLabel } from "@/features/clients/catalog";
import type { ImportTypeCode } from "@/features/imports/fields";
import { COMMERCIAL_SHEETS, COMPANY_FIELDS, CONFIDENCE_OPTIONS, CONTACT_COLUMNS, DIAG_COLUMNS, SHEETS, commercialColumns, optionsText } from "./layout";

type Cell = { value?: string | number | boolean | Date | null; [k: string]: unknown };
const NAVY = "#031951";
const AMBER_SOFT = "#FFF3D6";
const ICE = "#F7F9FC";
const SLATE = "#49556A";

export const EXPORT_ROW_CAP = 20_000;

const head = (value: string): Cell => ({ value, fontWeight: "bold", backgroundColor: NAVY, textColor: "#FFFFFF", wrap: true, alignVertical: "center" });
const example = (value: string | number | null): Cell => ({ value: value === null ? "" : value, fontStyle: "italic", textColor: SLATE, backgroundColor: ICE, wrap: true, alignVertical: "top" });
const fill = (value: string | number | Date | null | undefined, extra: Record<string, unknown> = {}): Cell => ({ value: value ?? "", backgroundColor: AMBER_SOFT, wrap: true, alignVertical: "top", borderColor: "#E2E8F0", ...extra });
const text = (value: string, extra: Record<string, unknown> = {}): Cell => ({ value, wrap: true, alignVertical: "top", ...extra });

const dmy = (d: Date | null | undefined) => (d ? new Date(d.getTime()).toISOString().slice(0, 10).split("-").reverse().join("/") : "");
const num = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));

type Mode = "template" | "data";

/** Gera o XLSX. `template` = em branco com exemplos (para enviar ao cliente); `data` = o que já existe no sistema. */
export async function buildWorkbook(user: SessionUser, clientId: string, mode: Mode): Promise<{ data: Buffer; fileName: string }> {
  const client = await assertClientAccess(user, clientId, "EDIT");
  const withData = mode === "data";
  const [scaleLabels, template] = await Promise.all([getSetting("scaleLabels"), getActiveTemplate()]);
  const sheets: { data: unknown[][]; sheet: string; columns: { width: number }[]; stickyRowsCount?: number }[] = [];
  const notes: string[] = [];

  // ── Empresa ──
  const taxId = client.taxIdEncrypted ? decryptSecret(client.taxIdEncrypted) : null;
  const current: Record<string, string> = withData
    ? {
        name: client.name, legalName: client.legalName ?? "", taxId: "", industry: segmentLabel(client.industry), industryOther: client.industryOther ?? "",
        size: sizeLabel(client.size) ?? "", city: client.city ?? "", state: client.state ?? "", salesModel: salesModelLabel(client.salesModel) ?? "",
        salesChannels: client.salesChannels.map(channelLabel).join("; "), sellersCount: client.sellersCount?.toString() ?? "", sourceSystem: client.sourceSystem ?? "",
        salesCycle: client.salesCycle ?? "", typicalPurchaseFrequencyDays: client.typicalPurchaseFrequencyDays?.toString() ?? "", mainChallenges: client.mainChallenges ?? "", tags: client.tags.join("; "),
      }
    : {};
  if (withData && taxId) notes.push("O CPF/CNPJ não é exportado (fica cifrado no sistema); deixe em branco para não alterar.");
  sheets.push({
    sheet: SHEETS.company,
    stickyRowsCount: 1,
    columns: [{ width: 34 }, { width: 38 }, { width: 13 }, { width: 34 }, { width: 46 }, { width: 52 }],
    data: [
      ["Campo", "Preenchimento", "Obrigatório", "Exemplo", "Como preencher", "Opções aceitas"].map(head),
      ...COMPANY_FIELDS.map((f) => [
        text(f.label, { fontWeight: "bold", textColor: NAVY }),
        fill(current[f.key] ?? ""),
        text(f.required ? "Sim" : "Não"),
        example(f.example),
        text(f.help),
        text(optionsText(f)),
      ]),
    ],
  });

  // ── Contatos ──
  const contacts = withData ? await prisma.clientContact.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } }) : [];
  sheets.push({
    sheet: SHEETS.contacts,
    stickyRowsCount: 2,
    columns: [{ width: 28 }, { width: 24 }, { width: 30 }, { width: 20 }, { width: 44 }],
    data: [
      CONTACT_COLUMNS.map((c) => head(`${c.label}${c.required ? " *" : ""}`)),
      CONTACT_COLUMNS.map((c) => example(c.example)),
      ...contacts.map((c) => [fill(c.name), fill(c.role), fill(c.email), fill(c.phone), fill(c.dataProcessingNote)]),
      ...(withData ? [] : Array.from({ length: 5 }, () => CONTACT_COLUMNS.map(() => fill("")))),
    ],
  });

  // ── Diagnóstico ──
  const [domains, questions] = await Promise.all([
    prisma.assessmentDomain.findMany({ where: { templateId: template.id }, orderBy: { sortOrder: "asc" } }),
    prisma.assessmentQuestion.findMany({ where: { templateId: template.id }, orderBy: { sortOrder: "asc" } }),
  ]);
  const domainName = new Map(domains.map((d) => [d.code, d.name]));
  const answers = new Map<string, { answer: string | number; respondent: string; notes: string; confidence: string }>();
  if (withData) {
    const last = await prisma.assessment.findFirst({ where: { clientId }, orderBy: { number: "desc" } });
    if (last) {
      const rows = await prisma.assessmentAnswer.findMany({ where: { assessmentId: last.id, clientId }, include: { question: { select: { questionCode: true } } } });
      for (const a of rows) {
        const v = answerValueSchema.safeParse(a.valueJson);
        if (!v.success) continue;
        const answer = v.data.kind === "scale" ? v.data.value : v.data.kind === "unknown" ? "NS" : v.data.kind === "na" ? "NA" : "";
        answers.set(a.question.questionCode, { answer, respondent: a.respondent ?? "", notes: a.notes ?? "", confidence: CONFIDENCE_OPTIONS.find((c) => c.code === a.confidence)?.label ?? "" });
      }
      notes.push(`Respostas do diagnóstico nº ${last.number} (${last.status === "FINALIZED" ? "fechado" : "rascunho"}).`);
    }
  }
  sheets.push({
    sheet: SHEETS.diagnostic,
    stickyRowsCount: 2,
    columns: [{ width: 13 }, { width: 28 }, { width: 70 }, { width: 18 }, { width: 22 }, { width: 44 }, { width: 24 }],
    data: [
      Object.values(DIAG_COLUMNS).map(head),
      [example("EXEMPLO"), example("Estratégia e posicionamento"), example("A empresa definiu formalmente quais tipos de clientes deseja conquistar e por quê?"), example(3), example("Maria (diretora)"), example("Existe documento, mas só a diretoria conhece"), example("Informado")],
      ...questions.map((q) => {
        const a = answers.get(q.questionCode);
        return [text(q.questionCode, { textColor: SLATE }), text(domainName.get(q.domainCode) ?? q.domainCode, { textColor: SLATE }), text(q.title), fill(a?.answer ?? "", { align: "center" }), fill(a?.respondent), fill(a?.notes), fill(a?.confidence)];
      }),
    ],
  });

  // ── Base comercial ──
  for (const type of Object.keys(COMMERCIAL_SHEETS) as ImportTypeCode[]) {
    const cols = commercialColumns(type);
    const rows = withData ? await commercialRows(clientId, type) : [];
    if (withData && rows.length === EXPORT_ROW_CAP) notes.push(`${COMMERCIAL_SHEETS[type]}: exportadas as ${EXPORT_ROW_CAP.toLocaleString("pt-BR")} linhas mais recentes (limite da planilha).`);
    sheets.push({
      sheet: COMMERCIAL_SHEETS[type],
      stickyRowsCount: 2,
      columns: cols.map((c) => ({ width: Math.max(16, c.label.length + 6) })),
      data: [
        cols.map((c) => head(`${c.label}${c.required ? " *" : ""}`)),
        cols.map((c) => example(c.example)),
        ...rows,
        ...(withData ? [] : [cols.map(() => fill(""))]),
      ],
    });
  }

  // ── Leia-me (primeira aba) ──
  const readme: unknown[][] = [
    [{ value: `Planilha do cliente — ${client.name}`, fontWeight: "bold", fontSize: 16, textColor: NAVY }],
    [text(withData ? `Dados atuais exportados do Efettiva OS em ${dmy(new Date())}.` : "Modelo em branco para preenchimento pelo cliente.", { textColor: SLATE })],
    [text("")],
    [head("Como preencher")],
    [text("1. Preencha somente as células amarelas. As linhas cinza em itálico são exemplos e são ignoradas na importação.")],
    [text("2. Aba Empresa: uma linha por campo; escreva na coluna “Preenchimento”. Em branco = não altera o que já existe no sistema.")],
    [text("3. Aba Contatos: uma pessoa por linha (a partir da linha 3). Nome é obrigatório.")],
    [text("4. Aba Diagnóstico: responda 0 a 5 conforme a escala abaixo; use NS se não souber e NA se não se aplica. Deixe em branco o que não quiser responder agora.")],
    [text("5. Abas Clientes, Produtos, Vendas, Itens de venda e Orçamentos: dados comerciais, uma linha por registro (a partir da linha 3). Datas como dd/mm/aaaa; valores como 1.234,56.")],
    [text("6. Não renomeie as abas nem altere os cabeçalhos. Devolva o arquivo ao consultor da Efettiva.")],
    [text("")],
    [head("Escala de respostas do diagnóstico")],
    ...scaleLabels.map((l, i) => [text(`${i} — ${l}`)]),
    [text("NS — Não sei responder")],
    [text("NA — Não se aplica à nossa empresa")],
    ...(notes.length ? [[text("")], [head("Observações desta exportação")], ...notes.map((n) => [text(n)])] : []),
  ];
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const all = [{ data: readme, sheet: SHEETS.readme, columns: [{ width: 130 }] }, ...sheets];
  const data = await writeXlsxFile(all as never).toBuffer();
  await audit({ actorUserId: user.id, clientId, entityType: "Client", entityId: clientId, action: withData ? "workbook.export" : "workbook.template" });
  const slug = client.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cliente";
  return { data, fileName: `planilha-${withData ? "dados" : "modelo"}-${slug}.xlsx` };
}

async function commercialRows(clientId: string, type: ImportTypeCode): Promise<unknown[][]> {
  const take = EXPORT_ROW_CAP;
  const f = (v: string | number | Date | null | undefined) => fill(v instanceof Date ? dmy(v) : v);
  const yn = (b: boolean | null) => (b === null ? "" : b ? "sim" : "não");
  switch (type) {
    case "CUSTOMERS":
      return (await prisma.customer.findMany({ where: { clientId }, orderBy: { externalId: "asc" }, take })).map((c) => [f(c.externalId), f(c.name), f(c.segment), f(c.sellerRef), f(c.typicalIntervalDays), f(yn(c.active))]);
    case "PRODUCTS":
      return (await prisma.product.findMany({ where: { clientId }, orderBy: { externalId: "asc" }, take })).map((p) => [f(p.externalId), f(p.sku), f(p.name), f(p.category), f(yn(p.active))]);
    case "SALES":
      return (await prisma.sale.findMany({ where: { clientId }, orderBy: { occurredAt: "desc" }, take, include: { customer: { select: { externalId: true } } } })).map((s) => [
        f(s.externalId), f(s.customer.externalId), f(s.occurredAt), f(s.statusRaw), f(s.recordKind === "ORDER" ? "PEDIDO" : "FATURAMENTO"), f(num(s.grossAmount)), f(num(s.discounts)), f(num(s.deductions)), f(num(s.netAmount)), f(s.sellerRef),
      ]);
    case "SALE_ITEMS":
      return (await prisma.saleItem.findMany({ where: { clientId }, orderBy: { sale: { occurredAt: "desc" } }, take, include: { sale: { select: { externalId: true } }, product: { select: { externalId: true } } } })).map((i) => [
        f(i.sale.externalId), f(i.externalLineId), f(i.product?.externalId), f(num(i.quantity)), f(num(i.unitPrice)), f(num(i.discount)), f(num(i.unitVariableCost)),
      ]);
    case "QUOTES":
      return (await prisma.quote.findMany({ where: { clientId }, orderBy: { issuedAt: "desc" }, take, include: { customer: { select: { externalId: true } } } })).map((q) => [
        f(q.externalId), f(q.customer.externalId), f(q.issuedAt), f(q.validUntil), f(q.statusRaw), f(num(q.amount)), f(q.ownerRef), f(q.lastInteractionAt), f(q.lostReason),
      ]);
  }
}

