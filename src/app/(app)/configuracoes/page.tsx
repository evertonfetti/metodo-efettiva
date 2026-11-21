import type { Metadata } from "next";
import Link from "next/link";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge, Chip } from "@/components/status-badge";
import { requirePageUser } from "@/lib/security/session";
import { getSetting } from "@/features/settings/service";
import { checkHealth } from "@/features/system/health";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { jobLabel } from "@/lib/jobs/labels";
import { cn } from "@/lib/utils";
import { BrandForm, MethodForm, ParametersForm, PingQueueButton, RetryJobButton } from "./forms";
import { AiSettingsForm } from "@/components/ai/ai-settings-form";
import { aiConfigured } from "@/features/ai/provider";
import { aiUsageSummary } from "@/features/ai/service";
import { listAuditEvents } from "@/features/governance/service";
import { RuleForm, RuleToggle, type RuleDefaults } from "./rules-ui";
import { describeCondition, listRules } from "@/features/assessments/rules";
import { conditionSchema, type Condition } from "@/features/assessments/conditions";

export const metadata: Metadata = { title: "Configurações" };

const TABS = [
  { id: "marca", label: "Marca" },
  { id: "metodo", label: "Fases do método e escala do diagnóstico" },
  { id: "diagnostico", label: "Regras do diagnóstico" },
  { id: "parametros", label: "Parâmetros" },
  { id: "ia", label: "Provedor de IA" },
  { id: "usuarios", label: "Usuários" },
  { id: "saude", label: "Backups e saúde" },
  { id: "auditoria", label: "Auditoria" },
] as const satisfies readonly { id: string; label: string; availableInPhase?: number }[];

type TabId = (typeof TABS)[number]["id"];
type TabDef = { id: TabId; label: string; availableInPhase?: number };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ aba?: string; regra?: string; acao?: string; pagina?: string }> }) {
  const user = await requirePageUser();
  const { aba, regra, acao, pagina } = await searchParams;
  const tab: TabId = (TABS.find((t) => t.id === aba)?.id ?? "metodo") as TabId;
  const canEdit = user.role === "OWNER";
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <>
      <Topbar crumbs={[{ label: "Configurações", href: "/configuracoes" }, { label: current.label }]} />
      <PageContent>
        <PageHeader title="Configurações" subtitle="Marca, parâmetros, provedor de IA, acessos, backups e saúde do sistema." />
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <nav aria-label="Seções de configuração" className="flex shrink-0 flex-row flex-wrap gap-1 md:w-64 md:flex-col">
            {(TABS as readonly TabDef[]).map((t) =>
              t.availableInPhase ? (
                <span key={t.id} aria-disabled="true" className="flex min-h-11 cursor-not-allowed items-center justify-between gap-2 rounded-[8px] px-3 text-sm font-semibold text-text-subtle">
                  {t.label} <span className="text-[11px] font-bold">Fase {t.availableInPhase}</span>
                </span>
              ) : (
                <Link
                  key={t.id}
                  href={`/configuracoes?aba=${t.id}`}
                  aria-current={t.id === tab ? "page" : undefined}
                  className={cn("flex min-h-11 items-center rounded-[8px] px-3 text-sm font-semibold", t.id === tab ? "bg-surface-sunken font-bold text-navy outline-2 outline-navy" : "text-text-muted hover:bg-surface-sunken")}
                >
                  {t.label}
                </Link>
              ),
            )}
          </nav>
          <div className="min-w-0 flex-1">
            {tab === "marca" ? <BrandTab canEdit={canEdit} /> : null}
            {tab === "metodo" ? <MethodTab canEdit={canEdit} /> : null}
            {tab === "diagnostico" ? <RulesTab canEdit={canEdit} editId={regra} /> : null}
            {tab === "parametros" ? <ParametersTab canEdit={canEdit} /> : null}
            {tab === "ia" ? <AiTab canEdit={canEdit} /> : null}
            {tab === "usuarios" ? <UsersTab /> : null}
            {tab === "saude" ? <HealthTab canEdit={canEdit} /> : null}
            {tab === "auditoria" ? (canEdit ? <AuditTab action={acao} page={pagina} /> : <Card className="p-5 text-sm text-text-muted">A trilha de auditoria é restrita ao perfil OWNER.</Card>) : null}
          </div>
        </div>
      </PageContent>
    </>
  );
}

async function BrandTab({ canEdit }: { canEdit: boolean }) {
  const brand = await getSetting("brand");
  return (
    <Card>
      <CardHeader title="Marca dos documentos" />
      <div className="p-5"><BrandForm brand={brand} canEdit={canEdit} /></div>
    </Card>
  );
}

async function MethodTab({ canEdit }: { canEdit: boolean }) {
  const [phases, labels] = await Promise.all([getSetting("methodPhases"), getSetting("scaleLabels")]);
  return (
    <Card>
      <CardHeader title="Fases do método e escala do diagnóstico" />
      <div className="p-5">
        <MethodForm phases={phases} labels={labels} canEdit={canEdit} />
      </div>
    </Card>
  );
}

async function ParametersTab({ canEdit }: { canEdit: boolean }) {
  const params = await getSetting("parameters");
  return (
    <Card>
      <CardHeader title="Parâmetros analíticos e operacionais" />
      <div className="flex flex-col gap-4 p-5">
        <p className="text-sm text-text-muted">Valores de referência editáveis. Não são regras universais: ajuste ao segmento e à realidade de cada operação.</p>
        <ParametersForm params={params} canEdit={canEdit} />
      </div>
    </Card>
  );
}

async function AiTab({ canEdit }: { canEdit: boolean }) {
  const configured = aiConfigured();
  const [s, usage] = await Promise.all([getSetting("ai"), aiUsageSummary()]);
  const { total, cost } = usage;
  const stats = usage.byDecision;
  const label: Record<string, string> = { PENDING: "aguardando revisão", ACCEPTED: "aceitas", EDITED: "aceitas com edição", REJECTED: "rejeitadas" };
  return (
    <Card>
      <CardHeader title="Provedor de IA" />
      <div className="flex flex-col gap-4 p-5 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-bold">Chave Anthropic:</span>
          {configured ? <Chip tone="ok" symbol="✓">Configurada via variável de ambiente</Chip> : <Chip tone="neutral" symbol="○">Não configurada (defina ANTHROPIC_API_KEY no .env e reinicie web e worker)</Chip>}
        </p>
        <p className="text-text-muted">A chave nunca é exibida nem salva no banco. Sem chave, o sistema segue integralmente com templates determinísticos. Com chave, cada cliente ainda precisa de autorização explícita (Editar cadastro → IA externa).</p>
        <p className="text-text-muted">Últimos 30 dias: {total} geração(ões){total ? ` (${stats.map((x) => `${x.count} ${label[x.decision]}`).join(", ")})` : ""} · custo estimado US$ {cost.toFixed(2)}.</p>
        <AiSettingsForm s={s} canEdit={canEdit} />
      </div>
    </Card>
  );
}

async function UsersTab() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true }, orderBy: { createdAt: "asc" } });
  return (
    <Card>
      <CardHeader title="Usuários internos" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase">
              <th className="px-5 py-3 font-bold">Nome</th>
              <th className="px-3 py-3 font-bold">E-mail</th>
              <th className="px-3 py-3 font-bold">Perfil</th>
              <th className="px-5 py-3 font-bold">Último acesso</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-5 py-3 font-bold">{u.name}{!u.active ? " (inativo)" : ""}</td>
                <td className="px-3 py-3">{u.email}</td>
                <td className="px-3 py-3">{u.role}</td>
                <td className="px-5 py-3">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Nunca"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-3 text-xs text-text-subtle">
        O primeiro OWNER é criado por variáveis de ambiente (`npm run bootstrap:owner`). Convites e gestão de múltiplos usuários são da fase F2 (RF-006).
      </p>
    </Card>
  );
}

async function HealthTab({ canEdit }: { canEdit: boolean }) {
  const [health, jobs] = await Promise.all([
    checkHealth(),
    prisma.backgroundJob.findMany({ where: { clientId: null }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  // jobs de todos os clientes: visível só ao OWNER (evita expor nomes de clientes a quem não tem acesso)
  const failed = canEdit ? await prisma.backgroundJob.findMany({ where: { status: "FAILED" }, include: { client: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Saúde do sistema" />
        <ul className="divide-y divide-border text-sm">
          <li className="flex items-center justify-between px-5 py-3">
            <span className="font-bold">Banco de dados (PostgreSQL)</span>
            {health.database.ok ? <Chip tone="ok" symbol="✓">Operacional · {health.database.latencyMs} ms</Chip> : <Chip tone="err" symbol="✕">Indisponível</Chip>}
          </li>
          <li className="flex items-center justify-between px-5 py-3">
            <span className="font-bold">Fila (Redis)</span>
            {health.redis.ok ? <Chip tone="ok" symbol="✓">Operacional · {health.redis.latencyMs} ms</Chip> : <Chip tone="err" symbol="✕">Indisponível</Chip>}
          </li>
        </ul>
        <p className="border-t border-border px-5 py-3 text-xs text-text-subtle">Fonte: verificação ao vivo · {formatDateTime(health.checkedAt)}</p>
      </Card>
      <Card>
        <CardHeader title="Fila de processamento" />
        <div className="flex flex-col gap-4 p-5">
          {canEdit ? <PingQueueButton /> : null}
          {jobs.length === 0 ? (
            <p className="text-sm text-text-muted">Nenhum job de sistema executado ainda.</p>
          ) : (
            <ul className="divide-y divide-border rounded-[8px] border border-border text-sm">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span>{jobLabel(j.operation)} · {formatDateTime(j.createdAt)}</span>
                  <StatusBadge context="job" value={j.status} suffix={j.status === "RUNNING" ? `${j.progress}%` : undefined} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
      {canEdit ? <Card>
        <CardHeader title={`Jobs com falha (${failed.length})`} />
        {failed.length === 0 ? <p className="px-5 py-4 text-sm text-text-muted">Nenhum job com falha. Jobs presos por queda do worker são recuperados automaticamente a cada 5 minutos.</p> : (
          <ul className="divide-y divide-border text-sm">
            {failed.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0"><span className="font-bold">{jobLabel(j.operation)}</span> · {j.client?.name ?? "Sistema"} · {formatDateTime(j.createdAt)}<span className="block text-xs text-err">{j.errorMessage ?? "Falhou"}</span></span>
                {canEdit ? <RetryJobButton jobId={j.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card> : null}
      <Card>
        <CardHeader title="Backups" />
        <div className="p-5 text-sm text-text-muted">
          Backup e restauração por script documentado: <code className="rounded bg-surface-sunken px-1">scripts/backup.sh</code> e{" "}
          <code className="rounded bg-surface-sunken px-1">scripts/restore.sh</code> (banco + volume de arquivos). Agende o backup no host
          (cron/EasyPanel). Procedimento completo no README.
        </div>
      </Card>
    </div>
  );
}

function ruleDefaults(r: { id: string; effect: "SHOW" | "HIDE"; reason: string; active: boolean; conditionJson: unknown; target: { questionCode: string } }): RuleDefaults {
  const c = conditionSchema.safeParse(r.conditionJson);
  const base: RuleDefaults = { id: r.id, targetQuestionCode: r.target.questionCode, effect: r.effect, reason: r.reason, active: r.active };
  if (!c.success) return base;
  const cond = c.data as Condition;
  if (cond.op === "equals" && cond.field === "segment") return { ...base, conditionType: "SEGMENT", segments: [String(cond.value)] };
  if (cond.op === "in" && cond.field === "segment") return { ...base, conditionType: "SEGMENT", segments: cond.values.map(String) };
  if ((cond.op === "lessThan" || cond.op === "greaterThan" || cond.op === "equals") && cond.field.startsWith("answer:"))
    return { ...base, conditionType: "ANSWER", answerQuestionCode: cond.field.slice(7), operator: cond.op, value: Number(cond.value) };
  return base;
}

async function RulesTab({ canEdit, editId }: { canEdit: boolean; editId?: string }) {
  const { rules, questions, template } = await listRules();
  const title = new Map(questions.map((q) => [q.questionCode, q.title]));
  const editing = editId ? rules.find((r) => r.id === editId) : undefined;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title={`Regras condicionais · ${template.name} v${template.version}`} />
        <p className="px-5 pt-4 text-sm text-text-muted">
          Regras por segmento e por resposta anterior controlam quais perguntas aparecem. Perguntas ocultas não entram no score. Alterações valem para diagnósticos em aberto; diagnósticos fechados preservam o snapshot.
        </p>
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase">
                <th className="px-3 py-2 font-bold">Pergunta</th>
                <th className="px-3 py-2 font-bold">Efeito</th>
                <th className="px-3 py-2 font-bold">Condição</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const c = conditionSchema.safeParse(r.conditionJson);
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2.5"><b>{r.target.questionCode}</b><div className="text-xs text-text-muted">{r.target.title}</div></td>
                    <td className="px-3 py-2.5">{r.effect === "SHOW" ? "Exibir" : "Ocultar"}</td>
                    <td className="px-3 py-2.5">{c.success ? describeCondition(c.data, (code) => title.get(code) ?? code) : "Condição inválida (ignorada)"}<div className="text-xs text-text-subtle">{r.reason}</div></td>
                    <td className="px-3 py-2.5">{r.active ? <Chip tone="ok" symbol="✓">Ativa</Chip> : <Chip tone="neutral" symbol="○">Inativa</Chip>}{r.isSeed ? <div className="mt-1 text-xs text-text-subtle">Padrão do seed</div> : null}</td>
                    <td className="px-3 py-2.5">
                      {canEdit ? (
                        <span className="flex gap-1">
                          <Link className="inline-flex min-h-8 items-center rounded-[8px] px-3 text-[13px] font-bold text-navy hover:bg-surface-sunken" href={`/configuracoes?aba=diagnostico&regra=${r.id}#editar-regra`}>Editar</Link>
                          <RuleToggle id={r.id} active={r.active} />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {canEdit ? (
        <Card id="editar-regra">
          <CardHeader title={editing ? `Editar regra · ${editing.target.questionCode}` : "Nova regra"} action={editing ? <Link className="text-sm font-bold text-navy hover:underline" href="/configuracoes?aba=diagnostico">Nova regra</Link> : null} />
          <div className="p-5">
            <RuleForm questions={questions} defaults={editing ? ruleDefaults(editing) : undefined} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

const AUDIT_FILTERS = [["", "Todas"], ["auth.", "Acesso"], ["client.", "Clientes"], ["assessment.", "Diagnósticos"], ["opportunity.", "Oportunidades"], ["project.", "Projetos"], ["task.", "Tarefas"], ["document.", "Documentos"], ["import.", "Importações"], ["baseline.", "Baseline"], ["ai.", "IA"], ["file.", "Arquivos"], ["setting.", "Configurações"], ["job.", "Jobs"]] as const;

async function AuditTab({ action, page }: { action?: string; page?: string }) {
  const user = await requirePageUser();
  const r = await listAuditEvents(user, { action: action || undefined, page });
  const href = (p: Record<string, string | number | undefined>) => `/configuracoes?${new URLSearchParams(Object.entries({ aba: "auditoria", acao: action, pagina: page, ...p }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString()}`;
  return (
    <Card>
      <CardHeader title="Trilha de auditoria" />
      <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-3">
        {AUDIT_FILTERS.map(([v, l]) => <Link key={v} href={href({ acao: v || undefined, pagina: undefined })} aria-current={(action ?? "") === v ? "true" : undefined} className={cn("rounded-full border px-3 py-1 text-xs font-bold", (action ?? "") === v ? "border-navy bg-navy text-white" : "border-border-strong text-text-muted hover:border-navy")}>{l}</Link>)}
      </div>
      {r.items.length === 0 ? <p className="px-5 py-4 text-sm text-text-muted">Nenhum evento com esse filtro.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase"><th className="px-5 py-2">Quando</th><th className="px-2 py-2">Quem</th><th className="px-2 py-2">Ação</th><th className="px-2 py-2">Cliente</th><th className="px-5 py-2">Registro</th></tr></thead>
            <tbody>{r.items.map((i) => <tr key={i.id} className="border-t border-border"><td className="px-5 py-2 whitespace-nowrap">{formatDateTime(i.createdAt)}</td><td className="px-2 py-2">{i.actor}</td><td className="px-2 py-2 font-mono text-xs">{i.action}</td><td className="px-2 py-2">{i.client ?? "—"}</td><td className="px-5 py-2 text-xs text-text-muted">{i.entityType}{i.entityId ? ` · ${i.entityId.slice(0, 8)}` : ""}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
        <span className="text-text-muted">{r.total.toLocaleString("pt-BR")} evento(s) · página {r.page} de {r.pages}</span>
        <span className="flex gap-2">
          {r.page > 1 ? <Link className="font-bold text-navy hover:underline" href={href({ pagina: r.page - 1 })}>Anterior</Link> : null}
          {r.page < r.pages ? <Link className="font-bold text-navy hover:underline" href={href({ pagina: r.page + 1 })}>Próxima</Link> : null}
        </span>
      </div>
      <p className="border-t border-border px-5 py-2 text-xs text-text-subtle">Registra quem, quando e o quê (com hashes de antes/depois, sem conteúdo sensível). Eventos de clientes excluídos permanecem como registro de eliminação.</p>
    </Card>
  );
}
