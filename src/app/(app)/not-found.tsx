import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="w-full max-w-[1240px] px-4 pt-10 md:px-8">
      <div className="rounded-[12px] border border-border bg-surface">
        <EmptyState
          icon={SearchX}
          title="Registro não encontrado"
          description="O endereço não existe ou você não tem acesso a este cliente."
          action={<Button asChild><Link href="/dashboard">Ir para a Visão geral</Link></Button>}
        />
      </div>
    </div>
  );
}
