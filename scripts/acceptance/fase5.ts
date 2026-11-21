/**
 * Aceite da Fase 5: sem chave de IA o sistema continua; com chave autorizada gera rascunho específico,
 * revisável, sem números inventados e com referências válidas.
 * Uso: ACCEPT_EMAIL=... ACCEPT_PASSWORD=... BASE=http://localhost:3100 npx tsx scripts/acceptance/fase5.ts
 * Com chave configurada no servidor (ANTHROPIC_API_KEY) e worker rodando: ACCEPT_AI=1 (faz chamada real, com custo).
 */
import { makeClient, check } from "./lib";

const BASE = process.env.BASE ?? "http://localhost:3100";
const api = makeClient(BASE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  check((await api.call("POST", "/api/v1/auth/login", { email: process.env.ACCEPT_EMAIL, password: process.env.ACCEPT_PASSWORD })).status === 200, "login com OWNER");
  const A = await api.call("POST", "/api/v1/clients", { name: `Aceite F5 ${stamp}`, industry: "DISTRIBUICAO", sellersCount: 4, mainChallenges: "Equipe não registra follow-up de propostas.", tags: ["teste-aceite"] });
  const a = A.json.id as string;
  const f = await api.call("POST", `/api/v1/clients/${a}/findings`, { type: "PROBLEM", domainCode: "DIAG04", title: "18 orçamentos abertos há mais de 15 dias", description: "Sem rotina de follow-up registrada.", evidence: "Relatório de orçamentos do ERP" });
  const o = await api.call("POST", `/api/v1/clients/${a}/opportunities`, { findingId: f.json.id, title: "Follow-up de propostas", explanation: "18 orçamentos parados.", domainCode: "V", impactScore: 4, confidenceScore: 4, effortScore: 2, processCodes: ["V05"] });
  await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${o.json.id}`, { status: "REVIEWED" });
  await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${o.json.id}`, { status: "APPROVED" });
  const pr = await api.call("POST", `/api/v1/clients/${a}/projects`, { name: "Follow-up 90 dias", startDate: "2026-11-23", sponsorName: "Diretora Comercial Ana Lima", opportunityIds: [o.json.id], generatePlan: true });
  const doc = await api.call("POST", `/api/v1/clients/${a}/projects/${pr.json.id}/documents`, { type: "PLAYBOOK" });
  const rev = doc.json.currentRevisionId as string;

  console.log("Sem IA");
  const st = await api.call("GET", `/api/v1/clients/${a}/ai`);
  const keyConfigured = !/chave/.test(st.json.reason ?? "");
  check(st.status === 200 && st.json.available === false, `IA indisponível para o cliente: ${st.json.reason}`);
  const blocked = await api.call("POST", `/api/v1/clients/${a}/documents/${doc.json.id}/ai-generate`, { revisionId: rev, sectionKeys: ["processo:v05"] });
  check(blocked.status === 409, "pedido de geração recusado com motivo (409), sem chamar o provedor");
  const ex = await api.call("POST", `/api/v1/clients/${a}/documents/${doc.json.id}/revisions/${rev}/exports`, { format: "MD", audience: "CLIENTE" });
  check(ex.status === 202, "playbook segue gerado e exportável por template, sem IA");
  check((await api.call("GET", `/api/v1/clients/${a}/documents/${doc.json.id}`)).json.revision.generatedByAi === false, "documento marcado como gerado sem IA");

  if (process.env.ACCEPT_AI === "1") {
    console.log("Com IA (chamada real ao provedor)");
    check(keyConfigured, "chave configurada no servidor");
    check((await api.call("PATCH", `/api/v1/clients/${a}/ai`, { allowed: true })).status === 422, "autorização exige ciência da política");
    check((await api.call("PATCH", `/api/v1/clients/${a}/ai`, { allowed: true, acknowledged: true })).status === 200, "cliente autorizado para IA externa");
    const pv = await api.call("POST", `/api/v1/clients/${a}/documents/${doc.json.id}/ai-preview`, { revisionId: rev, sectionKeys: ["processo:v05"] });
    const sent = JSON.stringify(pv.json.items?.[0]?.payload ?? {});
    check(pv.status === 200 && !sent.includes(A.json.name) && !sent.includes("Ana Lima"), "prévia do envio sem nome da empresa nem do patrocinador");
    const gen = await api.call("POST", `/api/v1/clients/${a}/documents/${doc.json.id}/ai-generate`, { revisionId: rev, sectionKeys: ["processo:v05"] });
    check(gen.status === 202, "geração enfileirada");
    let g: { status: string; validationJson: { level: string; message: string }[]; outputJson: { blocks: unknown[]; cited: string[] }; errorMessage: string | null; tokensIn: number; costEstimate: string } | undefined;
    for (let i = 0; i < 120; i++) {
      const list = await api.call("GET", `/api/v1/clients/${a}/documents/${doc.json.id}/ai-generate`);
      g = list.json.items.find((x: { id: string }) => x.id === gen.json.items[0].id);
      if (g && ["COMPLETED", "FAILED"].includes(g.status)) break;
      await sleep(2000);
    }
    check(g?.status === "COMPLETED", `rascunho gerado (${g?.tokensIn} tokens de entrada, US$ ${g?.costEstimate})${g?.errorMessage ? ` — ${g.errorMessage}` : ""}`);
    const text = JSON.stringify(g!.outputJson.blocks);
    check(text.includes(A.json.name) || !text.includes("[EMPRESA]"), "pseudônimos revertidos no texto final");
    const errors = g!.validationJson.filter((i) => i.level === "error");
    check(errors.length === 0, errors.length ? `validação apontou: ${errors.map((e) => e.message).join("; ")}` : "sem números inventados, evidências e códigos válidos");
    check(g!.outputJson.cited.length > 0, `cita evidências ${g!.outputJson.cited.join(", ")}`);
    const acc = await api.call("PATCH", `/api/v1/clients/${a}/ai-generations/${gen.json.items[0].id}`, { decision: "ACCEPT" });
    check(acc.status === 200, "sugestão aceita: seção volta para revisão humana");
    const d = await api.call("GET", `/api/v1/clients/${a}/documents/${doc.json.id}`);
    check(d.json.revision.generatedByAi === true && d.json.qa.find((q: { id: string }) => q.id === "evidence").level === "ok", "documento marcado com IA e referências válidas na QA");
  } else console.log("(ACCEPT_AI=1 não definido: geração real não executada)");

  if (process.env.KEEP !== "1") await api.call("PATCH", `/api/v1/clients/${a}`, { name: A.json.name, industry: "DISTRIBUICAO", tags: ["teste-aceite"], status: "ARCHIVED" });
  console.log("ACEITE FASE 5: OK");
}

main().catch((e) => {
  console.error("ACEITE FASE 5: FALHOU —", e.message);
  process.exitCode = 1;
});
