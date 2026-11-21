"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { saveOpportunityAction } from "@/features/opportunities/actions";
import { PROCESS_DOMAINS, toProcessDomain } from "@/features/processes/mapping";
import { formatDecimal } from "@/lib/format";
import type { ActionState } from "@/lib/actions";

export type OpportunityFormValues = {
  findingId?: string;
  title: string;
  explanation: string;
  expectedOutcome: string;
  domainCode: string;
  impactScore: number;
  confidenceScore: number;
  effortScore: number;
  criticalRisk: boolean;
  criticalRiskReason: string;
  urgency: string;
  dependency: string;
  costEstimate: string;
  timeToImpact: string;
  consultantOverrideReason: string;
  estimatedValue: string;
  estimateType: string;
  assumptions: string;
  evidence: string;
  missingData: string;
  processCodes: string;
};

type Finding = { id: string; title: string; description: string; domainCode: string; origin: string };

export function OpportunityForm({ clientId, opportunityId, initial, findings, catalog }: { clientId: string; opportunityId: string | null; initial: OpportunityFormValues; findings: Finding[]; catalog: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveOpportunityAction.bind(null, clientId, opportunityId), {});
  const [v, setV] = useState(initial);
  const err = state.fieldErrors ?? {};
  const set = <K extends keyof OpportunityFormValues>(k: K, val: OpportunityFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const score = (v.impactScore * v.confidenceScore) / v.effortScore;
  const fieldProps = (k: string) => ({ "aria-invalid": !!err[k], "aria-describedby": err[k] ? `e-${k}` : undefined });

  const pickFinding = (id: string) => {
    const f = findings.find((x) => x.id === id);
    setV((p) => ({ ...p, findingId: id, ...(f ? { title: f.title, explanation: f.description, domainCode: toProcessDomain(f.domainCode) ?? p.domainCode } : {}) }));
  };
  const scale = (k: "impactScore" | "confidenceScore" | "effortScore", label: string, hint: string) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`o-${k}`}>{label} *</Label>
      <Select id={`o-${k}`} name={k} value={v[k]} onChange={(e) => set(k, Number(e.target.value))} {...fieldProps(k)}>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </Select>
      <span className="text-xs text-text-subtle">{hint}</span>
      <FieldError id={`e-${k}`} message={err[k]} />
    </div>
  );

  return (
    <form action={action} className="flex flex-col gap-6 p-6" noValidate>
      {!opportunityId ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-extrabold text-navy">Origem</legend>
          <Label htmlFor="o-finding">A partir de um achado existente (opcional)</Label>
          <Select id="o-finding" name="findingId" value={v.findingId ?? ""} onChange={(e) => pickFinding(e.target.value)}>
            <option value="">Novo achado do consultor</option>
            {findings.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </Select>
          <span className="text-xs text-text-subtle">Sem achado escolhido, o sistema registra um achado de origem “Consultor” junto com a oportunidade.</span>
        </fieldset>
      ) : null}

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-extrabold text-navy">Oportunidade</legend>
        <div className="flex flex-col gap-1">
          <Label htmlFor="o-title">Título *</Label>
          <Input id="o-title" name="title" value={v.title} onChange={(e) => set("title", e.target.value)} {...fieldProps("title")} />
          <FieldError id="e-title" message={err.title} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="o-expl">Explicação e evidência principal *</Label>
          <Textarea id="o-expl" name="explanation" value={v.explanation} onChange={(e) => set("explanation", e.target.value)} {...fieldProps("explanation")} />
          <FieldError id="e-explanation" message={err.explanation} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-domain">Área *</Label>
            <Select id="o-domain" name="domainCode" value={v.domainCode} onChange={(e) => set("domainCode", e.target.value)} {...fieldProps("domainCode")}>
              {PROCESS_DOMAINS.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.name}</option>)}
            </Select>
            <FieldError id="e-domainCode" message={err.domainCode} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-out">Resultado esperado</Label>
            <Input id="o-out" name="expectedOutcome" value={v.expectedOutcome} onChange={(e) => set("expectedOutcome", e.target.value)} />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-extrabold text-navy">Priorização</legend>
        <div className="grid gap-4 sm:grid-cols-4">
          {scale("impactScore", "Impacto", "1 baixo · 5 alto")}
          {scale("confidenceScore", "Confiança", "1 hipótese · 5 comprovado")}
          {scale("effortScore", "Esforço", "1 simples · 5 complexo")}
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-bold text-text-muted">Score</span>
            <output className="flex min-h-10 items-center text-2xl font-extrabold text-navy" aria-live="polite">{formatDecimal(score)}</output>
            <span className="text-xs text-text-subtle">I × C ÷ E (máx. 25)</span>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="criticalRisk" checked={v.criticalRisk} onChange={(e) => set("criticalRisk", e.target.checked)} className="size-4 accent-navy" />
          Risco crítico (segurança, conformidade, capacidade ou crise de caixa): fica no topo independentemente do score
        </label>
        {v.criticalRisk ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-crit">Motivo do risco crítico *</Label>
            <Input id="o-crit" name="criticalRiskReason" value={v.criticalRiskReason} onChange={(e) => set("criticalRiskReason", e.target.value)} {...fieldProps("criticalRiskReason")} />
            <FieldError id="e-criticalRiskReason" message={err.criticalRiskReason} />
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-urg">Urgência (1–5)</Label>
            <Select id="o-urg" name="urgency" value={v.urgency} onChange={(e) => set("urgency", e.target.value)}>
              <option value="">Não informada</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-tti">Tempo até impacto</Label>
            <Input id="o-tti" name="timeToImpact" placeholder="Ex.: 30 dias" value={v.timeToImpact} onChange={(e) => set("timeToImpact", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-cost">Custo estimado (R$)</Label>
            <Input id="o-cost" name="costEstimate" inputMode="decimal" placeholder="1.234,56" value={v.costEstimate} onChange={(e) => set("costEstimate", e.target.value)} {...fieldProps("costEstimate")} />
            <FieldError id="e-costEstimate" message={err.costEstimate} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-dep">Dependências</Label>
            <Input id="o-dep" name="dependency" value={v.dependency} onChange={(e) => set("dependency", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-over">Justificativa de ajuste do consultor</Label>
            <Input id="o-over" name="consultantOverrideReason" value={v.consultantOverrideReason} onChange={(e) => set("consultantOverrideReason", e.target.value)} />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm font-extrabold text-navy">Valor e premissas (opcional)</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-val">Valor (R$)</Label>
            <Input id="o-val" name="estimatedValue" inputMode="decimal" placeholder="Deixe vazio se não houver base" value={v.estimatedValue} onChange={(e) => set("estimatedValue", e.target.value)} {...fieldProps("estimatedValue")} />
            <FieldError id="e-estimatedValue" message={err.estimatedValue} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-vtype">Classificação do valor</Label>
            <Select id="o-vtype" name="estimateType" value={v.estimateType} onChange={(e) => set("estimateType", e.target.value)} {...fieldProps("estimateType")}>
              <option value="">Selecione</option>
              <option value="OBSERVED">Observado</option>
              <option value="ESTIMATED">Estimado</option>
              <option value="TARGET">Meta</option>
            </Select>
            <FieldError id="e-estimateType" message={err.estimateType} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="o-ass">Premissas (uma por linha)</Label>
          <Textarea id="o-ass" name="assumptions" rows={3} value={v.assumptions} onChange={(e) => set("assumptions", e.target.value)} {...fieldProps("assumptions")} />
          <FieldError id="e-assumptions" message={err.assumptions} />
        </div>
        {!opportunityId ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="o-ev">Evidências adicionais (uma por linha)</Label>
            <Textarea id="o-ev" name="evidence" rows={3} value={v.evidence} onChange={(e) => set("evidence", e.target.value)} />
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor="o-miss">Dados ausentes</Label>
          <Input id="o-miss" name="missingData" value={v.missingData} onChange={(e) => set("missingData", e.target.value)} />
        </div>
      </fieldset>

      {!opportunityId ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-extrabold text-navy">Processos</legend>
          <Label htmlFor="o-proc">Códigos dos processos (separados por vírgula)</Label>
          <Input id="o-proc" name="processCodes" list="o-catalog" placeholder="Ex.: C05, C04" value={v.processCodes} onChange={(e) => set("processCodes", e.target.value.toUpperCase())} {...fieldProps("processCodes")} />
          <datalist id="o-catalog">{catalog.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</datalist>
          <span className="text-xs text-text-subtle">Em branco: o sistema sugere processos da área por regra determinística, sem vincular automaticamente.</span>
          <FieldError id="e-processCodes" message={err.processCodes} />
        </fieldset>
      ) : null}

      {state.error ? <p role="alert" className="text-sm font-semibold text-err">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Salvando…" : opportunityId ? "Salvar alterações" : "Registrar achado e oportunidade"}</Button>
        <Button asChild variant="secondary"><Link href={`/clientes/${clientId}/oportunidades${opportunityId ? `?sel=${opportunityId}` : ""}`}>Cancelar</Link></Button>
      </div>
    </form>
  );
}
