import { apiRoute, attachment, searchParams } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { IMPORT_TYPES, type ImportTypeCode } from "@/features/imports/fields";
import { templateCsv, templateXlsx } from "@/features/imports/templates";

type P = { type: string };
/** Arquivo-modelo (seção 6.1): `?format=csv|xlsx`. */
export const GET = apiRoute<P>(async ({ req, params }) => {
  const type = params.type.toUpperCase() as ImportTypeCode;
  if (!IMPORT_TYPES[type]) throw notFound("Modelo");
  const name = `modelo-${IMPORT_TYPES[type].file}`;
  if (searchParams(req).format === "xlsx")
    return new Response(new Uint8Array(await templateXlsx(type)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": attachment(`${name}.xlsx`) } });
  return new Response(templateCsv(type), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment(`${name}.csv`) } });
});
