import { prisma } from "@/lib/db";
import { accessibleClientsWhere } from "@/lib/security/access";
import type { SessionUser } from "@/features/auth/service";
import { getClientJourney } from "@/features/clients/journey";
import { addDays, todayDateOnly } from "@/lib/dates";

/** Dados operacionais da Visão geral — somente contagens; nunca soma receitas entre clientes. */
export async function getDashboardData(user: SessionUser) {
  const clientWhere = accessibleClientsWhere(user);
  const since24h = new Date(Date.now() - 24 * 3_600_000);
  const today = todayDateOnly();
  const openTask = { status: { not: "DONE" as const }, client: clientWhere, project: { status: { in: ["DRAFT" as const, "APPROVED" as const, "ACTIVE" as const] } } };
  const taskSelect = { id: true, title: true, dueDate: true, projectId: true, clientId: true, client: { select: { name: true } }, project: { select: { name: true } } } as const;

  const [activeClients, clients, failedJobs, recentJobs, hasDemo, activeProjects, overdueCount, overdueTasks, upcomingTasks] = await Promise.all([
    prisma.client.count({ where: { ...clientWhere, status: "ACTIVE" } }),
    prisma.client.findMany({
      where: { ...clientWhere, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, industry: true, isDemo: true, status: true, createdAt: true },
      orderBy: { name: "asc" },
      take: 8,
    }),
    prisma.backgroundJob.count({ where: { status: "FAILED", createdAt: { gte: since24h }, OR: [{ clientId: null }, { client: clientWhere }] } }),
    prisma.backgroundJob.findMany({
      where: { OR: [{ clientId: null }, { client: clientWhere }] },
      select: { id: true, operation: true, status: true, progress: true, createdAt: true, client: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.client.count({ where: { ...clientWhere, isDemo: true } }),
    prisma.project.count({ where: { status: { in: ["APPROVED", "ACTIVE"] }, client: clientWhere } }),
    prisma.actionTask.count({ where: { ...openTask, dueDate: { lt: today } } }),
    prisma.actionTask.findMany({ where: { ...openTask, dueDate: { lt: today } }, select: taskSelect, orderBy: { dueDate: "asc" }, take: 5 }),
    prisma.actionTask.findMany({ where: { ...openTask, dueDate: { gte: today, lte: addDays(today, 14) } }, select: taskSelect, orderBy: { dueDate: "asc" }, take: 5 }),
  ]);

  const journeys = await Promise.all(clients.map((c) => getClientJourney(c.id)));
  const clientsWithPhase = clients.map((c, i) => {
    const j = journeys[i]!;
    const current = j.find((p) => p.state === "CURRENT") ?? j.find((p) => p.state === "NOT_STARTED");
    return { ...c, phase: current ? { name: current.name, gate: current.gate, index: j.indexOf(current) + 1, started: current.state === "CURRENT" } : null };
  });
  return { activeClients, clients: clientsWithPhase, failedJobs, recentJobs, hasDemo: hasDemo > 0, activeProjects, overdueCount, overdueTasks, upcomingTasks, today };
}
