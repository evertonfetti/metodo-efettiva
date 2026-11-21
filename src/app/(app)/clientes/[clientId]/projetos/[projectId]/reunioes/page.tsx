import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { MeetingForm } from "@/components/results/forms";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { listMeetings } from "@/features/results/service";
import { formatDay } from "@/lib/format";

export const metadata: Metadata = { title: "Reuniões do projeto" };

const L = ({ title, items }: { title: string; items: unknown }) => (Array.isArray(items) && items.length ? <div><p className="text-xs font-bold tracking-[0.5px] text-text-muted uppercase">{title}</p><ul className="list-disc pl-5">{(items as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null);

export default async function MeetingsPage({ params }: { params: Promise<{ clientId: string; projectId: string }> }) {
  const user = await requirePageUser();
  const { clientId, projectId } = await params;
  const meetings = await orNotFound(listMeetings(user, clientId, projectId));
  return (
    <div className="flex flex-col gap-5">
      {user.role !== "VIEWER" ? <Card aria-labelledby="new-mt"><CardHeader id="new-mt" title="Registrar reunião" /><MeetingForm clientId={clientId} projectId={projectId} /></Card> : null}
      {meetings.length === 0 ? (
        <Card><EmptyState icon={Users} title="Nenhuma reunião registrada" description="Registre decisões, impedimentos, treinamentos e próximos passos: eles entram no relatório do período." /></Card>
      ) : (
        meetings.map((m) => (
          <Card key={m.id} className="flex flex-col gap-3 p-5 text-sm">
            <div><p className="text-xs text-text-subtle">{formatDay(m.occurredAt)}</p><h2 className="text-[17px] font-extrabold text-navy">{m.title}</h2></div>
            <p>{m.summary}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <L title="Participantes" items={m.attendeesJson} />
              <L title="Decisões" items={m.decisionsJson} />
              <L title="Próximos passos" items={m.nextStepsJson} />
              <L title="Impedimentos" items={m.impedimentsJson} />
              <L title="Treinamentos e entregas" items={m.trainingsJson} />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
