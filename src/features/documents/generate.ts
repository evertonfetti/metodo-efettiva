import type { Block, DocContent, EvidenceSource, Section, Sources } from "./content";
import { countPending } from "./content";
import type { CtxProcess, GenContext } from "./context";
import { formatDay, formatDecimal } from "@/lib/format";
import { planWindows, WINDOW_LABELS } from "@/features/projects/plan";
import { STATUS_MAP } from "@/lib/status";
import { processDomainName } from "@/features/processes/mapping";

/**
 * Gerador determinístico (sem IA) do playbook (seção 9.1) e do POP (seção 9.2).
 * Usa apenas dados cadastrados, diagnóstico, oportunidades, projeto e fichas versionadas.
 * Onde falta informação validada, escreve `[PENDENTE: …]` em vez de inventar.
 */
export const GENERATOR_VERSION = "playbook-det-1.0";

const P = (what: string) => `[PENDENTE: ${what}]`;
const para = (text: string): Block => ({ type: "paragraph", text });
const h3 = (text: string): Block => ({ type: "heading", level: 3, text });
const list = (items: string[], ordered = false): Block => ({ type: "list", ordered, items });
const table = (headers: string[], rows: string[][], kind: "generic" | "kpi" | "raci" | "responsibilities" = "generic"): Block => ({ type: "table", kind, headers, rows });
const callout = (text: string, tone: "info" | "warn" = "info"): Block => ({ type: "callout", tone, text });
const sec = (key: string, title: string, origin: string, blocks: Block[], extra: Partial<Section> = {}): Section => ({ key, title, visibility: "CLIENTE", state: "PENDING", origin, manuallyEdited: false, blocks, ...extra });
const statusLabel = (ctx: keyof typeof STATUS_MAP, v: string) => (STATUS_MAP[ctx] as Record<string, { label: string }>)[v]?.label ?? v;
const oppCode = (n: number) => `O-${String(n).padStart(2, "0")}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const score = (v: number | null) => (v == null ? "Indisponível" : formatDecimal(v));

function evidenceRegistry(ctx: GenContext) {
  const items: EvidenceSource[] = [];
  const byFinding = new Map<string, string[]>();
  for (const f of ctx.findings) {
    const refs: string[] = [];
    for (const e of f.evidence.length ? f.evidence : [f.description]) {
      const ref = `EV-${String(items.length + 1).padStart(3, "0")}`;
      items.push({ ref, label: `${f.title}: ${e}`, kind: f.origin === "RULE" ? "Regra do diagnóstico" : "Registro do consultor" });
      refs.push(ref);
    }
    byFinding.set(f.id, refs);
  }
  return { items, byFinding };
}

function kpiRows(ctx: GenContext): string[][] {
  const source = ctx.client.sourceSystem ? `${ctx.client.sourceSystem} e registros do processo` : `Registros do processo ${P("confirmar sistema/planilha de origem")}`;
  return ctx.processes.flatMap((p) =>
    (p.content?.kpis ?? []).map((k) => [k, p.code, p.content?.kpiFormulas?.[k] ?? P("definir fórmula, unidade e fonte"), "Indisponível: base histórica não importada", P("meta a aprovar com o patrocinador"), source]),
  );
}
const KPI_HEADERS = ["Indicador", "Processo", "Fórmula", "Baseline", "Meta", "Fonte"];

const ROLE_VERB = /^(.+?)\s+(aprova|aprovam|executa|executam|desenha|valida|validam|conduz|autoriza|mede|audita|define|distribui|registra|acompanha)\b(.*)$/i;

function responsibilityRows(ctx: GenContext, p: CtxProcess): string[][] {
  const rows: string[][] = [];
  for (const part of (p.content?.roles ?? "").split(";").map((s) => s.trim().replace(/\.$/, "")).filter(Boolean)) {
    const m = ROLE_VERB.exec(part);
    rows.push(m ? [cap(m[1]!), cap(`${m[2]}${m[3]}`.trim())] : [cap(part), P("descrever a atribuição")]);
  }
  rows.push(["Responsável no cliente", p.ownerName ? `${p.ownerName}: responde pela execução e pelos registros` : P("nomear o responsável do cliente pelo processo")]);
  if (ctx.project) rows.push(["Consultor Efettiva", `${ctx.project.ownerName}: desenha a rotina, treina e audita a execução`]);
  return rows;
}
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Subseções 9.2 de um processo (usadas como capítulo no playbook e como seções no POP). */
export function processParts(ctx: GenContext, p: CtxProcess): { key: string; title: string; blocks: Block[] }[] {
  const c = p.content;
  const steps = c?.steps ?? [];
  const tools = [ctx.client.sourceSystem ? `Sistema informado no cadastro: ${ctx.client.sourceSystem}.` : P("CRM/ERP utilizado"), `Campos mínimos: responsável, data, resultado e próximo passo de cada registro ${P("confirmar campos no sistema do cliente")}.`];
  return [
    {
      key: "identificacao",
      title: "Identificação",
      blocks: [table(["Item", "Informação"], [["Código", p.code], ["Processo", p.name], ["Versão da ficha", `v${p.version} (biblioteca Efettiva)`], ["Cliente", ctx.client.name], ["Aplicação", ctx.project ? `Projeto “${ctx.project.name}”` : "Operação comercial do cliente"], ["Status no projeto", statusLabel("processImpl", p.status)]])],
    },
    { key: "resultado", title: "Resultado buscado", blocks: [para(p.objective)] },
    {
      key: "escopo",
      title: "Escopo",
      blocks: [list([`Começa: ${c?.trigger ?? P("evento de início")}`, `Termina: ${steps.at(-1) ?? P("evento de término")}`, `Participantes: ${c?.roles ?? P("áreas e pessoas envolvidas")}`])],
    },
    { key: "gatilho", title: "Gatilho", blocks: [para(c?.trigger ?? P("evento que inicia o processo"))] },
    { key: "entradas", title: "Entradas", blocks: [para(c?.inputs ?? P("dados, materiais e ferramentas necessários"))] },
    { key: "responsabilidades", title: "Responsabilidades", blocks: [table(["Papel", "Responsabilidade"], responsibilityRows(ctx, p), "responsibilities")] },
    {
      key: "execucao",
      title: "Execução",
      blocks: steps.length
        ? [list(steps, true), para("Executar na ordem: cada passo depende do registro do anterior.")]
        : [list([P("passo 1"), P("passo 2"), P("passo 3")], true), callout("Ficha sem passos detalhados na biblioteca: desenhar com o responsável do cliente durante o piloto.", "warn")],
    },
    {
      key: "regras",
      title: "Regras e exceções",
      blocks: [list([...(c?.exceptions ? [`Exceções: ${c.exceptions}`] : []), ...(c?.controls ? [`Controles: ${c.controls}`] : []), ...(c?.exceptions || c?.controls ? [] : [P("limites, aprovações e exceções aplicáveis")])])],
    },
    { key: "ferramentas", title: "Ferramentas", blocks: [list(tools)] },
    { key: "cadencia", title: "Cadência e SLA", blocks: [para(c?.cadence ?? P("frequência, horário ou prazo (SLA)"))] },
    {
      key: "comunicacao",
      title: "Comunicação",
      blocks: c?.approach
        ? [callout(c.approach), para("Exemplo de referência: ajustar ao relacionamento e ao canal. O sistema não envia mensagens automaticamente.")]
        : [para(P("script de abordagem e mensagens de exemplo"))],
    },
    { key: "kpis", title: "Indicadores", blocks: [table(KPI_HEADERS, kpiRows({ ...ctx, processes: [p] }), "kpi")] },
    {
      key: "auditoria",
      title: "Auditoria",
      blocks: [list([`Evidências: registros do processo no sistema, atas e materiais de treinamento.`, `Amostragem: ${P("tamanho da amostra e frequência da auditoria")}.`, "Não conformidades: registrar, definir responsável e tratar na revisão semanal."])],
    },
    {
      key: "sucesso",
      title: "Critério de sucesso",
      blocks: [
        list([
          `Validado: tarefas do processo concluídas, indicadores verificados e ao menos uma evidência registrada${c?.validation ? `; critério da ficha: ${c.validation}` : ""}.`,
          "Sustentado: responsável do cliente treinado e auditoria posterior à validação comprovando a rotina.",
        ]),
      ],
    },
    { key: "historico", title: "Histórico", blocks: [table(["Versão", "Origem", "Data"], [[`Ficha ${p.code} v${p.version}`, "Biblioteca de processos Efettiva + dados do projeto", formatDay(ctx.today)]])] },
  ];
}

function openTasks(ctx: GenContext) {
  return ctx.tasks.filter((t) => t.status !== "DONE");
}

export function buildPlaybook(ctx: GenContext): { content: DocContent; sources: Sources } {
  const ev = evidenceRegistry(ctx);
  const pr = ctx.project;
  const inProject = ctx.opportunities.filter((o) => o.inProject);
  const activeOpps = ctx.opportunities.filter((o) => o.status !== "DISMISSED");
  const sections: Section[] = [];
  const assessOrigin = ctx.assessment ? `${ctx.assessment.label}${ctx.assessment.finalized ? "" : " (rascunho)"}` : "sem diagnóstico";
  const procCodes = ctx.processes.map((p) => p.code).join(", ") || "nenhum processo";

  // 1–2 Capa, sumário e finalidade
  sections.push(
    sec("capa", "Capa e finalidade", "Cadastro do cliente e do projeto", [
      table(["Item", "Informação"], [
        ["Empresa", ctx.client.legalName ? `${ctx.client.name} (${ctx.client.legalName})` : ctx.client.name],
        ["Projeto", pr ? pr.name : P("vincular projeto")],
        ["Período", pr ? `${formatDay(pr.startDate)} a ${formatDay(pr.targetDate)}` : P("período")],
        ["Elaborado por", ctx.brand.companyName],
        ["Classificação", ctx.brand.confidentiality],
      ]),
      para(`Este playbook reúne o diagnóstico, as prioridades e os processos comerciais que serão implantados em ${ctx.client.name}, com responsáveis, indicadores, cronograma e critérios de validação. Ele é o guia de execução da equipe e a referência para auditorias e treinamentos.`),
      callout("Instruções validadas aparecem como texto normal. Itens marcados [PENDENTE: …] são lacunas que precisam ser confirmadas com o cliente antes da aprovação do documento."),
    ]),
  );

  // 3 Contexto
  const c = ctx.client;
  sections.push(
    sec("contexto", "Contexto da empresa e escopo", "Cadastro do cliente + projeto", [
      table(["Item", "Informação cadastrada"], [
        ["Segmento", c.segment],
        ["Porte", c.size ?? "Não informado"],
        ["Localização", c.location ?? "Não informada"],
        ["Modelo de venda", c.salesModel ?? "Não informado"],
        ["Canais", c.channels.length ? c.channels.join(", ") : "Não informados"],
        ["Vendedores", c.sellersCount != null ? String(c.sellersCount) : "Não informado"],
        ["Sistema de origem", c.sourceSystem ?? "Não informado"],
        ["Ciclo de venda", c.salesCycle ?? "Não informado"],
      ]),
      ...(c.mainChallenges ? [h3("Desafios relatados pelo cliente"), para(c.mainChallenges)] : []),
      h3("Escopo da consultoria"),
      para(pr?.scope ?? P("descrever escopo acordado com o patrocinador")),
      para(`Processos no escopo: ${procCodes}.`),
    ]),
  );

  // 4 Diagnóstico
  const diag: Block[] = [];
  if (!ctx.assessment) diag.push(para(P("realizar e fechar o diagnóstico 360°")));
  else {
    const a = ctx.assessment;
    diag.push(
      para(`${a.label}${a.finalized ? ", fechado" : ", ainda em rascunho"}: score geral ${score(a.overall.weightedScore)} de 5, com cobertura de ${pct(a.overall.coverage)} (${a.overall.answeredCount} de ${a.overall.applicableCount} perguntas aplicáveis; ${a.overall.unknownCount} marcadas como “não sei”).`),
      table(["Área", "Score (0–5)", "Cobertura"], a.domains.map((d) => [d.name, score(d.score), pct(d.coverage)])),
    );
    if (!a.finalized) diag.push(callout("Diagnóstico ainda não fechado: scores podem mudar.", "warn"));
  }
  diag.push(h3("Principais achados"));
  diag.push(
    ctx.findings.length
      ? list(ctx.findings.map((f) => `${f.title}${f.status === "APPROVED" ? "" : " (preliminar)"} — ${f.description} (${(ev.byFinding.get(f.id) ?? []).join(", ")})`))
      : para(P("registrar achados com evidências")),
  );
  if (ev.items.length) diag.push(h3("Evidências citadas"), table(["Ref.", "Evidência", "Fonte"], ev.items.map((e) => [e.ref, e.label, e.kind])));
  diag.push(callout("Limitações: o score do questionário é indicativo e não substitui evidências, dados comerciais e a decisão do consultor. Áreas com cobertura baixa não permitem conclusão.", "warn"));
  sections.push(sec("diagnostico", "Diagnóstico executivo", assessOrigin, diag));

  // 5 Oportunidades
  sections.push(
    sec("oportunidades", "Mapa de oportunidades e prioridades", "Oportunidades registradas", [
      para("Prioridade = Impacto × Confiança ÷ Esforço (escala 1–5, máximo 25). O score é auxiliar: riscos críticos (segurança, conformidade, capacidade ou caixa) têm prioridade independentemente do ranking."),
      activeOpps.length
        ? table(["Código", "Oportunidade", "I", "C", "E", "Score", "Status", "Processos"], [...activeOpps].sort((a, b) => Number(b.criticalRisk) - Number(a.criticalRisk) || b.score - a.score).map((o) => [oppCode(o.number), `${o.title}${o.criticalRisk ? " (RISCO CRÍTICO)" : ""}`, String(o.impact), String(o.confidence), String(o.effort), formatDecimal(o.score), statusLabel("opportunity", o.status), o.processCodes.join(", ") || "—"]))
        : para(P("registrar e priorizar oportunidades")),
      ...activeOpps.filter((o) => o.criticalRisk).map((o) => callout(`Risco crítico em ${oppCode(o.number)}: ${o.criticalRiskReason ?? o.title}.`, "warn")),
    ]),
  );

  // 6 Objetivos e indicadores
  const kpis = kpiRows(ctx);
  sections.push(
    sec("objetivos", "Objetivos e indicadores", "Projeto + fichas dos processos", [
      h3("Objetivos do projeto"),
      pr?.objectives.length ? list(pr.objectives) : para(P("objetivos estratégicos aprovados")),
      h3("Indicadores"),
      kpis.length ? table(KPI_HEADERS, kpis, "kpi") : para(P("indicadores dos processos")),
      para("Metas só são consideradas aprovadas após validação do patrocinador. Sem dados históricos, o baseline aparece como “Indisponível”."),
    ]),
  );

  // 7 Governança
  sections.push(
    sec("governanca", "Governança do projeto", "Projeto + responsáveis por processo", [
      table(["Papel", "Responsável", "Atribuição"], [
        ["Patrocinador", pr?.sponsorName ?? P("nome do patrocinador"), "Aprova escopo, metas e prioridades; decide escalonamentos"],
        ["Gestor do projeto no cliente", P("nome do gestor"), "Coordena a equipe, garante registros e participa das revisões"],
        ["Consultor Efettiva", pr?.ownerName ?? P("consultor"), "Conduz o método, desenha processos, treina e audita"],
        ...ctx.processes.map((p) => [`Responsável por ${p.code}`, p.ownerName ?? P("responsável do cliente"), `Executa e mantém ${p.name}`]),
      ]),
      h3("Escalação"),
      para("Impedimentos são registrados nas tarefas do plano e tratados na revisão semanal. Decisões fora da alçada da equipe sobem ao patrocinador em até uma semana."),
    ]),
  );

  // 8 Um capítulo por processo
  for (const p of ctx.processes) {
    sections.push(
      sec(
        `processo:${p.code.toLowerCase()}`,
        `${p.code} — ${p.name}`,
        `Ficha ${p.code} v${p.version} + dados do projeto`,
        processParts(ctx, p).flatMap((part) => [h3(part.title), ...part.blocks]),
        { processCode: p.code },
      ),
    );
  }

  // 9 Políticas
  sections.push(
    sec("politicas", "Regras e políticas operacionais", "Fichas dos processos", [
      list(["Toda interação comercial relevante é registrada no sistema com data, responsável, resultado e próximo passo.", "Nenhuma mensagem é enviada automaticamente: o contato é sempre feito por uma pessoa, respeitando canal e preferências do cliente.", "Pedidos de não contato (opt-out) são registrados e respeitados."]),
      ...ctx.processes.filter((p) => p.content?.exceptions || p.content?.controls).flatMap((p) => [h3(`${p.code} — ${p.name}`), list([...(p.content?.exceptions ? [p.content.exceptions] : []), ...(p.content?.controls ? [p.content.controls] : [])])]),
    ]),
  );

  // 10 Roteiros
  const withScripts = ctx.processes.filter((p) => p.content?.approach || p.content?.cadence);
  sections.push(
    sec("roteiros", "Roteiros e exemplos práticos", "Fichas dos processos", withScripts.length ? withScripts.flatMap((p) => [h3(`${p.code} — ${p.name}`), ...(p.content?.approach ? [callout(p.content.approach)] : []), ...(p.content?.cadence ? [para(`Cadência: ${p.content.cadence}`)] : [])]) : [para(P("roteiros de abordagem dos processos"))]),
  );

  // 11 RACI
  sections.push(
    sec("raci", "Matriz RACI simplificada", "Padrão Efettiva (validar)", [
      table(["Processo", "Patrocinador", "Responsável no cliente", "Equipe comercial", "Consultor Efettiva"], ctx.processes.map((p) => [`${p.code} — ${p.name}`, "A", "R", "R", "C"]), "raci"),
      para("R = executa · A = aprova e responde pelo resultado · C = consultado · I = informado."),
      callout("Matriz padrão gerada a partir do método. Confirmar com o patrocinador antes da aprovação.", "warn"),
    ]),
  );

  // 12 Rotinas
  const hasA03 = ctx.processes.some((p) => p.code === "A03");
  sections.push(
    sec("rotinas", "Rotinas de gestão", "Método Efettiva + processos do projeto", [
      table(["Rotina", "Frequência", "Conteúdo"], [
        ["Reunião diária", P("avaliar necessidade"), "Prioridades do dia e bloqueios (15 minutos, se aplicável)"],
        [hasA03 ? "Revisão semanal de vendas (A03)" : "Revisão semanal do projeto", "Semanal", hasA03 ? "KPIs da semana, oportunidades críticas, inativos e follow-ups; até cinco ações com dono e prazo" : "Status das tarefas, impedimentos e decisões"],
        ["Reunião mensal de resultados", "Mensal", "Indicadores com fonte e período, status dos processos e decisões do patrocinador"],
        ["Revisão trimestral", "Trimestral", "Fase do método, processos a escalar e próximos ciclos"],
      ]),
    ]),
  );

  // 13 Cronograma
  const cron: Block[] = [];
  if (pr) {
    for (const w of planWindows(pr.startDate, pr.targetDate)) {
      const ts = ctx.tasks.filter((t) => t.window === w.window);
      cron.push(h3(`${WINDOW_LABELS[w.window].title} · ${formatDay(w.start)} a ${formatDay(w.end)}`), para(WINDOW_LABELS[w.window].summary + "."));
      if (ts.length) cron.push(table(["Tarefa", "Responsável", "Prazo", "Status"], ts.map((t) => [t.title, [t.assignee, t.externalOwner].filter(Boolean).join(" / ") || P("responsável"), formatDay(t.dueDate, P("prazo")), statusLabel("task", t.status)])));
    }
    const extra = ctx.tasks.filter((t) => t.window == null);
    if (extra.length) cron.push(h3("Tarefas adicionais"), table(["Tarefa", "Responsável", "Prazo", "Status"], extra.map((t) => [t.title, [t.assignee, t.externalOwner].filter(Boolean).join(" / ") || P("responsável"), formatDay(t.dueDate, P("prazo")), statusLabel("task", t.status)])));
    if (!ctx.tasks.length) cron.push(para(P("gerar o plano 30/60/90 do projeto")));
  } else cron.push(para(P("vincular projeto com cronograma")));
  sections.push(sec("cronograma", "Cronograma de implantação", "Plano de ação do projeto", cron));

  // 14 Treinamento
  const trainings = ctx.processes.map((p) => {
    const t = p.tasks.find((x) => x.planKey?.endsWith(":pop"));
    return [`${p.code} — ${p.name}`, `POP, passos, abordagem e registros do processo`, p.ownerName ? `${p.ownerName} e equipe` : P("público a treinar"), t ? formatDay(t.dueDate, P("data")) : P("data")];
  });
  sections.push(
    sec("treinamento", "Plano de treinamento e transferência", "Plano de ação + método", [
      trainings.length ? table(["Processo", "Conteúdo", "Público", "Prazo"], trainings) : para(P("plano de treinamento")),
      para("Formato: demonstração curta, role-play com casos reais e checklist de aplicação. A transferência termina quando o responsável do cliente conduz a rotina sozinho e a auditoria posterior confirma."),
    ]),
  );

  // 15 Dashboard
  sections.push(
    sec("dashboard", "Dashboard de indicadores e fórmulas", "Fichas dos processos", [
      kpis.length ? table(["Indicador", "Processo", "Fórmula", "Fonte"], kpis.map((k) => [k[0]!, k[1]!, k[2]!, k[5]!])) : para(P("indicadores")),
      para("Todo número exibido traz fonte e período. Sem dado suficiente, o indicador aparece como “Indisponível”, nunca como zero. Comparações antes/depois usam o mesmo período e a mesma regra de cálculo."),
    ]),
  );

  // 16 Auditoria
  sections.push(
    sec("auditoria", "Critérios de auditoria, aceitação e sustentação", "Fichas + critérios do método", [
      table(["Processo", "Critério de validação", "Status atual"], ctx.processes.map((p) => [`${p.code} — ${p.name}`, p.content?.validation ?? P("critério de validação"), statusLabel("processImpl", p.status)])),
      list(["Validado: processo executado (tarefas concluídas), indicadores verificados e evidência registrada.", "Sustentado: responsável do cliente treinado e auditoria posterior à validação.", "Não conformidades viram tarefas com responsável e prazo."]),
    ]),
  );

  // 17 Riscos e próximos passos
  const blocked = ctx.tasks.filter((t) => t.status === "BLOCKED");
  const critical = inProject.concat(activeOpps.filter((o) => !o.inProject)).filter((o) => o.criticalRisk);
  const deps = activeOpps.filter((o) => o.dependency).map((o) => `${oppCode(o.number)}: ${o.dependency}`);
  const assumptions = activeOpps.flatMap((o) => o.assumptions.map((a) => `${oppCode(o.number)}: ${a}`));
  const next = openTasks(ctx).filter((t) => t.status !== "BLOCKED").slice(0, 5);
  sections.push(
    sec("riscos", "Riscos, dependências, premissas e próximos passos", "Oportunidades + plano de ação", [
      h3("Riscos"),
      critical.length ? list(critical.map((o) => `${oppCode(o.number)} — ${o.criticalRiskReason ?? o.title}`)) : para("Nenhum risco crítico registrado."),
      h3("Dependências e impedimentos"),
      deps.length || blocked.length ? list([...deps, ...blocked.map((t) => `${t.title}: ${t.blockedReason ?? "bloqueada"}`)]) : para("Nenhuma dependência registrada."),
      h3("Premissas"),
      assumptions.length ? list(assumptions) : para("Nenhuma premissa registrada nas oportunidades."),
      h3("Próximos passos"),
      next.length ? list(next.map((t) => `${t.title} — ${formatDay(t.dueDate, "sem prazo")}`)) : para(P("próximos passos")),
    ]),
  );

  // 18 Anexos
  const checklists = ctx.tasks.filter((t) => t.checklist.length);
  sections.push(
    sec("anexos", "Anexos: checklists, scripts e glossário", "Plano de ação + fichas", [
      h3("Checklists operacionais"),
      ...(checklists.length ? checklists.slice(0, 30).flatMap((t) => [para(t.title), list(t.checklist)]) : [para(P("checklists"))]),
      h3("Glossário"),
      table(["Termo", "Significado"], [
        ["KPI", "Indicador de desempenho com fórmula, fonte e período definidos"],
        ["POP", "Procedimento operacional padrão: como o processo é executado"],
        ["Baseline", "Valor de referência medido antes da implantação"],
        ["RACI", "Matriz de quem executa, aprova, é consultado e informado"],
        ["Validado", "Processo executado, medido e com evidência"],
        ["Sustentado", "Processo operado pelo cliente e confirmado em auditoria posterior"],
      ]),
    ]),
  );

  // Notas internas (INTERNO)
  const dismissed = ctx.opportunities.filter((o) => o.status === "DISMISSED");
  const lowConf = ctx.findings.filter((f) => f.confidence === "LOW");
  sections.push(
    sec("notas-internas", "Notas estratégicas internas", "Oportunidades + diagnóstico", [
      callout("Seção INTERNA: nunca sai em arquivos para o cliente.", "warn"),
      h3("Estimativas de valor"),
      activeOpps.some((o) => o.estimatedValue != null)
        ? table(["Oportunidade", "Valor (R$)", "Classificação", "Premissas"], activeOpps.filter((o) => o.estimatedValue != null).map((o) => [oppCode(o.number), formatDecimal(o.estimatedValue, 2), o.estimateType ?? "—", o.assumptions.join("; ") || "—"]))
        : para("Nenhuma oportunidade com valor estimado."),
      h3("Oportunidades descartadas"),
      dismissed.length ? list(dismissed.map((o) => `${oppCode(o.number)} ${o.title}: ${o.statusReason ?? "sem motivo"}`)) : para("Nenhuma."),
      h3("Achados de baixa confiança e lacunas"),
      lowConf.length ? list(lowConf.map((f) => `${f.title} (${processDomainName(f.domainCode)})`)) : para("Nenhum achado de baixa confiança."),
      ...(ctx.assessment ? [para(`Perguntas marcadas “não sei” no diagnóstico: ${ctx.assessment.overall.unknownCount}.`)] : []),
    ], { visibility: "INTERNO" }),
  );

  // pendências totais no fim do capítulo de riscos
  const pending = sections.reduce((s, x) => s + countPending(x), 0);
  sections.find((s) => s.key === "riscos")!.blocks.push(h3("Pendências do documento"), para(`Itens marcados [PENDENTE] neste documento: ${pending}. Cada um precisa ser confirmado com o cliente antes da aprovação.`));

  return { content: { sections }, sources: sourcesOf(ctx, ev.items) };
}

export function buildPop(ctx: GenContext, code: string): { content: DocContent; sources: Sources } {
  const p = ctx.processes.find((x) => x.code === code);
  if (!p) throw new Error(`Processo ${code} não está no projeto`);
  const origin = `Ficha ${p.code} v${p.version} + dados do projeto`;
  const sections: Section[] = [
    sec("capa", "Identificação do POP", "Cadastro + projeto", [
      table(["Item", "Informação"], [["Empresa", ctx.client.name], ["Processo", `${p.code} — ${p.name}`], ["Projeto", ctx.project?.name ?? P("projeto")], ["Elaborado por", ctx.brand.companyName], ["Classificação", ctx.brand.confidentiality]]),
      callout("Itens marcados [PENDENTE: …] precisam ser confirmados com o cliente antes da aprovação."),
    ]),
    ...processParts(ctx, p).map((part) => sec(`pop:${part.key}`, part.title, origin, part.blocks, { processCode: part.key === "responsabilidades" || part.key === "execucao" ? p.code : undefined })),
  ];
  const checklists = p.tasks.filter((t) => t.checklist.length);
  sections.push(
    sec("pop:checklist", "Checklist operacional", "Plano de ação do projeto", checklists.length ? checklists.flatMap((t) => [para(t.title), list(t.checklist)]) : [list((p.content?.steps ?? [P("itens do checklist")]).map((s) => `☐ ${s}`))]),
  );
  return { content: { sections }, sources: sourcesOf({ ...ctx, processes: [p] }, []) };
}

function sourcesOf(ctx: GenContext, evidence: EvidenceSource[]): Sources {
  return {
    clientId: ctx.client.id,
    clientName: ctx.client.name,
    projectId: ctx.project?.id ?? null,
    assessmentId: ctx.assessment?.id ?? null,
    assessmentLabel: ctx.assessment?.label ?? null,
    processes: ctx.processes.map((p) => ({ code: p.code, version: p.version })),
    opportunityIds: ctx.opportunities.filter((o) => o.inProject).map((o) => o.id),
    evidence,
    generatedAt: new Date().toISOString(),
    generator: GENERATOR_VERSION,
  };
}
