import { apiRoute, attachment } from "@/lib/api";
import { downloadExport } from "@/features/documents/service";

type P = { clientId: string; exportId: string };
/** Download autenticado; exportação e arquivo revalidados sob o clientId da rota; audiência já filtrada no worker. */
export const GET = apiRoute<P>(async ({ user, params }) => {
  const { file, data } = await downloadExport(user, params.clientId, params.exportId);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": file.mime, "Content-Disposition": attachment(file.originalName), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
