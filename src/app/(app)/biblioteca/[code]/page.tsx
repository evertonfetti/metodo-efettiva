import type { Metadata } from "next";
import Link from "next/link";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/status-badge";
import { DataQualityBanner } from "@/components/data-banner";
import { ProcessCodeChip } from "@/components/processes/process-chip";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { getProcess, getProcessRevision } from "@/features/processes/service";
import { SHEET_SECTIONS, type ProcessSnapshot } from "@/features/processes/content";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Params = { params: Promise<{ code: string }>; searchParams: Promise<{ v?: string; salvo?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return { title: `Processo ${(await params).code}` };
}

export default async function ProcessPage({ params, searchParams }: Params) {
  const user = await requirePageUser();
  const { code } = await params;
  const { v, salvo } = await searchParams;
  const p = await orNotFound(getProcess(code));
  const version = Number(v);
  const viewing = Number.isInteger(version) && version > 0 && version !== p.currentVersion ? await orNotFound(getProcessRevision(code, version)) : null;
  const snap: ProcessSnapshot = viewing ? viewing.snapshot : { code: p.code, domainCode: p.domainCode, name: p.name, objective: p.objective, content: p.content };
  const canEdit = user.role !== "VIEWER";

  return (
    <>
      <Topbar crumbs={[{ label: "Biblioteca de processos", href: "/biblioteca" }, { label: p.code }]} />
      <PageContent wide>
        <PageHeader
          title={`${p.code} · ${snap.name}`}
          badges={
            <>
              <Chip tone={viewing ? "warn" : "navy"} symbol={viewing ? "!" : "●"}>v{viewing ? viewing.version : p.currentVersion}{viewing ? " (histórico)" : " atual"}</Chip>
              {p.hasFullSheet ? <Chip tone="ok" symbol="✓">Ficha completa</Chip> : <Chip tone="neutral" symbol="○">Ficha básica</Chip>}
            </>
          }
          subtitle={`${p.domainName}${p.customized ? " · personalizado a partir do seed" : " · conteúdo original do seed"}`}
          actions={canEdit && !viewing ? <Button asChild><Link href={`/biblioteca/${p.code}/editar`}>Editar ficha</Link></Button> : null}
        />
        {salvo ? <p role="status" className="rounded-[8px] bg-ok-bg px-4 py-2 text-sm font-semibold text-ok">✓ Nova versão salva. A anterior continua no histórico; projetos existentes mantêm a versão que usaram.</p> : null}
        {viewing ? (
          <DataQualityBanner action={<Button asChild variant="secondary" size="sm"><Link href={`/biblioteca/${p.code}`}>Ver versão atual</Link></Button>}>
            Você está vendo a versão {viewing.version} ({viewing.changeNotes}), somente leitura.
          </DataQualityBanner>
        ) : null}
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <Card aria-label="Ficha do processo">
            <article className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-7">
              <div className="flex items-center gap-3">
                <ProcessCodeChip code={p.code} />
                <span className="text-xs font-bold tracking-[0.5px] text-text-subtle uppercase">{p.domainName}</span>
              </div>
              <section>
                <h2 className="text-xs font-bold tracking-[0.5px] text-text-muted uppercase">Objetivo</h2>
                <p className="mt-1 leading-relaxed">{snap.objective}</p>
              </section>
              {snap.content ? (
                SHEET_SECTIONS.map(({ key, label, list }) => {
                  const val = snap.content?.[key];
                  if (!val || (Array.isArray(val) && val.length === 0)) return null;
                  return (
                    <section key={key}>
                      <h2 className="text-xs font-bold tracking-[0.5px] text-text-muted uppercase">{label}</h2>
                      {list && Array.isArray(val) ? (
                        key === "steps" ? (
                          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-6 leading-relaxed">{val.map((s, i) => <li key={i}>{s}</li>)}</ol>
                        ) : (
                          <ul className="mt-2 flex flex-wrap gap-1.5">{val.map((s, i) => <li key={i} className="rounded-[4px] bg-surface-sunken px-2 py-1 text-sm">{s}</li>)}</ul>
                        )
                      ) : (
                        <p className={cn("mt-1 leading-relaxed", key === "approach" && "border-l-4 border-amber bg-amber-50 px-4 py-2 italic")}>{String(val)}</p>
                      )}
                    </section>
                  );
                })
              ) : (
                <p className="rounded-[8px] bg-surface-sunken px-4 py-3 text-sm text-text-muted">
                  Processo do catálogo sem ficha detalhada. Ao incluí-lo num projeto, o plano gera tarefas genéricas (mapear, pilotar, padronizar, validar).{canEdit ? " Você pode detalhar a ficha em “Editar ficha”." : ""}
                </p>
              )}
            </article>
          </Card>
          <Card aria-labelledby="hist" className="h-fit">
            <CardHeader id="hist" title="Histórico de versões" />
            <ol className="divide-y divide-border">
              {p.revisions.map((r) => {
                const current = r.version === p.currentVersion;
                const active = viewing ? viewing.version === r.version : current;
                return (
                  <li key={r.id} className={cn("px-5 py-3 text-sm", active && "bg-surface-muted")}>
                    <Link href={current ? `/biblioteca/${p.code}` : `/biblioteca/${p.code}?v=${r.version}`} className="font-bold text-navy hover:underline">
                      v{r.version}{current ? " · atual" : ""}
                    </Link>
                    <p className="text-text-muted">{r.changeNotes}</p>
                    <p className="text-xs text-text-subtle">{r.author} · {formatDateTime(r.createdAt)}</p>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </PageContent>
    </>
  );
}
