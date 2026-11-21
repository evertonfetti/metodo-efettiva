import { hash, verify } from "@node-rs/argon2";

// Argon2id (algorithm 2) com parâmetros OWASP: m=19 MiB, t=2, p=1.
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

/** Hash fixo usado para equalizar tempo de resposta quando o e-mail não existe. */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword("efettiva-dummy-password-for-timing");
  return dummyHash;
}
