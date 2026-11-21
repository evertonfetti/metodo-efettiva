/**
 * E2E (teste obrigatório 10) no navegador real: cliente → diagnóstico → oportunidade → projeto → tarefas →
 * playbook → exportação → relatório, pela interface (Playwright/Chromium). Só as respostas do questionário usam a API.
 * Uso: E2E_EMAIL=... E2E_PASSWORD=... BASE=http://localhost:3100 npx tsx scripts/e2e/fluxo.ts  (worker rodando; SHOTS=<dir> salva telas)
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const SHOTS = process.env.SHOTS;
let step = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: false });
}

async function main() {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const name = `E2E Distribuidora ${stamp}`;
  try {
    // 1. login
    await page.goto(`${BASE}/login`);
    await page.fill("#email", process.env.E2E_EMAIL ?? "");
    await page.fill("#password", process.env.E2E_PASSWORD ?? "");
    await page.click("button[type=submit]");
    await page.waitForURL("**/dashboard");
    ok("login pela tela");

    // 2. cliente
    await page.goto(`${BASE}/clientes/novo`);
    await page.fill("#name", name);
    await page.selectOption("#industry", "DISTRIBUICAO");
    await page.fill("#tags", "teste-e2e");
    await page.getByRole("button", { name: "Cadastrar cliente" }).click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]{36}$/);
    const clientId = page.url().split("/").pop()!;
    await page.getByRole("heading", { name }).waitFor();
    await shot(page, "cliente-360");
    ok("cliente cadastrado pela tela (Visão 360°)");

    // 3. diagnóstico: criar pela tela, responder via API (autosave), fechar pela tela
    await page.goto(`${BASE}/clientes/${clientId}/diagnosticos?novo=1`);
    await page.getByRole("button", { name: "Iniciar diagnóstico" }).click();
    await page.waitForURL(/diagnosticos\/[0-9a-f-]{36}$/);
    const aid = page.url().split("/").pop()!;
    for (const [code, v] of [["DIAG05_01", 1], ["DIAG05_02", 0], ["DIAG04_01", 1], ["DIAG12_01", 2]] as const) {
      const r = await ctx.request.patch(`${BASE}/api/v1/clients/${clientId}/assessments/${aid}`, { data: { questionCode: code, value: { kind: "scale", value: v } }, headers: { origin: BASE } });
      if (!r.ok()) throw new Error(`resposta ${code}: ${r.status()}`);
    }
    await page.reload();
    await page.getByRole("button", { name: "Fechar diagnóstico" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Fechar diagnóstico" }).click();
    await page.waitForURL(/\/resumo$/);
    await page.getByRole("heading", { name: "Resumo e scores" }).waitFor();
    await shot(page, "diagnostico-resumo");
    ok("diagnóstico respondido e fechado (resumo com scores)");

    // 4. oportunidade
    await page.goto(`${BASE}/clientes/${clientId}/oportunidades/nova`);
    await page.fill("#o-title", "Recuperar clientes inativos");
    await page.fill("#o-expl", "Clientes deixaram de comprar sem rotina de reativação.");
    await page.selectOption("#o-domain", "C");
    await page.selectOption("#o-impactScore", "5");
    await page.selectOption("#o-effortScore", "2");
    await page.fill("#o-proc", "C05");
    await page.getByRole("button", { name: "Registrar achado e oportunidade" }).click();
    await page.waitForURL(/oportunidades\?sel=/);
    const oppId = new URL(page.url()).searchParams.get("sel")!;
    await page.getByRole("button", { name: "Marcar revisada" }).click();
    await page.getByRole("button", { name: "Aprovar", exact: true }).click();
    await page.getByRole("button", { name: "Retirar aprovação" }).waitFor();
    await shot(page, "oportunidades");
    ok("oportunidade registrada, revisada e aprovada (matriz I×E)");

    // 5. projeto com plano 30/60/90
    await page.goto(`${BASE}/clientes/${clientId}/projetos/novo?opp=${oppId}`);
    await page.fill("#p-name", "Implantação E2E");
    await page.getByRole("button", { name: "Criar projeto" }).click();
    await page.waitForURL(/projetos\/[0-9a-f-]{36}\/acoes/);
    const projectId = page.url().split("/projetos/")[1]!.split("/")[0]!;
    await page.getByText(/Pendente · \d+/).waitFor();
    ok("projeto criado com plano 30/60/90");

    // 6. tarefa concluída pelo quadro
    await page.locator("section[aria-label^='Pendente'] button").first().click();
    await page.selectOption("#t-status", "DONE");
    await page.getByRole("button", { name: "Salvar tarefa" }).click();
    await page.getByText("Concluída · 1").waitFor();
    await shot(page, "plano-de-acao");
    ok("tarefa movida para Concluída pelo quadro");

    // 7. playbook sem IA
    await page.goto(`${BASE}/clientes/${clientId}/documentos?projeto=${projectId}`);
    await page.getByRole("button", { name: "Gerar documento" }).click();
    await page.waitForURL(/documentos\/[0-9a-f-]{36}/);
    await page.getByRole("heading", { name: /Playbook Comercial/ }).waitFor();
    await shot(page, "playbook");
    ok("playbook gerado sem IA e aberto no editor");

    // 8. exportação (worker) e download
    await page.getByRole("button", { name: "MD", exact: true }).click();
    const link = page.getByRole("link", { name: /Baixar MD v1/ });
    await link.waitFor({ timeout: 90_000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const md = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c as Buffer[]).toString("utf8"));
    if (!md.includes(name) || md.includes("Notas estratégicas internas") || !md.includes("RASCUNHO")) throw new Error("conteúdo exportado inesperado");
    ok("exportação MD (rascunho, audiência Cliente) baixada sem seção interna");

    // 9. relatório
    await page.goto(`${BASE}/clientes/${clientId}/relatorios`);
    await page.getByRole("button", { name: "Gerar relatório" }).click();
    await page.waitForURL(/documentos\/[0-9a-f-]{36}/);
    await page.getByRole("heading", { name: /Relatório de resultados/ }).waitFor();
    await page.getByText(/não constitui comprovação isolada/).first().waitFor();
    await shot(page, "relatorio");
    ok("relatório de resultados gerado com a frase de não causalidade");

    // limpeza: arquiva o cliente de teste
    await ctx.request.patch(`${BASE}/api/v1/clients/${clientId}`, { data: { name, industry: "DISTRIBUICAO", tags: ["teste-e2e"], status: "ARCHIVED" }, headers: { origin: BASE } });
    console.log("E2E FLUXO COMPLETO: OK");
  } catch (e) {
    await page.screenshot({ path: `${SHOTS ?? "/tmp"}/e2e-falha.png`, fullPage: true }).catch(() => undefined);
    console.error("E2E FALHOU —", (e as Error).message.split("\n")[0], "em", page.url());
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
main();
