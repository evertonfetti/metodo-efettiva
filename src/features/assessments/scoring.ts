import type { AnswerValue } from "./conditions";

/**
 * Score do diagnóstico (RF-023/RF-024), função pura:
 * - só perguntas SCALE_0_5 visíveis e com peso > 0 entram;
 * - "não se aplica" e perguntas ocultas saem do denominador (não penalizam);
 * - "não sei" e sem resposta NÃO viram zero: contam como lacuna (reduzem cobertura, não o score);
 * - score = média ponderada 0–5 das respostas válidas; sem nenhuma resposta válida → null.
 */
export type ScoringQuestion = { code: string; domainCode: string; type: string; weight: number; visible: boolean };

export type DomainScore = {
  domainCode: string;
  weightedScore: number | null;
  answeredWeight: number;
  applicableWeight: number;
  answeredCount: number;
  applicableCount: number;
  unknownCount: number;
  notApplicableCount: number;
  coverage: number;
};

export function scoreDomains(questions: ScoringQuestion[], answers: Record<string, AnswerValue | undefined>): DomainScore[] {
  const byDomain = new Map<string, DomainScore & { sum: number }>();
  for (const q of questions) {
    if (!byDomain.has(q.domainCode)) {
      byDomain.set(q.domainCode, { domainCode: q.domainCode, weightedScore: null, answeredWeight: 0, applicableWeight: 0, answeredCount: 0, applicableCount: 0, unknownCount: 0, notApplicableCount: 0, coverage: 0, sum: 0 });
    }
    const d = byDomain.get(q.domainCode)!;
    if (q.type !== "SCALE_0_5" || q.weight <= 0 || !q.visible) continue;
    const a = answers[q.code];
    if (a?.kind === "na") {
      d.notApplicableCount++;
      continue;
    }
    d.applicableWeight += q.weight;
    d.applicableCount++;
    if (a?.kind === "scale") {
      d.answeredWeight += q.weight;
      d.answeredCount++;
      d.sum += a.value * q.weight;
    } else if (a?.kind === "unknown") {
      d.unknownCount++;
    }
  }
  return [...byDomain.values()].map(({ sum, ...d }) => ({
    ...d,
    weightedScore: d.answeredWeight > 0 ? round(sum / d.answeredWeight, 3) : null,
    coverage: d.applicableWeight > 0 ? round(d.answeredWeight / d.applicableWeight, 4) : 0,
  }));
}

export function overallScore(domains: DomainScore[]) {
  const answeredWeight = domains.reduce((s, d) => s + d.answeredWeight, 0);
  const applicableWeight = domains.reduce((s, d) => s + d.applicableWeight, 0);
  const sum = domains.reduce((s, d) => s + (d.weightedScore ?? 0) * d.answeredWeight, 0);
  return {
    weightedScore: answeredWeight > 0 ? round(sum / answeredWeight, 3) : null,
    coverage: applicableWeight > 0 ? round(answeredWeight / applicableWeight, 4) : 0,
    answeredCount: domains.reduce((s, d) => s + d.answeredCount, 0),
    applicableCount: domains.reduce((s, d) => s + d.applicableCount, 0),
    unknownCount: domains.reduce((s, d) => s + d.unknownCount, 0),
  };
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
