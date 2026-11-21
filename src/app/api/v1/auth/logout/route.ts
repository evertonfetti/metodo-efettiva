import { NextResponse } from "next/server";
import { revokeSessionToken } from "@/features/auth/service";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security/origin";
import { clearSessionCookie, readSessionToken } from "@/lib/security/session";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await revokeSessionToken(await readSessionToken());
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
