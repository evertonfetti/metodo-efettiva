/** Mapa central enum → rótulo pt-BR, tom e símbolo (UI_LAYOUT §6). Nunca renderizar enum cru. */

export type Tone = "ok" | "info" | "neutral" | "warn" | "err" | "blocked" | "navy";

export type StatusDef = { label: string; tone: Tone; symbol: string; strike?: boolean };

const S = (label: string, tone: Tone, symbol: string, strike = false): StatusDef => ({ label, tone, symbol, strike });

export const STATUS_MAP = {
  task: {
    TODO: S("Pendente", "neutral", "○"),
    IN_PROGRESS: S("Em andamento", "info", "●"),
    BLOCKED: S("Bloqueada", "blocked", "⊘"),
    DONE: S("Concluída", "ok", "✓"),
  },
  opportunity: {
    DETECTED: S("Detectada", "neutral", "○"),
    REVIEWED: S("Revisada", "info", "●"),
    APPROVED: S("Aprovada", "ok", "✓"),
    DISMISSED: S("Descartada", "neutral", "○", true),
    LINKED_TO_PROJECT: S("Em projeto", "ok", "✓"),
  },
  origin: {
    RULE: S("Regra", "neutral", "·"),
    CONSULTANT: S("Consultor", "neutral", "·"),
    AI_SUGGESTION: S("Sugestão IA", "neutral", "·"),
  },
  processImpl: {
    PLANNED: S("Planejado", "neutral", "○"),
    IN_PROGRESS: S("Em andamento", "info", "●"),
    PILOT: S("Piloto", "info", "◐"),
    ACTIVE: S("Ativo", "info", "●"),
    VALIDATED: S("Validado", "ok", "✓"),
    SUSTAINED: S("Sustentado", "ok", "✓"),
    BLOCKED: S("Bloqueado", "blocked", "⊘"),
    CANCELLED: S("Cancelado", "neutral", "○"),
  },
  revision: {
    DRAFT: S("Rascunho", "neutral", "○"),
    READY_FOR_REVIEW: S("Em revisão", "info", "◐"),
    APPROVED: S("Aprovada", "ok", "✓"),
    PUBLISHED: S("Publicada", "ok", "✓"),
  },
  visibility: {
    INTERNO: S("INTERNO", "blocked", "⊘"),
    CLIENTE: S("Cliente", "neutral", "○"),
  },
  assessment: {
    DRAFT: S("Rascunho", "neutral", "○"),
    IN_REVIEW: S("Em revisão", "info", "◐"),
    FINALIZED: S("Fechado", "ok", "✓"),
  },
  job: {
    QUEUED: S("Na fila", "neutral", "○"),
    RUNNING: S("Em execução", "info", "●"),
    COMPLETED: S("Concluído", "ok", "✓"),
    FAILED: S("Falhou", "err", "✕"),
    CANCELLED: S("Cancelado", "neutral", "○"),
  },
  project: {
    DRAFT: S("Rascunho", "neutral", "○"),
    APPROVED: S("Aprovado", "info", "●"),
    ACTIVE: S("Ativo", "info", "●"),
    PAUSED: S("Pausado", "blocked", "⊘"),
    COMPLETED: S("Concluído", "ok", "✓"),
    CANCELLED: S("Cancelado", "neutral", "○"),
  },
  client: {
    ACTIVE: S("Ativo", "ok", "✓"),
    PAUSED: S("Pausado", "blocked", "⊘"),
    ARCHIVED: S("Arquivado", "neutral", "○"),
  },
  report: {
    DRAFT: S("Rascunho", "neutral", "○"),
    APPROVED: S("Aprovado", "ok", "✓"),
    EXPORTED: S("Exportado", "ok", "✓"),
  },
  importBatch: {
    UPLOADED: S("Enviado", "neutral", "○"),
    MAPPED: S("Mapeado", "info", "◐"),
    VALIDATED: S("Validado", "info", "●"),
    IMPORTING: S("Importando", "info", "●"),
    COMPLETED: S("Concluído", "ok", "✓"),
    PARTIAL: S("Parcial", "warn", "!"),
    FAILED: S("Falhou", "err", "✕"),
  },
} as const satisfies Record<string, Record<string, StatusDef>>;

export type StatusContext = keyof typeof STATUS_MAP;

export function statusDef(context: StatusContext, value: string): StatusDef {
  const map = STATUS_MAP[context] as Record<string, StatusDef>;
  return map[value] ?? S("Desconhecido", "neutral", "?");
}

export const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  info: "bg-info-bg text-info",
  neutral: "bg-neutral-bg text-neutral",
  warn: "bg-warn-bg text-warn",
  err: "bg-err-bg text-err",
  blocked: "bg-blocked-bg text-blocked",
  navy: "bg-navy text-white",
};
