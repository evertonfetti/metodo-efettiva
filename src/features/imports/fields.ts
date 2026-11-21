import { normalizeHeader } from "./parse";

export type ImportTypeCode = "CUSTOMERS" | "PRODUCTS" | "SALES" | "SALE_ITEMS" | "QUOTES";
export type FieldKind = "text" | "number" | "date" | "bool" | "int";
export type FieldDef = { key: string; label: string; required: boolean; kind: FieldKind; synonyms: string[]; example: string };

const f = (key: string, label: string, required: boolean, kind: FieldKind, example: string, synonyms: string[] = []): FieldDef => ({ key, label, required, kind, example, synonyms });

/** Campos internos por tipo de arquivo (modelos da seção 6.1). */
export const IMPORT_TYPES: Record<ImportTypeCode, { label: string; file: string; description: string; fields: FieldDef[] }> = {
  CUSTOMERS: {
    label: "Clientes",
    file: "clientes",
    description: "Carteira de clientes do cliente Efettiva (base para vendas e orçamentos).",
    fields: [
      f("id_externo", "ID externo", true, "text", "CLI001", ["codigo", "cod_cliente", "id", "codigo_cliente"]),
      f("nome", "Nome", true, "text", "Comercial Exemplo", ["razao_social", "cliente", "nome_cliente", "fantasia"]),
      f("segmento", "Segmento", false, "text", "Oficinas", ["ramo", "atividade"]),
      f("vendedor", "Vendedor", false, "text", "VEN01", ["representante", "cod_vendedor"]),
      f("intervalo_compra_dias", "Intervalo de compra (dias)", false, "int", "30", ["periodicidade", "intervalo"]),
      f("ativo", "Ativo", false, "bool", "sim", ["situacao", "status"]),
    ],
  },
  PRODUCTS: {
    label: "Produtos",
    file: "produtos",
    description: "Produtos e serviços vendidos.",
    fields: [
      f("id_externo", "ID externo", true, "text", "PRD001", ["codigo", "cod_produto", "id"]),
      f("sku", "SKU", false, "text", "SKU001", ["referencia"]),
      f("nome", "Nome", true, "text", "Produto Exemplo", ["descricao", "produto"]),
      f("categoria", "Categoria", false, "text", "Insumos", ["grupo", "familia", "linha"]),
      f("ativo", "Ativo", false, "bool", "sim", ["situacao"]),
    ],
  },
  SALES: {
    label: "Vendas",
    file: "vendas",
    description: "Pedidos ou faturamentos (defina no envio o que o arquivo representa).",
    fields: [
      f("id_externo", "ID externo da venda", true, "text", "PED001", ["pedido", "numero", "nota", "id", "num_pedido", "numero_pedido"]),
      f("id_cliente", "ID do cliente", true, "text", "CLI001", ["cliente", "cod_cliente", "codigo_cliente"]),
      f("data", "Data", true, "date", "12/10/2026", ["data_emissao", "emissao", "data_pedido", "data_venda"]),
      f("status", "Status", true, "text", "confirmado", ["situacao"]),
      f("tipo_registro", "Tipo de registro", false, "text", "PEDIDO", ["tipo"]),
      f("valor_bruto", "Valor bruto", false, "number", "1.000,00", ["bruto", "valor_total", "total_bruto"]),
      f("descontos", "Descontos", false, "number", "50,00", ["desconto", "valor_desconto"]),
      f("deducoes", "Deduções", false, "number", "", ["impostos", "deducao"]),
      f("valor_liquido", "Valor líquido", false, "number", "950,00", ["liquido", "valor", "total", "valor_total_liquido"]),
      f("vendedor", "Vendedor", false, "text", "VEN01", ["representante", "cod_vendedor"]),
    ],
  },
  SALE_ITEMS: {
    label: "Itens de venda",
    file: "itens_venda",
    description: "Linhas das vendas (necessárias para margem e ABC de produtos).",
    fields: [
      f("id_venda", "ID da venda", true, "text", "PED001", ["pedido", "numero", "nota"]),
      f("id_linha", "ID da linha", true, "text", "1", ["linha", "item", "seq", "sequencia"]),
      f("id_produto", "ID do produto", false, "text", "PRD001", ["produto", "cod_produto", "codigo_produto"]),
      f("quantidade", "Quantidade", true, "number", "2", ["qtd", "qtde", "quant"]),
      f("preco_unitario", "Preço unitário", true, "number", "500,00", ["preco", "valor_unitario", "vl_unitario"]),
      f("desconto", "Desconto", false, "number", "50,00", ["descontos", "valor_desconto"]),
      f("custo_variavel_unitario", "Custo variável unitário", false, "number", "320,00", ["custo", "custo_unitario", "cmv_unitario"]),
    ],
  },
  QUOTES: {
    label: "Orçamentos",
    file: "orcamentos",
    description: "Propostas e cotações (não viram venda automaticamente).",
    fields: [
      f("id_externo", "ID externo", true, "text", "ORC001", ["numero", "orcamento", "proposta", "id"]),
      f("id_cliente", "ID do cliente", true, "text", "CLI001", ["cliente", "cod_cliente"]),
      f("data_emissao", "Data de emissão", true, "date", "01/10/2026", ["data", "emissao"]),
      f("data_validade", "Data de validade", false, "date", "20/10/2026", ["validade"]),
      f("status", "Status", true, "text", "aberto", ["situacao"]),
      f("valor", "Valor", true, "number", "5.000,00", ["valor_total", "total"]),
      f("vendedor", "Vendedor", false, "text", "VEN01", ["representante"]),
      f("ultimo_contato", "Último contato", false, "date", "05/10/2026", ["ultima_interacao", "data_contato"]),
      f("motivo_perda", "Motivo de perda", false, "text", "", ["motivo"]),
    ],
  },
};

export type Mapping = Record<string, string | null>; // campo interno → cabeçalho do arquivo

/** Sugere mapeamento por nome normalizado e sinônimos; perfil salvo tem prioridade. */
export function suggestMapping(type: ImportTypeCode, headers: string[], saved?: Mapping | null): Mapping {
  const norm = headers.map((h) => [h, normalizeHeader(h)] as const);
  const out: Mapping = {};
  for (const fd of IMPORT_TYPES[type].fields) {
    const fromProfile = saved?.[fd.key];
    if (fromProfile && headers.includes(fromProfile)) { out[fd.key] = fromProfile; continue; }
    const hit = norm.find(([, n]) => n === fd.key) ?? norm.find(([, n]) => fd.synonyms.includes(n));
    out[fd.key] = hit ? hit[0] : null;
  }
  return out;
}

export function mappingIssues(type: ImportTypeCode, headers: string[], mapping: Mapping): string[] {
  const issues: string[] = [];
  const used = new Map<string, string>();
  for (const fd of IMPORT_TYPES[type].fields) {
    const h = mapping[fd.key];
    if (!h) { if (fd.required) issues.push(`Campo obrigatório sem coluna: ${fd.label}`); continue; }
    if (!headers.includes(h)) issues.push(`Coluna inexistente no arquivo: ${h}`);
    if (used.has(h)) issues.push(`Coluna “${h}” usada em ${used.get(h)} e ${fd.label}`);
    used.set(h, fd.label);
  }
  return issues;
}

/** Status de origem → status interno. Desconhecido = erro antes de confirmar (nunca supor). */
const SALE_STATUS: Record<string, "VALID" | "CANCELLED" | "RETURN"> = {};
for (const s of ["confirmado", "confirmada", "faturado", "faturada", "aprovado", "aprovada", "concluido", "concluida", "entregue", "emitido", "emitida", "fechado", "fechada", "pago", "paga", "valido", "valida", "ativo", "normal", "autorizada", "autorizado", "finalizado", "finalizada"]) SALE_STATUS[s] = "VALID";
for (const s of ["cancelado", "cancelada", "estornado", "estornada", "anulado", "anulada", "denegada", "inutilizada"]) SALE_STATUS[s] = "CANCELLED";
for (const s of ["devolvido", "devolvida", "devolucao", "devolucao_parcial", "estorno"]) SALE_STATUS[s] = "RETURN";
export const saleStatus = (raw: string) => SALE_STATUS[normalizeHeader(raw)] ?? null;

const QUOTE_STATUS: Record<string, "OPEN" | "WON" | "LOST" | "EXPIRED"> = {};
for (const s of ["aberto", "aberta", "em_aberto", "enviado", "enviada", "em_negociacao", "negociacao", "pendente", "em_andamento", "aguardando"]) QUOTE_STATUS[s] = "OPEN";
for (const s of ["ganho", "ganha", "aprovado", "aprovada", "fechado", "fechada", "convertido", "convertida", "vendido", "vendida", "aceito", "aceita"]) QUOTE_STATUS[s] = "WON";
for (const s of ["perdido", "perdida", "recusado", "recusada", "cancelado", "cancelada", "reprovado", "reprovada"]) QUOTE_STATUS[s] = "LOST";
for (const s of ["vencido", "vencida", "expirado", "expirada"]) QUOTE_STATUS[s] = "EXPIRED";
export const quoteStatus = (raw: string) => QUOTE_STATUS[normalizeHeader(raw)] ?? null;

export const RECORD_KIND: Record<string, "ORDER" | "INVOICE"> = { pedido: "ORDER", order: "ORDER", faturamento: "INVOICE", nota: "INVOICE", nf: "INVOICE", nota_fiscal: "INVOICE", invoice: "INVOICE", fatura: "INVOICE" };
