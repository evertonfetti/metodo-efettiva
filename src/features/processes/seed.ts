import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { processContentSchema, type ProcessSnapshot } from "./content";

type CatalogItem = { code: string; domainCode: string; domainName: string; name: string; objective: string; seedStatus: "BASIC" | "CORE"; isActive: boolean };
type DetailItem = { code: string; title: string; objective: string; [k: string]: unknown };

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8")) as T;

/**
 * Importa os 146 processos (Anexo A) e aplica as 10 fichas completas (Anexo C).
 * Idempotente e sem duplicar códigos. Nunca sobrescreve processo personalizado;
 * ficha completa aplicada depois vira nova revisão (v2), preservando a v1 do catálogo.
 */
export async function seedProcesses(prisma: PrismaClient) {
  const catalog = readJson<{ total: number; processes: CatalogItem[] }>("catalogo_processos_seed.json").processes;
  const details = readJson<{ processes: DetailItem[] }>("prisma/seed-data/processos-detalhados.json").processes;

  const codes = new Set<string>();
  for (const p of catalog) {
    if (codes.has(p.code)) throw new Error(`Código de processo duplicado no catálogo: ${p.code}`);
    codes.add(p.code);
  }
  const detailByCode = new Map<string, DetailItem>();
  for (const d of details) {
    if (!codes.has(d.code)) throw new Error(`Ficha ${d.code} não existe no catálogo`);
    if (detailByCode.has(d.code)) throw new Error(`Ficha duplicada: ${d.code}`);
    detailByCode.set(d.code, d);
  }

  let created = 0;
  let sheetsApplied = 0;
  for (const item of catalog) {
    const detail = detailByCode.get(item.code);
    const content = detail ? processContentSchema.parse(detail) : null;
    const objective = detail?.objective ?? item.objective;
    const existing = await prisma.processDefinition.findUnique({ where: { code: item.code } });

    if (!existing) {
      const v1: ProcessSnapshot = { code: item.code, domainCode: item.domainCode, name: item.name, objective: item.objective, content: null };
      await prisma.$transaction(async (tx) => {
        const def = await tx.processDefinition.create({
          data: { code: item.code, domainCode: item.domainCode, domainName: item.domainName, name: item.name, objective: item.objective, seedStatus: item.seedStatus, active: item.isActive },
        });
        await tx.processRevision.create({ data: { processDefinitionId: def.id, version: 1, changeNotes: "Catálogo inicial (Anexo A)", contentJson: v1 as unknown as Prisma.InputJsonValue } });
        if (content) await applySheet(tx, def.id, 2, { ...v1, objective, content });
      });
      created++;
      if (content) sheetsApplied++;
      continue;
    }
    // Ficha nova ou atualizada no seed (ex.: fórmulas de KPI) → nova revisão, nunca sobre processo personalizado.
    const changed = content && stableJson(existing.contentJson) !== stableJson(content);
    if (content && changed && !existing.customized) {
      await prisma.$transaction((tx) =>
        applySheet(tx, existing.id, existing.currentVersion + 1, { code: existing.code, domainCode: existing.domainCode, name: existing.name, objective, content }, existing.hasFullSheet ? "Atualização da ficha no seed (fórmulas de KPI)" : undefined),
      );
      sheetsApplied++;
    }
  }
  const total = await prisma.processDefinition.count();
  const full = await prisma.processDefinition.count({ where: { hasFullSheet: true } });
  return { created, sheetsApplied, total, full };
}

async function applySheet(tx: Prisma.TransactionClient, id: string, version: number, snap: ProcessSnapshot, notes = "Ficha completa (Anexo C)") {
  await tx.processRevision.create({ data: { processDefinitionId: id, version, changeNotes: notes, contentJson: snap as unknown as Prisma.InputJsonValue } });
  await tx.processDefinition.update({
    where: { id },
    data: { objective: snap.objective, contentJson: snap.content as Prisma.InputJsonValue, hasFullSheet: true, currentVersion: version, baseVersion: version },
  });
}

/** JSON com chaves ordenadas (jsonb do Postgres não preserva a ordem). */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
