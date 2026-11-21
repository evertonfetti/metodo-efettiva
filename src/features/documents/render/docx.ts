import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Block, DocContent } from "../content";
import { audienceLabel, prepare, splitPending, WATERMARK, type RenderMeta } from "./meta";

const NAVY = "0B2545";
const AMBER = "D9A441";
const AMBER_50 = "FDF3DC";
const FONT = "Manrope";

const runs = (text: string, opts: { bold?: boolean; color?: string; size?: number } = {}) =>
  splitPending(text).map((p) => new TextRun({ text: p.text, bold: opts.bold || p.pending, color: p.pending ? "6B4A06" : opts.color, size: opts.size, shading: p.pending ? { type: ShadingType.CLEAR, fill: AMBER_50, color: "auto" } : undefined }));

function tableBlock(b: Extract<Block, { type: "table" }>): Table {
  const cell = (text: string, header: boolean) =>
    new TableCell({
      children: [new Paragraph({ children: header ? [new TextRun({ text, bold: true, color: "FFFFFF", size: 18 })] : runs(text, { size: 18 }) })],
      shading: header ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: b.headers.map((h) => cell(h, true)) }), ...b.rows.map((r) => new TableRow({ children: b.headers.map((_, i) => cell(r[i] ?? "", false)) }))],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
  });
}

export async function renderDocx(raw: DocContent, meta: RenderMeta): Promise<Buffer> {
  const content = prepare(raw, meta.audience);
  let listInstance = 0;
  const children: (Paragraph | Table)[] = [];

  // Capa
  children.push(
    new Paragraph({ children: [new TextRun({ text: meta.brand.companyName, bold: true, color: NAVY, size: 28 })], border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: AMBER, space: 4 } } }),
    new Paragraph({ children: [new TextRun({ text: meta.brand.tagline, color: "475569", size: 20 })], spacing: { after: 1600 } }),
    new Paragraph({ children: [new TextRun({ text: meta.title, bold: true, color: NAVY, size: 52 })], spacing: { after: 400 } }),
    ...[
      ["Empresa", meta.clientName],
      ...(meta.projectName ? [["Projeto", meta.projectName]] : []),
      ["Versão", `v${meta.version} · ${meta.stateLabel}`],
      ["Data", meta.dateLabel],
      ["Audiência", audienceLabel(meta.audience)],
      ["Classificação", meta.brand.confidentiality],
    ].map(([k, v]) => new Paragraph({ children: [new TextRun({ text: `${k}: `, bold: true, color: "475569" }), new TextRun({ text: v! })] })),
    ...(meta.isDraft ? [new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: `${WATERMARK} — documento não aprovado; não usar como versão final.`, bold: true, color: "991B1B" })] })] : []),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Sumário" })] }),
    ...content.sections.map((s, i) => new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${s.title}` })] })),
  );

  content.sections.forEach((s, i) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: `${i + 1}. ${s.title}` }), ...(s.visibility === "INTERNO" ? [new TextRun({ text: "  INTERNO", bold: true, color: "9A3412", size: 18 })] : [])] }));
    for (const b of s.blocks) {
      switch (b.type) {
        case "heading":
          children.push(new Paragraph({ heading: b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3, children: runs(b.text) }));
          break;
        case "paragraph":
          children.push(new Paragraph({ children: runs(b.text), spacing: { after: 120 } }));
          break;
        case "callout":
          children.push(new Paragraph({ children: runs(b.text), shading: { type: ShadingType.CLEAR, fill: b.tone === "warn" ? AMBER_50 : "F1F5F9", color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 24, color: b.tone === "warn" ? AMBER : NAVY, space: 8 } }, spacing: { before: 80, after: 160 } }));
          break;
        case "list": {
          const instance = ++listInstance;
          for (const it of b.items) children.push(new Paragraph({ children: runs(it), ...(b.ordered ? { numbering: { reference: "ordered", level: 0, instance } } : { bullet: { level: 0 } }) }));
          break;
        }
        case "table":
          children.push(tableBlock(b), new Paragraph({ children: [] }));
          break;
      }
    }
  });

  const doc = new Document({
    creator: meta.brand.companyName,
    title: meta.title,
    description: `${meta.clientName} · v${meta.version} · ${audienceLabel(meta.audience)}`,
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: "0F172A" } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: AMBER, space: 4 } } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 26, bold: true, color: NAVY }, paragraph: { spacing: { before: 200, after: 120 } } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 23, bold: true, color: NAVY }, paragraph: { spacing: { before: 200, after: 80 } } },
      ],
    },
    numbering: { config: [{ reference: "ordered", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] }] },
    sections: [
      {
        properties: { page: { margin: { top: 1200, bottom: 1100, left: 1100, right: 1100 } } },
        headers: meta.isDraft ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${WATERMARK} · documento não aprovado`, bold: true, color: "991B1B", size: 22 })] })] }) } : undefined,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${meta.clientName} · ${meta.title} · v${meta.version} · ${meta.brand.confidentiality} · Página `, size: 16, color: "64748B" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "64748B" }),
                  new TextRun({ text: " de ", size: 16, color: "64748B" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "64748B" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
