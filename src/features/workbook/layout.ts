import { CHANNELS, SALES_MODELS, SEGMENTS, SIZES, UF } from "@/features/clients/catalog";
import { IMPORT_TYPES, type ImportTypeCode } from "@/features/imports/fields";
import { normalizeHeader } from "@/features/imports/parse";

/** Planilha do cliente: modelo único para enviar ao cliente (em branco) e para exportar o que já existe. */
export const SHEETS = {
  readme: "Leia-me",
  company: "Empresa",
  contacts: "Contatos",
  diagnostic: "Diagnóstico",
} as const;

export const COMMERCIAL_SHEETS: Record<ImportTypeCode, string> = {
  CUSTOMERS: "Clientes",
  PRODUCTS: "Produtos",
  SALES: "Vendas",
  SALE_ITEMS: "Itens de venda",
  QUOTES: "Orçamentos",
};

/** Linha (1-based) do exemplo nas abas de tabela. A linha 1 é o cabeçalho; a 2 é sempre ignorada na importação. */
export const EXAMPLE_ROW = 2;

export type Option = { code: string; label: string };
export type CompanyField = {
  key: string;
  label: string;
  required: boolean;
  example: string;
  help: string;
  options?: readonly Option[];
  multi?: boolean;
};

const opts = (list: readonly Option[]) => list.map((o) => o.label).join(" | ");
export const optionsText = (f: CompanyField) => (f.options ? opts(f.options) : f.key === "state" ? UF.join(", ") : "");

export const COMPANY_FIELDS: CompanyField[] = [
  { key: "name", label: "Nome fantasia", required: true, example: "Distribuidora Exemplo", help: "Como a empresa é conhecida no dia a dia." },
  { key: "legalName", label: "Razão social", required: false, example: "Distribuidora Exemplo Ltda", help: "Nome que consta no CNPJ." },
  { key: "taxId", label: "CPF/CNPJ", required: false, example: "12.345.678/0001-90", help: "Opcional. Fica armazenado cifrado. Em branco = não altera o que já existe." },
  { key: "industry", label: "Segmento", required: true, example: "Distribuição e atacado", help: "Escolha uma opção da lista ao lado.", options: SEGMENTS },
  { key: "industryOther", label: "Descreva o segmento (se 'Outro')", required: false, example: "Autopeças", help: "Preencha apenas se o segmento for 'Outro'." },
  { key: "size", label: "Porte", required: false, example: "Pequena", help: "Escolha uma opção da lista.", options: SIZES },
  { key: "city", label: "Cidade", required: false, example: "Campinas", help: "Cidade da sede." },
  { key: "state", label: "UF", required: false, example: "SP", help: "Sigla do estado, com duas letras." },
  { key: "salesModel", label: "Modelo de venda", required: false, example: "Consultiva (ciclo longo, proposta)", help: "Como a empresa vende. Escolha uma opção da lista.", options: SALES_MODELS },
  { key: "salesChannels", label: "Canais de venda", required: false, example: "Venda externa / campo; Televendas", help: "Pode escolher vários: separe por ponto e vírgula.", options: CHANNELS, multi: true },
  { key: "sellersCount", label: "Quantidade de vendedores", required: false, example: "4", help: "Número inteiro, incluindo representantes que vendem regularmente." },
  { key: "sourceSystem", label: "Sistema de origem (ERP/CRM)", required: false, example: "ERP Sankhya", help: "Sistema onde ficam os pedidos e clientes. Se não houver, escreva 'Planilha'." },
  { key: "salesCycle", label: "Ciclo comercial típico", required: false, example: "15 a 30 dias", help: "Tempo entre o primeiro contato e o fechamento da venda." },
  { key: "typicalPurchaseFrequencyDays", label: "Frequência típica de compra (dias)", required: false, example: "30", help: "De quantos em quantos dias um cliente costuma comprar. Número inteiro." },
  { key: "mainChallenges", label: "Principais desafios", required: false, example: "Clientes deixam de comprar sem que ninguém perceba", help: "Dores comerciais em suas palavras. Texto livre." },
  { key: "tags", label: "Etiquetas", required: false, example: "atacado; região sul", help: "Palavras-chave separadas por ponto e vírgula (opcional)." },
];

export type ColumnDef = { key: string; label: string; required: boolean; example: string; help: string };

export const CONTACT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Nome", required: true, example: "Maria Souza", help: "Nome completo da pessoa." },
  { key: "role", label: "Cargo", required: false, example: "Gerente comercial", help: "Função na empresa." },
  { key: "email", label: "E-mail", required: false, example: "maria@empresa.com.br", help: "Endereço de e-mail válido." },
  { key: "phone", label: "Telefone", required: false, example: "(19) 99999-0000", help: "Com DDD. Pode ser celular/WhatsApp." },
  { key: "dataProcessingNote", label: "Base de tratamento (LGPD)", required: false, example: "Contato fornecido para execução do contrato", help: "Opcional. Por que podemos guardar este contato." },
];

export const DIAG_COLUMNS = {
  code: "Código",
  domain: "Área",
  question: "Pergunta",
  answer: "Resposta (0 a 5, NS ou NA)",
  respondent: "Quem respondeu",
  notes: "Observação / evidência",
  confidence: "Como sabe? (Verificado, Informado ou Estimado)",
} as const;

export const CONFIDENCE_OPTIONS: Option[] = [
  { code: "VERIFIED", label: "Verificado" },
  { code: "REPORTED", label: "Informado" },
  { code: "ESTIMATED", label: "Estimado" },
];

const KIND_HELP: Record<string, string> = {
  text: "Texto livre.",
  int: "Número inteiro.",
  number: "Número; aceita vírgula decimal (1.234,56).",
  date: "Data no formato dd/mm/aaaa.",
  bool: "Sim ou Não.",
};

/** Colunas das abas comerciais, derivadas do importador (uma única fonte da verdade). */
export function commercialColumns(type: ImportTypeCode): (ColumnDef & { kind: string })[] {
  return IMPORT_TYPES[type].fields.map((f) => ({
    key: f.key,
    label: f.label,
    required: f.required,
    example: f.example,
    kind: f.kind,
    help: `${f.required ? "Obrigatório. " : ""}${KIND_HELP[f.kind] ?? ""}`.trim(),
  }));
}

// ── Normalização de valores digitados pelo cliente ──

const norm = (s: string) => normalizeHeader(s);

/** Aceita o código, o rótulo completo ou a parte do rótulo antes de “/” ou “(”, sem diferenciar acentos/maiúsculas. */
export function matchOption(raw: string, options: readonly Option[]): string | null {
  const n = norm(raw);
  if (!n) return null;
  for (const o of options) {
    const names = [o.code, o.label, o.label.split(/[/(]/)[0]!.trim()];
    if (names.some((x) => norm(x) === n)) return o.code;
  }
  return null;
}

export function splitList(raw: string): string[] {
  return raw.split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
}

export const labelToCompanyKey = new Map(COMPANY_FIELDS.map((f) => [norm(f.label), f.key]));
