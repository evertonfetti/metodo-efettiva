import { blockTexts, filterForAudience, PENDING_RE, sectionText, type Block, type DocContent, type Sources } from "./content";

export type QaItem = { id: string; level: "ok" | "error" | "warn"; message: string };
export type QaFacts = {
  documentClientId: string;
  catalogCodes: Set<string>;
  approvedContentModified: boolean;
  assessmentCoverage: number | null;
  assessmentFinalized: boolean;
  tasksWithoutDueDate: number;
  hasCommercialData: boolean;
};

const PROMISE_RE = /\b(garantimos|garantid[oa]s?|garantia de (resultado|aumento|crescimento)|com certeza (vai|ir[aá])|aumento (garantido|de \d+\s?%)|vai (dobrar|triplicar))/i;
const EV_RE = /\bEV-\d{3}\b/g;
const isPending = (s: string | undefined) => !s?.trim() || /\[PENDENTE/.test(s);

function tables(content: DocContent, kind: string) {
  return content.sections.flatMap((s) => s.blocks.filter((b): b is Extract<Block, { type: "table" }> => b.type === "table" && b.kind === kind).map((t) => ({ section: s, table: t })));
}
const col = (headers: string[], name: string) => headers.findIndex((h) => h.toLowerCase().startsWith(name));

/**
 * Controle de qualidade pré-exportação/aprovação (seção 9.4).
 * `error` bloqueia aprovação da versão e exportação final; `warn` apenas alerta.
 */
export function runQa(content: DocContent, sources: Sources, f: QaFacts): QaItem[] {
  const out: QaItem[] = [];
  const add = (id: string, ok: boolean, okMsg: string, failMsg: string, level: "error" | "warn" = "error") => out.push({ id, level: ok ? "ok" : level, message: ok ? okMsg : failMsg });

  // Cliente certo
  add("client", sources.clientId === f.documentClientId, "Documento pertence ao cliente correto", "clientId das fontes diverge do cliente do documento");

  // Processos existem
  const codes = new Set([...sources.processes.map((p) => p.code), ...content.sections.map((s) => s.processCode).filter((x): x is string => !!x)]);
  const missing = [...codes].filter((c) => !f.catalogCodes.has(c));
  add("processes", missing.length === 0, "Processos existem na biblioteca", `Processo inexistente na biblioteca: ${missing.join(", ")}`);

  // KPI com fórmula; resultado financeiro com fonte
  const kpiTables = tables(content, "kpi");
  let noFormula = 0, noSource = 0, noBaseline = 0, noTarget = 0;
  for (const { table } of kpiTables) {
    const fi = col(table.headers, "fórmula"), si = col(table.headers, "fonte"), bi = col(table.headers, "baseline"), mi = col(table.headers, "meta");
    for (const r of table.rows) {
      if (fi < 0 || isPending(r[fi])) noFormula++;
      const base = bi >= 0 ? (r[bi] ?? "") : "";
      if (/\d/.test(base) && !/Indispon/i.test(base) && (si < 0 || isPending(r[si]))) noSource++;
      if (!base || /Indispon/i.test(base)) noBaseline++;
      if (mi >= 0 && isPending(r[mi])) noTarget++;
    }
  }
  add("kpi-formula", noFormula === 0, "Todo KPI tem fórmula", `${noFormula} indicador(es) sem fórmula definida`);
  add("financial-source", noSource === 0, "Valores com fonte identificada", `${noSource} valor(es) de baseline sem fonte`);

  // Evidências citadas existem
  const known = new Set(sources.evidence.map((e) => e.ref));
  const cited = new Set(content.sections.flatMap((s) => sectionText(s).match(EV_RE) ?? []));
  const invalid = [...cited].filter((r) => !known.has(r));
  add("evidence", invalid.length === 0, "Referências de evidência válidas", `Referência de evidência inexistente: ${invalid.join(", ")}`);

  // Promessa de resultado sem premissa
  const promises = content.sections.filter((s) => s.visibility === "CLIENTE" && PROMISE_RE.test(sectionText(s)) && !/premissa/i.test(sectionText(s)));
  add("promises", promises.length === 0, "Nenhuma promessa de resultado sem premissa", `Promessa de resultado sem premissa em: ${promises.map((s) => s.title).join(", ")}`);

  // Audiência
  const leaked = filterForAudience(content, "CLIENTE").sections.filter((s) => s.visibility !== "CLIENTE");
  const internal = content.sections.filter((s) => s.visibility === "INTERNO").length;
  add("audience", leaked.length === 0, internal ? `Nenhuma seção interna no arquivo do cliente (${internal} excluída(s))` : "Nenhuma seção interna no documento", "Seção INTERNO no arquivo do cliente");

  // Revisão aprovada não modificada
  add("immutable", !f.approvedContentModified, "Versão aprovada íntegra", "Conteúdo de versão aprovada foi alterado sem nova versão");

  // POP: responsável e ação
  const procSections = content.sections.filter((s) => s.processCode);
  const popIssues: string[] = [];
  for (const code of new Set(procSections.map((s) => s.processCode!))) {
    const blocks = procSections.filter((s) => s.processCode === code).flatMap((s) => s.blocks);
    const resp = blocks.find((b): b is Extract<Block, { type: "table" }> => b.type === "table" && b.kind === "responsibilities");
    const steps = blocks.find((b): b is Extract<Block, { type: "list" }> => b.type === "list" && b.ordered);
    if (!resp || !resp.rows.some((r) => r.every((c) => !isPending(c)))) popIssues.push(`${code}: sem responsável definido`);
    if (!steps || !steps.items.some((i) => !isPending(i))) popIssues.push(`${code}: sem passos de execução`);
  }
  add("pop", popIssues.length === 0, "POPs com responsável e passos", popIssues.join("; "));

  // Aprovação das seções (bloqueia versão final)
  const notApproved = content.sections.filter((s) => s.state !== "APPROVED").length;
  add("sections", notApproved === 0, "Todas as seções aprovadas", `${notApproved} seção(ões) sem aprovação (bloqueia versão final)`);

  // Alertas
  const pending = content.sections.reduce((n, s) => n + (sectionText(s).match(PENDING_RE) ?? []).length, 0);
  if (f.assessmentCoverage == null) out.push({ id: "assessment", level: "warn", message: "Sem diagnóstico vinculado" });
  else if (!f.assessmentFinalized || f.assessmentCoverage < 0.8) out.push({ id: "assessment", level: "warn", message: `Questionário incompleto (cobertura ${Math.round(f.assessmentCoverage * 100)}%${f.assessmentFinalized ? "" : ", não fechado"})` });
  if (!f.hasCommercialData) out.push({ id: "history", level: "warn", message: "Sem histórico comercial importado: baselines indisponíveis" });
  if (noBaseline) out.push({ id: "baseline", level: "warn", message: `Baseline ausente em ${noBaseline} indicador(es)` });
  if (noTarget) out.push({ id: "targets", level: "warn", message: `${noTarget} meta(s) ainda não validada(s)` });
  if (f.tasksWithoutDueDate) out.push({ id: "dates", level: "warn", message: `${f.tasksWithoutDueDate} tarefa(s) sem data de implantação` });
  if (pending) out.push({ id: "pending", level: "warn", message: `${pending} marcador(es) [PENDENTE] no texto` });
  return out;
}

export const qaBlocking = (items: QaItem[]) => items.filter((i) => i.level === "error");
export { blockTexts };
