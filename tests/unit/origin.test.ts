import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "@/lib/security/origin";

const req = (method: string, headers: Record<string, string>) => new Request("http://localhost:3000/api/v1/x", { method, headers });

describe("proteção CSRF por origem", () => {
  it("permite GET sem origem", () => {
    expect(() => assertSameOrigin(req("GET", {}))).not.toThrow();
  });
  it("permite POST da mesma origem", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "http://localhost:3000", host: "localhost:3000" }))).not.toThrow();
  });
  it("bloqueia POST de outra origem ou sem origem", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://evil.example", host: "localhost:3000" }))).toThrow();
    expect(() => assertSameOrigin(req("POST", { host: "localhost:3000" }))).toThrow();
  });
});
