import { apiRoute } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createBatch, listBatches } from "@/features/imports/service";

type P = { clientId: string };
export const GET = apiRoute<P>(async ({ user, params }) => ({ items: await listBatches(user, params.clientId) }));
/** Upload multipart: `file`, `type`, `sourceSystem`, `recordKind` (vendas: ORDER|INVOICE). */
export const POST = apiRoute<P>(async ({ req, user, params }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION", "Envie o arquivo no campo 'file'.");
  return createBatch(user, params.clientId, { type: form!.get("type"), sourceSystem: form!.get("sourceSystem"), recordKind: form!.get("recordKind") ?? undefined }, { name: file.name, data: Buffer.from(await file.arrayBuffer()) });
}, { status: 201 });
