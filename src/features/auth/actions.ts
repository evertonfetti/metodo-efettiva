"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, revokeSessionToken } from "@/features/auth/service";
import { AppError } from "@/lib/errors";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/lib/security/session";
import { logger } from "@/lib/logger";

export type LoginState = { error?: string; email?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  try {
    const h = await headers();
    const { token, expiresAt } = await authenticate({ email, password: String(formData.get("password") ?? "") }, h.get("user-agent"));
    await setSessionCookie(token, expiresAt);
  } catch (err) {
    if (err instanceof AppError) return { error: err.message, email };
    if (err && typeof err === "object" && "issues" in err) return { error: "Informe e-mail e senha válidos.", email };
    logger.error({ err }, "falha no login");
    return { error: "Não foi possível entrar agora. Tente novamente.", email };
  }
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logoutAction() {
  await revokeSessionToken(await readSessionToken());
  await clearSessionCookie();
  redirect("/login");
}
