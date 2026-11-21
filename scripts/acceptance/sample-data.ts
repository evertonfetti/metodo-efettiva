/**
 * Dados de exemplo determinísticos (semente fixa) para aceite e demonstração — fictícios.
 * Datas relativas a hoje; inclui cancelados, devolução, itens sem custo e linhas inválidas de propósito.
 */
export type Sample = { customers: string[][]; products: string[][]; sales: string[][]; items: string[][]; quotes: string[][]; expected: { salesValue12m: number; cancelled: number; invalidRows: number } };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const br = (n: number) => n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dayStr = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

export function buildSample(today: Date, opts: { customers?: number; seed?: number } = {}): Sample {
  const r = rng(opts.seed ?? 42);
  const nC = opts.customers ?? 60;
  const day = (ago: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ago));
  const segs = ["Oficinas", "Frotas", "Revendas", "Indústrias"];
  const customers = [["id_externo", "nome", "segmento", "vendedor", "intervalo_compra_dias", "ativo"]];
  for (let i = 1; i <= nC; i++) customers.push([`CLI${String(i).padStart(3, "0")}`, `Cliente Exemplo ${i}`, segs[i % 4]!, `VEN0${(i % 4) + 1}`, i % 5 === 0 ? "30" : "", i === nC ? "não" : "sim"]);
  const products = [["id_externo", "sku", "nome", "categoria", "ativo"]];
  for (let i = 1; i <= 30; i++) products.push([`PRD${String(i).padStart(3, "0")}`, `SKU${i}`, `Produto ${i}`, ["Insumos", "Peças", "Serviços"][i % 3]!, "sim"]);

  const sales = [["id_externo", "id_cliente", "data", "status", "tipo_registro", "valor_bruto", "descontos", "deducoes", "valor_liquido", "vendedor"]];
  const items = [["id_venda", "id_linha", "id_produto", "quantidade", "preco_unitario", "desconto", "custo_variavel_unitario"]];
  let n = 0, cancelled = 0;
  const lastDate = 3;
  const valid: { ago: number; net: number }[] = [];
  let minAgo = Infinity;
  for (let c = 1; c <= nC; c++) {
    const interval = 15 + Math.floor(r() * 45);
    // 20% dos clientes param de comprar há 90–200 dias (sinal de inatividade)
    const stopAgo = c % 5 === 1 ? 90 + Math.floor(r() * 110) : lastDate + Math.floor(r() * 10);
    for (let ago = 420; ago >= stopAgo; ago -= interval + Math.floor(r() * 6)) {
      n++;
      const id = `PED${String(n).padStart(5, "0")}`;
      const lines = 1 + Math.floor(r() * 3);
      let gross = 0;
      const its: string[][] = [];
      for (let l = 1; l <= lines; l++) {
        const q = 1 + Math.floor(r() * 10), price = Math.round((20 + r() * 480) * 100) / 100;
        gross += q * price;
        its.push([id, String(l), `PRD${String(1 + Math.floor(r() * 30)).padStart(3, "0")}`, String(q), br(price), "", n % 7 === 0 ? "" : br(Math.round(price * (0.45 + r() * 0.25) * 100) / 100)]);
      }
      gross = Math.round(gross * 100) / 100;
      const status = n % 41 === 0 ? "cancelado" : "confirmado";
      const net = gross; // descontos já refletidos nos preços
      const d = day(ago);
      sales.push([id, `CLI${String(c).padStart(3, "0")}`, dayStr(d), status, "PEDIDO", br(gross), "0,00", "", br(net), `VEN0${(c % 4) + 1}`]);
      items.push(...its);
      minAgo = Math.min(minAgo, ago);
      if (status === "cancelado") cancelled++;
      else valid.push({ ago, net });
    }
  }
  // devolução válida e linhas inválidas propositais
  n++;
  sales.push([`DEV${n}`, "CLI002", dayStr(day(20)), "devolvido", "PEDIDO", "", "", "", "150,00", "VEN03"]);
  valid.push({ ago: 20, net: -150 });
  // período = 12 meses terminando na última venda registrada (mesma regra do motor)
  const salesValue12m = valid.filter((v) => v.ago <= minAgo + 364).reduce((t, v) => t + v.net, 0);
  sales.push(["PEDX01", "CLI999", dayStr(day(10)), "confirmado", "PEDIDO", "", "", "", "100,00", "VEN01"]); // cliente inexistente
  sales.push(["PEDX02", "CLI003", "31/02/2026", "confirmado", "PEDIDO", "", "", "", "100,00", "VEN01"]); // data inválida
  sales.push(["PEDX03", "CLI003", dayStr(day(10)), "confirmado", "PEDIDO", "", "", "", "-80,00", "VEN01"]); // negativo sem devolução

  const quotes = [["id_externo", "id_cliente", "data_emissao", "data_validade", "status", "valor", "vendedor", "ultimo_contato", "motivo_perda"]];
  for (let i = 1; i <= 40; i++) {
    const ago = 5 + Math.floor(r() * 120);
    const st = i % 4 === 0 ? "ganho" : i % 4 === 1 ? "perdido" : "aberto";
    quotes.push([`ORC${String(i).padStart(3, "0")}`, `CLI${String(1 + (i % nC)).padStart(3, "0")}`, dayStr(day(ago)), dayStr(day(ago - 20)), st, br(Math.round((500 + r() * 9500) * 100) / 100), `VEN0${(i % 4) + 1}`, i % 3 === 0 ? "" : dayStr(day(Math.max(1, ago - 3))), st === "perdido" ? "Preço" : ""]);
  }
  return { customers, products, sales, items, quotes, expected: { salesValue12m: Math.round(salesValue12m * 100) / 100, cancelled, invalidRows: 3 } };
}

export const toCsv = (rows: string[][], sep = ";") => "﻿" + rows.map((r) => r.map((c) => (c.includes(sep) || c.includes('"') || c.includes("\n") ? `"${c.replace(/"/g, '""')}"` : c)).join(sep)).join("\r\n") + "\r\n";
