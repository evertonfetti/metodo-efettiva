import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Cifra AES-256-GCM para dados sensíveis (ex.: CPF/CNPJ). Formato: v1.<iv>.<tag>.<dados> em base64url. */
function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) throw new Error("APP_ENCRYPTION_KEY ausente ou curta: necessária para cifrar dados sensíveis.");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string | null {
  try {
    const [v, iv, tag, data] = payload.split(".");
    if (v !== "v1" || !iv || !tag || !data) return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Exibe somente os 4 últimos dígitos. */
export function maskTaxId(plain: string | null): string | null {
  if (!plain) return null;
  const digits = plain.replace(/\D/g, "");
  return digits.length <= 4 ? "••••" : `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
