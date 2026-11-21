import { z } from "zod";

/**
 * DSL limitada de condições (seção 5.2): and / or / not / equals / in / greaterThan / lessThan.
 * Campos permitidos: "segment" ou "answer:<CÓDIGO_DA_PERGUNTA>". Nada é executado como código.
 */
export type Condition =
  | { op: "and"; conditions: Condition[] }
  | { op: "or"; conditions: Condition[] }
  | { op: "not"; condition: Condition }
  | { op: "equals"; field: string; value: string | number | boolean }
  | { op: "in"; field: string; values: (string | number)[] }
  | { op: "greaterThan"; field: string; value: number }
  | { op: "lessThan"; field: string; value: number };

const FIELD = z.string().regex(/^(segment|answer:[A-Z0-9_]{2,40})$/, "Campo de condição inválido.");

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("and"), conditions: z.array(conditionSchema).min(1).max(20) }),
    z.object({ op: z.literal("or"), conditions: z.array(conditionSchema).min(1).max(20) }),
    z.object({ op: z.literal("not"), condition: conditionSchema }),
    z.object({ op: z.literal("equals"), field: FIELD, value: z.union([z.string().max(100), z.number(), z.boolean()]) }),
    z.object({ op: z.literal("in"), field: FIELD, values: z.array(z.union([z.string().max(100), z.number()])).min(1).max(50) }),
    z.object({ op: z.literal("greaterThan"), field: FIELD, value: z.number() }),
    z.object({ op: z.literal("lessThan"), field: FIELD, value: z.number() }),
  ]),
);

/** Valor de resposta armazenado (valueJson). */
export type AnswerValue =
  | { kind: "scale"; value: number }
  | { kind: "unknown" }
  | { kind: "na" }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "choice"; value: string }
  | { kind: "choices"; value: string[] }
  | { kind: "date"; value: string };

export const answerValueSchema: z.ZodType<AnswerValue> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scale"), value: z.number().int().min(0).max(5) }),
  z.object({ kind: z.literal("unknown") }),
  z.object({ kind: z.literal("na") }),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }),
  z.object({ kind: z.literal("number"), value: z.number().finite() }),
  z.object({ kind: z.literal("text"), value: z.string().max(5000) }),
  z.object({ kind: z.literal("choice"), value: z.string().max(200) }),
  z.object({ kind: z.literal("choices"), value: z.array(z.string().max(200)).max(50) }),
  z.object({ kind: z.literal("date"), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);

export type ConditionContext = { segment: string; answers: Record<string, AnswerValue | undefined> };

/** Valor comparável de um campo; `undefined` quando ausente, "não sei" ou "não se aplica". */
function resolve(field: string, ctx: ConditionContext): string | number | boolean | undefined {
  if (field === "segment") return ctx.segment;
  const code = field.slice("answer:".length);
  const a = ctx.answers[code];
  if (!a) return undefined;
  switch (a.kind) {
    case "scale":
    case "number":
    case "boolean":
    case "text":
    case "choice":
    case "date":
      return a.value;
    default:
      return undefined;
  }
}

/** Avalia condição. Campo ausente nunca satisfaz comparação (exceto via `not`). */
export function evaluate(c: Condition, ctx: ConditionContext, depth = 0): boolean {
  if (depth > 10) return false;
  switch (c.op) {
    case "and":
      return c.conditions.every((x) => evaluate(x, ctx, depth + 1));
    case "or":
      return c.conditions.some((x) => evaluate(x, ctx, depth + 1));
    case "not":
      return !evaluate(c.condition, ctx, depth + 1);
    case "equals": {
      const v = resolve(c.field, ctx);
      return v !== undefined && v === c.value;
    }
    case "in": {
      const v = resolve(c.field, ctx);
      return v !== undefined && (c.values as (string | number | boolean)[]).includes(v);
    }
    case "greaterThan": {
      const v = resolve(c.field, ctx);
      return typeof v === "number" && v > c.value;
    }
    case "lessThan": {
      const v = resolve(c.field, ctx);
      return typeof v === "number" && v < c.value;
    }
  }
}

export type RuleLike = { effect: "SHOW" | "HIDE"; conditionJson: unknown; reason: string; active: boolean };
export type Visibility = { visible: boolean; reason?: string };

/**
 * Visibilidade de uma pergunta:
 * - visível por padrão se `applicableByDefault`; senão só quando alguma regra SHOW casar;
 * - qualquer regra HIDE que case oculta (prevalece).
 * Regras com JSON inválido são ignoradas (nunca quebram o questionário).
 */
export function questionVisibility(applicableByDefault: boolean, rules: RuleLike[], ctx: ConditionContext): Visibility {
  let visible = applicableByDefault;
  let reason: string | undefined;
  for (const r of rules) {
    if (!r.active || r.effect !== "SHOW") continue;
    const parsed = conditionSchema.safeParse(r.conditionJson);
    if (parsed.success && evaluate(parsed.data, ctx)) {
      visible = true;
      reason = r.reason;
      break;
    }
  }
  for (const r of rules) {
    if (!r.active || r.effect !== "HIDE") continue;
    const parsed = conditionSchema.safeParse(r.conditionJson);
    if (parsed.success && evaluate(parsed.data, ctx)) return { visible: false, reason: r.reason };
  }
  return { visible, reason };
}
