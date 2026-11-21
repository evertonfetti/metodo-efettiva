/**
 * Aceite da Fase 6 sobre o seed DEMO (npm run db:seed:demo): 60 dias fictícios de acompanhamento,
 * baseline × atual, relatório com fonte, entregas e limitações; aprovação e exportação final; isolamento.
 * Uso: ACCEPT_EMAIL=... ACCEPT_PASSWORD=... BASE=http://localhost:3100 npx tsx scripts/acceptance/fase6.ts (worker rodando)
 */
import { makeClient, check } from "./lib";

const BASE = process.env.BASE ?? "http://localhost:3100";
const api = makeClient(BASE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NON_CAUSALITY = "A evolução observada ocorreu durante o projeto, mas não constitui comprovação isolada de que foi causada pela consultoria.";

async function main() {
  check((await api.call("POST", "/api/v1/auth/login", { email: process.env.ACCEPT_EMAIL, password: process.env.ACCEPT_PASSWORD })).status === 200, "login com OWNER");
  const clients = (await api.call("GET", "/api/v1/clients?pageSize=100&status=ACTIVE&q=Demonstra")).json;
  const all = [...(clients.items ?? []), ...((await api.call("GET", "/api/v1/clients?q=Modelo B2B")).json.items ?? [])];
  const a = all.find((c: { name: string; isDemo: boolean }) => c.name === "Distribuidora Modelo B2B" && c.isDemo);
  const b = all.find((c: { name: string; isDemo: boolean }) => c.name === "Varejo Demonstração Sul" && c.isDemo);
  check(a && b, "empresas DEMO A e B presentes (selo DEMO)");
  const projects = (await api.call("GET", `/api/v1/clients/${a.id}/projects`)).json.items;
  const p = projects.find((x: { name: string }) => x.name === "Implantação Comercial 90 dias");
  check(!!p && p.taskDone > 0, `projeto com ${p?.taskDone} de ${p?.taskTotal} tarefas concluídas em 60 dias`);

  console.log("Baseline × atual");
  const ind = (await api.call("GET", `/api/v1/clients/${a.id}/projects/${p.id}/indicators`)).json;
  const sv = ind.rows.find((r: { code: string }) => r.code === "SALES_VALUE");
  check(ind.baselineLocked && sv.baseline?.value != null && sv.current?.value != null, `valor comercial: baseline ${sv.baseline?.value} → atual ${sv.current?.value} (${sv.pct}%)`);
  check(sv.series.length >= 2 && sv.classification === "OBSERVED" && /vendas\.csv/.test(sv.source), "série com 2+ snapshots, classificação Observado e fonte");
  const ad = ind.rows.find((r: { code: string }) => r.code === "PROCESS_ADOPTION_RATE");
  check(ad.current?.value != null, `aderência por auditoria: ${ad.current?.value}%`);
  check(ind.events.length >= 1, "evento externo registrado como nota de comparabilidade");
  check((await api.call("POST", `/api/v1/clients/${a.id}/projects/${p.id}/baseline`, {})).status === 409, "baseline congelado não é sobrescrito");
  const meetings = (await api.call("GET", `/api/v1/clients/${a.id}/projects/${p.id}/meetings`)).json.items;
  check(meetings.length >= 8, `${meetings.length} reuniões com decisões/impedimentos`);

  console.log("Relatório");
  const reports = (await api.call("GET", `/api/v1/clients/${a.id}/projects/${p.id}/reports`)).json.items;
  check(reports.length >= 1, "relatório do período existente (seed)");
  // cada execução gera um relatório novo do mesmo período (o anterior pode já estar aprovado e imutável)
  const created = await api.call("POST", `/api/v1/clients/${a.id}/projects/${p.id}/reports`, { periodStart: reports.at(-1).periodStart.slice(0, 10), periodEnd: reports.at(-1).periodEnd.slice(0, 10) });
  check(created.status === 201, "novo relatório do período gerado");
  const docId = created.json.documentId;
  const doc = (await api.call("GET", `/api/v1/clients/${a.id}/documents/${docId}`)).json;
  const text = JSON.stringify(doc.revision.content);
  check(doc.revision.content.sections.length === 11, "11 seções (9.3)");
  check(text.includes(NON_CAUSALITY), "frase obrigatória de não causalidade");
  check(text.includes("Baseline (congelado)") && /vendas\.csv/.test(text), "indicadores com baseline congelado e fonte");
  check(text.includes("Atividades implantadas") && text.includes("Concluída em"), "entregas do período");
  check(/não é lucro|não de lucro|não mensurado/i.test(text) && text.includes("Notas de comparabilidade"), "limitações e comparabilidade explícitas");
  let lock = doc.revision.lockVersion;
  for (const s of doc.revision.content.sections) lock = (await api.call("PATCH", `/api/v1/clients/${a.id}/documents/${docId}/revisions/${doc.revision.id}`, { sectionKey: s.key, action: "state", state: "APPROVED", lockVersion: lock })).json.lockVersion;
  check((await api.call("POST", `/api/v1/clients/${a.id}/documents/${docId}/revisions/${doc.revision.id}/approve`)).status === 200, "relatório aprovado (versão imutável)");
  const ex = await api.call("POST", `/api/v1/clients/${a.id}/documents/${docId}/revisions/${doc.revision.id}/exports`, { format: "PDF", audience: "CLIENTE" });
  let st = "";
  for (let i = 0; i < 90 && !["COMPLETED", "FAILED"].includes(st); i++) { st = (await api.call("GET", `/api/v1/clients/${a.id}/exports/${ex.json.id}`)).json.status; if (st !== "COMPLETED") await sleep(1000); }
  const pdf = await api.bytes(`/api/v1/clients/${a.id}/exports/${ex.json.id}/download`);
  check(st === "COMPLETED" && pdf.data.subarray(0, 4).toString() === "%PDF", `PDF final do relatório (${Math.round(pdf.data.length / 1024)} KB)`);
  const after = (await api.call("GET", `/api/v1/clients/${a.id}/projects/${p.id}/reports`)).json.items.find((r: { documentId: string }) => r.documentId === docId);
  check(after.status === "EXPORTED", "relatório passa a Exportado");

  console.log("Novo snapshot e isolamento");
  check((await api.call("POST", `/api/v1/clients/${a.id}/projects/${p.id}/snapshots`, {})).status === 201, "snapshot adicional registrado");
  check((await api.call("GET", `/api/v1/clients/${b.id}/projects/${p.id}/indicators`)).status === 404, "indicadores do projeto A não abrem pela rota de B");
  check((await api.call("GET", `/api/v1/clients/${b.id}/documents/${docId}`)).status === 404, "relatório de A não abre pela rota de B");
  check((await api.call("GET", `/api/v1/clients/${b.id}/projects`)).json.items.length === 0, "empresa B sem projetos da A");
  console.log("ACEITE FASE 6: OK");
}

main().catch((e) => {
  console.error("ACEITE FASE 6: FALHOU —", e.message);
  process.exitCode = 1;
});
