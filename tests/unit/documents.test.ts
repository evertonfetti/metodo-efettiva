import { describe, expect, it } from "vitest";
import { runQa } from "@/features/documents/qa";
import { renderMarkdown } from "@/features/documents/render/markdown";
import { renderHtml } from "@/features/documents/render/html";
import type { DocContent, Sources } from "@/features/documents/content";

const sources: Sources = { clientId: "c1", clientName: "X", projectId: null, assessmentId: null, assessmentLabel: null, processes: [{ code: "C05", version: 3 }], opportunityIds: [], evidence: [{ ref: "EV-001", label: "a", kind: "k" }], generatedAt: "", generator: "t" };
const content = (over: Partial<DocContent["sections"][number]>[] = []): DocContent => ({
  sections: [
    { key: "capa", title: "Capa", visibility: "CLIENTE", state: "APPROVED", origin: "o", manuallyEdited: false, blocks: [{ type: "paragraph", text: "Ver EV-001." }] },
    { key: "notas", title: "Notas internas secretas", visibility: "INTERNO", state: "APPROVED", origin: "o", manuallyEdited: false, blocks: [{ type: "paragraph", text: "margem <b>alvo</b>" }] },
    ...over.map((o, i) => ({ key: `s${i}`, title: `S${i}`, visibility: "CLIENTE" as const, state: "APPROVED" as const, origin: "o", manuallyEdited: false, blocks: [], ...o })),
  ],
});
const facts = { documentClientId: "c1", catalogCodes: new Set(["C05"]), approvedContentModified: false, assessmentCoverage: 1, assessmentFinalized: true, tasksWithoutDueDate: 0, hasCommercialData: true };
const errors = (c: DocContent, s = sources, f = facts) => runQa(c, s, f).filter((q) => q.level === "error").map((q) => q.id);

describe("QA pré-exportação (9.4)", () => {
  it("documento correto passa", () => expect(errors(content())).toEqual([]));
  it("bloqueia KPI sem fórmula, evidência inexistente, promessa, processo e cliente errados", () => {
    expect(errors(content([{ blocks: [{ type: "table", kind: "kpi", headers: ["Indicador", "Processo", "Fórmula", "Baseline", "Meta", "Fonte"], rows: [["Taxa", "C05", "[PENDENTE: fórmula]", "12", "x", ""]] }] }]))).toEqual(expect.arrayContaining(["kpi-formula", "financial-source"]));
    expect(errors(content([{ blocks: [{ type: "paragraph", text: "Conforme EV-009" }] }]))).toContain("evidence");
    expect(errors(content([{ blocks: [{ type: "paragraph", text: "Com este processo o faturamento vai dobrar." }] }]))).toContain("promises");
    expect(errors(content([{ processCode: "Z99" }]))).toEqual(expect.arrayContaining(["processes", "pop"]));
    expect(errors(content(), { ...sources, clientId: "c2" })).toContain("client");
    expect(errors(content([{ state: "PENDING" }]))).toContain("sections");
    expect(errors(content(), sources, { ...facts, approvedContentModified: true })).toContain("immutable");
  });
});

describe("audiência e escape nos renderizadores", () => {
  const meta = { title: "Playbook", clientName: "X", projectName: null, version: 1, stateLabel: "Aprovada", dateLabel: "21/11/2026", isDraft: false, brand: { companyName: "Efettiva", tagline: "", footerText: "", confidentiality: "Confidencial" } } as const;
  it("arquivo CLIENTE não contém seção INTERNO", () => {
    expect(renderMarkdown(content(), { ...meta, audience: "CLIENTE" })).not.toContain("Notas internas secretas");
    expect(renderMarkdown(content(), { ...meta, audience: "INTERNO" })).toContain("Notas internas secretas");
    expect(renderHtml(content(), { ...meta, audience: "CLIENTE" })).not.toContain("Notas internas secretas");
  });
  it("HTML escapa conteúdo e marca rascunho", () => {
    const html = renderHtml(content(), { ...meta, audience: "INTERNO", isDraft: true });
    expect(html).toContain("margem &lt;b&gt;alvo&lt;/b&gt;");
    expect(html).toContain('class="watermark"');
  });
});
