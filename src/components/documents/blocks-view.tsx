import type { Block } from "@/features/documents/content";
import { cn } from "@/lib/utils";

/** Texto com marcadores [PENDENTE: …] destacados (UI_LAYOUT: fundo amber-50 e negrito). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[PENDENTE(?::[^\]]*)?\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[PENDENTE/.test(p) ? (
          <mark key={i} className="rounded-[3px] bg-amber-50 px-0.5 font-bold text-amber-900">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Renderização somente leitura dos blocos (prévia, versões aprovadas, comparação). */
export function BlocksView({ blocks, className }: { blocks: Block[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 text-[15px] leading-relaxed", className)}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.level === 2 ? <h3 key={i} className="mt-2 text-lg font-extrabold text-navy"><RichText text={b.text} /></h3> : <h4 key={i} className="mt-2 text-[15px] font-extrabold text-navy"><RichText text={b.text} /></h4>;
          case "paragraph":
            return <p key={i} className="whitespace-pre-line"><RichText text={b.text} /></p>;
          case "callout":
            return <div key={i} className={cn("border-l-4 px-4 py-2", b.tone === "warn" ? "border-amber bg-amber-50" : "border-navy bg-surface-sunken")}><RichText text={b.text} /></div>;
          case "list": {
            const Tag = b.ordered ? "ol" : "ul";
            return <Tag key={i} className={cn("flex flex-col gap-1 pl-6", b.ordered ? "list-decimal" : "list-disc")}>{b.items.map((it, j) => <li key={j}><RichText text={it} /></li>)}</Tag>;
          }
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead><tr>{b.headers.map((h, j) => <th key={j} className="bg-navy px-3 py-2 text-left font-bold text-white">{h}</th>)}</tr></thead>
                  <tbody>{b.rows.map((r, j) => <tr key={j} className="border-b border-border">{b.headers.map((_, k) => <td key={k} className="px-3 py-2 align-top"><RichText text={r[k] ?? ""} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
