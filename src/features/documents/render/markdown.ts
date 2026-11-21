import type { Block, DocContent } from "../content";
import { audienceLabel, prepare, WATERMARK, type RenderMeta } from "./meta";

const esc = (s: string) => s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");

function block(b: Block): string {
  switch (b.type) {
    case "heading":
      return `${"#".repeat(b.level + 1)} ${b.text}`;
    case "paragraph":
      return b.text;
    case "callout":
      return b.text.split(/\r?\n/).map((l) => `> ${l}`).join("\n");
    case "list":
      return b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : "-"} ${it}`).join("\n");
    case "table":
      return [`| ${b.headers.map(esc).join(" | ")} |`, `| ${b.headers.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${b.headers.map((_, i) => esc(r[i] ?? "")).join(" | ")} |`)].join("\n");
  }
}

export function renderMarkdown(raw: DocContent, meta: RenderMeta): string {
  const content = prepare(raw, meta.audience);
  const lines = [
    `# ${meta.title}`,
    "",
    `> ${meta.clientName}${meta.projectName ? ` · ${meta.projectName}` : ""} · versão ${meta.version} (${meta.stateLabel}) · ${meta.dateLabel}`,
    `> Audiência: ${audienceLabel(meta.audience)} · ${meta.brand.confidentiality} · ${meta.brand.companyName}`,
    ...(meta.isDraft ? ["", `> **${WATERMARK}** — documento não aprovado; não usar como versão final.`] : []),
    "",
    "## Sumário",
    "",
    ...content.sections.map((s, i) => `${i + 1}. ${s.title}`),
    "",
  ];
  content.sections.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.title}`, "");
    for (const b of s.blocks) lines.push(block(b), "");
  });
  lines.push("---", "", `${meta.brand.footerText || meta.brand.companyName} · ${meta.title} · v${meta.version}`, "");
  return lines.join("\n");
}
