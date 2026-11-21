import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSessionToken, type SessionUser } from "@/features/auth/service";
import { AppError } from "@/lib/errors";

export const SESSION_COOKIE = "efettiva_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && (process.env.APP_URL ?? "").startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionToken() {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Usuário da sessão atual (memoizado por requisição). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return validateSessionToken(await readSessionToken());
});

/** Para páginas: redireciona ao login se não houver sessão válida. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Para APIs e server actions: lança 401 se não houver sessão válida. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Sessão expirada. Entre novamente.");
  return user;
}
