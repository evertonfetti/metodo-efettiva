// Uso: node docs/apostila/render-pdf.mjs  (gera docs/apostila/Apostila_Efettiva_OS.pdf a partir de apostila.html)
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
const dir = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ args: ["--no-sandbox", "--allow-file-access-from-files"] });
const p = await b.newPage();
await p.goto("file://" + path.join(dir, "apostila.html"), { waitUntil: "load" });
await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: path.join(dir, "Apostila_Efettiva_OS.pdf"), format: "A4", printBackground: true, displayHeaderFooter: true, preferCSSPageSize: true,
  headerTemplate: "<span></span>", footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#667;font-family:sans-serif">Efettiva OS · Apostila de ajuda · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>', margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" } });
await b.close();
