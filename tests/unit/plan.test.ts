import { describe, expect, it } from "vitest";
import { buildPlan, planWindows } from "@/features/projects/plan";
import { dateOnly, easter, isBusinessDay, toISODate } from "@/lib/dates";
import { priorityScore, sortOpportunities, transitionNeedsReason } from "@/features/opportunities/scoring";
import { processTransitionIssues, overdueDays } from "@/features/projects/rules";
import { suggestProcessCodes } from "@/features/processes/mapping";

describe("datas e feriados", () => {
  it("Páscoa e feriados móveis/fixos", () => {
    expect(toISODate(easter(2026))).toBe("2026-04-05");
    expect(isBusinessDay(dateOnly(2026, 4, 3))).toBe(false); // Sexta-feira Santa
    expect(isBusinessDay(dateOnly(2026, 11, 20))).toBe(false); // Consciência Negra
    expect(isBusinessDay(dateOnly(2026, 11, 21))).toBe(false); // sábado
    expect(isBusinessDay(dateOnly(2026, 11, 23))).toBe(true);
  });
});

describe("plano 30/60/90", () => {
  const start = dateOnly(2026, 11, 2);
  const target = dateOnly(2027, 1, 31);
  const procs = [
    { projectProcessId: "pp1", code: "C05", name: "Recuperação de inativos", version: 2, content: { steps: ["A", "B", "C", "D", "E"], kpis: [], kpiFormulas: {}, validation: "Duas rotinas semanais auditadas; vendedor treinado" } },
    { projectProcessId: "pp2", code: "D03", name: "Curva ABC de clientes", version: 1, content: null },
  ];

  it("janelas proporcionais e prazos em dia útil dentro do projeto", () => {
    const w = planWindows(start, target);
    expect(w[0].start).toEqual(start);
    expect(w[2].end).toEqual(target);
    const plan = buildPlan(start, target, procs);
    for (const t of plan) {
      expect(isBusinessDay(t.dueDate)).toBe(true);
      expect(t.dueDate.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(t.dueDate.getTime()).toBeLessThanOrEqual(target.getTime());
    }
  });

  it("passos da ficha viram tarefas; processo sem ficha recebe tarefas genéricas; chaves únicas", () => {
    const plan = buildPlan(start, target, procs);
    const keys = plan.map((t) => t.planKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(plan.filter((t) => t.planKey.startsWith("C05:step")).length).toBe(5);
    expect(plan.filter((t) => t.planKey.startsWith("C05:step") && t.window === 1).length).toBe(3);
    expect(keys).toContain("D03:map");
    expect(plan.find((t) => t.planKey === "C05:validate")!.checklist.map((c) => c.text)).toEqual(["Duas rotinas semanais auditadas", "Vendedor treinado"]);
    expect(plan.filter((t) => t.window === 3).length).toBe(4);
  });
});

describe("priorização", () => {
  it("I × C ÷ E com escala 1–5, máximo 25", () => {
    expect(priorityScore(5, 4, 2)).toBe(10);
    expect(priorityScore(5, 5, 1)).toBe(25);
    expect(priorityScore(3, 2, 4)).toBe(1.5);
    expect(() => priorityScore(6, 1, 1)).toThrow();
    expect(() => priorityScore(1, 1, 0)).toThrow();
  });
  it("risco crítico prevalece sobre o ranking; descartadas por último", () => {
    const sorted = sortOpportunities([
      { number: 1, criticalRisk: false, status: "APPROVED", priorityScore: 20 },
      { number: 2, criticalRisk: true, status: "DETECTED", priorityScore: 1.5 },
      { number: 3, criticalRisk: false, status: "DISMISSED", priorityScore: 25 },
      { number: 4, criticalRisk: false, status: "REVIEWED", priorityScore: 8 },
    ]);
    expect(sorted.map((s) => s.number)).toEqual([2, 1, 4, 3]);
  });
  it("motivo obrigatório em descarte, reabertura e retirada de aprovação", () => {
    expect(transitionNeedsReason("DETECTED", "DISMISSED")).toBe(true);
    expect(transitionNeedsReason("DISMISSED", "DETECTED")).toBe(true);
    expect(transitionNeedsReason("APPROVED", "REVIEWED")).toBe(true);
    expect(transitionNeedsReason("REVIEWED", "APPROVED")).toBe(false);
  });
});

describe("sugestão determinística de processos", () => {
  const catalog = ["C01", "C02", "C04", "C05", "C06", "V05", "D01"].map((code) => ({ code, domainCode: code[0]!, hasFullSheet: ["C01", "C04", "C05", "C06", "V05"].includes(code), active: true }));
  it("mapeia área do diagnóstico e só usa códigos do catálogo", () => {
    expect(suggestProcessCodes("DIAG05", catalog)).toEqual(["C05", "C04", "C01"]);
    expect(suggestProcessCodes("V", catalog)).toEqual(["V05"]);
    expect(suggestProcessCodes("ZZ", catalog)).toEqual([]);
  });
});

describe("critérios de Validado/Sustentado", () => {
  const base = { status: "ACTIVE" as const, tasksTotal: 3, tasksOpen: 0, evidenceCount: 1, ownerName: null, validatedAt: null };
  it("Validado exige execução, indicadores e evidência", () => {
    expect(processTransitionIssues({ ...base, tasksOpen: 1, evidenceCount: 0 }, "VALIDATED", {})).toHaveLength(3);
    expect(processTransitionIssues(base, "VALIDATED", { indicatorsChecked: true, indicatorsNote: "Reativação 12%" })).toEqual([]);
  });
  it("Sustentado exige Validado, responsável treinado e auditoria posterior", () => {
    const v = { ...base, status: "VALIDATED" as const, validatedAt: new Date("2026-12-10T15:00:00Z"), ownerName: "Gerente comercial" };
    expect(processTransitionIssues(v, "SUSTAINED", { clientOwnerTrained: true, auditDate: "2026-12-01", auditNote: "ok" })).toEqual(["A auditoria precisa ser posterior à validação."]);
    expect(processTransitionIssues(v, "SUSTAINED", { clientOwnerTrained: true, auditDate: "2027-01-15", auditNote: "Rotina mantida" })).toEqual([]);
    expect(processTransitionIssues(base, "SUSTAINED", {}).length).toBeGreaterThan(2);
  });
  it("tarefa vencida", () => {
    const today = dateOnly(2026, 11, 20);
    expect(overdueDays(dateOnly(2026, 11, 18), "TODO", today)).toBe(2);
    expect(overdueDays(dateOnly(2026, 11, 18), "DONE", today)).toBe(0);
    expect(overdueDays(null, "TODO", today)).toBe(0);
  });
});
