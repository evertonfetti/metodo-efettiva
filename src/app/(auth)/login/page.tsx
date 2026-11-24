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
        <div className="mb-6 flex flex-col gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo_horizontal.png" alt="Efettiva" width={200} height={42} className="h-auto w-[200px]" />
          <span className="text-xs text-text-muted">Efettiva OS · Uso interno</span>
        </div>
        <h1 className="mb-1 text-[22px] font-extrabold text-navy">Entrar</h1>
        <p className="mb-6 text-sm text-text-muted">Acesso restrito à equipe da Efettiva.</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
