import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";
import { requirePageUser } from "@/lib/security/session";
import { assignableUsers, getProject } from "@/features/projects/service";
import { toISODate } from "@/lib/dates";

export const metadata: Metadata = { title: "Editar projeto" };

export default async function EditProjectPage({ params }: { params: Promise<{ clientId: string; projectId: string }> }) {
  const user = await requirePageUser();
  if (user.role === "VIEWER") notFound();
  const { clientId, projectId } = await params;
  const [p, users] = await Promise.all([getProject(user, clientId, projectId), assignableUsers(clientId)]);
  return (
    <Card className="max-w-[880px]">
      <ProjectForm
        clientId={clientId}
        projectId={projectId}
        users={users}
        initial={{ name: p.name, scope: p.scope ?? "", objectives: p.objectives.join("\n"), startDate: toISODate(p.startDate), targetDate: toISODate(p.targetDate), sponsorName: p.sponsorName ?? "", ownerUserId: p.ownerUserId }}
      />
    </Card>
  );
}
