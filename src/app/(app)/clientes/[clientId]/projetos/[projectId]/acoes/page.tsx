import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ProcessCodeChip } from "@/components/processes/process-chip";
import { Timeline306090 } from "@/components/projects/timeline";
import { TaskBoard, type BoardTask } from "@/components/projects/task-board";
import { GeneratePlanButton } from "@/components/projects/project-actions";
import { requirePageUser } from "@/lib/security/session";
import { assignableUsers, getProject, listTasks, taskFilterSchema } from "@/features/projects/service";
import { todayDateOnly, toISODate } from "@/lib/dates";
import { formatShortDate, formatShortDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Plano de ação" };

export default async function ProjectActionsPage({ params, searchParams }: { params: Promise<{ clientId: string; projectId: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser();
  const { clientId, projectId } = await params;
  const sp = await searchParams;
  const filters = taskFilterSchema.parse(sp);
  const view = sp.view === "lista" ? "lista" : "quadro";
  const [p, all, filtered, users] = await Promise.all([
    getProject(user, clientId, projectId),
    listTasks(user, clientId, projectId),
    listTasks(user, clientId, projectId, filters),
    assignableUsers(clientId),
  ]);
  const canEdit = user.role !== "VIEWER" && !["COMPLETED", "CANCELLED"].includes(p.status);
  const base = `/clientes/${clientId}/projetos/${projectId}/acoes`;
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ view: sp.view, filter: filters.filter, process: filters.process, ...patch })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const counts = {
    overdue: all.filter((t) => t.overdueDays > 0).length,
    blocked: all.filter((t) => t.status === "BLOCKED").length,
    done: all.filter((t) => t.status === "DONE").length,
    external: all.filter((t) => t.externalOwnerName).length,
  };
  const chips: { key: "overdue" | "blocked" | "done" | "external"; label: string }[] = [
    { key: "overdue", label: `Vencidas (${counts.overdue})` },
    { key: "blocked", label: `Bloqueadas (${counts.blocked})` },
    { key: "done", label: `Concluídas (${counts.done})` },
    { key: "external", label: "Com responsável do cliente" },
  ];
  const tasks: BoardTask[] = filtered.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? toISODate(t.dueDate) : null,
    dueLabel: t.dueDate ? formatShortDay(t.dueDate) : null,
    completedLabel: t.completedAt ? formatShortDate(t.completedAt) : null,
    overdueDays: t.overdueDays,
    processCode: t.projectProcess?.process.code ?? null,
    projectProcessId: t.projectProcessId,
    assigneeUserId: t.assigneeUserId,
    assigneeName: t.assignee?.name ?? null,
    externalOwnerName: t.externalOwnerName,
    blockedReason: t.blockedReason,
    notes: t.notes,
    checklist: t.checklist,
    evidences: t.evidences.map((e) => ({
      id: e.id,
      label: e.file?.originalName ?? e.url ?? e.text ?? "Evidência",
      href: e.fileAssetId ? `/api/v1/clients/${clientId}/files/${e.fileAssetId}` : e.url,
    })),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-5"><Timeline306090 start={p.startDate} target={p.targetDate} today={todayDateOnly()} tasks={all} /></Card>
        <Card className="flex flex-col gap-2 p-5" aria-labelledby="pp-title">
          <h2 id="pp-title" className="text-[17px] font-extrabold text-navy">Processos no projeto</h2>
          <ul className="flex flex-col gap-2">
            {p.processes.map((pp) => (
              <li key={pp.id} className="flex items-center gap-2 text-sm">
                <ProcessCodeChip code={pp.process.code} />
                <Link href={href({ process: filters.process === pp.id ? undefined : pp.id })} className={cn("min-w-0 flex-1 truncate hover:underline", filters.process === pp.id && "font-bold text-navy")} aria-current={filters.process === pp.id ? "true" : undefined}>{pp.snapshot.name}</Link>
                <StatusBadge context="processImpl" value={pp.status} />
              </li>
            ))}
          </ul>
          {canEdit && all.length === 0 ? <GeneratePlanButton clientId={clientId} projectId={projectId} hasTasks={false} /> : null}
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-[8px] border border-border bg-surface p-0.5" role="group" aria-label="Visualização">
          {(["quadro", "lista"] as const).map((v) => (
            <Link key={v} href={href({ view: v === "quadro" ? undefined : v })} aria-current={view === v ? "page" : undefined} className={cn("rounded-[6px] px-3 py-1.5 text-sm font-bold", view === v ? "bg-navy text-white" : "text-text-muted hover:text-navy")}>
              {v === "quadro" ? "Quadro" : "Lista"}
            </Link>
          ))}
        </div>
        {chips.map((c) => {
          const active = filters.filter === c.key;
          return (
            <Link key={c.key} href={href({ filter: active ? undefined : c.key })} aria-current={active ? "true" : undefined} className={cn("rounded-full border px-3 py-1.5 text-xs font-bold", active ? "border-navy bg-navy text-white" : "border-border-strong bg-surface text-text-muted hover:border-navy")}>
              {c.label}
            </Link>
          );
        })}
        {filters.filter || filters.process ? <Link href={href({ filter: undefined, process: undefined })} className="text-xs font-bold text-navy underline">Limpar filtros</Link> : null}
      </div>
      {all.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-text-muted">Nenhuma tarefa ainda. {canEdit ? "Gere o plano 30/60/90 a partir dos processos ou crie uma tarefa." : ""}</Card>
      ) : null}
      <TaskBoard
        tasks={tasks}
        view={view}
        openNew={sp.nova === "1"}
        ctx={{ clientId, projectId, users, canEdit, processes: p.processes.map((pp) => ({ id: pp.id, code: pp.process.code, name: pp.snapshot.name })) }}
      />
    </div>
  );
}
