import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AiProvider, GenerateInput, GenerateResult } from "./provider";

/**
 * Adaptador Anthropic (SDK oficial, server-side). Saída estruturada com schema Zod;
 * fallback de servidor em caso de recusa do modelo (`fallbacks: "default"`).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async generateStructured<T>(input: GenerateInput<T>): Promise<GenerateResult<T>> {
    const res = await this.client.beta.messages.parse(
      {
        model: input.model,
        max_tokens: input.maxOutputTokens,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
        output_config: { effort: input.effort, format: betaZodOutputFormat(input.schema) },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { timeout: input.timeoutMs },
    );
    const base = { model: res.model, tokensIn: res.usage?.input_tokens ?? null, tokensOut: res.usage?.output_tokens ?? null };
    if (res.stop_reason === "refusal") return { ...base, output: null, errorCode: "REFUSAL", errorMessage: "O provedor recusou a solicitação." };
    if (res.stop_reason === "max_tokens") return { ...base, output: null, errorCode: "MAX_TOKENS", errorMessage: "Resposta cortada pelo limite de tokens: aumente o limite ou reduza a seção." };
    if (!res.parsed_output) return { ...base, output: null, errorCode: "INVALID_OUTPUT", errorMessage: "Resposta fora do formato esperado." };
    return { ...base, output: res.parsed_output as T };
  }
}
