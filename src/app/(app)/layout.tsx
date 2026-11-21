import { AppShell } from "@/components/shell/app-shell";
import { prisma } from "@/lib/db";
import { accessibleClientsWhere } from "@/lib/security/access";
import { requirePageUser } from "@/lib/security/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const clients = await prisma.client.findMany({
    where: { ...accessibleClientsWhere(user), status: { not: "ARCHIVED" } },
    select: { id: true, name: true, industry: true, isDemo: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  return <AppShell sidebar={{ user: { name: user.name, role: user.role }, clients }}>{children}</AppShell>;
}
