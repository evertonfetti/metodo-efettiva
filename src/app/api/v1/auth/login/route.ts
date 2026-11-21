import { NextResponse } from "next/server";
import { authenticate } from "@/features/auth/service";
import { errorResponse } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security/origin";
import { setSessionCookie } from "@/lib/security/session";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = await req.json().catch(() => ({}));
    const { token, expiresAt, user } = await authenticate(body, req.headers.get("user-agent"));
    await setSessionCookie(token, expiresAt);
    return NextResponse.json({ user });
  } catch (err) {
    return errorResponse(err);
  }
}
