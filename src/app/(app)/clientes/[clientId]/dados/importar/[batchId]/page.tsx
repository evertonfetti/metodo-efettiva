import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Topbar, PageContent } from "@/components/shell/topbar";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { ImportStepper } from "@/components/imports/stepper";
import { AutoRefresh, MappingForm, SourceValidatedToggle, ValidatedActions } from "@/components/imports/batch-steps";
import { requirePageUser } from "@/lib/security/session";
import { orNotFound } from "@/lib/page";
import { getClientView } from "@/features/clients/service";
import { getBatch } from "@/features/imports/service";
import { IMPORT_TYPES } from "@/features/imports/fields";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Importação" };

type Summary = { total?: number; willCreate?: number; willUpdate?: number; unchanged?: number; duplicatesInFile?: number; rejected?: number; errorsByType?: { reason: string; count: number }[]; sheets?: string[]; fromProfile?: boolean };
type Preview = { columns: { key: string; label: string; header: string }[]; rows: { row: number; values: string[]; errors: { field: string | null; reason: string }[] }[] };

export default async function BatchPage({ params }: { params: Promise<{ clientId: string; batchId: string }> }) {
  const user = await requirePageUser();
  const { clientId, batchId } = await params;
  const [client, b] = await Promise.all([getClientView(user, clientId), orNotFound(getBatch(user, clientId, batchId))]);
  const canEdit = user.role !== "VIEWER";
  const def = IMPORT_TYPES[b.type];
  const s = (b.summaryJson ?? {}) as Summary;
  const preview = b.previewJson as Preview | null;
  const step = b.status === "UPLOADED" || b.status === "MAPPED" ? 3 : b.status === "VALIDATED" ? 4 : 5;
  const done = b.status === "COMPLETED" || b.status === "PARTIAL";
  const base = `/clientes/${clientId}/dados`;
  return (
    <>
      <Topbar crumbs={[{ label: client.name, href: `/clientes/${clientId}` }, { label: "Dados e importações", href: base }, { label: b.originalName }]} />
      <PageContent wide>
        <AutoRefresh active={b.status === "IMPORTING"} />
        <PageHeader
          title={`${def.label}: ${b.originalName}`}
          badges={<StatusBadge context="importBatch" value={b.status} />}
          subtitle={`Origem ${b.sourceSystem}${b.recordKind ? ` · ${b.recordKind === "ORDER" ? "pedidos" : "faturamento"}` : ""}${b.sheetName ? ` · aba ${b.sheetName}` : ""} · ${b.totalRows.toLocaleString("pt-BR")} linhas · enviado em ${formatDateTime(b.createdAt)}`}
          actions={<Button asChild variant="secondary"><Link href={base}>Voltar aos dados</Link></Button>}
        />
        <ImportStepper current={step} />

        {(b.status === "UPLOADED" || b.status === "MAPPED" || b.status === "VALIDATED") && canEdit ? (
          <Card aria-labelledby="map">
            <CardHeader id="map" title="Mapeamento de colunas" />
            <MappingForm clientId={clientId} batchId={b.id} fields={def.fields.map((f) => ({ key: f.key, label: f.label, required: f.required, example: f.example }))} headers={b.headersJson as string[]} mapping={(b.mappingJson ?? {}) as Record<string, string | null>} sheets={s.sheets ?? []} sheet={b.sheetName} fromProfile={!!s.fromProfile} />
          </Card>
        ) : null}

        {b.status === "VALIDATED" || done ? (
          <Card aria-labelledby="val">
            <CardHeader id="val" title={done ? "Resultado da importação" : "Prévia e validação"} />
            <div className="flex flex-col gap-4 p-5">
              <p className="text-[15px] font-bold">
                {done
                  ? `${b.createdRows.toLocaleString("pt-BR")} novos · ${b.updatedRows.toLocaleString("pt-BR")} atualizados · ${b.unchangedRows.toLocaleString("pt-BR")} ignorados (sem alteração/duplicados) · ${b.rejectedRows.toLocaleString("pt-BR")} rejeitados`
                  : `${(s.willCreate ?? 0).toLocaleString("pt-BR")} novos · ${(s.willUpdate ?? 0).toLocaleString("pt-BR")} atualizados · ${(s.unchanged ?? 0).toLocaleString("pt-BR")} sem alteração${s.duplicatesInFile ? ` · ${s.duplicatesInFile} duplicados iguais no arquivo` : ""} · ${(s.rejected ?? 0).toLocaleString("pt-BR")} com erro`}
              </p>
              {s.errorsByType?.length ? (
                <div>
                  <h3 className="text-xs font-bold tracking-[0.5px] text-text-muted uppercase">Erros por tipo</h3>
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm">{s.errorsByType.map((e) => <li key={e.reason}><span className="font-bold text-err">{e.count}×</span> {e.reason}</li>)}</ul>
                </div>
              ) : null}
              {b.errorFileAssetId ? <a className="flex w-fit items-center gap-1 text-sm font-bold text-navy hover:underline" href={`/api/v1/clients/${clientId}/files/${b.errorFileAssetId}`}><Download className="size-4" aria-hidden="true" /> Baixar arquivo de erros (CSV)</a> : null}
              {b.status === "VALIDATED" && canEdit ? <ValidatedActions clientId={clientId} batchId={b.id} accepted={b.acceptedRows} rejected={b.rejectedRows} /> : null}
              {done && b.type === "SALES" && canEdit ? <SourceValidatedToggle clientId={clientId} batchId={b.id} value={b.sourceValidated} /> : null}
              {done ? <p className="text-sm text-text-muted">Indicadores recalculados. <Link className="font-bold text-navy underline" href={base}>Ver dados e indicadores</Link></p> : null}
            </div>
            {preview && !done ? (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <caption className="px-5 py-2 text-left text-xs text-text-subtle">Prévia das primeiras {preview.rows.length} linhas; células com erro em vermelho.</caption>
                  <thead><tr className="text-left text-xs tracking-[0.5px] text-text-muted uppercase"><th className="px-3 py-2">Linha</th>{preview.columns.map((c) => <th key={c.key} className="px-3 py-2">{c.label}<span className="block font-normal normal-case text-text-subtle">{c.header}</span></th>)}</tr></thead>
                  <tbody>
                    {preview.rows.map((r) => {
                      const rowErr = r.errors.filter((e) => !e.field || !preview.columns.some((c) => c.key === e.field));
                      return (
                        <tr key={r.row} className={cn("border-t border-border align-top", r.errors.length && "bg-err-bg/40")}>
                          <td className="px-3 py-2 font-mono text-xs">{r.row}{rowErr.map((e, i) => <span key={i} className="block font-sans font-semibold text-err">{e.reason}</span>)}</td>
                          {preview.columns.map((c, i) => {
                            const e = r.errors.find((x) => x.field === c.key);
                            return <td key={c.key} className={cn("px-3 py-2", e && "bg-err-bg font-semibold text-err")} title={e?.reason}>{r.values[i] || <span className="text-text-subtle">—</span>}{e ? <span className="block text-xs">{e.reason}</span> : null}</td>;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {b.errors.length && done ? (
              <ul className="border-t border-border px-5 py-3 text-sm">{b.errors.slice(0, 20).map((e) => <li key={e.id}>Linha {e.rowNumber}{e.field ? ` · ${e.field}` : ""}: <span className="text-err">{e.reason}</span>{e.rawValueSafe ? ` (“${e.rawValueSafe}”)` : ""}</li>)}</ul>
            ) : null}
          </Card>
        ) : null}

        {b.status === "IMPORTING" ? <Card className="px-5 py-8 text-center text-sm text-text-muted" role="status">Importando em segundo plano… a página atualiza sozinha.</Card> : null}
        {b.status === "FAILED" ? <Card className="px-5 py-6 text-sm text-err" role="alert">A importação falhou: {b.errorMessage ?? "erro inesperado"}. Nenhum dado parcial do lote com erro fica duplicado; envie o arquivo novamente.</Card> : null}
      </PageContent>
    </>
  );
}
