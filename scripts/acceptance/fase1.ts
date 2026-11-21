/**
 * Aceite da Fase 1 (seção 14): criar duas empresas, preencher diagnóstico completo em uma,
 * fechar e exportar resumo simples sem misturar dados.
 * Uso: ACCEPT_EMAIL=... ACCEPT_PASSWORD=... BASE=http://localhost:3100 npx tsx scripts/acceptance/fase1.ts
 * Os clientes criados recebem a tag "teste-aceite" e são arquivados ao final.
 */
import { makeClient, check } from "./lib";

const BASE = process.env.BASE ?? "http://localhost:3100";
const api = makeClient(BASE);

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  console.log("Login");
  const login = await api.call("POST", "/api/v1/auth/login", { email: process.env.ACCEPT_EMAIL, password: process.env.ACCEPT_PASSWORD });
  check(login.status === 200, "login com OWNER");

  console.log("Duas empresas");
  const A = await api.call("POST", "/api/v1/clients", { name: `Aceite A ${stamp}`, industry: "DISTRIBUICAO", sellersCount: 4, salesChannels: ["VENDA_EXTERNA"], tags: ["teste-aceite"] });
  const B = await api.call("POST", "/api/v1/clients", { name: `Aceite B ${stamp}`, industry: "SERVICOS_B2B", tags: ["teste-aceite"] });
  check(A.status === 201 && B.status === 201, "empresas A e B criadas com clientId próprio");
  const a = A.json.id as string;
  const b = B.json.id as string;
  const invalid = await api.call("POST", "/api/v1/clients", { name: "X", industry: "NAO_EXISTE" });
  check(invalid.status === 422, "cadastro inválido rejeitado (422)");

  console.log("Diagnóstico completo em A");
  const asmt = await api.call("POST", `/api/v1/clients/${a}/assessments`, { periodStart: "2025-11-01", periodEnd: "2026-10-31" });
  check(asmt.status === 201, "diagnóstico criado");
  const aid = asmt.json.id as string;
  let rounds = 0;
  for (;;) {
    const d = await api.call("GET", `/api/v1/clients/${a}/assessments/${aid}`);
    const pending = (d.json.questions as any[]).filter((q) => d.json.visibility[q.code]?.visible && !d.json.answers[q.code]); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (pending.length === 0 || rounds++ > 5) break;
    for (const [i, q] of pending.entries()) {
      let value: unknown;
      if (q.type === "SCALE_0_5") value = i % 11 === 0 ? { kind: "unknown" } : i % 13 === 0 ? { kind: "na" } : { kind: "scale", value: (i * 7) % 6 };
      else if (q.type === "TEXT") value = { kind: "text", value: "Planilha compartilhada" };
      else if (q.type === "NUMBER") value = { kind: "number", value: 120 };
      else if (q.type === "SINGLE_CHOICE") value = { kind: "choice", value: q.options[0] };
      const r = await api.call("PATCH", `/api/v1/clients/${a}/assessments/${aid}`, { questionCode: q.code, value, respondent: "Gerente comercial" });
      if (r.status !== 200) throw new Error(`falha ao responder ${q.code}: ${JSON.stringify(r.json)}`);
    }
  }
  const full = await api.call("GET", `/api/v1/clients/${a}/assessments/${aid}`);
  const visible = (full.json.questions as any[]).filter((q) => full.json.visibility[q.code]?.visible); // eslint-disable-line @typescript-eslint/no-explicit-any
  check(visible.every((q) => full.json.answers[q.code]), `todas as ${visible.length} perguntas visíveis respondidas (inclui condicionais de Distribuição)`);
  check(full.json.visibility.DIST_01?.visible === true && full.json.visibility.SERV_01?.visible === false, "condicionais por segmento corretas para Distribuição");

  const fd = new FormData();
  fd.append("file", new Blob(["Política de orçamentos — evidência de teste"], { type: "text/plain" }), "politica-orcamentos.txt");
  const up = await api.call("POST", `/api/v1/clients/${a}/files`, fd);
  check(up.status === 201, "upload de evidência privada");
  const exe = new FormData();
  exe.append("file", new Blob([Buffer.from("MZ\x90\x00binario")]), "programa.exe");
  check((await api.call("POST", `/api/v1/clients/${a}/files`, exe)).status === 422, "executável rejeitado no upload");
  const crossDl = await api.call("GET", `/api/v1/clients/${b}/files/${up.json.id}`, undefined, true);
  check(crossDl.status === 404, "arquivo de A não baixa pela rota de B (troca de clientId)");

  const fin = await api.call("POST", `/api/v1/clients/${a}/assessments/${aid}/finalize`);
  check(fin.status === 200 && fin.json.status === "FINALIZED", "diagnóstico fechado com snapshot");
  const after = await api.call("PATCH", `/api/v1/clients/${a}/assessments/${aid}`, { questionCode: "DIAG01_01", value: { kind: "scale", value: 5 } });
  check(after.status === 409, "edição após fechamento bloqueada (409)");

  console.log("Exportar resumo e isolamento");
  const md = await api.call("GET", `/api/v1/clients/${a}/assessments/${aid}/summary?format=md`, undefined, true);
  check(md.status === 200 && md.headers.get("content-type")?.includes("text/markdown"), "resumo exportado em Markdown");
  check(md.text.includes(`Aceite A ${stamp}`) && !md.text.includes(`Aceite B ${stamp}`), "resumo contém só dados da empresa A");
  check(/Score geral: \d,\d \/ 5/.test(md.text) && md.text.includes("Lacunas de informação"), "resumo traz score, cobertura e lacunas");
  const cross = await api.call("GET", `/api/v1/clients/${b}/assessments/${aid}`);
  check(cross.status === 404, "diagnóstico de A inacessível pela rota de B (404)");
  const bList = await api.call("GET", `/api/v1/clients/${b}/assessments`);
  check(Array.isArray(bList.json) && bList.json.length === 0, "empresa B sem diagnósticos de A");

  console.log("Revisão");
  const rev = await api.call("POST", `/api/v1/clients/${a}/assessments/${aid}/revisions`);
  check(rev.status === 201 && rev.json.revision === 1, "revisão criada sem alterar o original");

  for (const [id, industry] of [[a, "DISTRIBUICAO"], [b, "SERVICOS_B2B"]] as const) {
    const name = id === a ? `Aceite A ${stamp}` : `Aceite B ${stamp}`;
    await api.call("PATCH", `/api/v1/clients/${id}`, { name, industry, tags: ["teste-aceite"], status: "ARCHIVED" });
  }
  console.log("\nACEITE FASE 1: OK");
}

main().catch((e) => {
  console.error("\nACEITE FASE 1: FALHOU —", e instanceof Error ? e.message : e);
  process.exit(1);
});
