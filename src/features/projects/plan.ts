import { addDays, businessDayOnOrAfter, businessDayOnOrBefore, diffDays } from "@/lib/dates";
import type { ProcessContent } from "@/features/processes/content";

export type PlanProcess = { projectProcessId: string; code: string; name: string; version: number; content: ProcessContent | null };
export type PlannedTask = {
  planKey: string;
  projectProcessId: string | null;
  title: string;
  description: string;
  window: 1 | 2 | 3;
  dueDate: Date;
  priority: "LOW" | "MEDIUM" | "HIGH";
  checklist: { text: string; done: boolean }[];
};

export const WINDOW_LABELS: Record<1 | 2 | 3, { title: string; summary: string }> = {
  1: { title: "Ativar", summary: "Piloto dos processos e primeiros passos" },
  2: { title: "Estruturar", summary: "POPs, treinamento e rotina" },
  3: { title: "Validar", summary: "Auditoria, evidências e transferência" },
};

/** Limites das janelas 30/60/90 proporcionais à duração real do projeto (mínimo 3 dias por janela). */
export function planWindows(start: Date, target: Date) {
  const total = Math.max(diffDays(start, target), 9);
  const end = (i: number) => addDays(start, Math.round((total * i) / 3));
  return [
    { window: 1 as const, start, end: end(1) },
    { window: 2 as const, start: addDays(end(1), 1), end: end(2) },
    { window: 3 as const, start: addDays(end(2), 1), end: end(3) },
  ] as const;
}

const splitChecklist = (text?: string) =>
  (text ?? "")
    .split(/;\s+|\.\s+(?=[A-ZÁÉÍÓÚ])/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 3)
    .map((s) => ({ text: s[0]!.toUpperCase() + s.slice(1), done: false }));

/**
 * Plano 30/60/90 determinístico (RF-071) a partir dos processos do projeto:
 * - janela 1 (Ativar): ~60% dos passos da ficha (piloto);
 * - janela 2 (Estruturar): passos restantes + POP/treinamento;
 * - janela 3 (Validar): critérios de validação da ficha + transferência ao cliente.
 * Prazos distribuídos na janela e ajustados para dia útil (fins de semana e feriados nacionais).
 * `planKey` estável garante idempotência ao regenerar.
 */
export function buildPlan(start: Date, target: Date, processes: PlanProcess[]): PlannedTask[] {
  const [w1, w2, w3] = planWindows(start, target);
  const due = (w: { start: Date; end: Date }, idx: number, count: number) => {
    const span = diffDays(w.start, w.end);
    const d = addDays(w.start, Math.round((span * (idx + 1)) / count));
    return businessDayOnOrBefore(d, w.start);
  };

  const tasks: PlannedTask[] = [
    {
      planKey: "kickoff",
      projectProcessId: null,
      title: "Aprovar escopo, cronograma e responsáveis do projeto",
      description: "Reunião de abertura com o patrocinador: escopo, processos, responsáveis do cliente e forma de acompanhamento.",
      window: 1,
      dueDate: businessDayOnOrAfter(addDays(start, Math.min(5, diffDays(w1.start, w1.end)))),
      priority: "HIGH",
      checklist: [
        { text: "Escopo e objetivos aprovados", done: false },
        { text: "Responsáveis do cliente definidos", done: false },
        { text: "Rotina de acompanhamento combinada", done: false },
      ],
    },
  ];

  for (const p of processes) {
    const ref = `ficha ${p.code} v${p.version}`;
    const steps = p.content?.steps ?? [];
    if (steps.length > 0) {
      const inW1 = Math.ceil(steps.length * 0.6);
      steps.forEach((step, i) => {
        const w = i < inW1 ? w1 : w2;
        const idx = i < inW1 ? i : i - inW1;
        const count = i < inW1 ? inW1 : steps.length - inW1 + 1;
        tasks.push({
          planKey: `${p.code}:step:${i + 1}`,
          projectProcessId: p.projectProcessId,
          title: step,
          description: `Passo ${i + 1} de ${steps.length} da ${ref} (${p.name}). Adaptar à operação real do cliente.`,
          window: w.window,
          dueDate: due(w, idx, count),
          priority: i === 0 ? "HIGH" : "MEDIUM",
          checklist: [],
        });
      });
    } else {
      tasks.push(
        {
          planKey: `${p.code}:map`,
          projectProcessId: p.projectProcessId,
          title: `Mapear situação atual e requisitos: ${p.name}`,
          description: `Levantar como o processo acontece hoje, dados disponíveis e responsáveis (${ref}).`,
          window: 1,
          dueDate: due(w1, 0, 2),
          priority: "HIGH",
          checklist: [],
        },
        {
          planKey: `${p.code}:pilot`,
          projectProcessId: p.projectProcessId,
          title: `Desenhar e pilotar: ${p.name}`,
          description: `Definir passos, responsáveis e indicadores; rodar piloto controlado (${ref}).`,
          window: 1,
          dueDate: due(w1, 1, 2),
          priority: "MEDIUM",
          checklist: [],
        },
      );
    }
    tasks.push(
      {
        planKey: `${p.code}:pop`,
        projectProcessId: p.projectProcessId,
        title: `Padronizar ${p.code}: POP e treinamento da equipe`,
        description: `Registrar o procedimento aprovado e treinar quem executa (${ref}).`,
        window: 2,
        dueDate: due(w2, 0, 1),
        priority: "MEDIUM",
        checklist: [
          { text: "POP revisado com o responsável do cliente", done: false },
          { text: "Equipe treinada", done: false },
        ],
      },
      {
        planKey: `${p.code}:validate`,
        projectProcessId: p.projectProcessId,
        title: `Validar ${p.code}: execução, indicadores e evidências`,
        description: p.content?.validation ? `Critério da ficha: ${p.content.validation}` : `Confirmar execução do processo, medir indicadores e registrar evidências (${ref}).`,
        window: 3,
        dueDate: due(w3, 0, 2),
        priority: "HIGH",
        checklist: p.content?.validation
          ? splitChecklist(p.content.validation)
          : [
              { text: "Processo executado conforme desenho", done: false },
              { text: "Indicadores medidos", done: false },
              { text: "Evidências registradas", done: false },
            ],
      },
      {
        planKey: `${p.code}:handover`,
        projectProcessId: p.projectProcessId,
        title: `Transferir rotina de ${p.code} ao responsável do cliente`,
        description: "Garantir que o cliente opera sozinho e agendar auditoria posterior (critério de Sustentado).",
        window: 3,
        dueDate: due(w3, 1, 2),
        priority: "MEDIUM",
        checklist: [
          { text: "Responsável do cliente treinado", done: false },
          { text: "Auditoria posterior agendada", done: false },
        ],
      },
    );
  }
  return tasks;
}
