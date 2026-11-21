import { describe, expect, it } from "vitest";
import { scoreDomains, overallScore, type ScoringQuestion } from "@/features/assessments/scoring";
import type { AnswerValue } from "@/features/assessments/conditions";

const q = (code: string, extra: Partial<ScoringQuestion> = {}): ScoringQuestion => ({ code, domainCode: "D1", type: "SCALE_0_5", weight: 1, visible: true, ...extra });

describe("score do questionário (teste obrigatório 6)", () => {
  it("'não se aplica' não penaliza: sai do denominador", () => {
    const [d] = scoreDomains([q("A"), q("B")], { A: { kind: "scale", value: 4 }, B: { kind: "na" } });
    expect(d!.weightedScore).toBe(4);
    expect(d!.applicableCount).toBe(1);
    expect(d!.coverage).toBe(1);
  });

  it("'não sei' não vira zero: reduz cobertura, não o score", () => {
    const [d] = scoreDomains([q("A"), q("B")], { A: { kind: "scale", value: 4 }, B: { kind: "unknown" } });
    expect(d!.weightedScore).toBe(4);
    expect(d!.coverage).toBe(0.5);
    expect(d!.unknownCount).toBe(1);
  });

  it("só 'não sei' → score indisponível (null), nunca 0", () => {
    const [d] = scoreDomains([q("A")], { A: { kind: "unknown" } });
    expect(d!.weightedScore).toBeNull();
    expect(overallScore([d!]).weightedScore).toBeNull();
  });

  it("pergunta oculta por regra e pergunta de peso 0 não entram", () => {
    const answers: Record<string, AnswerValue> = { A: { kind: "scale", value: 2 }, B: { kind: "scale", value: 0 }, C: { kind: "text", value: "CRM X" } };
    const [d] = scoreDomains([q("A"), q("B", { visible: false }), q("C", { type: "TEXT", weight: 0 })], answers);
    expect(d!.weightedScore).toBe(2);
    expect(d!.applicableCount).toBe(1);
  });

  it("média ponderada pelos pesos", () => {
    const [d] = scoreDomains([q("A", { weight: 3 }), q("B", { weight: 1 })], { A: { kind: "scale", value: 4 }, B: { kind: "scale", value: 0 } });
    expect(d!.weightedScore).toBe(3);
  });
});
