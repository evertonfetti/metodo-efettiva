import type { z } from "zod";

/**
 * Provedor de IA desacoplado (RF-090). Só gera saída estruturada validada por Zod;
 * não tem ferramentas, não acessa banco nem executa ações (8.6).
 */
export type GenerateInput<T> = {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  model: string;
  effort: "low" | "medium" | "high";
  maxOutputTokens: number;
  timeoutMs: number;
};
export type GenerateResult<T> = {
  output: T | null;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  errorCode?: "REFUSAL" | "MAX_TOKENS" | "INVALID_OUTPUT";
  errorMessage?: string;
};
export interface AiProvider {
  readonly name: string;
  generateStructured<T>(input: GenerateInput<T>): Promise<GenerateResult<T>>;
}

/** Preço por 1M tokens (US$) para estimar custo; modelos fora da tabela ficam sem estimativa. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
export const estimateCost = (model: string, tokensIn: number, tokensOut: number) => {
  const p = PRICES[model];
  return p ? (tokensIn * p.input + tokensOut * p.output) / 1_000_000 : null;
};

let override: AiProvider | null | undefined;
/** Somente testes: injeta provedor falso (ou `null` para simular "sem chave"). */
export function setAiProviderForTests(p: AiProvider | null | undefined) {
  override = p;
}

export const aiConfigured = () => (override !== undefined ? override !== null : !!process.env.ANTHROPIC_API_KEY?.trim());

/** Provedor ativo, ou `null` sem chave configurada (modo sem IA continua funcional). */
export async function getAiProvider(): Promise<AiProvider | null> {
  if (override !== undefined) return override;
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
  const { AnthropicProvider } = await import("./anthropic");
  return new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
}
