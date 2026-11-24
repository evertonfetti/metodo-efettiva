import { PAGE_HELP } from "@/lib/help";
import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { Chip } from "@/components/status-badge";
import { ProcessCodeChip } from "@/components/processes/process-chip";
import { requirePageUser } from "@/lib/security/session";
import { areaCounts, listProcesses, processFilterSchema } from "@/features/processes/service";
import { PROCESS_DOMAINS } from "@/features/processes/mapping";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Biblioteca de processos" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requirePageUser();
  const f = processFilterSchema.parse(await searchParams);
  const [items, counts] = await Promise.all([listProcesses(f), areaCounts()]);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { ...f, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return `/biblioteca${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <Topbar crumbs={[{ label: "Biblioteca de processos" }]} />
      <PageContent wide>
        <PageHeader help={PAGE_HELP.biblioteca}
          title="Biblioteca de processos"
          subtitle={`${total} processos em 14 áreas. Fichas completas são templates canônicos: valide requisitos, pessoas e sistema antes de aplicar no cliente.`}
        />
        <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <nav aria-label="Áreas" className="h-fit rounded-[12px] border border-border bg-surface p-2">
            <Link href={href({ area: undefined })} aria-current={!f.area ? "page" : undefined} className={cn("flex items-center justify-between rounded-[8px] px-3 py-2 text-sm font-semibold hover:bg-surface-sunken", !f.area && "bg-surface-sunken text-navy")}>
              Todas as áreas <span className="text-xs text-text-subtle">{total}</span>
            </Link>
            {PROCESS_DOMAINS.map((d) => (
              <Link
                key={d.code}
                href={href({ area: d.code })}
                aria-current={f.area === d.code ? "page" : undefined}
                className={cn("flex items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-sm hover:bg-surface-sunken", f.area === d.code && "bg-surface-sunken font-bold text-navy")}
              >
                <span className="min-w-0"><span className="font-mono text-xs font-bold text-text-subtle">{d.code}</span> {d.name}</span>
                <span className="text-xs text-text-subtle">{counts[d.code] ?? 0}</span>
              </Link>
            ))}
          </nav>
          <div className="flex min-w-0 flex-col gap-4">
            <form className="flex flex-wrap items-end gap-3" role="search">
              {f.area ? <input type="hidden" name="area" value={f.area} /> : null}
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle" aria-hidden="true" />
                <Input name="q" defaultValue={f.q} placeholder="Buscar por nome, objetivo ou código (ex.: C05)" aria-label="Buscar processo" className="pl-9" />
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-text-muted">
                <input type="checkbox" name="full" value="1" defaultChecked={!!f.full} className="size-4 accent-navy" /> Só fichas completas
              </label>
              <Button type="submit" variant="secondary">Filtrar</Button>
            </form>
            <Card aria-label="Processos">
              {items.length === 0 ? (
                <EmptyState icon={BookOpen} title="Nenhum processo encontrado" description="Ajuste a busca ou escolha outra área." action={<Button asChild variant="secondary"><Link href="/biblioteca">Limpar filtros</Link></Button>} />
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((p) => (
                    <li key={p.id}>
                      <Link href={`/biblioteca/${p.code}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface-muted">
                        <ProcessCodeChip code={p.code} className="mt-0.5" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-navy">{p.name}</span>
                            {p.hasFullSheet ? <Chip tone="ok" symbol="✓">Ficha completa</Chip> : null}
                            {p.customized ? <Chip tone="info" symbol="●">Personalizado · v{p.currentVersion}</Chip> : null}
                            {!p.active ? <Chip tone="neutral" symbol="○">Inativo</Chip> : null}
                          </span>
                          <span className="text-sm text-text-muted">{p.objective}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </PageContent>
    </>
  );
}
