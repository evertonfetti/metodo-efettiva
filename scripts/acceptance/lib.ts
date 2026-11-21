/** Cliente HTTP mínimo com cookie de sessão para scripts de aceite (rodam contra o servidor real). */
export function makeClient(base: string) {
  let cookie = "";
  async function call(method: string, path: string, body?: unknown, raw = false) {
    const isForm = body instanceof FormData;
    const res = await fetch(base + path, {
      method,
      headers: { origin: base, ...(cookie ? { cookie } : {}), ...(body && !isForm ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      redirect: "manual",
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0]!;
    const text = await res.text();
    let json: unknown = null;
    if (!raw) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }
    return { status: res.status, text, json: json as any, headers: res.headers }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  /** GET binário autenticado (downloads). */
  async function bytes(path: string) {
    const res = await fetch(base + path, { headers: { origin: base, ...(cookie ? { cookie } : {}) } });
    return { status: res.status, data: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  }
  return { call, bytes };
}

export function check(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`  ✕ ${msg}`);
    process.exitCode = 1;
    throw new Error(msg);
  }
  console.log(`  ✓ ${msg}`);
}
