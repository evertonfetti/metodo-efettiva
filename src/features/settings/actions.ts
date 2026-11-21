"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUser } from "@/lib/security/session";
import { AppError } from "@/lib/errors";
import { assertRole } from "@/lib/security/access";
import { enqueueJob } from "@/lib/jobs/queue";
import { updateSetting } from "./service";

export type FormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string };

function toState(err: unknown): FormState {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of err.issues) fieldErrors[i.path.join(".") || "_"] = i.message;
    return { error: "Revise os campos destacados.", fieldErrors };
  }
  if (err instanceof AppError) return { error: err.message };
  return { error: "Não foi possível salvar. Tente novamente." };
}

export async function saveMethodAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    assertRole(user, "OWNER");
    const phases = [0, 1, 2, 3, 4].map((i) => ({
      code: String(fd.get(`phase.${i}.code`) ?? ""),
      name: String(fd.get(`phase.${i}.name`) ?? "").trim(),
      gate: String(fd.get(`phase.${i}.gate`) ?? "").trim(),
    }));
    const labels = [0, 1, 2, 3, 4, 5].map((i) => String(fd.get(`scale.${i}`) ?? "").trim());
    await updateSetting(user, "methodPhases", phases);
    await updateSetting(user, "scaleLabels", labels);
    revalidatePath("/", "layout");
    return { ok: true, message: "Fases e escala salvas." };
  } catch (err) {
    return toState(err);
  }
}

export async function saveParametersAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    assertRole(user, "OWNER");
    await updateSetting(user, "parameters", Object.fromEntries(fd.entries()));
    revalidatePath("/configuracoes");
    return { ok: true, message: "Parâmetros salvos." };
  } catch (err) {
    return toState(err);
  }
}

/** Enfileira um job de verificação ponta a ponta (web → Redis → worker → banco). */
export async function pingQueueAction(): Promise<FormState> {
  try {
    const user = await requireUser();
    assertRole(user, "OWNER");
    await enqueueJob({ operation: "system.ping", clientId: null, createdBy: user.id, idempotencyKey: `system.ping:${Date.now()}` });
    revalidatePath("/configuracoes");
    return { ok: true, message: "Job enviado. Atualize a página para ver o resultado do worker." };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    return { error: "Fila indisponível: verifique o Redis." };
  }
}

export async function saveRuleAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    assertRole(user, "OWNER");
    const { saveRule } = await import("@/features/assessments/rules");
    const o: Record<string, unknown> = Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$ACTION") && k !== "segments"));
    o.segments = fd.getAll("segments").map(String);
    o.active = fd.get("active") === "on";
    await saveRule(user, o);
    revalidatePath("/configuracoes");
    return { ok: true, message: "Regra salva. Vale para diagnósticos em aberto; diagnósticos fechados mantêm o snapshot." };
  } catch (err) {
    return toState(err);
  }
}

export async function toggleRuleAction(ruleId: string, active: boolean): Promise<FormState> {
  try {
    const user = await requireUser();
    const { setRuleActive } = await import("@/features/assessments/rules");
    await setRuleActive(user, ruleId, active);
    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (err) {
    return toState(err);
  }
}
