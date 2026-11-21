import type { Metadata } from "next";
import { Paperclip } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { projectFiles } from "@/features/results/service";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Arquivos do projeto" };

export default async function FilesPage({ params }: { params: Promise<{ clientId: string; projectId: string }> }) {
  const user = await requirePageUser();
  const { clientId, projectId } = await params;
  const files = await orNotFound(projectFiles(user, clientId, projectId));
  return files.length === 0 ? (
    <Card><EmptyState icon={Paperclip} title="Nenhuma evidência registrada" description="Evidências de tarefas e processos (arquivos, links e notas) aparecem aqui." /></Card>
  ) : (
    <Card aria-label="Evidências do projeto">
      <ul className="divide-y divide-border">
        {files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <Paperclip className="size-4 text-text-subtle" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {f.file ? <a className="font-bold text-navy hover:underline" href={`/api/v1/clients/${clientId}/files/${f.file.id}`}>{f.file.originalName}</a> : f.url ? <a className="font-bold text-navy hover:underline" href={f.url} target="_blank" rel="noreferrer">{f.url}</a> : <span className="font-bold">{f.text}</span>}
              <span className="block text-xs text-text-subtle">{f.task ? `Tarefa: ${f.task.title}` : f.projectProcess ? `Processo ${f.projectProcess.process.code}` : ""} · {formatDateTime(f.createdAt)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
