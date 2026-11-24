import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "efettiva_session";
const PUBLIC_PATHS = ["/login", "/api/health", "/api/v1/auth/login"];

/**
 * Barreira rápida: sem cookie de sessão, páginas vão ao /login e APIs recebem 401.
 * A validação real da sessão e da autorização por cliente acontece no servidor (layouts/rotas).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ code: "UNAUTHENTICATED", message: "Sessão expirada. Entre novamente." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" || pathname === "/dashboard" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|robots.txt).*)"],
};
