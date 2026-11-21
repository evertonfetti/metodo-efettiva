/**
 * Aceite da Fase 4: importar dados de exemplo (CSV e XLSX), reimportar sem duplicar, ver métricas e
 * oportunidades corretas com fonte, e atualizar documentos sem perder conteúdo aprovado.
 * Uso: ACCEPT_EMAIL=... ACCEPT_PASSWORD=... BASE=http://localhost:3100 npx tsx scripts/acceptance/fase4.ts  (worker rodando; KEEP=1 mantém)
 */
import { makeClient, check } from "./lib";
import { buildSample, toCsv } from "./sample-data";

const BASE = process.env.BASE ?? "http://localhost:3100";
const api = makeClient(BASE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()) + "T00:00:00Z");

async function upload(clientId: string, type: string, name: string, data: Buffer | string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("type", type);
  fd.append("sourceSystem", "ERP Exemplo");
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  fd.append("file", new Blob([typeof data === "string" ? Buffer.from(data, "utf8") : new Uint8Array(data)]), name);
  const up = await api.call("POST", `/api/v1/clients/${clientId}/imports`, fd);
  if (up.status !== 201) throw new Error(`upload ${name}: ${JSON.stringify(up.json)}`);
  const map = await api.call("PATCH", `/api/v1/clients/${clientId}/imports/${up.json.id}`, { mapping: up.json.mappingJson });
  if (map.status !== 200) throw new Error(`mapeamento ${name}: ${JSON.stringify(map.json)}`);
  const val = await api.call("POST", `/api/v1/clients/${clientId}/imports/${up.json.id}/validate`);
  return { id: up.json.id as string, summary: val.json.summary as { willCreate: number; willUpdate: number; unchanged: number; rejected: number; total: number } };
}
async function commit(clientId: string, id: string) {
  const c = await api.call("POST", `/api/v1/clients/${clientId}/imports/${id}/commit`);
  if (c.status !== 202) throw new Error(`commit: ${JSON.stringify(c.json)}`);
  for (let i = 0; i < 120; i++) {
    const b = await api.call("GET", `/api/v1/clients/${clientId}/imports/${id}`);
    if (["COMPLETED", "PARTIAL", "FAILED"].includes(b.json.status)) return b.json;
    await sleep(1000);
  }
  throw new Error("importação não concluiu (worker rodando?)");
}
const approveAll = async (a: string, docId: string) => {
  const doc = await api.call("GET", `/api/v1/clients/${a}/documents/${docId}`);
  let lock = doc.json.revision.lockVersion as number;
  for (const s of doc.json.revision.content.sections) lock = (await api.call("PATCH", `/api/v1/clients/${a}/documents/${docId}/revisions/${doc.json.revision.id}`, { sectionKey: s.key, action: "state", state: "APPROVED", lockVersion: lock })).json.lockVersion;
  return { rev: doc.json.revision.id as string, approve: await api.call("POST", `/api/v1/clients/${a}/documents/${docId}/revisions/${doc.json.revision.id}/approve`) };
};

async function main() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const sample = buildSample(today);
  check((await api.call("POST", "/api/v1/auth/login", { email: process.env.ACCEPT_EMAIL, password: process.env.ACCEPT_PASSWORD })).status === 200, "login com OWNER");
  const A = await api.call("POST", "/api/v1/clients", { name: `Aceite F4 A ${stamp}`, industry: "DISTRIBUICAO", tags: ["teste-aceite"] });
  const B = await api.call("POST", "/api/v1/clients", { name: `Aceite F4 B ${stamp}`, industry: "VAREJO", tags: ["teste-aceite"] });
  const a = A.json.id as string, b = B.json.id as string;

  console.log("Modelos");
  for (const t of ["CUSTOMERS", "SALES", "QUOTES"]) {
    const csv = await api.bytes(`/api/v1/import-templates/${t}?format=csv`);
    const xlsx = await api.bytes(`/api/v1/import-templates/${t}?format=xlsx`);
    check(csv.status === 200 && csv.data.toString("utf8").includes("id_") && xlsx.status === 200 && xlsx.data.subarray(0, 2).toString() === "PK", `modelo ${t} em CSV e XLSX`);
  }

  console.log("Playbook aprovado antes dos dados");
  const opp = await api.call("POST", `/api/v1/clients/${a}/opportunities`, { title: "Recuperar inativos", explanation: "Clientes deixaram de comprar.", domainCode: "C", impactScore: 5, confidenceScore: 3, effortScore: 2, processCodes: ["C05", "C01"] });
  await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${opp.json.id}`, { status: "REVIEWED" });
  await api.call("PATCH", `/api/v1/clients/${a}/opportunities/${opp.json.id}`, { status: "APPROVED" });
  const pr = await api.call("POST", `/api/v1/clients/${a}/projects`, { name: "Reativação", startDate: today.toISOString().slice(0, 10), opportunityIds: [opp.json.id], generatePlan: true });
  const doc = await api.call("POST", `/api/v1/clients/${a}/projects/${pr.json.id}/documents`, { type: "PLAYBOOK" });
  const v1 = await approveAll(a, doc.json.id);
  check(v1.approve.status === 200, "playbook v1 aprovado com baseline “Indisponível”");

  console.log("Importação");
  const cu = await upload(a, "CUSTOMERS", "clientes.csv", toCsv(sample.customers));
  check(cu.summary.willCreate === sample.customers.length - 1 && cu.summary.rejected === 0, `clientes validados: ${cu.summary.willCreate} novos`);
  check((await commit(a, cu.id)).status === "COMPLETED", "clientes importados");
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const prodXlsx = await writeXlsxFile(sample.products.map((r) => r.map((v) => ({ value: v }))) as never).toBuffer();
  const pd = await upload(a, "PRODUCTS", "produtos.xlsx", prodXlsx);
  check(pd.summary.willCreate === 30, "produtos via XLSX validados");
  await commit(a, pd.id);
  const sa = await upload(a, "SALES", "vendas.csv", toCsv(sample.sales), { recordKind: "ORDER" });
  check(sa.summary.rejected === sample.expected.invalidRows, `vendas: ${sa.summary.rejected} linhas inválidas detectadas antes de confirmar (cliente inexistente, data inválida, negativo)`);
  const batchErr = await api.call("GET", `/api/v1/clients/${a}/imports/${sa.id}`);
  check(batchErr.json.errors.some((e: { reason: string }) => /cliente não encontrado/.test(e.reason)) && batchErr.json.errorFileAssetId, "erros por linha e arquivo de erros exportável");
  const sres = await commit(a, sa.id);
  check(sres.status === "PARTIAL" && sres.createdRows === sample.sales.length - 1 - sample.expected.invalidRows, `vendas importadas: ${sres.createdRows} (lote PARCIAL com rejeições)`);
  await commit(a, (await upload(a, "SALE_ITEMS", "itens_venda.csv", toCsv(sample.items))).id);
  await commit(a, (await upload(a, "QUOTES", "orcamentos.csv", toCsv(sample.quotes))).id);

  console.log("Reimportação");
  const again = await upload(a, "SALES", "vendas.csv", toCsv(sample.sales), { recordKind: "ORDER" });
  check(again.summary.willCreate === 0 && again.summary.willUpdate === 0 && again.summary.unchanged === sres.createdRows, `reimportar igual: 0 novos, ${again.summary.unchanged} sem alteração`);
  const again2 = await commit(a, again.id);
  check(again2.createdRows === 0, "reimportação não duplica vendas");
  const changed = sample.sales.map((r, i) => (i === 1 ? r.map((c, j) => (j === 8 ? "12.345,67" : c)) : r));
  const upd = await upload(a, "SALES", "vendas-corrigido.csv", toCsv(changed), { recordKind: "ORDER" });
  check(upd.summary.willUpdate === 1 && upd.summary.willCreate === 0, "arquivo corrigido: 1 venda atualizada pela mesma origem/ID");
  await commit(a, upd.id);
  const orig = Number(sample.sales[1]![8]!.replace(/\./g, "").replace(",", "."));
  await commit(a, (await upload(a, "SALES", "vendas.csv", toCsv(sample.sales), { recordKind: "ORDER" })).id); // volta ao original

  console.log("Métricas com fonte");
  const m = await api.call("GET", `/api/v1/clients/${a}/metrics`);
  const get = (code: string) => (m.json.items as { metricCode: string; valueDecimal: string | null; unavailableReason: string | null; sourceJson: { scope: string; source?: { label: string } } }[]).find((x) => x.metricCode === code && x.sourceJson.scope !== "MONTH")!;
  const sv = Number(get("SALES_VALUE").valueDecimal);
  check(Math.abs(sv - sample.expected.salesValue12m) < 0.01, `valor comercial 12 meses = R$ ${sv.toLocaleString("pt-BR")} (esperado ${sample.expected.salesValue12m.toLocaleString("pt-BR")}; ${sample.expected.cancelled} cancelados fora, devolução abatida)`);
  check(/vendas\.csv/.test(get("SALES_VALUE").sourceJson.source?.label ?? ""), `fonte: ${get("SALES_VALUE").sourceJson.source?.label}`);
  check(get("CONTRIBUTION_MARGIN").valueDecimal === null && /Custo variável ausente/.test(get("CONTRIBUTION_MARGIN").unavailableReason ?? ""), "margem indisponível com motivo (itens sem custo)");
  check(Number(get("INACTIVE_CUSTOMERS").valueDecimal) > 0, `${Number(get("INACTIVE_CUSTOMERS").valueDecimal)} clientes com sinal de inatividade`);
  check(Number(get("STALE_QUOTES").valueDecimal) > 0 && get("QUOTE_CONVERSION").valueDecimal !== null, "orçamentos parados e conversão calculados");
  void orig;

  console.log("Oportunidade a partir dos dados");
  const findings = await api.call("GET", `/api/v1/clients/${a}/findings`);
  const fin = (findings.json as { id: string; ruleKey: string | null; title: string; evidenceJson: { text: string }[] }[]).find((f) => f.ruleKey === "DATA:INACTIVE")!;
  check(!!fin && /vendas\.csv/.test(JSON.stringify(fin.evidenceJson)), `achado por regra: “${fin?.title}” com fonte`);
  const o2 = await api.call("POST", `/api/v1/clients/${a}/opportunities`, { findingId: fin.id, title: fin.title, explanation: "Recuperar clientes que pararam de comprar.", domainCode: "C", impactScore: 5, confidenceScore: 4, effortScore: 2, processCodes: ["C05"] });
  const o2v = await api.call("GET", `/api/v1/clients/${a}/opportunities/${o2.json.id}`);
  check(o2v.json.origin === "RULE" && /vendas\.csv/.test(JSON.stringify(o2v.json.evidenceJson)), "oportunidade herda origem Regra e evidência com fonte");

  console.log("Documento atualizado sem perder o aprovado");
  const v2 = await api.call("POST", `/api/v1/clients/${a}/documents/${doc.json.id}/revisions`);
  for (const key of ["diagnostico", "objetivos"]) {
    const r = await api.call("PATCH", `/api/v1/clients/${a}/documents/${doc.json.id}/revisions/${v2.json.id}`, { sectionKey: key, action: "regenerate", lockVersion: (await api.call("GET", `/api/v1/clients/${a}/documents/${doc.json.id}?revision=${v2.json.id}`)).json.revision.lockVersion });
    check(r.status === 200, `seção “${key}” regenerada na v2 com dados importados`);
  }
  const d2 = await api.call("GET", `/api/v1/clients/${a}/documents/${doc.json.id}?revision=${v2.json.id}`);
  const t2 = JSON.stringify(d2.json.revision.content);
  check(t2.includes("Indicadores comerciais (dados importados)") && /vendas\.csv/.test(t2), "v2 traz indicadores com fonte e período");
  const d1 = await api.call("GET", `/api/v1/clients/${a}/documents/${doc.json.id}?revision=${v1.rev}`);
  check(d1.json.revision.state === "APPROVED" && !JSON.stringify(d1.json.revision.content).includes("Indicadores comerciais (dados importados)"), "v1 aprovada permanece intacta");
  check(d2.json.qa.every((q: { id: string }) => q.id !== "history"), "alerta “sem histórico comercial” some na v2");

  console.log("Isolamento");
  check((await api.call("GET", `/api/v1/clients/${b}/imports/${sa.id}`)).status === 404, "lote de A não abre pela rota de B");
  check((await api.call("POST", `/api/v1/clients/${b}/imports/${sa.id}/commit`)).status === 404, "commit de lote de A pela rota de B → 404");
  check((await api.call("GET", `/api/v1/clients/${b}/metrics`)).json.items.length === 0, "B sem métricas");
  const cross = await upload(b, "SALES", "vendas.csv", toCsv(sample.sales.slice(0, 3)), { recordKind: "ORDER" });
  check(cross.summary.rejected === 2, "vendas em B não referenciam clientes de A");

  if (process.env.KEEP === "1") console.log(`Mantidos: cliente ${a}`);
  else for (const [id, name, industry] of [[a, A.json.name, "DISTRIBUICAO"], [b, B.json.name, "VAREJO"]]) await api.call("PATCH", `/api/v1/clients/${id}`, { name, industry, tags: ["teste-aceite"], status: "ARCHIVED" });
  console.log("ACEITE FASE 4: OK");
}

main().catch((e) => {
  console.error("ACEITE FASE 4: FALHOU —", e.message);
  process.exitCode = 1;
});
