import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertRole } from "@/lib/security/access";
import type { SessionUser } from "@/features/auth/service";
import { SETTINGS, type SettingName } from "./defaults";
import type { z } from "zod";

type SettingValue<N extends SettingName> = z.infer<(typeof SETTINGS)[N]["schema"]>;

/** Lê configuração validada; se ausente ou inválida, devolve o padrão. */
export async function getSetting<N extends SettingName>(name: N): Promise<SettingValue<N>> {
  const def = SETTINGS[name];
  const row = await prisma.systemSetting.findUnique({ where: { key: def.key } });
  if (!row) return def.default as SettingValue<N>;
  const parsed = def.schema.safeParse(row.valueJson);
  return (parsed.success ? parsed.data : def.default) as SettingValue<N>;
}

/** Atualiza configuração (somente OWNER), com validação e auditoria. */
export async function updateSetting<N extends SettingName>(user: SessionUser, name: N, value: unknown): Promise<SettingValue<N>> {
  assertRole(user, "OWNER");
  const def = SETTINGS[name];
  const data = def.schema.parse(value) as SettingValue<N>;
  const before = await prisma.systemSetting.findUnique({ where: { key: def.key } });
  await prisma.systemSetting.upsert({
    where: { key: def.key },
    create: { key: def.key, valueJson: data as object, updatedBy: user.id },
    update: { valueJson: data as object, updatedBy: user.id },
  });
  await audit({ actorUserId: user.id, entityType: "SystemSetting", entityId: def.key, action: "setting.update", before: before?.valueJson, after: data });
  return data;
}
