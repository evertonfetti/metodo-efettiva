import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/security/redirect";

describe("redirect pós-login", () => {
  it("aceita caminho interno", () => {
    expect(safeInternalPath("/clientes/abc?x=1")).toBe("/clientes/abc?x=1");
  });
  it("rejeita destinos externos", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "\\\\evil", "javascript:alert(1)", "/\tx", ""]) {
      expect(safeInternalPath(bad)).toBe("/dashboard");
    }
  });
});
