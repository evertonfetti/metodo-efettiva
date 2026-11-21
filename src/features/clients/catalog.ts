/** Listas de referência do cadastro de clientes (seção 1.3 e RF-010). */

export const SEGMENTS = [
  { code: "DISTRIBUICAO", label: "Distribuição e atacado" },
  { code: "INDUSTRIA_B2B", label: "Indústria / fornecedor industrial B2B" },
  { code: "SERVICOS_B2B", label: "Serviços B2B" },
  { code: "REPRESENTACAO", label: "Representantes e vendedores externos" },
  { code: "VAREJO", label: "Varejo" },
  { code: "RECORRENTE", label: "Contratos e receita recorrente" },
  { code: "OUTRO", label: "Outro" },
] as const;

export type SegmentCode = (typeof SEGMENTS)[number]["code"];
export const SEGMENT_CODES = SEGMENTS.map((s) => s.code) as [SegmentCode, ...SegmentCode[]];

export function segmentLabel(code: string, other?: string | null): string {
  if (code === "OUTRO" && other) return other;
  return SEGMENTS.find((s) => s.code === code)?.label ?? code;
}

export const SIZES = [
  { code: "MICRO", label: "Microempresa" },
  { code: "PEQUENA", label: "Pequena" },
  { code: "MEDIA", label: "Média" },
  { code: "GRANDE", label: "Grande" },
] as const;

export const sizeLabel = (code?: string | null) => SIZES.find((s) => s.code === code)?.label ?? null;

export const CHANNELS = [
  { code: "VENDA_INTERNA", label: "Venda interna / inside sales" },
  { code: "VENDA_EXTERNA", label: "Venda externa / campo" },
  { code: "REPRESENTANTES", label: "Representantes" },
  { code: "ECOMMERCE", label: "E-commerce / B2B online" },
  { code: "LOJA", label: "Loja física" },
  { code: "TELEVENDAS", label: "Televendas" },
  { code: "LICITACAO", label: "Licitações" },
] as const;

export const channelLabel = (code: string) => CHANNELS.find((c) => c.code === code)?.label ?? code;

export const SALES_MODELS = [
  { code: "TRANSACIONAL", label: "Transacional (recompra frequente)" },
  { code: "CONSULTIVA", label: "Consultiva (ciclo longo, proposta)" },
  { code: "CONTRATO", label: "Contrato / recorrência" },
  { code: "PROJETO", label: "Projeto sob demanda" },
  { code: "MISTO", label: "Misto" },
] as const;

export const salesModelLabel = (code?: string | null) => SALES_MODELS.find((s) => s.code === code)?.label ?? null;

export const UF = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;
