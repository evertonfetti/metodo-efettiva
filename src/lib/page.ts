import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";

/** Em páginas: registro inexistente/não autorizado vira 404 (nunca tela de erro genérica). */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof AppError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
}
