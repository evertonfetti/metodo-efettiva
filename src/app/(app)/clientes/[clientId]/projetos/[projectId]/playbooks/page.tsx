import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { requirePageUser } from "@/lib/security/session";
import { listDocuments } from "@/features/documents/service";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Playbooks do projeto" };

export default async function ProjectPlaybooksPage({ params }: { params: Promise<{ clientId: string; projectId: string }> }) {
  const user = await requirePageUser();
  const { clientId, projectId } = await params;
  const docs = await listDocuments(user, clientId, projectId);
  const canEdit = user.role !== "VIEWER";
  const gen = `/clientes/${clientId}/documentos?projeto=${projectId}`;
  return docs.length === 0 ? (
    <Card>
      <EmptyState icon={FileText} title="Nenhum playbook deste projeto" description="Gere o playbook completo ou POPs dos processos, sem IA, a partir do diagnóstico, da biblioteca e do plano." action={canEdit ? <Button asChild><Link href={gen}>Gerar documento</Link></Button> : undefined} />
    </Card>
  ) : (
    <Card aria-label="Documentos do projeto">
      <div className="flex justify-end border-b border-border px-5 py-3">{canEdit ? <Button asChild size="sm"><Link href={gen}>Gerar documento</Link></Button> : null}</div>
      <ul className="divide-y divide-border">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <Link href={`/clientes/${clientId}/documentos/${d.id}`} className="min-w-0 flex-1 font-bold text-navy hover:underline">{d.title}</Link>
            {d.latest ? <StatusBadge context="revision" value={d.latest.state} suffix={`· v${d.latest.version}`} /> : null}
            <span className="text-xs text-text-subtle">{formatDateTime(d.latest?.updatedAt ?? d.updatedAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
