import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { DemoBadge } from "@/components/demo-badge";
import { StatusBadge } from "@/components/status-badge";
import { requirePageUser } from "@/lib/security/session";
import { listClients } from "@/features/clients/service";
import { SEGMENTS, segmentLabel } from "@/features/clients/catalog";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Clientes" };

type SP = { q?: string; segment?: string; status?: string; page?: string };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const status = sp.status === "ACTIVE" || sp.status === "PAUSED" || sp.status === "ARCHIVED" ? sp.status : undefined;
  const data = await listClients(user, { q: sp.q, segment: sp.segment, status, page: sp.page });
  const filtered = !!(sp.q || sp.segment || status);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (sp.segment) p.set("segment", sp.segment);
    if (status) p.set("status", status);
    p.set("page", String(page));
    return `/clientes?${p.toString()}`;
  };

  return (
    <>
      <Topbar crumbs={[{ label: "Clientes" }]} />
      <PageContent>
        <PageHeader
          title="Clientes"
          subtitle={`${data.total} ${data.total === 1 ? "empresa" : "empresas"}${filtered ? " no filtro atual" : ""}`}
          actions={user.role !== "VIEWER" ? <Button asChild><Link href="/clientes/novo">+ Novo cliente</Link></Button> : null}
        />
        <form role="search" className="flex flex-wrap items-end gap-3" action="/clientes">
          <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-[8px] border border-border-strong bg-surface-muted px-3">
            <Search className="size-4 text-text-subtle" aria-hidden="true" />
            <span className="sr-only">Buscar por nome, razão social ou cidade</span>
            <input name="q" defaultValue={sp.q} placeholder="Buscar por nome, razão social ou cidade" className="min-h-10 flex-1 bg-transparent text-sm outline-none" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-bold text-text-muted">
            Segmento
            <Select name="segment" defaultValue={sp.segment ?? ""} className="w-56">
              <option value="">Todos</option>
              {SEGMENTS.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-bold text-text-muted">
            Status
            <Select name="status" defaultValue={status ?? ""} className="w-40">
              <option value="">Ativos e pausados</option>
              <option value="ACTIVE">Ativo</option>
              <option value="PAUSED">Pausado</option>
              <option value="ARCHIVED">Arquivado</option>
            </Select>
          </label>
          <Button type="submit" variant="secondary">Filtrar</Button>
          {filtered ? <Button asChild variant="ghost"><Link href="/clientes">Limpar</Link></Button> : null}
          <Input type="hidden" name="page" value="1" />
        </form>

        <Card>
          {data.items.length === 0 ? (
            filtered ? (
              <EmptyState icon={Search} title="Nenhum cliente encontrado" description="Ajuste a busca ou os filtros." />
            ) : (
              <EmptyState
                icon={Building2}
                title="Nenhum cliente cadastrado"
                description="Cadastre a primeira empresa-cliente para iniciar o diagnóstico 360°."
                action={user.role !== "VIEWER" ? <Button asChild><Link href="/clientes/novo">+ Novo cliente</Link></Button> : undefined}
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase">
                    <th className="px-5 py-3 font-bold">Empresa</th>
                    <th className="px-3 py-3 font-bold">Segmento</th>
                    <th className="px-3 py-3 font-bold">Cidade/UF</th>
                    <th className="px-3 py-3 font-bold">Último diagnóstico</th>
                    <th className="px-3 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold">Cliente desde</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => {
                    const last = c.assessments[0];
                    return (
                      <tr key={c.id} className="border-t border-border hover:bg-surface-muted">
                        <td className="px-5 py-3.5">
                          <Link href={`/clientes/${c.id}`} className="font-bold text-navy hover:underline">{c.name}</Link> <DemoBadge show={c.isDemo} />
                        </td>
                        <td className="px-3 py-3.5">{segmentLabel(c.industry, c.industryOther)}</td>
                        <td className="px-3 py-3.5">{[c.city, c.state].filter(Boolean).join("/") || "Não informado"}</td>
                        <td className="px-3 py-3.5">{last ? <StatusBadge context="assessment" value={last.status} /> : <span className="text-text-subtle">Nenhum</span>}</td>
                        <td className="px-3 py-3.5"><StatusBadge context="client" value={c.status} /></td>
                        <td className="px-5 py-3.5">{formatDate(c.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {data.pages > 1 ? (
            <nav aria-label="Paginação" className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
              <span className="text-text-muted">Página {data.page} de {data.pages}</span>
              <span className="flex gap-2">
                {data.page > 1 ? <Button asChild variant="secondary" size="sm"><Link href={qs(data.page - 1)}>← Anterior</Link></Button> : null}
                {data.page < data.pages ? <Button asChild variant="secondary" size="sm"><Link href={qs(data.page + 1)}>Próxima →</Link></Button> : null}
              </span>
            </nav>
          ) : null}
        </Card>
      </PageContent>
    </>
  );
}
