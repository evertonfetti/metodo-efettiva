import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { FileAccessLevel } from "@/generated/prisma/enums";

/**
 * StorageAdapter local (volume Docker). Arquivos ficam sob prefixo privado por cliente:
 * clients/<clientId>/<aaaa-mm>/<uuid>.<ext>. Nunca há URL pública: download só por rota autenticada.
 */

type Detected = { mime: string; ext: string };

const ALLOWED: Record<string, Detected> = {
  pdf: { mime: "application/pdf", ext: "pdf" },
  png: { mime: "image/png", ext: "png" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
  csv: { mime: "text/csv", ext: "csv" },
  txt: { mime: "text/plain", ext: "txt" },
  md: { mime: "text/markdown", ext: "md" },
};

/** Detecta o tipo real pelo conteúdo (assinatura) + extensão; rejeita executáveis e formatos com macro. */
export function detectFileType(buf: Buffer, originalName: string): Detected {
  const ext = path.extname(originalName).slice(1).toLowerCase();
  const head = buf.subarray(0, 8);
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (head.subarray(0, 4).toString("latin1") === "%PDF") return ALLOWED.pdf!;
  if (head[0] === 0x89 && head.subarray(1, 4).toString("latin1") === "PNG") return ALLOWED.png!;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return ALLOWED.jpg!;
  if (head[0] === 0x4d && head[1] === 0x5a) throw new AppError("VALIDATION", "Arquivo executável não é permitido.");
  if (isZip) {
    if (ext === "xlsx" || ext === "docx") {
      // OOXML com macro tem vbaProject.bin dentro do zip.
      if (buf.includes(Buffer.from("vbaProject.bin"))) throw new AppError("VALIDATION", "Arquivos com macro não são permitidos.");
      return ALLOWED[ext]!;
    }
    throw new AppError("VALIDATION", "Tipo de arquivo compactado não permitido.");
  }
  if ((ext === "csv" || ext === "txt" || ext === "md") && isProbablyText(buf)) return ALLOWED[ext]!;
  throw new AppError("VALIDATION", "Tipo de arquivo não permitido. Use PDF, PNG, JPG, XLSX, DOCX, CSV, TXT ou MD.");
}

function isProbablyText(buf: Buffer) {
  const sample = buf.subarray(0, 4096);
  return !sample.includes(0);
}

export function safeFileName(name: string): string {
  const base = path.basename(name).normalize("NFC").replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").trim();
  return (base || "arquivo").slice(0, 160);
}

const storageRoot = () => path.resolve(env().STORAGE_DIR);

function absolutePath(storageKey: string) {
  const full = path.resolve(storageRoot(), storageKey);
  if (!full.startsWith(storageRoot() + path.sep)) throw new AppError("FORBIDDEN", "Caminho de arquivo inválido.");
  return full;
}

export type PutFileInput = {
  clientId: string | null;
  uploadedBy: string | null;
  originalName: string;
  data: Buffer;
  maxBytes: number;
  accessLevel?: FileAccessLevel;
  /** Para arquivos gerados pelo sistema (exportações) com tipo conhecido. */
  forcedType?: Detected;
};

/** Grava arquivo privado + FileAsset (sha256, tamanho, tipo real). */
export async function putFile(input: PutFileInput) {
  if (input.data.length === 0) throw new AppError("VALIDATION", "Arquivo vazio.");
  if (input.data.length > input.maxBytes) throw new AppError("VALIDATION", `Arquivo maior que o limite de ${Math.round(input.maxBytes / 1_048_576)} MB.`);
  const type = input.forcedType ?? detectFileType(input.data, input.originalName);
  const id = randomUUID();
  const month = new Date().toISOString().slice(0, 7);
  const prefix = input.clientId ? `clients/${input.clientId}` : "system";
  const storageKey = `${prefix}/${month}/${id}.${type.ext}`;
  const full = absolutePath(storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, input.data, { mode: 0o600 });
  try {
    return await prisma.fileAsset.create({
      data: {
        id,
        clientId: input.clientId,
        uploadedBy: input.uploadedBy,
        originalName: safeFileName(input.originalName),
        storageKey,
        sha256: createHash("sha256").update(input.data).digest("hex"),
        mime: type.mime,
        bytes: input.data.length,
        accessLevel: input.accessLevel ?? "INTERNAL",
      },
    });
  } catch (err) {
    await rm(full, { force: true });
    throw err;
  }
}

/**
 * Lê arquivo verificando que pertence ao cliente informado (a autorização do usuário
 * sobre o cliente deve ter sido verificada antes). Arquivo de outro cliente → 404.
 */
export async function readClientFile(clientId: string, fileId: string) {
  const file = await prisma.fileAsset.findFirst({ where: { id: fileId, clientId } });
  if (!file) throw new AppError("NOT_FOUND", "Arquivo não encontrado.");
  if (!file.storageKey.startsWith(`clients/${clientId}/`)) throw new AppError("NOT_FOUND", "Arquivo não encontrado.");
  const data = await readFile(absolutePath(file.storageKey));
  return { file, data };
}

export async function deleteFile(storageKey: string) {
  await rm(absolutePath(storageKey), { force: true });
}
