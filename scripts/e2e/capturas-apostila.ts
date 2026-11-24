/**
 * Refaz as capturas da apostila (docs/apostila/img) a partir de um banco DESCARTÁVEL com seed DEMO.
 * Uso: DATABASE_URL=<banco descartável> BASE=http://localhost:3101 E2E_EMAIL=... E2E_PASSWORD=... OUT=<pasta> npx tsx scripts/e2e/capturas-apostila.ts
 */
import "dotenv/config";
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { prisma } from "@/lib/db";
import { buildSample, toCsv } from "../acceptance/sample-data";

const BASE = process.env.BASE ?? "http://localhost:3101";
const OUT = process.env.OUT ?? "/tmp/capturas";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const client = await prisma.client.findFirstOrThrow({ where: { name: "Distribuidora Modelo B2B" } });
  const assessment = await prisma.assessment.findFirstOrThrow({ where: { clientId: client.id }, orderBy: { number: "asc" } });
  const project = await prisma.project.findFirstOrThrow({ where: { clientId: client.id } });
  const doc = await prisma.document.findFirstOrThrow({ where: { clientId: client.id } });
  const proc = await prisma.processDefinition.findFirstOrThrow({ where: { code: "V05" } }).catch(() => prisma.processDefinition.findFirstOrThrow());
  const c = `/clientes/${client.id}`;
  const p = `${c}/projetos/${project.id}`;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  const snap = async (name: string, path: string, full = false) => {
    await page.goto(BASE + path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
    console.log("  ✓", name);
  };

  await snap("login", "/login");
  await page.fill("#email", process.env.E2E_EMAIL ?? "");
  await page.fill("#password", process.env.E2E_PASSWORD ?? "");
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");

  await snap("f-dashboard", "/dashboard", true);
  await snap("clientes", "/clientes");
  await snap("f-clientes-novo", "/clientes/novo", true);
  await snap("f-cliente-360", c, true);
  await snap("f-cliente-editar", `${c}/editar`, true);
  await snap("diag-novo", `${c}/diagnosticos`);
  await snap("diag-runner", `${c}/diagnosticos/${assessment.id}`);
  await snap("f-diag-resumo", `${c}/diagnosticos/${assessment.id}/resumo`, true);
  await snap("f-dados", `${c}/dados`, true);
  await snap("wizard-1-envio", `${c}/dados/importar`);
  await snap("f-oportunidades", `${c}/oportunidades`, true);
  await snap("f-oport-nova", `${c}/oportunidades/nova`, true);
  await snap("f-projeto-novo", `${c}/projetos/novo`, true);
  await snap("projeto-full", p, true);
  await snap("acoes", `${p}/acoes`);
  await snap("f-indicadores", `${p}/indicadores`, true);
  await snap("f-reunioes", `${p}/reunioes`, true);
  await snap("documentos-full", `${c}/documentos`);
  await snap("doc-playbook", `${c}/documentos/${doc.id}`);
  await snap("f-relatorios", `${c}/relatorios`);
  await snap("biblioteca-lista", "/biblioteca");
  await snap("biblioteca-ficha", `/biblioteca/${proc.code}`, true);
  await snap("biblioteca-editar", `/biblioteca/${proc.code}/editar`, true);
  for (const [n, a, full] of [["marca", "marca", false], ["metodo", "metodo", false], ["diagnostico", "diagnostico", true], ["parametros", "parametros", false], ["ia", "ia", false], ["saude", "saude", false]] as const)
    await snap(`config-${n}`, `/configuracoes?aba=${a}`, full);

  // ── Estados com interação (modais, wizard, ajuda) ──
  const shot = async (name: string) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("  ✓", name); };
  await page.goto(BASE + c); await page.waitForLoadState("networkidle");
  await page.getByText("Contatos-chave").scrollIntoViewIfNeeded(); await shot("modal-contato");

  await page.goto(BASE + p); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Atualizar status de/ }).first().click(); await shot("modal-processo-status");

  await page.goto(BASE + `${p}/acoes`); await page.waitForLoadState("networkidle");
  await page.locator("main button.text-left", { hasText: "Validar V05" }).first().click(); await shot("modal-tarefa-editar");

  await page.goto(BASE + `${c}/documentos/${doc.id}`); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Editar", exact: true }).first().click().catch(() => undefined); await shot("doc-editar");

  await page.goto(BASE + `/biblioteca/${proc.code}/editar`); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Ajuda: Gatilho" }).click(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/ajuda-campo.png`, clip: { x: 240, y: 330, width: 760, height: 330 } }); console.log("  ✓ ajuda-campo");

  await page.goto(BASE + `${c}/oportunidades/nova`); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Ajuda", exact: true }).click(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/ajuda-tela.png`, clip: { x: 700, y: 60, width: 740, height: 360 } }); console.log("  ✓ ajuda-tela");

  await page.goto(BASE + `${c}/dados/importar`); await page.waitForLoadState("networkidle");
  const csv = toCsv(buildSample(new Date(), { customers: 40 }).sales);
  await page.check("input[name=type][value=SALES]");
  await page.fill("#i-src", "ERP Demonstração");
  await page.selectOption("#i-kind", "ORDER");
  await page.setInputFiles("#i-file", { name: "vendas.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.getByRole("button", { name: "Enviar e mapear colunas" }).first().click();
  await page.waitForURL("**/importar/**"); await page.waitForLoadState("networkidle"); await shot("wizard-2-mapeamento");

  await browser.close();
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
