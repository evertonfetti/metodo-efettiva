import { NextResponse } from "next/server";
import { checkHealth } from "@/features/system/health";

export const dynamic = "force-dynamic";

/** Health check público (sem dados de clientes). 200 = ok; 503 = degradado. */
export async function GET() {
  const report = await checkHealth();
  return NextResponse.json(report, { status: report.status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
