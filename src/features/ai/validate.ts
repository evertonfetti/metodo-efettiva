import { blockSchema, blockTexts, type Block } from "@/features/documents/content";
import type { SectionDraft } from "./schemas";

export type AiIssue = { level: "error" | "warn"; code: string; message: string };

/** Bloco plano da IA → bloco do documento (schema seguro, sem HTML). Inválido → null. */
export function toBlock(f: SectionDraft["blocks"][number]): Block | null {
  const cand =
    f.type === "heading" ? { type: "heading", level: 3, text: f.text ?? "" }
    : f.type === "paragraph" ? { type: "paragraph", text: f.text ?? "" }
    : f.type === "callout" ? { type: "callout", tone: f.tone ?? "info", text: f.text ?? "" }
    : f.type === "list" ? { type: "list", ordered: !!f.ordered, items: (f.items ?? []).filter((x) => x.trim()) }
    : { type: "table", kind: "generic", headers: f.headers ?? [], rows: (f.rows ?? []).map((r) => (f.headers ?? []).map((_, i) => r[i] ?? "")) };
  const r = blockSchema.safeParse(cand);
  return r.success ? r.data : null;
}

/** Números normalizados de um texto (ignora IDs EV-xxx, códigos de processo e dígitos isolados). */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  const t = text.replace(/\bEV-\d+\b/g, " ").replace(/\b[A-Z]\d{2}\b/g, " ").replace(/\bO-\d+\b/g, " ");
  for (const m of t.matchAll(/\d[\d.,]*\d|\d/g)) {
    let s = m[0];
    if (/^\d$/.test(s)) continue;
    if (/,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const v = Number(s.replace(/,/g, ""));
    if (Number.isFinite(v)) out.add(String(Math.round(v * 100) / 100));
  }
  return out;
}

/**
 * BusinessValidator (8.2 passo 8, RF-097): referências de evidência devem existir; códigos de processo só do catálogo
 * do projeto; números do texto precisam constar dos dados enviados (nada calculado ou inventado pela IA).
 * `error` impede aceitar a sugestão.
 */
export function validateDraft(draft: SectionDraft, allowed: { evidence: string[]; processCodes: string[]; contextText: string; kpiTablePresent: boolean }) {
  const issues: AiIssue[] = [];
  const blocks = draft.blocks.map(toBlock);
  const valid = blocks.filter((b): b is Block => !!b);
  if (valid.length < blocks.length) issues.push({ level: "error", code: "INVALID_BLOCK", message: `${blocks.length - valid.length} bloco(s) fora do formato permitido.` });
  if (!valid.length) issues.push({ level: "error", code: "EMPTY", message: "A sugestão veio sem conteúdo." });
  const text = valid.flatMap(blockTexts).join("\n");

  const ev = new Set(allowed.evidence);
  const cited = new Set([...draft.evidenceRefs, ...(text.match(/\bEV-\d{3}\b/g) ?? [])]);
  const badEv = [...cited].filter((r) => !ev.has(r));
  if (badEv.length) issues.push({ level: "error", code: "INVALID_EVIDENCE", message: `Evidência inexistente citada: ${badEv.join(", ")}.` });
  if (!cited.size) issues.push({ level: "warn", code: "NO_EVIDENCE", message: "Nenhuma evidência citada: confira se as afirmações têm base." });

  const pc = new Set(allowed.processCodes);
  const codes = new Set([...draft.processCodes, ...(text.match(/\b[A-Z]\d{2}\b/g) ?? [])]);
  const badCodes = [...codes].filter((c) => !pc.has(c));
  if (badCodes.length) issues.push({ level: "error", code: "INVALID_PROCESS", message: `Código de processo fora do projeto/catálogo: ${badCodes.join(", ")}.` });

  const known = numbersIn(allowed.contextText);
  const invented = [...numbersIn(text)].filter((x) => !known.has(x));
  if (invented.length) issues.push({ level: "error", code: "UNSOURCED_NUMBER", message: `Número sem fonte nos dados enviados: ${invented.slice(0, 8).join(", ")}${invented.length > 8 ? "…" : ""}. Edite ou rejeite.` });

  if (allowed.kpiTablePresent && !valid.some((b) => b.type === "table")) issues.push({ level: "warn", code: "KPI_TABLE_REMOVED", message: "A tabela de indicadores da seção original não foi mantida." });
  if (draft.confidence === "LOW") issues.push({ level: "warn", code: "LOW_CONFIDENCE", message: "A própria IA indicou confiança baixa." });
  if (draft.missingData.length) issues.push({ level: "warn", code: "MISSING_DATA", message: `${draft.missingData.length} dado(s) ausente(s) apontado(s).` });
  return { blocks: valid, issues, cited: [...cited].filter((r) => ev.has(r)) };
}

/** Reverte a pseudonimização no texto final (tokens → nomes reais). */
export function restore(blocks: Block[], replacements: [string, string][]): Block[] {
  const map = new Map<string, string>([["[EQUIPE_EFETTIVA]", "Equipe Efettiva"]]);
  // vários nomes reais por token (ex.: nome fantasia e razão social): restaura o mais curto
  for (const [token, real] of replacements) if (!token.startsWith("[EQUIPE") && (!map.has(token) || real.length < map.get(token)!.length)) map.set(token, real);
  const fix = (s: string) => [...map.entries()].reduce((acc, [t, r]) => acc.split(t).join(r), s);
  return blocks.map((b) => {
    switch (b.type) {
      case "heading":
      case "paragraph":
      case "callout":
        return { ...b, text: fix(b.text) };
      case "list":
        return { ...b, items: b.items.map(fix) };
      case "table":
        return { ...b, headers: b.headers.map(fix), rows: b.rows.map((r) => r.map(fix)) };
    }
  });
}
