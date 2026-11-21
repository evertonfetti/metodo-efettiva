"use client";

import { useActionState, startTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { clientFormSchema } from "@/features/clients/schema";
import { CHANNELS, SALES_MODELS, SEGMENTS, SIZES, UF } from "@/features/clients/catalog";
import type { ActionState } from "@/lib/actions";

export type ClientFormDefaults = Partial<{
  name: string; legalName: string; industry: string; industryOther: string; size: string; city: string; state: string;
  timezone: string; salesModel: string; salesChannels: string[]; sellersCount: number | null; sourceSystem: string; salesCycle: string;
  typicalPurchaseFrequencyDays: number | null; mainChallenges: string; tags: string[];
}>;

type Props = {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  defaults?: ClientFormDefaults;
  submitLabel: string;
  withContact?: boolean;
  taxIdMasked?: string | null;
};

/** Formulário de empresa-cliente: validação no navegador (RHF+Zod) e de novo no servidor. */
export function ClientForm({ action, defaults = {}, submitLabel, withContact, taxIdMasked }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      ...defaults,
      timezone: defaults.timezone ?? "America/Sao_Paulo",
      salesChannels: defaults.salesChannels ?? [],
      tags: undefined,
      sellersCount: defaults.sellersCount ?? undefined,
      typicalPurchaseFrequencyDays: defaults.typicalPurchaseFrequencyDays ?? undefined,
    } as never,
    mode: "onBlur",
  });
  const industry = useWatch({ control, name: "industry" }) as unknown as string | undefined;
  const err = (name: string) => (errors as Record<string, { message?: string }>)[name]?.message ?? state.fieldErrors?.[name];

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    void handleSubmit(() => startTransition(() => formAction(new FormData(form))))(e);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-[720px] flex-col gap-6">
      <Card className="flex flex-col gap-5 p-6">
        <h2 className="text-[17px] font-extrabold text-navy">Identificação</h2>
        <Field label="Nome fantasia *" name="name" error={err("name")}>
          <Input id="name" {...register("name")} aria-invalid={!!err("name")} autoComplete="organization" />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Razão social" name="legalName" error={err("legalName")}>
            <Input id="legalName" {...register("legalName")} />
          </Field>
          <Field label="CPF/CNPJ (opcional, armazenado cifrado)" name="taxId" error={err("taxId")} help={taxIdMasked ? `Atual: ${taxIdMasked}. Deixe em branco para manter.` : undefined}>
            <Input id="taxId" name="taxId" inputMode="numeric" autoComplete="off" aria-invalid={!!err("taxId")} />
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Segmento *" name="industry" error={err("industry")}>
            <Select id="industry" {...register("industry")} aria-invalid={!!err("industry")}>
              <option value="">Selecione…</option>
              {SEGMENTS.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </Select>
          </Field>
          {industry === "OUTRO" ? (
            <Field label="Descreva o segmento *" name="industryOther" error={err("industryOther")}>
              <Input id="industryOther" {...register("industryOther")} />
            </Field>
          ) : (
            <Field label="Porte" name="size" error={err("size")}>
              <Select id="size" {...register("size")}>
                <option value="">Não informado</option>
                {SIZES.map((s) => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        {industry === "OUTRO" ? (
          <Field label="Porte" name="size" error={err("size")}>
            <Select id="size" {...register("size")}>
              <option value="">Não informado</option>
              {SIZES.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <div className="grid gap-4 md:grid-cols-[1fr_120px]">
          <Field label="Cidade" name="city" error={err("city")}>
            <Input id="city" {...register("city")} />
          </Field>
          <Field label="UF" name="state" error={err("state")}>
            <Select id="state" {...register("state")}>
              <option value="">—</option>
              {UF.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Tags (separadas por vírgula)" name="tags" error={err("tags")}>
          <Input id="tags" name="tags" defaultValue={(defaults.tags ?? []).join(", ")} />
        </Field>
        <input type="hidden" {...register("timezone")} />
      </Card>

      <Card className="flex flex-col gap-5 p-6">
        <h2 className="text-[17px] font-extrabold text-navy">Perfil comercial</h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-bold text-text-muted">Canais de venda</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <label key={c.code} className="flex min-h-10 items-center gap-2 rounded-[8px] border border-border px-3 text-sm">
                <input type="checkbox" value={c.code} {...register("salesChannels")} className="size-4 accent-navy" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Modelo de venda" name="salesModel" error={err("salesModel")}>
            <Select id="salesModel" {...register("salesModel")}>
              <option value="">Não informado</option>
              {SALES_MODELS.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Quantidade de vendedores" name="sellersCount" error={err("sellersCount")}>
            <Input id="sellersCount" type="number" min={0} {...register("sellersCount")} />
          </Field>
          <Field label="Sistema de origem (ERP/CRM)" name="sourceSystem" error={err("sourceSystem")}>
            <Input id="sourceSystem" {...register("sourceSystem")} />
          </Field>
          <Field label="Ciclo comercial típico" name="salesCycle" error={err("salesCycle")} help="Ex.: 7 dias, 2 a 3 meses">
            <Input id="salesCycle" {...register("salesCycle")} />
          </Field>
          <Field label="Frequência típica de compra (dias)" name="typicalPurchaseFrequencyDays" error={err("typicalPurchaseFrequencyDays")} help="Informada pelo cliente; usada quando não houver histórico importado.">
            <Input id="typicalPurchaseFrequencyDays" type="number" min={1} {...register("typicalPurchaseFrequencyDays")} />
          </Field>
        </div>
        <Field label="Principais desafios" name="mainChallenges" error={err("mainChallenges")}>
          <Textarea id="mainChallenges" {...register("mainChallenges")} />
        </Field>
      </Card>

      {withContact ? (
        <Card className="flex flex-col gap-5 p-6">
          <h2 className="text-[17px] font-extrabold text-navy">Contato responsável <span className="text-sm font-semibold text-text-muted">(opcional)</span></h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome" name="contactName" error={err("contactName")}>
              <Input id="contactName" name="contactName" />
            </Field>
            <Field label="Cargo" name="contactRole" error={err("contactRole")}>
              <Input id="contactRole" name="contactRole" />
            </Field>
            <Field label="E-mail" name="contactEmail" error={err("contactEmail")}>
              <Input id="contactEmail" name="contactEmail" type="email" />
            </Field>
            <Field label="Telefone" name="contactPhone" error={err("contactPhone")}>
              <Input id="contactPhone" name="contactPhone" type="tel" />
            </Field>
          </div>
          <p className="text-xs text-text-subtle">Registre apenas dados mínimos necessários (LGPD). O contato não recebe acesso ao sistema.</p>
        </Card>
      ) : null}

      {state.error ? (
        <p role="alert" className="rounded-[8px] bg-err-bg px-3 py-2 text-sm font-semibold text-err">{state.error}</p>
      ) : null}
      <div>
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Salvando…" : submitLabel}</Button>
      </div>
    </form>
  );
}

function Field({ label, name, error, help, children }: { label: string; name: string; error?: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {help ? <span className="text-xs text-text-subtle">{help}</span> : null}
      <FieldError message={error} />
    </div>
  );
}
