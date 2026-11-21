import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL obrigatório"),
  REDIS_URL: z.string().default("redis://localhost:6380"),
  APP_URL: z.string().default("http://localhost:3000"),
  APP_ENCRYPTION_KEY: z.string().optional(),
  STORAGE_DIR: z.string().default("./storage"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  LOG_LEVEL: z.string().default("info"),
  ANTHROPIC_API_KEY: z.string().optional(),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Variáveis de ambiente validadas (somente servidor). */
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
