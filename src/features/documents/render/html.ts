import { readFileSync } from "node:fs";
import path from "node:path";
import type { Block, DocContent } from "../content";
import { audienceLabel, prepare, splitPending, WATERMARK, type RenderMeta } from "./meta";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const inline = (s: string) => splitPending(s).map((p) => (p.pending ? `<mark>${esc(p.text)}</mark>` : esc(p.text))).join("").replace(/\r?\n/g, "<br>");

let fontCache: string | null = null;
function fontFace(): string {
  if (fontCache === null) {
    try {
      const b64 = readFileSync(path.join(process.cwd(), "assets/fonts/Manrope-Variable.ttf")).toString("base64");
      fontCache = `@font-face{font-family:"Manrope";src:url(data:font/ttf;base64,${b64}) format("truetype");font-weight:200 800;}`;
    } catch {
      fontCache = "";
    }
  }
  return fontCache;
}

function block(b: Block): string {
  switch (b.type) {
    case "heading":
      return `<h${b.level + 1}>${inline(b.text)}</h${b.level + 1}>`;
    case "paragraph":
      return `<p>${inline(b.text)}</p>`;
    case "callout":
      return `<div class="callout ${b.tone}">${inline(b.text)}</div>`;
    case "list":
      return `<${b.ordered ? "ol" : "ul"}>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`;
    case "table":
      return `<table><thead><tr>${b.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${b.headers.map((_, i) => `<td>${inline(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
}

/** HTML autocontido (fonte embutida, sem recursos externos) usado para o PDF. */
export function renderHtml(raw: DocContent, meta: RenderMeta): string {
  const content = prepare(raw, meta.audience);
  const css = `${fontFace()}
  @page{size:A4;margin:22mm 18mm 20mm 18mm}
  *{box-sizing:border-box}
  body{font-family:"Manrope",Arial,sans-serif;color:#0f172a;font-size:10.5pt;line-height:1.5;margin:0}
  .cover{height:250mm;display:flex;flex-direction:column;justify-content:space-between;break-after:page}
  .cover .bar{height:10px;background:#0B2545;border-bottom:4px solid #D9A441}
  .cover .brand{font-weight:800;color:#0B2545;font-size:14pt;margin-top:14mm}
  .cover .tag{color:#475569;font-size:10pt}
  .cover h1{font-size:28pt;line-height:1.15;color:#0B2545;margin:0 0 6mm}
  .cover .meta td{padding:2px 12px 2px 0;font-size:10.5pt;border:0}
  .cover .meta td:first-child{color:#475569;font-weight:700}
  .toc{break-after:page}.toc h2{margin-top:0}.toc ol{padding-left:18px}.toc li{margin:3px 0}
  h2{color:#0B2545;font-size:16pt;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #D9A441;break-after:avoid}
  h3{color:#0B2545;font-size:12pt;margin:14px 0 6px;break-after:avoid}
  h4{color:#0B2545;font-size:11pt;margin:10px 0 4px}
  section.chapter{break-before:page}
  table{width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:9.5pt;break-inside:auto}
  th{background:#0B2545;color:#fff;text-align:left;padding:5px 6px;font-weight:700}
  td{border-bottom:1px solid #e2e8f0;padding:5px 6px;vertical-align:top}
  tr{break-inside:avoid}
  .callout{border-left:4px solid #0B2545;background:#f1f5f9;padding:8px 12px;margin:8px 0}
  .callout.warn{border-left-color:#D9A441;background:#fdf3dc}
  mark{background:#fdf3dc;color:#6b4a06;font-weight:700;padding:0 2px}
  .internal{display:inline-block;background:#ffedd5;color:#9a3412;font-size:8pt;font-weight:800;padding:1px 6px;border-radius:4px;margin-left:6px;vertical-align:middle}
  .watermark{position:fixed;top:45%;left:0;right:0;text-align:center;transform:rotate(-30deg);font-size:96pt;font-weight:800;color:rgba(153,27,27,.10);z-index:1000;pointer-events:none}
  .draftnote{color:#991b1b;font-weight:800}`;
  const cover = `<div class="cover"><div><div class="bar"></div><div class="brand">${esc(meta.brand.companyName)}</div><div class="tag">${esc(meta.brand.tagline)}</div></div>
  <div><h1>${esc(meta.title)}</h1><table class="meta"><tr><td>Empresa</td><td>${esc(meta.clientName)}</td></tr>${meta.projectName ? `<tr><td>Projeto</td><td>${esc(meta.projectName)}</td></tr>` : ""}<tr><td>Versão</td><td>v${meta.version} · ${esc(meta.stateLabel)}</td></tr><tr><td>Data</td><td>${esc(meta.dateLabel)}</td></tr><tr><td>Audiência</td><td>${audienceLabel(meta.audience)}</td></tr><tr><td>Classificação</td><td>${esc(meta.brand.confidentiality)}</td></tr></table>
  ${meta.isDraft ? `<p class="draftnote">${WATERMARK} — documento não aprovado; não usar como versão final.</p>` : ""}</div>
  <div class="tag">${esc(meta.brand.footerText)}</div></div>`;
  const toc = `<div class="toc"><h2>Sumário</h2><ol>${content.sections.map((s) => `<li>${esc(s.title)}</li>`).join("")}</ol></div>`;
  const body = content.sections
    .map((s, i) => `<section class="${s.processCode && !s.key.startsWith("pop:") ? "chapter" : ""}"><h2>${i + 1}. ${esc(s.title)}${s.visibility === "INTERNO" ? '<span class="internal">INTERNO</span>' : ""}</h2>${s.blocks.map(block).join("\n")}</section>`)
    .join("\n");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(meta.title)}</title><style>${css}</style></head><body>${meta.isDraft ? `<div class="watermark">${WATERMARK}</div>` : ""}${cover}${toc}${body}</body></html>`;
}

/** Rodapé do PDF (template do Chromium: só estilos inline). */
export function pdfFooter(meta: RenderMeta): string {
  return `<div style="font-family:Arial,sans-serif;font-size:7.5pt;color:#64748b;width:100%;padding:0 18mm;display:flex;justify-content:space-between"><span>${esc(meta.clientName)} · ${esc(meta.title)} · v${meta.version}${meta.isDraft ? ` · ${WATERMARK}` : ""}</span><span>${esc(meta.brand.confidentiality)} · <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;
}
