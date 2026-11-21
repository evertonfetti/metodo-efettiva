import type { DocContent } from "../content";
import { filterForAudience } from "../content";

export type RenderMeta = {
  title: string;
  clientName: string;
  projectName: string | null;
  version: number;
  stateLabel: string;
  dateLabel: string;
  audience: "INTERNO" | "CLIENTE";
  isDraft: boolean;
  brand: { companyName: string; tagline: string; footerText: string; confidentiality: string };
};

export const audienceLabel = (a: "INTERNO" | "CLIENTE") => (a === "INTERNO" ? "Interno Efettiva" : "Cliente");
export const WATERMARK = "RASCUNHO";

/** Única porta de entrada dos renderizadores: aplica o filtro de audiência no servidor. */
export function prepare(content: DocContent, audience: "INTERNO" | "CLIENTE"): DocContent {
  return filterForAudience(content, audience);
}

/** Divide texto em trechos normais e marcadores [PENDENTE: …] para destaque. */
export function splitPending(text: string): { text: string; pending: boolean }[] {
  const out: { text: string; pending: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[PENDENTE(?::[^\]]*)?\]/g)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), pending: false });
    out.push({ text: m[0], pending: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), pending: false });
  return out.length ? out : [{ text: "", pending: false }];
}
