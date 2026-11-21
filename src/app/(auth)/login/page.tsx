import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/security/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-[400px] rounded-[12px] bg-surface p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span aria-hidden="true" className="flex size-[34px] items-center justify-center rounded-[8px] bg-amber text-[17px] font-extrabold text-navy">
            E
          </span>
          <span className="flex flex-col">
            <span className="text-base font-extrabold text-navy">Efettiva OS</span>
            <span className="text-xs text-text-muted">Uso interno · Efettiva Gestão</span>
          </span>
        </div>
        <h1 className="mb-1 text-[22px] font-extrabold text-navy">Entrar</h1>
        <p className="mb-6 text-sm text-text-muted">Acesso restrito à equipe da Efettiva.</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
