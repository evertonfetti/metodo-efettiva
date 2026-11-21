import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Estado padrão de formulários com server actions. */
export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> };

/** Converte erros de domínio/validação em estado de formulário (mensagens pt-BR, sem detalhes internos). */
export function actionError(err: unknown): ActionState {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of err.issues) {
      const k = i.path.join(".") || "_";
      if (!fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { error: "Revise os campos destacados.", fieldErrors };
  }
  if (err instanceof AppError) return { error: err.message };
  // redirect()/notFound() do Next lançam erros especiais que precisam propagar
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_")) throw err;
  logger.error({ err }, "erro em server action");
  return { error: "Não foi possível concluir a ação. Tente novamente." };
}

export function formToObject(fd: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = arrays.includes(key) ? fd.getAll(key).map(String).filter(Boolean) : String(fd.get(key) ?? "");
  }
  for (const a of arrays) if (!(a in out)) out[a] = [];
  return out;
}
