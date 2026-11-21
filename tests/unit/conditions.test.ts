import { describe, expect, it } from "vitest";
import { conditionSchema, evaluate, questionVisibility } from "@/features/assessments/conditions";

const ctx = { segment: "DISTRIBUICAO", answers: { DIAG11_03: { kind: "scale" as const, value: 1 }, X: { kind: "unknown" as const } } };

describe("DSL de condições", () => {
  it("avalia segmento, respostas e combinadores", () => {
    expect(evaluate({ op: "equals", field: "segment", value: "DISTRIBUICAO" }, ctx)).toBe(true);
    expect(evaluate({ op: "in", field: "segment", values: ["VAREJO", "DISTRIBUICAO"] }, ctx)).toBe(true);
    expect(evaluate({ op: "lessThan", field: "answer:DIAG11_03", value: 3 }, ctx)).toBe(true);
    expect(evaluate({ op: "and", conditions: [{ op: "equals", field: "segment", value: "DISTRIBUICAO" }, { op: "greaterThan", field: "answer:DIAG11_03", value: 2 }] }, ctx)).toBe(false);
    expect(evaluate({ op: "not", condition: { op: "equals", field: "segment", value: "VAREJO" } }, ctx)).toBe(true);
  });

  it("'não sei' e resposta ausente não satisfazem comparação", () => {
    expect(evaluate({ op: "lessThan", field: "answer:X", value: 3 }, ctx)).toBe(false);
    expect(evaluate({ op: "lessThan", field: "answer:NAO_EXISTE", value: 3 }, ctx)).toBe(false);
  });

  it("rejeita campos e operadores fora da DSL (nada de código)", () => {
    expect(conditionSchema.safeParse({ op: "equals", field: "process.env", value: 1 }).success).toBe(false);
    expect(conditionSchema.safeParse({ op: "eval", code: "1+1" }).success).toBe(false);
  });

  it("visibilidade: SHOW habilita pergunta condicional; HIDE prevalece; regra inválida é ignorada", () => {
    const show = { effect: "SHOW" as const, conditionJson: { op: "equals", field: "segment", value: "DISTRIBUICAO" }, reason: "segmento", active: true };
    const hide = { effect: "HIDE" as const, conditionJson: { op: "equals", field: "segment", value: "DISTRIBUICAO" }, reason: "oculta", active: true };
    expect(questionVisibility(false, [show], ctx)).toEqual({ visible: true, reason: "segmento" });
    expect(questionVisibility(true, [hide], ctx).visible).toBe(false);
    expect(questionVisibility(false, [{ ...show, active: false }], ctx).visible).toBe(false);
    expect(questionVisibility(true, [{ ...hide, conditionJson: { op: "bad" } }], ctx).visible).toBe(true);
  });
});
