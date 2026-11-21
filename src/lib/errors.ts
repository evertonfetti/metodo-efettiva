import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_STATE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INVALID_STATE: 409,
  INTERNAL: 500,
};

/** Erro de domínio com código padronizado e mensagem segura (pt-BR) para o usuário. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (what = "Registro") => new AppError("NOT_FOUND", `${what} não encontrado.`);
export const forbidden = () => new AppError("FORBIDDEN", "Você não tem permissão para esta ação.");

/** Converte qualquer erro em resposta `{ code, message, details?, traceId }`. */
export function errorResponse(err: unknown): NextResponse {
  const traceId = randomUUID();
  if (err instanceof AppError) {
    return NextResponse.json({ code: err.code, message: err.message, details: err.details, traceId }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { code: "VALIDATION", message: "Dados inválidos.", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })), traceId },
      { status: 422 },
    );
  }
  logger.error({ err, traceId }, "erro não tratado");
  return NextResponse.json({ code: "INTERNAL", message: "Erro interno. Tente novamente.", traceId }, { status: 500 });
}
