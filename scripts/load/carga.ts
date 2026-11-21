/**
 * Teste de capacidade (RNF-06): importa 100 mil vendas sintéticas num cliente DEMO temporário, mede validação,
 * gravação idempotente, recálculo de KPIs e reimportação; ao final exclui o cliente (banco + arquivos).
 * Uso: npx tsx scripts/load/carga.ts [vendas=100000]
 */
import "dotenv/config";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/features/auth/service";
import { createBatch, runCommit, setMapping, validateBatch } from "@/features/imports/service";
import { refreshMetrics } from "@/features/metrics/service";
import { deleteClientData } from "@/features/governance/service";
import { toCsv } from "../acceptance/sample-data";

const N = Number(process.argv[2] ?? 100_000);
const t0 = () => performance.now();
const secs = (t: number) => `${((performance.now() - t) / 1000).toFixed(1)} s`;

async function load(user: SessionUser, clientId: string, type: string, rows: string[][], extra: Record<string, string> = {}) {
  const csv = toCsv(rows);
  let t = t0();
  const b = await createBatch(user, clientId, { type, sourceSystem: "Carga", ...extra }, { name: `${type.toLowerCase()}.csv`, data: Buffer.from(csv, "utf8") });
  await setMapping(user, clientId, b.id, { mapping: b.mappingJson });
  const v = await validateBatch(user, clientId, b.id);
  const tv = secs(t);
  t = t0();
  await prisma.importBatch.update({ where: { id: b.id }, data: { status: "IMPORTING" } });
  const r = await runCommit(b.id, clientId);
  console.log(`  ${type}: ${rows.length - 1} linhas (${(csv.length / 1_048_576).toFixed(1)} MB) · validação ${tv} · gravação+KPIs ${secs(t)} · ${JSON.stringify({ novos: v.summary.willCreate, atualizados: v.summary.willUpdate, iguais: v.summary.unchanged, rejeitados: v.summary.rejected })} → ${JSON.stringify(r)}`);
}

async function main() {
  const o = await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } });
  const user: SessionUser = { id: o.id, email: o.email, name: o.name, role: o.role };
  const c = await prisma.client.create({ data: { name: `Carga sintética ${Date.now()}`, industry: "DISTRIBUICAO", isDemo: true, tags: ["carga"], ownerUserId: user.id } });
  console.log(`[carga] cliente ${c.id} · ${N.toLocaleString("pt-BR")} vendas`);
  try {
    const customers = [["id_externo", "nome", "segmento", "vendedor", "intervalo_compra_dias", "ativo"], ...Array.from({ length: 2000 }, (_, i) => [`C${i}`, `Cliente ${i}`, "Geral", `V${i % 8}`, "", "sim"])];
    const today = new Date();
    const sales = [["id_externo", "id_cliente", "data", "status", "valor_bruto", "descontos", "deducoes", "valor_liquido", "vendedor"]];
    for (let i = 0; i < N; i++) {
      const d = new Date(today.getTime() - (i % 730) * 86_400_000);
      sales.push([`P${i}`, `C${i % 2000}`, `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`, i % 50 === 0 ? "cancelado" : "faturado", `${(100 + (i % 900)).toFixed(2).replace(".", ",")}`, "0,00", "", "", `V${i % 8}`]);
    }
    await load(user, c.id, "CUSTOMERS", customers);
    await load(user, c.id, "SALES", sales, { recordKind: "INVOICE" });
    console.log("[carga] reimportação do mesmo arquivo (deve dar 0 novos):");
    await load(user, c.id, "SALES", sales, { recordKind: "INVOICE" });
    let t = t0();
    await refreshMetrics(c.id, user.id);
    console.log(`  recálculo de KPIs avulso: ${secs(t)}`);
    t = t0();
    const page = await prisma.sale.findMany({ where: { clientId: c.id }, orderBy: { occurredAt: "desc" }, take: 50 });
    console.log(`  consulta paginada (50 de ${await prisma.sale.count({ where: { clientId: c.id } })}): ${secs(t)} · ${page.length} linhas`);
  } finally {
    const t = t0();
    await deleteClientData(user, c.id, { confirmName: c.name, reason: "Limpeza do teste de carga sintética" });
    console.log(`[carga] cliente temporário excluído em ${secs(t)}`);
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error("[carga] falhou:", e);
  process.exitCode = 1;
});
