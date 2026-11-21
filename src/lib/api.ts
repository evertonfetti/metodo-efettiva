import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security/origin";
import { requireUser } from "@/lib/security/session";
import type { SessionUser } from "@/features/auth/service";

type Ctx<P> = { params: Promise<P> };

/**
 * Envolve um handler REST: exige sessão, valida origem em métodos mutáveis
 * e padroniza erros `{ code, message, details?, traceId }`.
 */
export function apiRoute<P = Record<string, string>>(
  handler: (args: { req: Request; user: SessionUser; params: P }) => Promise<unknown>,
  opts: { status?: number } = {},
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      const user = await requireUser();
      const params = await ctx.params;
      const result = await handler({ req, user, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { status: opts.status ?? 200 });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function jsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function searchParams(req: Request) {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}

/** Content-Disposition seguro (RFC 5987) para downloads. */
export function attachment(filename: string, inline = false) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
