import { describe, expect, it } from "vitest";
import { numbersIn, restore, validateDraft } from "@/features/ai/validate";
import type { SectionDraft } from "@/features/ai/schemas";

const draft = (blocks: SectionDraft["blocks"], extra: Partial<SectionDraft> = {}): SectionDraft => ({ blocks, evidenceRefs: [], processCodes: [], assumptions: [], missingData: [], openQuestions: [], reviewRequests: [], confidence: "MEDIUM", ...extra });
const p = (text: string): SectionDraft["blocks"][number] => ({ type: "paragraph", text, ordered: null, items: null, headers: null, rows: null, tone: null });
const allowed = { evidence: ["EV-001", "EV-002"], processCodes: ["C05", "V05"], contextText: "40 clientes inativos de 200; taxa 12,5%; R$ 1.234,56 · 15 dias", kpiTablePresent: false };
const errors = (d: SectionDraft) => validateDraft(d, allowed).issues.filter((i) => i.level === "error").map((i) => i.code);

describe("IA: validação de negócio (8.2/RF-097)", () => {
  it("teste 9: evidência inexistente é rejeitada", () => {
    expect(errors(draft([p("Há 40 clientes inativos (EV-009).")], { evidenceRefs: ["EV-009"] }))).toContain("INVALID_EVIDENCE");
    expect(errors(draft([p("Há 40 clientes inativos (EV-001).")], { evidenceRefs: ["EV-001"] }))).toEqual([]);
  });
  it("número sem fonte e código de processo fora do catálogo", () => {
    expect(errors(draft([p("A empresa vai recuperar R$ 100.000 em 30 dias com C05.")]))).toContain("UNSOURCED_NUMBER");
    expect(errors(draft([p("Aplicar também o processo Z99.")]))).toContain("INVALID_PROCESS");
    expect(errors(draft([p("Taxa de 12,5% e R$ 1.234,56 em 15 dias, 40 de 200 (EV-002) via V05.")]))).toEqual([]);
  });
  it("bloco inválido e saída vazia", () => {
    expect(errors(draft([{ type: "table", text: null, ordered: null, items: null, headers: [], rows: [], tone: null }]))).toEqual(expect.arrayContaining(["INVALID_BLOCK", "EMPTY"]));
  });
  it("normalização numérica pt-BR", () => {
    expect([...numbersIn("R$ 1.234,56 e 12,5% (EV-003) C05 e 7")]).toEqual(["1234.56", "12.5"]);
  });
  it("pseudonimização revertida no texto final", () => {
    const out = restore([{ type: "paragraph", text: "[EMPRESA] e [PATROCINADOR] com [EQUIPE_EFETTIVA]" }], [["[EMPRESA]", "Comercial Alfa Ltda"], ["[EMPRESA]", "Alfa"], ["[PATROCINADOR]", "Maria"], ["[EQUIPE_EFETTIVA]", "João"]]);
    expect(out[0]).toEqual({ type: "paragraph", text: "Alfa e Maria com Equipe Efettiva" });
  });
});
