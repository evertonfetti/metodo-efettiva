/** Rótulos pt-BR das operações de job (nunca exibir o código cru). */
export const JOB_LABELS: Record<string, string> = {
  "system.ping": "Verificação da fila",
  "document.export": "Exportação de documento",
  "import.commit": "Importação de dados",
  "ai.generate": "Sugestão com IA",
};

export const jobLabel = (op: string) => JOB_LABELS[op] ?? "Processamento";
