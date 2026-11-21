/**
 * Aceite da Fase 2 (seção 14): a partir de um diagnóstico, registrar três achados, aprovar duas
 * oportunidades, selecionar processos e gerar projeto com tarefas — via API real, com checagens de isolamento.
 * Uso: ACCEPT_EMAIL=... ACCEPT_PASSWORD=... BASE=http://localhost:3100 npx tsx scripts/acceptance/fase2.ts
 * Os clientes criados recebem a tag "teste-aceite" e são arquivados ao final (KEEP=1 mantém para inspeção).
 */
import { makeClient, check } from "./lib";

const BASE = process.env.BASE ?? "http://localhost:3100";
const api = makeClient(BASE);

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  console.log("Login e biblioteca");
  check((await api.call("POST", "/api/v1/auth/login", { email: process.env.ACCEPT_EMAIL, password: process.env.ACCEPT_PASSWORD })).status === 200, "login com OWNER");
  const lib = await api.call("GET", "/api/v1/processes");
  check(lib.status === 200 && lib.json.items.length === 146, "biblioteca com 146 processos");
  check(lib.json.items.filter((p: { hasFullSheet: boolean }) => p.hasFullSheet).length === 10, "10 fichas completas");
  const c05 = await api.call("GET", "/api/v1/processes/C05");
  check(c05.status === 200 && c05.json.content.steps.length === 10 && c05.json.revisions.length >= 2, "ficha C05 versionada com 10 passos");
  check((await api.call("GET", "/api/v1/processes/ZZZ")).status === 404, "código inexistente → 404");

  console.log("Clientes e diagnóstico");
  const A = await api.call("POST", "/api/v1/clients", { name: `Aceite F2 A ${stamp}`, industry: "DISTRIBUICAO", tags: ["teste-aceite"] });
  const B = await api.call("POST", "/api/v1/clients", { name: `Aceite F2 B ${stamp}`, industry: "VAREJO", tags: ["teste-aceite"] });
  const a = A.json.id as string;
  const b = B.json.id as string;
  const asmt = await api.call("POST", `/api/v1/clients/${a}/assessments`, {});
  const aid = asmt.json.id as string;
  for (const [code, v] of [["DIAG05_01", 1], ["DIAG05_02", 0], ["DIAG04_01", 1], ["DIAG07_01", 2]] as const)
    await api.call("PATCH", `/api/v1/clients/${a}/assessments/${aid}`, { questionCode: code, value: { kind: "scale", value: v } });
  check((await api.call("POST", `/api/v1/clients/${a}/assessments/${aid}/finalize`)).status === 200, "diagnóstico fechado");

  console.log("Três achados");
  const findings = [
    { type: "PROBLEM", domainCode: "DIAG05", title: "40 clientes sem compra acima do intervalo habitual", description: "Reativação não é feita de forma sistemática." },
    { type: "PROBLEM", domainCode: "DIAG04", title: "Orçamentos sem follow-up há mais de 7 dias", description: "7 de 18 orçamentos sem próximo passo." },
    { type: "RISK", domainCode: "DIAG07", title: "Descontos sem alçada de aprovação", description: "Vendedores concedem descontos sem limite.", severity: "HIGH" },
  ];
  const fids: string[] = [];
  for (const f of findings) {
    const r = await api.call("POST", `/api/v1/clients/${a}/findings`, { ...f, assessmentId: aid, evidence: "Entrevista com gerente comercial" });
    check(r.status === 201, `achado registrado: ${f.title}`);
    fids.push(r.json.id);
  }

  console.log("Oportunidades");
  const specs = [
    { findingId: fids[0], title: findings[0]!.title, explanation: findings[0]!.description, domainCode: "C", impactScore: 5, confidenceScore: 4, effortScore: 2, processCodes: ["C05"] },
    { findingId: fids[1], title: findings[1]!.title, explanation: findings[1]!.description, domainCode: "V", impactScore: 4, confidenceScore: 4, effortScore: 2, processCodes: [] },
    { findingId: fids[2], title: findings[2]!.title, explanation: findings[2]!.description, domainCode: "L", impactScore: 3, confidenceScore: 2, effortScore: 4, processCodes: ["L05"], criticalRisk: true, criticalRiskReason: "Margem negativa" },
  ];
  const oids: string[] = [];
  for (const s of specs) {
    const r = await api.call("POST", `/api/v1/clients/${a}/opportunities`, s);
    check(r.status === 201, `oportunidade O-${String(r.json.number).padStart(2, "0")} criada (score ${r.json.priorityScore})`);
    oids.push(r.json.id);
  }
  const list = await api.call("GET", `/api/v1/clients/${a}/opportunities`);
  check(list.json.items[0].id === oids[2], "risco crítico no topo apesar do menor score");
  const sug = await api.call("GET", `/api/v1/clients/${a}/opportunities/${oids[1]}`);
  check(sug.json.processes.some((p: { suggested: boolean; process: { code: string } }) => p.suggested && p.process.code === "V05"), "sugestão determinística V05 para área V");
  check((await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${oids[1]}`, { processCodes: ["V05", "V11"] })).status === 200, "processos V05 e V11 selecionados manualmente");
  check((await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${oids[1]}`, { processCodes: ["X99"] })).status === 422, "código de processo inventado rejeitado");
  check((await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${oids[0]}`, { status: "APPROVED" })).status === 409, "aprovação sem revisão bloqueada");
  for (const id of oids.slice(0, 2)) {
    await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${id}`, { status: "REVIEWED" });
    check((await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${id}`, { status: "APPROVED" })).status === 200, "oportunidade revisada e aprovada");
  }
  check((await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${oids[2]}`, { status: "DISMISSED" })).status === 422, "descarte sem motivo rejeitado");

  console.log("Projeto e tarefas");
  const pr = await api.call("POST", `/api/v1/clients/${a}/projects`, { name: "Implantação Comercial 90 dias", startDate: "2026-11-02", sponsorName: "Diretor comercial", opportunityIds: oids.slice(0, 2), processCodes: ["A03"], generatePlan: true });
  check(pr.status === 201 && pr.json.planTasks > 20, `projeto criado com ${pr.json.planTasks} tarefas do plano 30/60/90`);
  const pid = pr.json.id as string;
  const proj = await api.call("GET", `/api/v1/clients/${a}/projects/${pid}`);
  check(proj.json.processes.map((p: { process: { code: string } }) => p.process.code).sort().join(",") === "A03,C05,V05,V11", "processos no projeto: A03, C05, V05, V11");
  check((await api.call("GET", `/api/v1/clients/${a}/opportunities/${oids[0]}`)).json.status === "LINKED_TO_PROJECT", "oportunidade passa a 'Em projeto'");
  const again = await api.call("POST", `/api/v1/clients/${a}/projects/${pid}/plan`);
  check(again.status === 200 && again.json.created === 0, "regerar plano é idempotente (0 novas)");
  const tasks = await api.call("GET", `/api/v1/clients/${a}/projects/${pid}/tasks`);
  const t0 = tasks.json.items[0];
  check((await api.call("PATCH", `/api/v1/clients/${a}/projects/${pid}/tasks/${t0.id}`, { status: "DONE" })).status === 200, "tarefa concluída");
  check((await api.call("PATCH", `/api/v1/clients/${a}/projects/${pid}/tasks/${t0.id}`, { evidence: { text: "Ata da reunião de abertura" } })).status === 200, "evidência registrada na tarefa");
  const nt = await api.call("POST", `/api/v1/clients/${a}/projects/${pid}/tasks`, { title: "Importar histórico de contatos dos orçamentos", externalOwnerName: "TI / ERP", dueDate: "2026-11-28", status: "BLOCKED", blockedReason: "Aguardando exportação do ERP" });
  check(nt.status === 201, "tarefa manual bloqueada com impedimento");
  check((await api.call("PATCH", `/api/v1/clients/${a}/projects/${pid}`, { status: "APPROVED" })).status === 200, "projeto aprovado");

  console.log("Isolamento");
  check((await api.call("GET", `/api/v1/clients/${b}/projects/${pid}`)).status === 404, "projeto de A não abre pela rota de B");
  check((await api.call("GET", `/api/v1/clients/${b}/opportunities/${oids[0]}`)).status === 404, "oportunidade de A não abre pela rota de B");
  check((await api.call("PATCH", `/api/v1/clients/${b}/projects/${pid}/tasks/${t0.id}`, { status: "TODO" })).status === 404, "tarefa de A não muda pela rota de B");
  check((await api.call("POST", `/api/v1/clients/${b}/projects`, { name: "Cruzado", startDate: "2026-11-02", opportunityIds: [oids[0]] })).status === 404, "projeto em B com oportunidade de A rejeitado");
  check((await api.call("GET", `/api/v1/clients/${b}/projects`)).json.items.length === 0, "B sem projetos");

  if (process.env.KEEP === "1") {
    console.log(`Mantidos para inspeção: cliente ${a}, projeto ${pid}`);
    console.log("ACEITE FASE 2: OK");
    return;
  }
  console.log("Limpeza");
  for (const [id, name, industry] of [[a, A.json.name, "DISTRIBUICAO"], [b, B.json.name, "VAREJO"]])
    await api.call("PATCH", `/api/v1/clients/${id}`, { name, industry, tags: ["teste-aceite"], status: "ARCHIVED" });
  console.log("ACEITE FASE 2: OK");
}

main().catch((e) => {
  console.error("ACEITE FASE 2: FALHOU —", e.message);
  process.exitCode = 1;
});
