import type { DocContent } from "../content";
import { pdfFooter, renderHtml } from "./html";
import type { RenderMeta } from "./meta";

/** PDF via Chromium (Playwright) a partir do mesmo HTML autocontido; sem acesso à rede. */
export async function renderPdf(content: DocContent, meta: RenderMeta): Promise<Buffer> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true });
    const page = await ctx.newPage();
    await page.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
    await page.setContent(renderHtml(content, meta), { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: pdfFooter(meta), margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
