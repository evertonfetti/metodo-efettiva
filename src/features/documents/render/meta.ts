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
  brand: { companyName: string; tagline: string; footerText: string; confidentiality: string; logo?: { data: Buffer; mime: string } | null };
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

/** Dimensões de PNG/JPEG pelo cabeçalho (para dimensionar o logo sem dependências). */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1]!;
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Logo escalado para altura fixa (px), largura proporcional limitada. */
export function logoBox(buf: Buffer, height = 48, maxWidth = 220) {
  const s = imageSize(buf);
  if (!s || !s.width || !s.height) return { width: height * 3, height };
  const w = Math.round((s.width / s.height) * height);
  return w > maxWidth ? { width: maxWidth, height: Math.round((s.height / s.width) * maxWidth) } : { width: w, height };
}
