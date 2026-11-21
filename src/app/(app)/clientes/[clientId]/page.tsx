import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Target, FolderKanban } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCardWithSource } from "@/components/metric-card";
import { DataQualityBanner } from "@/components/data-banner";
import { DemoBadge } from "@/components/demo-badge";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge, Chip } from "@/components/status-badge";
import { MethodJourney } from "@/components/method-journey";
import { DomainBars } from "@/components/domain-bars";
import { ContactForm, NoteForm, RemoveContactButton } from "@/components/clients/contacts-notes";
import { requirePageUser } from "@/lib/security/session";
import { prisma } from "@/lib/db";
import { getClientView } from "@/features/clients/service";
import { getClientJourney } from "@/features/clients/journey";
import { getAssessmentDetail } from "@/features/assessments/service";
import { channelLabel, salesModelLabel, segmentLabel, sizeLabel } from "@/features/clients/catalog";
import { formatDate, formatDateTime, formatDay, formatDecimal } from "@/lib/format";
import { todayDateOnly } from "@/lib/dates";
import { overdueDays } from "@/features/projects/rules";
import { formatCode } from "@/features/opportunities/scoring";

export const metadata: Metadata = { title: "Visão 360°" };

export default async function Client360Page({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await requirePageUser();
  const { clientId } = await params;
  const client = await getClientView(user, clientId);
  const canEdit = user.role !== "VIEWER";

  const [journey, contacts, notes, lastAssessment, approvedOpps, activeProject] = await Promise.all([
    getClientJourney(clientId),
    prisma.clientContact.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } }),
    prisma.clientNote.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 10, include: { author: { select: { name: true } } } }),
    prisma.assessment.findFirst({ where: { clientId }, orderBy: [{ number: "desc" }, { revision: "desc" }] }),
    prisma.opportunity.findMany({
      where: { clientId, status: { in: ["APPROVED", "LINKED_TO_PROJECT"] } },
      select: { id: true, number: true, title: true, priorityScore: true, criticalRisk: true, status: true },
      orderBy: [{ criticalRisk: "desc" }, { priorityScore: "desc" }],
      take: 5,
    }),
    prisma.project.findFirst({
      where: { clientId, status: { in: ["ACTIVE", "APPROVED", "DRAFT", "PAUSED"] } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, status: true, startDate: true, targetDate: true, tasks: { select: { status: true, dueDate: true } } },
    }),
  ]);
  const today = todayDateOnly();
  const detail = lastAssessment ? await getAssessmentDetail(user, clientId, lastAssessment.id) : null;
  const domainName = new Map(detail?.domains.map((d) => [d.code, d.name]) ?? []);

  const subtitle = [
    segmentLabel(client.industry, client.industryOther),
    sizeLabel(client.size),
    client.sellersCount != null ? `${client.sellersCount} vendedores` : null,
    client.salesChannels.length ? client.salesChannels.map(channelLabel).join(", ") : null,
    `Cliente desde ${formatDate(client.createdAt)}`,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <Topbar crumbs={[{ label: "Clientes", href: "/clientes" }, { label: client.name }]} />
      <PageContent>
        <PageHeader
          title={client.name}
          badges={<><DemoBadge show={client.isDemo} /><StatusBadge context="client" value={client.status} /></>}
          subtitle={subtitle}
          actions={
            canEdit ? (
              <>
                <Button asChild variant="secondary"><Link href={`/clientes/${clientId}/editar`}>Editar cadastro</Link></Button>
                <Button asChild><Link href={`/clientes/${clientId}/diagnosticos?novo=1`}>Novo diagnóstico</Link></Button>
              </>
            ) : null
          }
        />
        <MethodJourney phases={journey} />
        <DataQualityBanner>Sem dados comerciais importados: os indicadores abaixo ficam indisponíveis até a importação de clientes, vendas e orçamentos (Fase 4).</DataQualityBanner>

        <section aria-label="Indicadores do cliente" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCardWithSource label="Clientes cadastrados" value={null} source="clientes.csv" period="—" unavailableReason="importe a base de clientes" />
          <MetricCardWithSource label="Com sinal de inatividade" value={null} source="vendas.csv" period="—" unavailableReason="importe o histórico de vendas" />
          <MetricCardWithSource label="Orçamentos abertos" value={null} source="orcamentos.csv" period="—" unavailableReason="importe os orçamentos" />
          <MetricCardWithSource label="Margem de contribuição" value={null} source="itens_venda.csv" period="—" unavailableReason="custos variáveis não informados" />
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card aria-labelledby="c360-diag">
            <CardHeader id="c360-diag" title="Diagnóstico 360°" action={detail ? <Link className="text-sm font-bold text-navy hover:underline" href={`/clientes/${clientId}/diagnosticos/${detail.assessment.id}`}>Abrir</Link> : null} />
            {detail ? (
              <div className="flex flex-col gap-4 p-5">
                <p className="flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
                  Diagnóstico #{detail.assessment.number}{detail.assessment.revision ? ` · revisão ${detail.assessment.revision}` : ""}
                  <StatusBadge context="assessment" value={detail.assessment.status} />
                  · {detail.assessment.finalizedAt ? `fechado em ${formatDate(detail.assessment.finalizedAt)}` : `atualizado em ${formatDateTime(detail.assessment.updatedAt)}`}
                  · cobertura {Math.round(detail.overall.coverage * 100)}% ({detail.overall.answeredCount}/{detail.overall.applicableCount})
                </p>
                <DomainBars items={detail.domainScores.map((s) => ({ code: s.domainCode, name: domainName.get(s.domainCode) ?? s.domainCode, score: s.weightedScore, coverage: s.coverage, answered: s.answeredCount, applicable: s.applicableCount }))} />
                <p className="text-xs text-text-subtle">Fonte: respostas do diagnóstico (nota 0–5 só sobre itens respondidos e aplicáveis; abaixo de 2,0 em âmbar; n/d = sem respostas válidas).</p>
              </div>
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="Nenhum diagnóstico ainda"
                description="Comece pelo questionário-base de 96 perguntas em 12 áreas."
                action={canEdit ? <Button asChild><Link href={`/clientes/${clientId}/diagnosticos?novo=1`}>Novo diagnóstico</Link></Button> : undefined}
              />
            )}
          </Card>
          <div className="flex flex-col gap-6">
            <Card aria-labelledby="c360-opps">
              <CardHeader id="c360-opps" title="Oportunidades aprovadas" className="[&_h2]:text-[15px]" />
              {approvedOpps.length === 0 ? (
                <EmptyState
                  icon={Target}
                  title="Nenhuma oportunidade aprovada"
                  description="Registre achados, priorize por impacto × confiança ÷ esforço e aprove as oportunidades."
                  action={<Button asChild variant="secondary"><Link href={`/clientes/${clientId}/oportunidades`}>Abrir oportunidades</Link></Button>}
                />
              ) : (
                <ul className="divide-y divide-border">
                  {approvedOpps.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <Link href={`/clientes/${clientId}/oportunidades?sel=${o.id}`} className="min-w-0 truncate font-bold text-navy hover:underline">{formatCode(o.number)} · {o.title}</Link>
                      <span className="flex shrink-0 items-center gap-2">
                        {o.criticalRisk ? <Chip tone="err" symbol="!">Crítico</Chip> : null}
                        <span className="font-bold tabular-nums">{formatDecimal(Number(o.priorityScore))}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card aria-labelledby="c360-proj">
              <CardHeader id="c360-proj" title="Projeto ativo" className="[&_h2]:text-[15px]" />
              {activeProject ? (
                <div className="flex flex-col gap-2 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/clientes/${clientId}/projetos/${activeProject.id}/acoes`} className="font-bold text-navy hover:underline">{activeProject.name}</Link>
                    <StatusBadge context="project" value={activeProject.status} />
                  </div>
                  <p className="text-text-muted">{formatDay(activeProject.startDate)} → {formatDay(activeProject.targetDate)}</p>
                  <p>
                    {activeProject.tasks.filter((t) => t.status === "DONE").length} de {activeProject.tasks.length} tarefas concluídas
                    {(() => { const n = activeProject.tasks.filter((t) => overdueDays(t.dueDate, t.status, today) > 0).length; return n ? <span className="font-bold text-err"> · {n} vencida(s)</span> : null; })()}
                  </p>
                  <p className="text-xs text-text-subtle">Fonte: tarefas do projeto</p>
                </div>
              ) : (
                <EmptyState
                  icon={FolderKanban}
                  title="Sem projeto em aberto"
                  description="Crie um projeto a partir das oportunidades aprovadas para gerar o plano 30/60/90."
                  action={canEdit ? <Button asChild variant="secondary"><Link href={`/clientes/${clientId}/projetos/novo`}>Novo projeto</Link></Button> : undefined}
                />
              )}
            </Card>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card aria-labelledby="c360-perfil">
            <CardHeader id="c360-perfil" title="Perfil da empresa" />
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
              <Info label="Razão social" value={client.legalName} />
              <Info label="CPF/CNPJ" value={client.taxIdMasked} />
              <Info label="Cidade/UF" value={[client.city, client.state].filter(Boolean).join("/")} />
              <Info label="Modelo de venda" value={salesModelLabel(client.salesModel)} />
              <Info label="Sistema de origem" value={client.sourceSystem} />
              <Info label="Ciclo comercial" value={client.salesCycle} />
              <Info label="Frequência típica de compra" value={client.typicalPurchaseFrequencyDays ? `${client.typicalPurchaseFrequencyDays} dias (informado pelo cliente)` : null} />
              <Info label="Fuso" value={client.timezone} />
              <div className="sm:col-span-2"><Info label="Principais desafios" value={client.mainChallenges} /></div>
              {client.tags.length ? (
                <div className="flex flex-wrap gap-1.5 sm:col-span-2">
                  {client.tags.map((t) => <Chip key={t} tone="neutral">{t}</Chip>)}
                </div>
              ) : null}
            </dl>
          </Card>
          <Card aria-labelledby="c360-contatos">
            <CardHeader id="c360-contatos" title="Contatos-chave" />
            {contacts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-muted">Nenhum contato registrado.</p>
            ) : (
              <ul className="divide-y divide-border">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-bold">{c.name} <DemoBadge show={c.isDemo} /></span>
                      <span className="text-text-muted">{[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "Sem dados adicionais"}</span>
                      {c.dataProcessingNote ? <span className="text-xs text-text-subtle">Base: {c.dataProcessingNote}</span> : null}
                    </span>
                    {canEdit ? <RemoveContactButton clientId={clientId} contactId={c.id} name={c.name} /> : null}
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? <ContactForm clientId={clientId} /> : null}
          </Card>
        </div>

        <Card aria-labelledby="c360-notas">
          <CardHeader id="c360-notas" title="Notas" />
          {notes.length === 0 ? (
            <p className="px-5 py-4 text-sm text-text-muted">Nenhuma nota registrada.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notes.map((n) => (
                <li key={n.id} className="flex flex-col gap-1 px-5 py-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                    {n.author.name} · {formatDateTime(n.createdAt)} <StatusBadge context="visibility" value={n.visibility} />
                  </span>
                  <p className="whitespace-pre-wrap">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
          {canEdit ? <NoteForm clientId={clientId} /> : null}
        </Card>
      </PageContent>
    </>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-bold text-text-muted">{label}</dt>
      <dd className={value ? "" : "text-text-subtle"}>{value || "Não informado"}</dd>
    </div>
  );
}
