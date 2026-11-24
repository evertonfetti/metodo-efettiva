import { PAGE_HELP } from "@/lib/help";
import type { Metadata } from "next";
import Link from "next/link";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/status-badge";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { getClientView } from "@/features/clients/service";
import { getDocument } from "@/features/documents/service";
import { diffContent } from "@/features/documents/diff";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Comparar versões" };

const STATUS = { changed: { tone: "info", label: "Alterada" }, added: { tone: "ok", label: "Nova" }, removed: { tone: "err", label: "Removida" }, unchanged: { tone: "neutral", label: "Sem alterações" } } as const;

export default async function ComparePage({ params, searchParams }: { params: Promise<{ clientId: string; documentId: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const user = await requirePageUser();
  const { clientId, documentId } = await params;
  const { a, b } = await searchParams;
  const [client, va, vb] = await Promise.all([getClientView(user, clientId), orNotFound(getDocument(user, clientId, documentId, a)), orNotFound(getDocument(user, clientId, documentId, b))]);
  const diffs = diffContent(va.revision.content, vb.revision.content);
  const changed = diffs.filter((d) => d.status !== "unchanged");
  const base = `/clientes/${clientId}/documentos/${documentId}`;
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Documentos", href: `/clientes/${clientId}/documentos` }, { label: va.doc.title, href: base }, { label: "Comparar" }]} />
      <PageContent>
        <PageHeader help={PAGE_HELP.documentoComparar}
          title={`Comparar v${va.revision.version} → v${vb.revision.version}`}
          subtitle={`${changed.length} de ${diffs.length} seções com diferenças. Linhas removidas em vermelho, adicionadas em verde.`}
          actions={<Button asChild variant="secondary"><Link href={`${base}?rev=${vb.revision.id}`}>Voltar ao documento</Link></Button>}
        />
        {changed.length === 0 ? <Card className="px-5 py-8 text-center text-sm text-text-muted">As duas versões têm o mesmo conteúdo.</Card> : null}
        {changed.map((d) => (
          <Card key={d.key} aria-label={d.title} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <h2 className="text-[15px] font-extrabold text-navy">{d.title}</h2>
              <Chip tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Chip>
            </div>
            {d.meta.length ? <ul className="px-5 pt-3 text-sm text-text-muted">{d.meta.map((m) => <li key={m}>{m}</li>)}</ul> : null}
            <pre className="overflow-x-auto px-0 py-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">
              {d.lines.map((l, i) => (
                <div key={i} className={cn("px-5", l.kind === "add" && "bg-ok-bg text-ok", l.kind === "del" && "bg-err-bg text-err line-through decoration-err/40", l.kind === "same" && "text-text-subtle")}>
                  <span aria-hidden="true">{l.kind === "add" ? "+ " : l.kind === "del" ? "− " : "  "}</span>
                  <span className="sr-only">{l.kind === "add" ? "Adicionado: " : l.kind === "del" ? "Removido: " : ""}</span>
                  {l.text || " "}
                </div>
              ))}
            </pre>
          </Card>
        ))}
      </PageContent>
    </>
  );
}
