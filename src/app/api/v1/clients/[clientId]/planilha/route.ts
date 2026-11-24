import { apiRoute, attachment } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { buildWorkbook } from "@/features/workbook/build";

type P = { clientId: string };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Baixa a planilha do cliente: `?modo=modelo` (em branco, com exemplos) ou `?modo=dados` (o que já existe). */
export const GET = apiRoute<P>(async ({ req, user, params }) => {
  const modo = new URL(req.url).searchParams.get("modo");
  if (modo !== "modelo" && modo !== "dados") throw new AppError("VALIDATION", "Informe modo=modelo ou modo=dados.");
  const { data, fileName } = await buildWorkbook(user, params.clientId, modo === "modelo" ? "template" : "data");
  return new Response(new Uint8Array(data), { headers: { "Content-Type": XLSX, "Content-Disposition": attachment(fileName), "Cache-Control": "private, no-store" } });
});
