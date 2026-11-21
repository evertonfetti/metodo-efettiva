import { apiRoute } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { readSystemFile } from "@/lib/storage";
import { getSetting } from "@/features/settings/service";

/** Logo da marca (somente usuários autenticados; sem URL pública). */
export const GET = apiRoute(async () => {
  const brand = await getSetting("brand");
  if (!brand.logoFileId) throw notFound("Logo");
  const { file, data } = await readSystemFile(brand.logoFileId);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": file.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});
