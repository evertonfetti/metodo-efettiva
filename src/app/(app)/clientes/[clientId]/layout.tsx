import { notFound } from "next/navigation";
import { Fragment } from "react";
import { requirePageUser } from "@/lib/security/session";
import { assertClientAccess } from "@/lib/security/access";
import { AppError } from "@/lib/errors";

/**
 * Layout do cliente: autorização no servidor antes de qualquer conteúdo.
 * A chave = clientId garante que nenhum estado do cliente anterior sobreviva à troca.
 */
export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const user = await requirePageUser();
  const { clientId } = await params;
  try {
    await assertClientAccess(user, clientId, "VIEW");
  } catch (err) {
    if (err instanceof AppError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
  return <Fragment key={clientId}>{children}</Fragment>;
}
