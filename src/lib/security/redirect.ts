/**
 * Aceita apenas caminhos internos (mesma origem) para redirecionar após login.
 * Rejeita URLs absolutas, protocol-relative (`//x`), barras invertidas (`/\x`) e caracteres de controle.
 */
export function safeInternalPath(next: string, fallback = "/dashboard"): string {
  if (!next || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return fallback;
  try {
    const base = "http://efettiva.internal";
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    const out = u.pathname + u.search + u.hash;
    // Revalida após normalização: "/.//x" e "/a/..//x" viram "//x" (protocol-relative).
    if (!out.startsWith("/") || out.startsWith("//") || out.startsWith("/\\")) return fallback;
    return out;
  } catch {
    return fallback;
  }
}
