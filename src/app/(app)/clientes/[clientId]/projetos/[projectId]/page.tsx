import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ProcessCodeChip } from "@/components/processes/process-chip";
import { Timeline306090 } from "@/components/projects/timeline";
import { AddProcessForm, GeneratePlanButton, ProcessStatusDialog } from "@/components/projects/project-actions";
import { requirePageUser } from "@/lib/security/session";
import { getProject, listTasks } from "@/features/projects/service";
import { processCatalog } from "@/features/processes/service";
import { formatCode } from "@/features/opportunities/scoring";
import { todayDateOnly } from "@/lib/dates";
import { formatDecimal } from "@/lib/format";

export const metadata: Metadata = { title: "Projeto" };

export default async function ProjectOverviewPage({ params }: { params: Promise<{ clientId: string; projectId: string }> }) {
  const user = await requirePageUser();
  const { clientId, projectId } = await params;
  const [p, tasks, catalog] = await Promise.all([getProject(user, clientId, projectId), listTasks(user, clientId, projectId), processCatalog()]);
  const canEdit = user.role !== "VIEWER" && !["COMPLETED", "CANCELLED"].includes(p.status);
  const done = tasks.filter((t) => t.status === "DONE").length;
  const overdue = tasks.filter((t) => t.overdueDays > 0).length;
  const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
  const validated = p.processes.filter((x) => x.status === "VALIDATED" || x.status === "SUSTAINED").length;
  const stats = [
    { label: "Tarefas concluídas", value: `${done} de ${tasks.length}` },
    { label: "Vencidas", value: String(overdue), alert: overdue > 0 },
    { label: "Bloqueadas", value: String(blocked), alert: blocked > 0 },
    { label: "Processos validados", value: `${validated} de ${p.processes.length}` },
  ];
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className={s.alert ? "border-border-alert p-4" : "p-4"}>
            <dt className="text-xs font-bold tracking-[0.5px] text-text-subtle uppercase">{s.label}</dt>
            <dd className={s.alert ? "text-2xl font-extrabold text-err" : "text-2xl font-extrabold text-navy"}>{s.value}</dd>
            <p className="text-xs text-text-subtle">Fonte: tarefas e processos deste projeto</p>
          </Card>
        ))}
      </dl>
      <Card className="p-5">
        <Timeline306090 start={p.startDate} target={p.targetDate} today={todayDateOnly()} tasks={tasks} />
      </Card>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card aria-labelledby="procs">
          <CardHeader id="procs" title="Processos no projeto" action={canEdit ? <GeneratePlanButton clientId={clientId} projectId={projectId} hasTasks={tasks.some((t) => t.planKey)} /> : null} />
          <ul className="divide-y divide-border">
            {p.processes.map((pp) => (
              <li key={pp.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <ProcessCodeChip code={pp.process.code} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <Link href={`/biblioteca/${pp.process.code}?v=${pp.processVersion}`} className="font-bold text-navy hover:underline">{pp.snapshot.name}</Link>
                  <span className="text-xs text-text-subtle">
                    Ficha v{pp.processVersion}{pp.process.currentVersion > pp.processVersion ? ` (biblioteca já está na v${pp.process.currentVersion})` : ""} · {pp.tasksTotal - pp.tasksOpen}/{pp.tasksTotal} tarefas · {pp.evidenceCount} evidência(s){pp.ownerName ? ` · Cliente: ${pp.ownerName}` : ""}
                  </span>
                  {pp.statusReason ? <span className="text-xs text-blocked">Motivo: {pp.statusReason}</span> : null}
                </span>
                <StatusBadge context="processImpl" value={pp.status} />
                {canEdit ? (
                  <ProcessStatusDialog
                    key={`${pp.id}-${pp.status}`}
                    clientId={clientId}
                    projectId={projectId}
                    pp={{ id: pp.id, code: pp.process.code, name: pp.snapshot.name, status: pp.status, ownerName: pp.ownerName, tasksTotal: pp.tasksTotal, tasksOpen: pp.tasksOpen, evidenceCount: pp.evidenceCount, validation: pp.validation }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {canEdit ? <div className="border-t border-border px-5 py-3"><AddProcessForm clientId={clientId} projectId={projectId} catalog={catalog.map((c) => ({ code: c.code, name: c.name }))} /></div> : null}
        </Card>
        <div className="flex flex-col gap-5">
          <Card aria-labelledby="scope">
            <CardHeader id="scope" title="Escopo e objetivos" />
            <div className="flex flex-col gap-3 px-5 py-4 text-sm">
              <p className={p.scope ? "" : "text-text-subtle"}>{p.scope ?? "Escopo não descrito."}</p>
              {p.objectives.length ? <ul className="list-disc pl-5">{p.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul> : <p className="text-text-subtle">Nenhum objetivo registrado.</p>}
            </div>
          </Card>
          <Card aria-labelledby="opps">
            <CardHeader id="opps" title="Oportunidades atendidas" />
            {p.opportunities.length ? (
              <ul className="divide-y divide-border">
                {p.opportunities.map((o) => (
                  <li key={o.id} className="px-5 py-3 text-sm">
                    <Link href={`/clientes/${clientId}/oportunidades?sel=${o.id}`} className="font-bold text-navy hover:underline">{formatCode(o.number)} · {o.title}</Link>
                    <span className="block text-xs text-text-subtle">Score {formatDecimal(Number(o.priorityScore))}{o.criticalRisk ? " · risco crítico" : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-text-subtle">Projeto criado sem oportunidades vinculadas.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
