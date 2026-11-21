import { questionVisibility, type AnswerValue, type RuleLike } from "./conditions";
import { scoreDomains, overallScore } from "./scoring";

/** Módulo puro (sem banco): usado no servidor e no navegador para visibilidade e scores idênticos. */

export type QuestionView = {
  id: string;
  code: string;
  domainCode: string;
  title: string;
  type: string;
  weight: number;
  options: string[] | null;
  guidance: string | null;
  allowUnknown: boolean;
  allowNotApplicable: boolean;
  allowEvidence: boolean;
  allowNotes: boolean;
  applicableByDefault: boolean;
  rules: RuleLike[];
};

export type AnswerView = {
  questionCode: string;
  value: AnswerValue;
  confidence: string;
  respondent: string | null;
  notes: string | null;
  updatedAt: string;
  evidences: { id: string; note: string | null; url: string | null; file: { id: string; name: string; bytes: number } | null; createdAt: string }[];
};

/** Visibilidade + scores (mesma função pura usada no navegador). */
export function computeScores(segment: string, questions: QuestionView[], answers: Record<string, Pick<AnswerView, "value"> | undefined>) {
  const answerValues: Record<string, AnswerValue | undefined> = {};
  for (const [k, v] of Object.entries(answers)) answerValues[k] = v?.value;
  const ctx = { segment, answers: answerValues };
  const visibility: Record<string, { visible: boolean; reason?: string }> = {};
  for (const q of questions) visibility[q.code] = questionVisibility(q.applicableByDefault, q.rules, ctx);
  const domainScores = scoreDomains(
    questions.map((q) => ({ code: q.code, domainCode: q.domainCode, type: q.type, weight: q.weight, visible: visibility[q.code]!.visible })),
    answerValues,
  );
  return { visibility, domainScores, overall: overallScore(domainScores) };
}

