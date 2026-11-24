import { IMPORT_TYPES, type ImportTypeCode } from "./fields";

/** Modelo CSV (separador `;`, UTF-8 com BOM — abre corretamente no Excel em pt-BR). */
export function templateCsv(type: ImportTypeCode): string {
  const fs = IMPORT_TYPES[type].fields;
  const q = (s: string) => (/[;"\n]/.test(s) || /,/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + [fs.map((f) => f.key).join(";"), fs.map((f) => q(f.example)).join(";")].join("\r\n") + "\r\n";
}

export async function templateXlsx(type: ImportTypeCode): Promise<Buffer> {
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const fs = IMPORT_TYPES[type].fields;
  const header = fs.map((f) => ({ value: f.key, fontWeight: "bold" as const, backgroundColor: "#031951", color: "#FFFFFF" }));
  const example = fs.map((f) => ({ value: f.example }));
  const help = fs.map((f) => ({ value: `${f.label}${f.required ? " (obrigatório)" : ""}` }));
  return writeXlsxFile([header, example, [], help] as never, { sheet: IMPORT_TYPES[type].file, columns: fs.map(() => ({ width: 22 })) } as never).toBuffer();
}
