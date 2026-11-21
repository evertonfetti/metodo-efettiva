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

/** Identidade visual dos documentos: textos + logo opcional (PNG/JPG até 2 MB, arquivo de sistema privado). */
export async function saveBrandAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    assertRole(user, "OWNER");
    const { getSetting } = await import("./service");
    const { putFile } = await import("@/lib/storage");
    const current = await getSetting("brand");
    let logoFileId = fd.get("removeLogo") === "on" ? null : current.logoFileId;
    const logo = fd.get("logo");
    if (logo instanceof File && logo.size > 0) {
      const asset = await putFile({ clientId: null, uploadedBy: user.id, originalName: logo.name, data: Buffer.from(await logo.arrayBuffer()), maxBytes: 2 * 1_048_576 });
      if (asset.mime !== "image/png" && asset.mime !== "image/jpeg") throw new AppError("VALIDATION", "Envie o logo em PNG ou JPG.");
      logoFileId = asset.id;
    }
    await updateSetting(user, "brand", {
      companyName: String(fd.get("companyName") ?? ""),
      tagline: String(fd.get("tagline") ?? ""),
      footerText: String(fd.get("footerText") ?? ""),
      confidentiality: String(fd.get("confidentiality") ?? ""),
      logoFileId,
    });
    revalidatePath("/configuracoes");
    return { ok: true, message: "Marca salva. Vale para as próximas exportações." };
  } catch (err) {
    return toState(err);
  }
}

/** Reprocessa job que falhou (OWNER). Operações idempotentes: não duplicam dados. */
export async function retryJobAction(jobId: string): Promise<FormState> {
  try {
    const user = await requireUser();
    assertRole(user, "OWNER");
    const { retryFailedJob } = await import("@/lib/jobs/recovery");
    const ok = await retryFailedJob(jobId);
    if (!ok) return { error: "Job não encontrado ou não está com falha." };
    const { audit } = await import("@/lib/audit");
    await audit({ actorUserId: user.id, entityType: "BackgroundJob", entityId: jobId, action: "job.retry" });
    revalidatePath("/configuracoes");
    return { ok: true, message: "Job reenviado para a fila." };
  } catch (err) {
    return toState(err);
  }
}
