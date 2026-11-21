/**
 * Mapeamento determinístico área do diagnóstico → área do catálogo (RF-064).
 * A sugestão de processos nunca inventa código: só retorna códigos existentes no catálogo.
 */
export const DIAG_TO_PROCESS_DOMAIN: Record<string, string> = {
  DIAG01: "E",
  DIAG02: "M",
  DIAG03: "P",
  DIAG04: "V",
  DIAG05: "C",
  DIAG06: "R",
  DIAG07: "L",
  DIAG08: "O",
  DIAG09: "F",
  DIAG10: "G",
  DIAG11: "T",
  DIAG12: "A",
};

/** Sugestões específicas por área (processos-âncora do Anexo C primeiro). */
const PREFERRED: Record<string, string[]> = {
  C: ["C05", "C04", "C01", "C06"],
  V: ["V05", "V11"],
  L: ["L05"],
  P: ["P04"],
  A: ["A03"],
  G: ["G05"],
};

export const PROCESS_DOMAINS: { code: string; name: string }[] = [
  { code: "D", name: "Diagnóstico e inteligência de negócios" },
  { code: "E", name: "Estratégia e posicionamento comercial" },
  { code: "M", name: "Marketing e geração de demanda" },
  { code: "P", name: "Prospecção e aquisição de clientes" },
  { code: "V", name: "Atendimento, negociação e conversão" },
  { code: "C", name: "Gestão da carteira e expansão de contas" },
  { code: "R", name: "Pós-venda, experiência e retenção" },
  { code: "L", name: "Precificação e rentabilidade" },
  { code: "O", name: "Operações, estoque e produtividade" },
  { code: "F", name: "Gestão financeira e capital de giro" },
  { code: "G", name: "Pessoas, liderança e desempenho" },
  { code: "T", name: "Tecnologia, CRM, automação e IA" },
  { code: "A", name: "Gestão, indicadores e melhoria contínua" },
  { code: "X", name: "Expansão, canais e novas receitas" },
];

export const processDomainName = (code: string) => PROCESS_DOMAINS.find((d) => d.code === code)?.name ?? code;

/** Converte área do diagnóstico (DIAG05) ou do catálogo (C) para letra do catálogo. */
export function toProcessDomain(domainCode: string): string | null {
  if (DIAG_TO_PROCESS_DOMAIN[domainCode]) return DIAG_TO_PROCESS_DOMAIN[domainCode]!;
  return PROCESS_DOMAINS.some((d) => d.code === domainCode) ? domainCode : null;
}

type Candidate = { code: string; domainCode: string; hasFullSheet: boolean; active: boolean };

/**
 * Até `limit` processos sugeridos para uma área: preferidos da área, depois fichas completas,
 * depois os demais em ordem de código. Determinístico e só com códigos do catálogo.
 */
export function suggestProcessCodes(domainCode: string, catalog: Candidate[], limit = 3): string[] {
  const dom = toProcessDomain(domainCode);
  if (!dom) return [];
  const inDomain = catalog.filter((p) => p.active && p.domainCode === dom);
  const known = new Set(inDomain.map((p) => p.code));
  const preferred = (PREFERRED[dom] ?? []).filter((c) => known.has(c));
  const rest = inDomain
    .filter((p) => !preferred.includes(p.code))
    .sort((a, b) => Number(b.hasFullSheet) - Number(a.hasFullSheet) || a.code.localeCompare(b.code, "pt-BR", { numeric: true }))
    .map((p) => p.code);
  return [...preferred, ...rest].slice(0, limit);
}
