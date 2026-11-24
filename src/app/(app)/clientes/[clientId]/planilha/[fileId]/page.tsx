import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { ApplyForm, type SectionView } from "@/components/workbook/apply-form";
import { requirePageUser } from "@/lib/security/session";
import { getClientView } from "@/features/clients/service";
import { inspectWorkbook } from "@/features/workbook/service";
import { IMPORT_TYPES } from "@/features/imports/fields";
import { PAGE_HELP } from "@/lib/help";

export const metadata: Metadata = { title: "Conferir planilha" };

export default async function WorkbookReviewPage({ params }: { params: Promise<{ clientId: string; fileId: string }> }) {
  const user = await requirePageUser();
  if (user.role === "VIEWER") notFound();
  const { clientId, fileId } = await params;
  const client = await getClientView(user, clientId);
  const { file, analysis: a, applied } = await inspectWorkbook(user, clientId, fileId).catch(() => notFound());
  const issues = (list: { sheet: string; row?: number; field?: string; message: string }[]) => list.map((i) => ({ where: [i.row ? `Linha ${i.row}` : "", i.field ?? ""].filter(Boolean).join(" · ") ? `${[i.row ? `Linha ${i.row}` : "", i.field ?? ""].filter(Boolean).join(" · ")}:` : `${i.sheet}:`, message: i.message }));
  const meta = (section: string) => applied.find((m) => m.section === section);
  const sections: SectionView[] = [
    {
      id: "company", title: "Empresa (cadastro)", applied: !!meta("company"), empty: !a.company.present || (a.company.changes.length === 0 && a.company.issues.length === 0),
      summary: a.company.changes.length ? a.company.changes.map((c) => `${c.label}: ${c.from ? `“${c.from}”` : "(vazio)"} → “${c.to}”`) : ["Nenhuma alteração em relação ao cadastro atual."],
      issues: issues(a.company.issues),
    },
    {
      id: "contacts", title: "Contatos", applied: !!meta("contacts"), empty: !a.contacts.present || (a.contacts.toCreate.length === 0 && a.contacts.issues.length === 0),
      summary: [`${a.contacts.toCreate.length} contato(s) novo(s)${a.contacts.toCreate.length ? `: ${a.contacts.toCreate.slice(0, 5).map((c) => c.name).join(", ")}${a.contacts.toCreate.length > 5 ? "…" : ""}` : ""}.`, ...(a.contacts.duplicates ? [`${a.contacts.duplicates} já existe(m) no cadastro e será(ão) ignorado(s).`] : [])],
      issues: issues(a.contacts.issues),
    },
    {
      id: "diagnostic", title: "Diagnóstico (questionário completo)", applied: !!meta("diagnostic"), empty: !a.diagnostic.present || (a.diagnostic.answers.length === 0 && a.diagnostic.issues.length === 0),
      appliedHref: meta("diagnostic")?.assessmentId ? `/clientes/${clientId}/diagnosticos/${meta("diagnostic")!.assessmentId}` : null,
      summary: [`${a.diagnostic.answers.length} resposta(s) válida(s). Serão gravadas num novo diagnóstico em rascunho, para você revisar e fechar.`],
      issues: issues(a.diagnostic.issues),
    },
    ...a.commercial.map((c): SectionView => ({
      id: `commercial:${c.type}`, title: `Base comercial · ${IMPORT_TYPES[c.type].label}`, applied: !!meta(`commercial:${c.type}`), empty: !c.present || (c.rows.length === 0 && c.issues.length === 0),
      appliedHref: meta(`commercial:${c.type}`)?.batchId ? `/clientes/${clientId}/dados/importar/${meta(`commercial:${c.type}`)!.batchId}` : null,
      needsSalesKind: c.type === "SALES",
      summary: [`${c.rows.length} linha(s) preenchida(s). Vira um lote de importação validado; você confirma a gravação na tela de importação.`],
      issues: issues(c.issues),
    })),
  ];
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Planilha do cliente", href: `/clientes/${clientId}/planilha` }, { label: "Conferir" }]} />
      <PageContent>
        <PageHeader help={PAGE_HELP.planilhaConferir} title="Conferir planilha" subtitle={`Arquivo: ${file.name}. Nada foi gravado ainda.`} />
        <div className="max-w-[960px]"><ApplyForm clientId={clientId} fileId={fileId} sections={sections} /></div>
      </PageContent>
    </>
  );
}
