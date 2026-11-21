import { AppError } from "@/lib/errors";

/**
 * Mitigação de CSRF para rotas REST que usam cookie: exige Origin (ou Referer)
 * igual ao host da requisição ou ao APP_URL. Server Actions já têm checagem própria do Next.
 */
export function assertSameOrigin(req: Request) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const origin = req.headers.get("origin") ?? refererOrigin(req.headers.get("referer"));
  if (!origin) throw new AppError("FORBIDDEN", "Origem da requisição ausente.");

  const allowed = new Set<string>();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);

  if (!allowed.has(origin)) throw new AppError("FORBIDDEN", "Origem da requisição não permitida.");
}

function refererOrigin(referer: string | null) {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
