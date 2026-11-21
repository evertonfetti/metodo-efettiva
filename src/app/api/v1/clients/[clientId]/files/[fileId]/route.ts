import { apiRoute, attachment } from "@/lib/api";
import { assertClientAccess, isUuid } from "@/lib/security/access";
import { notFound } from "@/lib/errors";
import { readClientFile } from "@/lib/storage";

type P = { clientId: string; fileId: string };
/** Download autenticado: valida acesso ao cliente e que o arquivo pertence a ele. */
export const GET = apiRoute<P>(async ({ user, params }) => {
  await assertClientAccess(user, params.clientId, "VIEW");
  if (!isUuid(params.fileId)) throw notFound("Arquivo");
  const { file, data } = await readClientFile(params.clientId, params.fileId);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": file.mime, "Content-Disposition": attachment(file.originalName), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
});
