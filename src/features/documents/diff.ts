import type { DocContent } from "./content";
import { blockToMarkdown } from "./render/markdown";

export type DiffLine = { kind: "same" | "add" | "del"; text: string };
export type SectionDiff = { key: string; title: string; status: "unchanged" | "changed" | "added" | "removed"; lines: DiffLine[]; meta: string[] };

const toLines = (blocks: DocContent["sections"][number]["blocks"]) => blocks.flatMap((b) => blockToMarkdown(b).split("\n"));

/** Diff por linhas (LCS) — suficiente para seções de até algumas centenas de linhas. */
export function diffLines(a: string[], b: string[]): DiffLine[] {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ kind: "same", text: a[i]! }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ kind: "del", text: a[i++]! });
    else out.push({ kind: "add", text: b[j++]! });
  }
  while (i < m) out.push({ kind: "del", text: a[i++]! });
  while (j < n) out.push({ kind: "add", text: b[j++]! });
  return out;
}

export function diffContent(a: DocContent, b: DocContent): SectionDiff[] {
  const keys = [...new Set([...a.sections.map((s) => s.key), ...b.sections.map((s) => s.key)])];
  return keys.map((key) => {
    const sa = a.sections.find((s) => s.key === key);
    const sb = b.sections.find((s) => s.key === key);
    if (!sa) return { key, title: sb!.title, status: "added", lines: toLines(sb!.blocks).map((text) => ({ kind: "add", text })), meta: [] };
    if (!sb) return { key, title: sa.title, status: "removed", lines: toLines(sa.blocks).map((text) => ({ kind: "del", text })), meta: [] };
    const lines = diffLines(toLines(sa.blocks), toLines(sb.blocks));
    const meta = [...(sa.title !== sb.title ? [`Título: “${sa.title}” → “${sb.title}”`] : []), ...(sa.visibility !== sb.visibility ? [`Visibilidade: ${sa.visibility} → ${sb.visibility}`] : [])];
    const changed = meta.length > 0 || lines.some((l) => l.kind !== "same");
    return { key, title: sb.title, status: changed ? "changed" : "unchanged", lines, meta };
  });
}
