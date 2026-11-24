/** E2E da Planilha do cliente no navegador: baixa modelo e dados, devolve o arquivo exportado e confere o relatório. */
import "dotenv/config";
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { prisma } from "@/lib/db";

const BASE = process.env.BASE ?? "http://localhost:3101";
const OUT = process.env.OUT ?? "/tmp/planilha-e2e";
async function main() {
  mkdirSync(OUT, { recursive: true });
  const client = await prisma.client.findFirstOrThrow({ where: { name: "Distribuidora Modelo B2B" } });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", process.env.E2E_EMAIL ?? ""); await page.fill("#password", process.env.E2E_PASSWORD ?? "");
  await page.click("button[type=submit]"); await page.waitForURL("**/dashboard");
  const c = `/clientes/${client.id}`;
  await page.goto(`${BASE}${c}/planilha`); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/01-planilha.png` });
  for (const modo of ["modelo", "dados"]) {
    const r = await ctx.request.get(`${BASE}/api/v1/clients${"/" + client.id}/planilha?modo=${modo}`);
    console.log(modo, r.status(), r.headers()["content-disposition"], (await r.body()).length);
    writeFileSync(`${OUT}/${modo}.xlsx`, await r.body());
  }
  await page.setInputFiles("#wb-file", `${OUT}/dados.xlsx`);
  await page.getByRole("button", { name: "Enviar e conferir" }).click();
  await page.waitForURL("**/planilha/**"); await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/02-conferir.png`, fullPage: true });
  console.log((await page.locator("main").innerText()).slice(0, 1500));
  await browser.close(); await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
