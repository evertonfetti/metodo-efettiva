import { prisma } from "@/lib/db";
import { accessibleClientsWhere } from "@/lib/security/access";
import type { SessionUser } from "@/features/auth/service";
import { getClientJourney } from "@/features/clients/journey";

/** Dados operacionais da Visão geral — somente contagens; nunca soma receitas entre clientes. */
export async function getDashboardData(user: SessionUser) {
  const clientWhere = accessibleClientsWhere(user);
  const since24h = new Date(Date.now() - 24 * 3_600_000);

  const [activeClients, clients, failedJobs, recentJobs, hasDemo] = await Promise.all([
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
  ]);

  const journeys = await Promise.all(clients.map((c) => getClientJourney(c.id)));
  const clientsWithPhase = clients.map((c, i) => {
    const j = journeys[i]!;
    const current = j.find((p) => p.state === "CURRENT") ?? j.find((p) => p.state === "NOT_STARTED");
    return { ...c, phase: current ? { name: current.name, gate: current.gate, index: j.indexOf(current) + 1, started: current.state === "CURRENT" } : null };
  });
  return { activeClients, clients: clientsWithPhase, failedJobs, recentJobs, hasDemo: hasDemo > 0 };
}
