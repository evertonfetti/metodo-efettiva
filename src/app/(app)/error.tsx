"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Erro recuperável dentro do shell, sempre com opção de tentar de novo. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex w-full max-w-[1240px] flex-col px-4 pt-10 md:px-8">
      <div role="alert" className="flex flex-col items-start gap-3 rounded-[12px] border border-border-alert bg-surface p-6">
        <p className="flex items-center gap-2 text-[17px] font-extrabold text-err">
          <TriangleAlert className="size-5" aria-hidden="true" /> Não foi possível carregar esta tela
        </p>
        <p className="text-sm text-text-muted">
          Ocorreu um erro ao buscar os dados. Nenhuma alteração foi perdida. {error.digest ? `Código: ${error.digest}` : ""}
        </p>
        <Button onClick={reset}>Tentar de novo</Button>
      </div>
    </div>
  );
}
