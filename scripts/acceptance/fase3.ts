/**
 * Aceite da Fase 3 (marco central): gerar e exportar playbook real em DOCX, PDF e MD, com POPs,
 * indicadores, responsáveis e cronograma — sem IA, via API real, fila Redis e worker.
 * Uso: ACCEPT_EMAIL=... ACCEPT_PASSWORD=... BASE=http://localhost:3100 npx tsx scripts/acceptance/fase3.ts
 * Requer worker rodando (npm run worker). KEEP=1 mantém os dados; OUT=<dir> salva os arquivos exportados.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { makeClient, check } from "./lib";

const BASE = process.env.BASE ?? "http://localhost:3100";
const api = makeClient(BASE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitExport(clientId: string, id: string) {
  for (let i = 0; i < 90; i++) {
    const r = await api.call("GET", `/api/v1/clients/${clientId}/exports/${id}`);
    if (r.json.status === "COMPLETED") return r.json;
    if (r.json.status === "FAILED") throw new Error(`exportação falhou: ${r.json.errorMessage}`);
    await sleep(1000);
  }
  throw new Error("exportação não concluiu em 90 s (worker rodando?)");
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  console.log("Preparação (cliente, diagnóstico, oportunidades, projeto)");
  check((await api.call("POST", "/api/v1/auth/login", { email: process.env.ACCEPT_EMAIL, password: process.env.ACCEPT_PASSWORD })).status === 200, "login com OWNER");
  const A = await api.call("POST", "/api/v1/clients", { name: `Aceite F3 A ${stamp}`, industry: "DISTRIBUICAO", sellersCount: 4, sourceSystem: "ERP Sankhya", salesChannels: ["VENDA_EXTERNA"], tags: ["teste-aceite"] });
  const B = await api.call("POST", "/api/v1/clients", { name: `Aceite F3 B ${stamp}`, industry: "VAREJO", tags: ["teste-aceite"] });
  const a = A.json.id as string, b = B.json.id as string;
  const asmt = await api.call("POST", `/api/v1/clients/${a}/assessments`, {});
  for (const [code, v] of [["DIAG05_01", 1], ["DIAG05_02", 0], ["DIAG04_01", 1], ["DIAG12_01", 2]] as const)
    await api.call("PATCH", `/api/v1/clients/${a}/assessments/${asmt.json.id}`, { questionCode: code, value: { kind: "scale", value: v } });
  await api.call("POST", `/api/v1/clients/${a}/assessments/${asmt.json.id}/finalize`);
  const f = await api.call("POST", `/api/v1/clients/${a}/findings`, { assessmentId: asmt.json.id, type: "PROBLEM", domainCode: "DIAG05", title: "Clientes inativos sem rotina de recuperação", description: "40 de 200 clientes sem compra acima do intervalo habitual.", evidence: "Relatório de vendas por cliente apresentado pelo gerente" });
  const opps: string[] = [];
  for (const o of [
    { findingId: f.json.id, title: "Recuperar clientes inativos", explanation: "40 clientes sem compra acima do intervalo habitual.", domainCode: "C", impactScore: 5, confidenceScore: 4, effortScore: 2, processCodes: ["C05"] },
    { title: "Follow-up de propostas paradas", explanation: "7 de 18 orçamentos sem próximo passo.", domainCode: "V", impactScore: 4, confidenceScore: 4, effortScore: 2, processCodes: ["V05", "A03"] },
  ]) {
    const r = await api.call("POST", `/api/v1/clients/${a}/opportunities`, o);
    await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${r.json.id}`, { status: "REVIEWED" });
    await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${r.json.id}`, { status: "APPROVED" });
    opps.push(r.json.id);
  }
  const pr = await api.call("POST", `/api/v1/clients/${a}/projects`, { name: "Implantação Comercial 90 dias", startDate: "2026-11-02", sponsorName: "Diretor comercial", objectives: "Reativar clientes inativos\nGarantir próximo passo em toda proposta", opportunityIds: opps, generatePlan: true });
  check(pr.status === 201, `projeto com ${pr.json.planTasks} tarefas`);
  const pid = pr.json.id as string;

  console.log("Geração determinística");
  const gen = await api.call("POST", `/api/v1/clients/${a}/projects/${pid}/documents`, { type: "PLAYBOOK" });
  check(gen.status === 201, "playbook gerado sem IA");
  const docId = gen.json.id as string;
  let doc = await api.call("GET", `/api/v1/clients/${a}/documents/${docId}`);
  const sections = doc.json.revision.content.sections as { key: string; title: string; visibility: string; blocks: unknown[] }[];
  const text = JSON.stringify(sections);
  check(sections.length >= 20, `${sections.length} seções (18 da seção 9.1 + capítulos por processo)`);
  check(["processo:c05", "processo:v05", "processo:a03"].every((k) => sections.some((s) => s.key === k)), "um capítulo (POP) por processo: C05, V05, A03");
  check(text.includes("Reativados ÷ Abordados × 100"), "indicadores com fórmula");
  check(text.includes("Diretor comercial") && text.includes("Responsabilidades"), "responsáveis e governança");
  check(sections.some((s) => s.key === "cronograma") && text.includes("Ativar ·"), "cronograma 30/60/90 com datas");
  check(!/lorem ipsum/i.test(text) && text.includes(A.json.name), "conteúdo real do cliente (sem lorem ipsum)");
  check(doc.json.qa.some((q: { id: string; level: string }) => q.id === "sections" && q.level === "error"), "QA bloqueia versão final com seções não aprovadas");
  check((await api.call("POST", `/api/v1/clients/${a}/documents/${docId}/revisions/${doc.json.revision.id}/approve`)).status === 409, "aprovação bloqueada antes da revisão das seções");

  console.log("Revisão por seção");
  const rev = doc.json.revision.id as string;
  let lock = doc.json.revision.lockVersion as number;
  const capa = sections.find((s) => s.key === "capa")!;
  const saved = await api.call("PATCH", `/api/v1/clients/${a}/documents/${docId}/revisions/${rev}`, { sectionKey: "capa", action: "save", lockVersion: lock, title: capa.title, visibility: "CLIENTE", blocks: [...capa.blocks, { type: "paragraph", text: "Documento revisado com o patrocinador em reunião de abertura." }] });
  check(saved.status === 200, "seção editada manualmente e salva");
  lock = saved.json.lockVersion;
  check((await api.call("PATCH", `/api/v1/clients/${a}/documents/${docId}/revisions/${rev}`, { sectionKey: "capa", action: "save", lockVersion: 0, title: capa.title, visibility: "CLIENTE", blocks: [] })).status === 409, "edição concorrente com versão antiga rejeitada (409)");
  const regen = await api.call("PATCH", `/api/v1/clients/${a}/documents/${docId}/revisions/${rev}`, { sectionKey: "capa", action: "regenerate", lockVersion: lock });
  check(regen.status === 409, "regenerar seção editada exige confirmação explícita");
  for (const s of sections) {
    const r = await api.call("PATCH", `/api/v1/clients/${a}/documents/${docId}/revisions/${rev}`, { sectionKey: s.key, action: "state", state: "APPROVED", lockVersion: lock });
    if (r.status !== 200) throw new Error(`falha ao aprovar ${s.key}: ${JSON.stringify(r.json)}`);
    lock = r.json.lockVersion;
  }
  check(true, `${sections.length} seções aprovadas`);
  check((await api.call("POST", `/api/v1/clients/${a}/documents/${docId}/revisions/${rev}/approve`)).status === 200, "versão 1 aprovada (QA sem bloqueios)");
  check((await api.call("PATCH", `/api/v1/clients/${a}/documents/${docId}/revisions/${rev}`, { sectionKey: "capa", action: "save", lockVersion: lock, title: capa.title, visibility: "CLIENTE", blocks: [] })).status === 409, "versão aprovada é imutável");

  console.log("Exportação DOCX, PDF e MD (worker)");
  const out = process.env.OUT;
  if (out) mkdirSync(out, { recursive: true });
  const files: Record<string, Buffer> = {};
  for (const [format, audience] of [["MD", "CLIENTE"], ["DOCX", "CLIENTE"], ["PDF", "CLIENTE"], ["MD", "INTERNO"]] as const) {
    const r = await api.call("POST", `/api/v1/clients/${a}/documents/${docId}/revisions/${rev}/exports`, { format, audience });
    check(r.status === 202 && r.json.isDraft === false, `${format}/${audience} enfileirado como versão final`);
    await waitExport(a, r.json.id);
    const dl = await api.bytes(`/api/v1/clients/${a}/exports/${r.json.id}/download`);
    if (dl.status !== 200) throw new Error(`download ${format} falhou: ${dl.status}`);
    const buf = dl.data;
    files[`${format}-${audience}`] = buf;
    if (out) writeFileSync(`${out}/playbook-${audience}.${format.toLowerCase()}`, buf);
    check((await api.call("GET", `/api/v1/clients/${b}/exports/${r.json.id}/download`, undefined, true)).status === 404, `${format}/${audience}: download pela rota de outro cliente → 404`);
  }
  const md = files["MD-CLIENTE"]!.toString("utf8");
  check(md.includes("C05 — Recuperação de inativos") && md.includes("| Indicador | Processo | Fórmula"), "MD: POPs e tabela de indicadores");
  check(!md.includes("Notas estratégicas internas") && files["MD-INTERNO"]!.toString("utf8").includes("Notas estratégicas internas"), "MD: seção INTERNO só no arquivo interno");
  check(!md.includes("RASCUNHO"), "MD final sem marca d'água");
  check(files["PDF-CLIENTE"]!.subarray(0, 4).toString() === "%PDF" && files["PDF-CLIENTE"]!.length > 30_000, `PDF válido (${Math.round(files["PDF-CLIENTE"]!.length / 1024)} KB)`);
  check(files["DOCX-CLIENTE"]!.subarray(0, 2).toString() === "PK", `DOCX válido (${Math.round(files["DOCX-CLIENTE"]!.length / 1024)} KB)`);
  check(true, "arquivos baixados por rota autenticada");

  console.log("Nova versão em rascunho");
  const v2 = await api.call("POST", `/api/v1/clients/${a}/documents/${docId}/revisions`);
  check(v2.status === 201 && v2.json.version === 2, "v2 criada a partir da v1 aprovada");
  const ed = await api.call("PATCH", `/api/v1/clients/${a}/documents/${docId}/revisions/${v2.json.id}`, { sectionKey: "capa", action: "save", lockVersion: 0, title: capa.title, visibility: "CLIENTE", blocks: capa.blocks });
  check(ed.status === 200, "v2 editável");
  const dr = await api.call("POST", `/api/v1/clients/${a}/documents/${docId}/revisions/${v2.json.id}/exports`, { format: "MD", audience: "CLIENTE" });
  await waitExport(a, dr.json.id);
  const draftMd = (await api.call("GET", `/api/v1/clients/${a}/exports/${dr.json.id}/download`, undefined, true)).text;
  check(dr.json.isDraft === true && draftMd.includes("RASCUNHO"), "rascunho exportado com marca d'água");
  doc = await api.call("GET", `/api/v1/clients/${a}/documents/${docId}?revision=${rev}`);
  check(doc.json.revision.state === "APPROVED" && JSON.stringify(doc.json.revision.content).includes("reunião de abertura"), "v1 aprovada permanece intacta");

  console.log("Isolamento");
  check((await api.call("GET", `/api/v1/clients/${b}/documents/${docId}`)).status === 404, "documento de A não abre pela rota de B");
  check((await api.call("POST", `/api/v1/clients/${b}/documents/${docId}/revisions/${rev}/exports`, { format: "MD", audience: "INTERNO" })).status === 404, "exportação de documento de A pela rota de B → 404");
  check((await api.call("POST", `/api/v1/clients/${b}/projects/${pid}/documents`, { type: "PLAYBOOK" })).status === 404, "gerar playbook em B com projeto de A → 404");
  check(!strFromU8(unzipSync(new Uint8Array(files["DOCX-CLIENTE"]!))["word/document.xml"]!).includes("Notas estratégicas internas"), "DOCX do cliente sem seção INTERNO");

  if (process.env.KEEP === "1") {
    console.log(`Mantidos: cliente ${a}, documento ${docId}`);
  } else {
    for (const [id, name, industry] of [[a, A.json.name, "DISTRIBUICAO"], [b, B.json.name, "VAREJO"]]) await api.call("PATCH", `/api/v1/clients/${id}`, { name, industry, tags: ["teste-aceite"], status: "ARCHIVED" });
  }
  console.log("ACEITE FASE 3: OK");
}

main().catch((e) => {
  console.error("ACEITE FASE 3: FALHOU —", e.message);
  process.exitCode = 1;
});
