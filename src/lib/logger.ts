import pino from "pino";

/** Logger estruturado. Nunca registrar senhas, tokens, prompts integrais ou dados pessoais. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "efettiva-os" },
  redact: {
    paths: ["password", "*.password", "token", "*.token", "passwordHash", "*.passwordHash", "authorization", "cookie"],
    censor: "[omitido]",
  },
});
