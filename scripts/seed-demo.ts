/**
 * Seed DEMO (seção 16) — dados INTEIRAMENTE FICTÍCIOS, marcados isDemo/selo DEMO, nunca misturados com dados reais.
 * Empresa A "Distribuidora Modelo B2B" (200 clientes, 20 produtos, 12 meses de vendas, 18 orçamentos abertos, custo
 * em parte dos itens, diagnóstico com lacunas, projeto "Implantação Comercial 90 dias" com 60 dias de acompanhamento:
 * tarefas, evidências, reuniões, auditorias, baseline, 2 snapshots, playbook e relatório) e empresa B para isolamento.
 * Uso: npm run db:seed:demo            (não recria se já existir)
 *      npm run db:seed:demo -- --reset (remove SOMENTE as empresas DEMO deste seed e recria)
 */
import "dotenv/config";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/features/auth/service";
import { seedQuestionnaire } from "@/features/assessments/seed";
import { seedProcesses } from "@/features/processes/seed";
import { createAssessment, finalizeAssessment, generateRuleFindings, saveAnswer, getActiveTemplate } from "@/features/assessments/service";
import { createBatch, runCommit, setMapping, validateBatch } from "@/features/imports/service";
import { createOpportunity, transitionOpportunity } from "@/features/opportunities/service";
import { addProcessEvidence, createProject, getProject, listTasks, updateProjectProcess, updateTask } from "@/features/projects/service";
import { createEvent, createMeeting, freezeBaseline, recordProcessAudit, recordSnapshot } from "@/features/results/service";
import { createReport } from "@/features/results/report";
import { generateDocument } from "@/features/documents/service";
import { addDays, todayDateOnly, toISODate } from "@/lib/dates";
import { buildSample, toCsv } from "./acceptance/sample-data";

const NAMES = { A: "Distribuidora Modelo B2B", B: "Varejo Demonstração Sul" };

async function importCsv(user: SessionUser, clientId: string, type: string, name: string, rows: string[][], extra: Record<string, string> = {}) {
  const b = await createBatch(user, clientId, { type, sourceSystem: "ERP Demonstração", ...extra }, { name, data: Buffer.from(toCsv(rows), "utf8") });
  await setMapping(user, clientId, b.id, { mapping: b.mappingJson });
  await validateBatch(user, clientId, b.id);
  await prisma.importBatch.update({ where: { id: b.id }, data: { status: "IMPORTING", startedAt: new Date() } });
  await runCommit(b.id, clientId);
  if (type === "SALES") await prisma.importBatch.update({ where: { id: b.id }, data: { sourceValidated: true } });
}

async function main() {
  const reset = process.argv.includes("--reset");
  const ownerRow = await prisma.user.findFirst({ where: { role: "OWNER", active: true }, orderBy: { createdAt: "asc" } });
  if (!ownerRow) throw new Error("Crie o OWNER antes (npm run bootstrap:owner).");
  const user: SessionUser = { id: ownerRow.id, email: ownerRow.email, name: ownerRow.name, role: ownerRow.role };
  const existing = await prisma.client.findMany({ where: { isDemo: true, name: { in: Object.values(NAMES) } } });
  if (existing.length && !reset) return console.log("[demo] já existe; use --reset para recriar.");
  if (existing.length) {
    await prisma.client.deleteMany({ where: { id: { in: existing.map((c) => c.id) }, isDemo: true } });
    console.log(`[demo] ${existing.length} empresa(s) DEMO removida(s).`);
  }
  await seedQuestionnaire(prisma);
  await seedProcesses(prisma);
  const today = todayDateOnly();
  const iso = (d: Date) => toISODate(d);

  // ── Empresa A
  const a = await prisma.client.create({ data: { name: NAMES.A, legalName: "Distribuidora Modelo B2B Ltda (fictícia)", industry: "DISTRIBUICAO", size: "PEQUENA", city: "Cidade Exemplo", state: "SP", salesModel: "CONSULTIVA", salesChannels: ["VENDA_EXTERNA", "TELEVENDAS"], sellersCount: 4, sourceSystem: "ERP Demonstração", mainChallenges: "Clientes deixam de comprar sem que ninguém perceba; orçamentos ficam sem retorno.", tags: ["demo"], isDemo: true, ownerUserId: user.id } }).catch(async () => prisma.client.create({ data: { name: NAMES.A, industry: "DISTRIBUICAO", sellersCount: 4, tags: ["demo"], isDemo: true, ownerUserId: user.id } }));
  const sample = buildSample(today, { customers: 200, products: 20, quotes: 36, invalid: false, seed: 7 });
  await importCsv(user, a.id, "CUSTOMERS", "clientes.csv", sample.customers);
  await importCsv(user, a.id, "PRODUCTS", "produtos.csv", sample.products);
  await importCsv(user, a.id, "SALES", "vendas.csv", sample.sales, { recordKind: "ORDER" });
  await importCsv(user, a.id, "SALE_ITEMS", "itens_venda.csv", sample.items);
  await importCsv(user, a.id, "QUOTES", "orcamentos.csv", sample.quotes);
  console.log("[demo] base comercial importada");

  // Diagnóstico com lacunas: follow-up (DIAG04), carteira (DIAG05), reativação
  const template = await getActiveTemplate();
  const qs = await prisma.assessmentQuestion.findMany({ where: { templateId: template.id, questionCode: { startsWith: "DIAG" } }, select: { questionCode: true, domainCode: true } });
  const asmt = await createAssessment(user, a.id, { segment: "DISTRIBUICAO" });
  for (const [i, q] of qs.entries()) {
    const low = ["DIAG04", "DIAG05"].includes(q.domainCode);
    await saveAnswer(user, a.id, asmt.id, { questionCode: q.questionCode, value: i % 17 === 0 ? { kind: "unknown" } : { kind: "scale", value: low ? i % 2 : 2 + (i % 3) } });
  }
  await finalizeAssessment(user, a.id, asmt.id).catch(() => undefined);
  await generateRuleFindings(user, a.id, asmt.id);

  // Oportunidades a partir dos achados por dados
  const fInactive = await prisma.finding.findFirst({ where: { clientId: a.id, ruleKey: "DATA:INACTIVE" } });
  const fStale = await prisma.finding.findFirst({ where: { clientId: a.id, ruleKey: "DATA:STALE_QUOTES" } });
  const opps = [
    await createOpportunity(user, a.id, { findingId: fInactive?.id, title: fInactive?.title ?? "Clientes com sinal de inatividade", explanation: "Reativação não é feita de forma sistemática; valor dos inativos identificado pela regra.", domainCode: "C", impactScore: 5, confidenceScore: 4, effortScore: 2, processCodes: ["C05"] }),
    await createOpportunity(user, a.id, { findingId: fStale?.id, title: fStale?.title ?? "Orçamentos sem follow-up", explanation: "Orçamentos abertos sem próximo passo registrado.", domainCode: "V", impactScore: 4, confidenceScore: 4, effortScore: 2, processCodes: ["V05"] }),
    await createOpportunity(user, a.id, { title: "Ausência de revisão semanal de vendas", explanation: "Gestão sem rotina semanal de indicadores e decisões.", domainCode: "A", impactScore: 4, confidenceScore: 5, effortScore: 1, processCodes: ["A03"], evidence: "Entrevista com o diretor comercial" }),
    await createOpportunity(user, a.id, { title: "Carteira sem responsável definido por conta", explanation: "Clientes sem dono claro.", domainCode: "C", impactScore: 3, confidenceScore: 3, effortScore: 3, processCodes: ["C01"] }),
  ];
  for (const o of opps.slice(0, 3)) {
    await transitionOpportunity(user, a.id, o.id, { status: "REVIEWED" });
    await transitionOpportunity(user, a.id, o.id, { status: "APPROVED" });
  }
  await transitionOpportunity(user, a.id, opps[3]!.id, { status: "REVIEWED" });

  // Projeto com 60 dias de execução
  const start = addDays(today, -60);
  const proj = await createProject(user, a.id, { name: "Implantação Comercial 90 dias", startDate: iso(start), sponsorName: "Diretor comercial (fictício)", objectives: "Reativar clientes inativos com rotina semanal\nGarantir próximo passo em toda proposta ativa\nInstituir revisão semanal de vendas", scope: "Implantação de C05, V05 e A03 com a equipe de 4 vendedores.", opportunityIds: opps.slice(0, 3).map((o) => o.id), generatePlan: "on" });
  await prisma.project.update({ where: { id: proj.id }, data: { status: "ACTIVE" } });
  await freezeBaseline(user, a.id, proj.id);
  const tasks = await listTasks(user, a.id, proj.id);
  let n = 0;
  for (const t of tasks) {
    if (!t.dueDate || t.dueDate > today) continue;
    n++;
    if (n % 9 === 0) { await updateTask(user, a.id, proj.id, t.id, { status: "BLOCKED", blockedReason: "Aguardando exportação de contatos do ERP pelo cliente" }); continue; }
    if (n % 7 === 0) { await updateTask(user, a.id, proj.id, t.id, { status: "IN_PROGRESS" }); continue; }
    await updateTask(user, a.id, proj.id, t.id, { status: "DONE", externalOwnerName: "Gerente comercial" });
    // concluída no prazo na maioria; algumas com atraso
    await prisma.actionTask.update({ where: { id: t.id }, data: { completedAt: addDays(t.dueDate, n % 5 === 0 ? 3 : 0) } });
  }
  const p = await getProject(user, a.id, proj.id);
  for (const pp of p.processes) {
    await addProcessEvidence(user, a.id, proj.id, pp.id, { text: `Registro da rotina ${pp.process.code}: planilha de acompanhamento semanal (fictícia)` });
    await updateProjectProcess(user, a.id, proj.id, pp.id, { status: pp.process.code === "A03" ? "ACTIVE" : "PILOT", ownerName: pp.process.code === "A03" ? "Diretor comercial" : "Gerente comercial" });
    for (const [d, chk, ok] of [[28, 10, pp.process.code === "A03" ? 7 : 5], [56, 10, pp.process.code === "A03" ? 9 : 7]] as const)
      await recordProcessAudit(user, a.id, proj.id, pp.id, { auditedAt: iso(addDays(start, d)), itemsChecked: chk, itemsConforming: ok, notes: `Amostra de ${chk} registros do processo ${pp.process.code}` });
  }
  for (let w = 0; w < 8; w++)
    await createMeeting(user, a.id, proj.id, { occurredAt: iso(addDays(start, 3 + w * 7)), title: `Revisão semanal de vendas — semana ${w + 1}`, attendees: "Diretor comercial\nGerente comercial\nVendedores (4)\nConsultor Efettiva", summary: "Revisão dos indicadores da semana, inativos abordados e orçamentos sem próximo passo.", decisions: w % 2 ? "Priorizar clientes classe A na reativação" : "Registrar próximo passo em todo orçamento aberto", nextSteps: w === 7 ? "Cliente aprovar política de cadência de follow-up" : "", impediments: w === 5 ? "Campo de próximo passo ainda não existe no ERP" : "", trainings: w === 2 ? "Treinamento do script de reativação (C05)" : w === 4 ? "Treinamento de follow-up de propostas (V05)" : "" });
  await createEvent(user, a.id, proj.id, { occurredAt: iso(addDays(start, 30)), kind: "PRICE_CHANGE", description: "Reajuste de tabela de 4% em parte do portfólio (fictício)" });
  await recordSnapshot(user, a.id, proj.id, { endDate: iso(addDays(start, 30)) });
  await recordSnapshot(user, a.id, proj.id, { endDate: iso(addDays(today, -1)) });
  await generateDocument(user, a.id, { projectId: proj.id, type: "PLAYBOOK" });
  await createReport(user, a.id, { projectId: proj.id, periodStart: iso(start), periodEnd: iso(addDays(today, -1)) });
  console.log(`[demo] ${NAMES.A}: projeto com 60 dias, baseline, 2 snapshots, 8 reuniões, playbook e relatório`);

  // ── Empresa B (isolamento)
  const b = await prisma.client.create({ data: { name: NAMES.B, industry: "VAREJO", sellersCount: 2, tags: ["demo"], isDemo: true, ownerUserId: user.id } });
  const sb = buildSample(today, { customers: 30, products: 10, quotes: 8, invalid: false, seed: 99 });
  await importCsv(user, b.id, "CUSTOMERS", "clientes.csv", sb.customers);
  await importCsv(user, b.id, "SALES", "vendas.csv", sb.sales, { recordKind: "ORDER" });
  console.log(`[demo] ${NAMES.B}: base própria para provar isolamento`);
}

main()
  .catch((e) => {
    console.error("[demo] falhou:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });
