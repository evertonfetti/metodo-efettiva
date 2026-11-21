# Índice da especificação (ESPECIFICACAO_MESTRA_EFETTIVA_OS.md)

Use: `sed -n 'INICIO,FIMp' ESPECIFICACAO_MESTRA_EFETTIVA_OS.md` lendo **só as seções da fase atual**.
Para UI, sempre `docs/UI_LAYOUT.md` (303 linhas) + mockup em `docs/design/`.

| Linha | Seção | Conteúdo |
|---|---|---|
| 14 | 0 Resumo executivo | Objetivo do produto, IA como copiloto |
| 22 | 0.1 Objetivos de negócio | 7 objetivos |
| 32 | 0.2 Princípios inegociáveis | Isolamento, sem IA obrigatória, fonte dos números, sem envio automático |
| 45 | 0.3 Fora do MVP | SaaS, portal cliente, disparos etc. |
| 53 | 1.1 Perfis | OWNER, CONSULTANT, VIEWER(F2); primeiro usuário seguro |
| 63 | 1.2 Estrutura | Cliente → diagnóstico → oportunidade → projeto → processo → ações → relatórios |
| 69 | 1.3 Segmentos | Distribuidoras, indústria B2B, serviços B2B, representantes, varejo, recorrente, OUTRO |
| 84–152 | 2 Jornadas J01–J06 | Novo cliente, diagnóstico, importação, priorização/projeto, playbook, implantação |
| 160 | M01 | RF-001..006 login, autorização, menu, busca, auditoria |
| 169 | M02 | RF-010..014 cadastro de cliente, contatos, visão 360°, notas/tags/arquivos |
| 177 | M03 | RF-020..027 questionário versionado, tipos de resposta, autosave, não sei, score/cobertura, achados, snapshot |
| 190 | M04 | RF-030..039 importador CSV/XLSX, mapeamento, idempotência, pt-BR, estados do lote; convenção pedido×faturamento |
| 205 | M05 | RF-040..050 KPIs, inatividade, ABC, margem, priorização I×C÷E, status de oportunidade |
| 221 | M06 | RF-060..065 catálogo 146 processos, 10 fichas, vínculo oportunidade↔processo, versões |
| 230 | M07 | RF-070..077 projetos, plano 30/60/90, tarefas, kanban, reuniões, status por processo, VALIDATED/SUSTAINED |
| 241 | M08 | RF-080..089 playbook geral/processo, POP, editor, versões, DOCX/PDF/MD, INTERNO×CLIENTE, marca d'água |
| 254 | M09 | RF-090..098 AiProvider, JSON+Zod, evidências, logs de geração, minimização |
| 266 | M10 | RF-100..108 painéis, baseline congelado, snapshots, relatório, observado×estimado, ROI |
| 278 | M11 | RF-110..115 marca, IA, parâmetros, exportação/exclusão, backup |
| 290 | 4.1 Stack | Next.js, Prisma, PG, BullMQ, TipTap, docx, Playwright PDF, Vitest |
| 316 | 4.2 Estrutura repo | Pastas sugeridas |
| 377 | 4.3 Fluxo técnico | Regras worker/jobs (clientId, idempotencyKey) |
| 396 | 4.4 Estado e falhas | Status de jobs, transações, SHA-256 de anexos |
| 409 | 5 Convenções de dados | UUID, Decimal, clientId, deletedAt |
| 411 | 5.1 Auth/empresas | User, Session, Client, ClientAccess, ClientContact, ClientNote, AuditEvent, FileAsset |
| 424 | 5.2 Diagnóstico | AssessmentTemplate/Question/Answer/Evidence/Score; DSL de condições |
| 437 | 5.3 Importação | ImportBatch, ImportRowError, Customer, Product, Sale, SaleItem, Quote, Interaction, MetricSnapshot; índices |
| 454 | 5.4 Projetos | Finding, Opportunity, ProcessDefinition/Revision, OpportunityProcess, Project, ProjectProcess, ActionTask, Evidence, Meeting, Baseline, Risk |
| 471 | 5.5 Documentos/IA | Document, DocumentRevision, DocumentExport, AiGeneration, ReportPeriod, MetricDefinition, SystemSetting |
| 485 | 5.6 Estados | Máquinas de estado de Assessment, Opportunity, Project, DocumentRevision, ReportPeriod |
| 498 | 6.1 Arquivos-modelo | Colunas de clientes/produtos/vendas/itens/orçamentos/interações |
| 549 | 6.2 Validação/idempotência | Separador, BOM, cancelados, negativos, external_id obrigatório, reimportação |
| 562 | 6.3 Qualidade | Alertas DADOS_INSUFICIENTES, PERIODO_CURTO etc. |
| 568 | 7 KPIs | Tabela de 19 KPIs com fórmula |
| 594 | 7.1 Inatividade | Mediana dos intervalos × fator |
| 598 | 7.2 ABC | 80/95 |
| 602 | 7.3 Priorização | I×C÷E, risco crítico |
| 606 | 7.4 Baseline | Antes/depois, sem dupla contagem |
| 618 | 8.1 Tarefas IA | Lista de taskTypes |
| 624 | 8.2 Pipeline IA | ContextAssembler → … → Exportador |
| 637 | 8.3 EvidenceRef | Tipo TS |
| 654 | 8.4 PlaybookDraft | Schema do playbook |
| 708 | 8.5 Prompt base | Texto do system prompt |
| 724 | 8.6 Segurança IA | externalAiAllowed, custo, injection |
| 747 | 9.1 Playbook geral | 18 seções obrigatórias |
| 772 | 9.2 Ficha/POP | 15 campos |
| 792 | 9.3 Relatório periódico | 11 seções + frase de não causalidade |
| 798 | 9.4 QA pré-exportação | Bloqueios e alertas |
| 805 | 10 UX | (UI_LAYOUT prevalece) diretrizes, mapa de telas (809), componentes (834), usabilidade (838) |
| 851 | 11 APIs | Tabela de rotas /api/v1, formato de erro |
| 889 | 11.1–11.2 Exemplos | Criação de oportunidade, job de playbook |
| 938 | 12.1 Isolamento | assertClientAccess, testes de troca de ID |
| 948 | 12.2 Segurança app | Argon2id, CSRF, headers, rate limit |
| 958 | 12.3 LGPD | Recursos mínimos |
| 964 | 12.4 Backup | Restauração testável |
| 982 | 13 RNF | RNF-01..13 |
| 1008 | 14 Fase 0 | Fundação |
| 1014 | Fase 1 | Cadastro e diagnóstico |
| 1020 | Fase 2 | Biblioteca, oportunidades, projetos |
| 1026 | Fase 3 | Playbook sem IA (MARCO CENTRAL) |
| 1034 | Fase 4 | Importações e KPIs |
| 1040 | Fase 5 | IA supervisionada |
| 1046 | Fase 6 | Resultados e relatórios |
| 1052 | Fase 7 | Robustez |
| 1068 | 15 Testes obrigatórios | 10 testes automatizados |
| 1081 | Testes manuais | Lista |
| 1099 | 16 Seed DEMO | Distribuidora Modelo B2B, 200 clientes, roteiro de demonstração |
| 1127 | 17 Decisões resolvidas | Tabela de defaults |
| 1153 | Anexo A | 146 processos (já em catalogo_processos_seed.json) |
| 1374 | Anexo B | 96 perguntas (já em questionario_diagnostico_seed.json) |
| 1510 | Anexo C | 10 fichas completas (C05 1514, V11 1526, V05 1537, C01 1547, C04 1556, C06 1566, L05 1575, P04 1585, A03 1596, G05 1606) → prisma/seed-data/processos-detalhados.json |
| 1617 | Anexo D | 5 fases do método e gates |
| 1633 | Anexo E | Ordem de execução; resultado mínimo utilizável (1650) |

## Seeds
- `catalogo_processos_seed.json`: `{version,total,processes[{code,domainCode,domainName,name,objective,seedStatus(BASIC|CORE),isActive}]}` — 146, 14 áreas, 10 CORE.
- `questionario_diagnostico_seed.json`: `{version,total,questions[{code,domainCode(DIAG01..12),domainName,title,type(SCALE_0_5),weight,allowUnknown,allowEvidence,allowNotes,applicableByDefault}]}` — 96, sem condições.
