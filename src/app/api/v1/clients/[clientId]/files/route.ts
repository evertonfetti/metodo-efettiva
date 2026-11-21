import { apiRoute } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { assertClientAccess } from "@/lib/security/access";
import { putFile } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { getSetting } from "@/features/settings/service";

type P = { clientId: string };
/** Upload privado de arquivo do cliente (evidências, anexos). */
export const POST = apiRoute<P>(async ({ req, user, params }) => {
  await assertClientAccess(user, params.clientId, "EDIT");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new AppError("VALIDATION", "Envie um arquivo no campo 'file'.");
  const { uploadMaxMb } = await getSetting("parameters");
  const asset = await putFile({ clientId: params.clientId, uploadedBy: user.id, originalName: file.name, data: Buffer.from(await file.arrayBuffer()), maxBytes: uploadMaxMb * 1_048_576 });
  await audit({ actorUserId: user.id, clientId: params.clientId, entityType: "FileAsset", entityId: asset.id, action: "file.upload", meta: { bytes: asset.bytes, mime: asset.mime } });
  return { id: asset.id, name: asset.originalName, bytes: asset.bytes, mime: asset.mime };
}, { status: 201 });
