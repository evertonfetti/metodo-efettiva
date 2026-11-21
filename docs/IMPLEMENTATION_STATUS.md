# Efettiva OS — Status de implementação

Legenda: **TODO** · **PARTIAL** · **DONE** · **BLOCKED**. Evidência = comando, teste, rota ou commit.
Checklists da seção 14 (Construir/Aceite) e testes da seção 15 da especificação.

## Como verificar (ambiente local deste host)

```bash
sudo docker compose up -d postgres redis
npm test                         # banco efettiva_test isolado
npm run lint && npx tsc --noEmit && npm run build
npx next start -p 3100 & npm run worker &
curl localhost:3100/api/health
```

---

## Fase 0 — Fundação técnica

| Item | Status | Evidência |
|---|---|---|
| Repositório Git + remoto GitHub + .gitignore | DONE | commit inicial enviado a `origin/main` |
| TypeScript strict + Next.js 16 + Tailwind 4 | DONE | `npx tsc --noEmit` e `npm run build` sem erros |
| Prisma 7 + PostgreSQL 17 + migration inicial | DONE | `prisma/migrations/*_fase0_fundacao` aplicada |
| Redis + BullMQ + worker separado | DONE | `npx tsx scripts/check-queue.ts` → job COMPLETED em ~1s |
| Docker (Dockerfile, compose com postgres/redis/migrate/web/worker, volumes) | DONE | `docker compose up -d` em projeto limpo (portas 3200/5434/6381): migrate aplicou migration + criou OWNER; web healthy; worker pronto |
| `.env.example` + `scripts/setup-env.sh` (segredos aleatórios) | DONE | arquivos no repositório; `.env` ignorado |
| Autenticação (Argon2id, sessão HTTP-only com hash, bloqueio 5×/15 min, logout) | DONE | `tests/integration/auth.test.ts` (5 testes) + smoke REST (401/403/200/logout) |
| Autorização base `assertClientAccess` (negar por padrão, 404) | DONE | `tests/integration/access.test.ts` (3 testes) |
| CSRF: origem nas rotas REST | DONE | `tests/unit/origin.test.ts`; smoke: outra origem → 403 |
| Criação segura do OWNER por env (`npm run bootstrap:owner`) | DONE | executado; idempotente |
| Layout: tokens, Manrope, shell (sidebar, topbar, trilha, gaveta mobile) | DONE | `src/components/shell/*`, `globals.css` |
| `/login` | DONE | login/erro/bloqueio funcionando |
| `/dashboard` útil vazio (métricas com fonte, estados vazios, jobs) | DONE | smoke autenticado mostra "Nenhum cliente cadastrado" |
| Configuração inicial (`/configuracoes`: fases do método, escala, parâmetros, IA, usuários, saúde) | DONE | `SystemSetting` + Zod; teste de fila na aba Saúde |
| Logging estruturado (pino, redaction) | DONE | `src/lib/logger.ts` |
| Health check `/api/health` (banco + Redis) | DONE | `curl` → `{"status":"ok"}` |
| Auditoria (AuditEvent: login, logout, bloqueio, settings) | DONE | `src/lib/audit.ts` |
| Loading/erro/not-found no shell | DONE | `src/app/(app)/{loading,error,not-found}.tsx` |
| Testes básicos | DONE | `npm test` → 15/15 |
| Scripts de backup/restauração | PARTIAL | escritos; teste de restauração fica na Fase 7 |
| **Aceite:** iniciar, criar OWNER, entrar/sair, persistir após reinício | DONE | smoke no Docker: login 200, logout invalida cookie; após `down`/`up` mesmo usuário (id preservado) e sessões persistidas |

## Fase 1 — Cadastro e diagnóstico operacional
| Item | Status | Evidência |
|---|---|---|
| Clientes: cadastro (RHF+Zod, revalidação no servidor), edição, busca, filtros, paginação, arquivamento | DONE | `/clientes`, `/clientes/novo`, `/clientes/[id]/editar`; `tests/integration/clients.test.ts` |
| CPF/CNPJ cifrado (AES-256-GCM) e exibido mascarado | DONE | `src/lib/security/crypto.ts`; teste em clients.test.ts |
| Contatos (com base de tratamento LGPD), notas com visibilidade, tags | DONE | Visão 360° |
| Visão 360° (MethodJourney, banner de dados, KPIs "Indisponível" com motivo, barras por área) | DONE | `/clientes/[id]`; screenshot 1440/390 conferido |
| Questionário versionado: 12 áreas, 96 perguntas-base + 14 condicionais, seed idempotente | DONE | `npm run db:seed` 2× → 0 novas; teste "seed" |
| Regras condicionais (DSL limitada) por segmento e por resposta anterior, editáveis em Configurações | DONE | `/configuracoes?aba=diagnostico`; `tests/unit/conditions.test.ts` |
| Tipos de resposta (escala, não sei, não se aplica, texto, número, escolha) + validação por tipo | DONE | assessments.test.ts |
| Evidências (upload privado com detecção de tipo real, link, descrição) e notas | DONE | aceite: upload ok, .exe rejeitado, download cruzado 404 |
| Autosave por resposta com indicador e "tentar de novo" | DONE | PATCH `/api/v1/clients/:id/assessments/:aid` |
| Score/cobertura (não sei/não se aplica não penalizam; null quando sem resposta) | DONE | `tests/unit/scoring.test.ts` (teste obrigatório 6) |
| Achados por regra (idempotentes) e manuais; revisar/aprovar/descartar com motivo | DONE | `/resumo`; assessments.test.ts |
| Fechamento com snapshot imutável + revisões | DONE | edição após fechar → 409; revisão preserva original |
| Exportar resumo simples (Markdown) | DONE | `GET …/summary?format=md` |
| **Aceite:** 2 empresas, diagnóstico completo em uma, fechar e exportar resumo sem misturar | DONE | `npx tsx scripts/acceptance/fase1.ts` → "ACEITE FASE 1: OK" (17 verificações) |

## Fase 2 — Biblioteca, oportunidades e implantação
| Item | Status | Evidência |
|---|---|---|
| Seed 146 processos + 10 fichas completas (Anexo C) | DONE | `prisma/seed-data/processos-detalhados.json`; `seedProcesses` idempotente (teste `projects.test.ts`: 146/10, reexecução cria 0) |
| Biblioteca e ficha versionada | DONE | `/biblioteca`, `/biblioteca/[code]` (histórico `?v=N`), edição gera revisão imutável com lock otimista (409) |
| Mapa de oportunidades + priorização I×C÷E + risco crítico | DONE | `/clientes/[id]/oportunidades` (matriz, detalhe, tabela, filtros); `scoring.ts` + `tests/unit/plan.test.ts` |
| Vínculo oportunidade ↔ processos | DONE | seleção manual + sugestões determinísticas (`mapping.ts`); código inexistente → 422 |
| Projetos, processos no projeto, tarefas, kanban/lista | DONE | `/projetos`, `/projetos/[id]`, `/acoes` (quadro/lista, filtros vencidas/bloqueadas/concluídas/cliente), tarefas com checklist e evidências; Validado/Sustentado com critérios (`rules.ts`) |
| Cronograma 30/60/90 | DONE | `plan.ts`: janelas proporcionais, dias úteis com feriados nacionais, idempotente por `planKey` |
| **Aceite:** 3 achados, 2 oportunidades aprovadas, processos, projeto com tarefas | DONE | `scripts/acceptance/fase2.ts` → "ACEITE FASE 2: OK" (33 checagens, inclui isolamento A×B) |

## Fase 3 — Playbook sem IA (MARCO CENTRAL)
| Item | Status | Evidência |
|---|---|---|
| Geração determinística do playbook (diagnóstico + biblioteca + projeto) | DONE | `features/documents/generate.ts`: 18 seções da 9.1 + capítulo 9.2 por processo; POP avulso; `[PENDENTE: …]` onde falta dado validado; fórmulas de KPI das 10 fichas no seed |
| Editor por seções, revisão, aprovação, versões imutáveis | DONE | `/clientes/[id]/documentos/[docId]` (3 colunas, prévia/edição por blocos, regenerar com confirmação, lock otimista), comparação `/comparar`; trigger `document_revision_immutable` no Postgres |
| Audiência INTERNO/CLIENTE filtrada no servidor | DONE | `filterForAudience` aplicado no worker antes de renderizar; testes unitário + integração + aceite (MD, DOCX, HTML) |
| Exportação DOCX, PDF, MD (marca d'água em rascunho) | DONE | job `document.export` no worker (`docx` 9.15.1, Playwright/Chromium, Manrope embutida); download autenticado `/exports/[id]/download`; aba Marca com logo |
| QA pré-exportação | DONE | `qa.ts` (erros bloqueiam aprovação: cliente, processo, KPI sem fórmula, valor sem fonte, evidência inválida, promessa, INTERNO, imutabilidade, POP sem responsável/passos; alertas da 9.4) |
| **Aceite:** playbook real exportado nos 3 formatos com POPs, KPIs, responsáveis e cronograma | DONE | `scripts/acceptance/fase3.ts` → "ACEITE FASE 3: OK" (fila real + worker; PDF 23 páginas A4); repetido contra a stack Docker (imagem com Chromium, PDF gerado no container do worker) |

## Fase 4 — Importações e KPIs reais
| Item | Status | Evidência |
|---|---|---|
| Arquivos-modelo, wizard CSV/XLSX, mapeamento | DONE | `/api/v1/import-templates/:type?format=csv|xlsx`; `/dados/importar` (Tipo → Arquivo → Mapeamento → Prévia e validação → Confirmação); perfil de mapeamento por cliente+tipo; sinônimos; abas do XLSX; arquivo de erros CSV |
| Deduplicação/idempotência Customer/Product/Sale/Quote | DONE | chaves (cliente, ID) e (cliente, origem, ID); hash por linha → novos/atualizados/sem alteração; commit em lotes de 500 no worker (`import.commit`); `tests/integration/imports.test.ts` |
| KPIs determinísticos, inatividade, ABC, orçamentos parados | DONE | `features/metrics/engine.ts` (puro, `tests/unit/metrics.test.ts`); snapshots com fonte/período/versão/qualidade; achados por regra (DATA:*) com fonte |
| Dashboard de dados + DataQualityBanner | DONE | `/clientes/[id]/dados` (cobertura, KPIs com fonte, série mensal, inatividade, ABC, orçamentos parados, achados, histórico); alertas DADOS_INSUFICIENTES/PERIODO_CURTO/FONTE_NAO_VALIDADA/DADOS_DESATUALIZADOS; 360° com dados reais |
| **Aceite:** importar, reimportar sem duplicar, métricas e oportunidades com fonte | DONE | `scripts/acceptance/fase4.ts` → "ACEITE FASE 4: OK" (valor 12 m confere com cálculo independente; reimportação 0 novos; v2 do playbook com indicadores e v1 aprovada intacta) |

## Fase 5 — IA supervisionada
| Item | Status | Evidência |
|---|---|---|
| AiProvider + adaptador Anthropic, config segura | DONE | `features/ai/provider.ts` + `anthropic.ts` (SDK oficial 1.6.0, `beta.messages.parse` com schema Zod, `fallbacks: "default"`, timeout/retry); chave só em `ANTHROPIC_API_KEY`; modelo/esforço/limites em Configurações → Provedor de IA; autorização por cliente (`externalAiAllowed`, padrão desligado, exige ciência) |
| Context assembly, evidências EV-xxx, minimização | DONE | `features/ai/context.ts`: só dados do cliente/projeto, agregados, empresa/pessoas pseudonimizadas, R$ omitido por padrão, evidências EV-xxx (diagnóstico, indicadores, oportunidades); prévia exata do envio antes de enviar |
| Geração de seção/playbook, revisão, bloqueios de publicação | DONE | job `ai.generate`; até 8 seções por pedido (playbook, POP, roteiros, treinamento, diagnóstico, oportunidades); validação de evidência/processo/número (`validate.ts`); antes/depois com Aceitar/Editar/Rejeitar; seção aceita volta a "Em revisão" e exige aprovação humana; log `AiGeneration` com hash, tokens, custo e decisão |
| **Aceite:** sem chave o sistema segue; com chave gera rascunho com referências válidas | PARTIAL | sem chave: `scripts/acceptance/fase5.ts` → OK (pedido recusado com motivo, playbook e exportação seguem). Com chave: fluxo validado com provedor falso em `tests/integration/ai.test.ts`; **chamada real BLOCKED: não há ANTHROPIC_API_KEY neste ambiente** — rodar `ACCEPT_AI=1 npx tsx scripts/acceptance/fase5.ts` após configurar a chave |

## Fase 6 — Acompanhamento, resultados e relatórios
| Item | Status | Evidência |
|---|---|---|
| Baseline imutável, snapshots, status de processo, evidências, reuniões | DONE | `features/results/service.ts`: baseline = 90 dias antes do início, mesma fórmula/fonte, trigger `project_baseline_immutable`, correção por revisão com motivo; snapshots calculados e manuais (justificativa/fonte, "Estimado"); reuniões (decisões, próximos passos, impedimentos, treinamentos); eventos externos (RF-106); aba Arquivos com evidências |
| Score de adoção, relatórios periódicos e exportações | DONE | aderência = Σ conformes ÷ Σ auditados (última auditoria por processo); tarefas no prazo; relatório REPORT com as 11 seções da 9.3, frase de não causalidade, observado × estimado × não mensurado; editor/versões/exportação da Fase 3; IA opcional (REPORT_NARRATIVE_BUILD) |
| **Aceite:** 60 dias fictícios, baseline × atual, relatório com fonte e limitações | DONE | `npm run db:seed:demo` + `scripts/acceptance/fase6.ts` → "ACEITE FASE 6: OK" (baseline × 2 snapshots, aderência 76,7%, 8 reuniões, relatório aprovado e PDF final, isolamento A × B); `tests/integration/results.test.ts` |

## Fase 7 — Robustez e operação contínua
| Item | Status | Evidência |
|---|---|---|
| Auditoria completa, testes de permissão, backup/restore testado | DONE | Configurações → Auditoria (OWNER, filtros e paginação); `tests/integration/robustness.test.ts` (VIEWER e consultor só-leitura bloqueados em todas as mutações); `scripts/ops/backup-restore-test.sh` → "BACKUP/RESTORE: OK" (stack Docker descartável: backup íntegro, perda simulada, restauração com banco no ponto do backup e arquivo com o mesmo SHA-256) |
| Recuperação de jobs, performance, revisão visual e de segurança | DONE | `lib/jobs/recovery.ts` (presos → fila; FAILED com motivo; "Tentar de novo"); carga `scripts/load/carga.ts`: 100 mil vendas validadas em 8,3 s, gravadas + KPIs em 84 s, reimportação 0 novos em 10 s, consulta paginada < 0,1 s (1 CPU); revisão independente de segurança sem IDOR, 6 correções aplicadas (`docs/DECISIONS.md` Fase 7) |
| LGPD: exportação e exclusão assistida (RF-113) | DONE | Editar cadastro → Dados do cliente (OWNER): JSON completo; exclusão com nome + motivo remove banco e arquivos e registra a eliminação |
| **Aceite:** reinstalação documentada, restore de teste, isolamento verificado, E2E | DONE | README "Reinstalação do zero" (validada: stack nova sobe com as 8 migrations, seed e OWNER no teste de backup); restore OK; isolamento em testes + aceites F1–F6; `scripts/e2e/fluxo.ts` → "E2E FLUXO COMPLETO: OK" no navegador |

## Testes obrigatórios (seção 15)
| # | Teste | Status | Arquivo |
|---|---|---|---|
| 1 | Isolamento por troca de ID | DONE | testes access/clients/assessments/projects/documents + aceites F1–F3 (diagnóstico, arquivo, oportunidade, projeto, tarefa, documento, exportação, download, job com clientId divergente) |
| 2 | Importação idempotente | DONE | `tests/integration/imports.test.ts` + aceite F4 |
| 3 | Moeda `1.234,56` | DONE | `tests/unit/imports.test.ts` |
| 4 | Cancelamentos não inflam vendas | DONE | `tests/unit/metrics.test.ts` + integração + aceite F4 |
| 5 | Ausência de custo → margem indisponível | DONE | `tests/unit/metrics.test.ts` + aceite F4 |
| 6 | Questionário: não sei/não se aplica | DONE | `tests/unit/scoring.test.ts` |
| 7 | Versão aprovada imutável | DONE | `tests/integration/documents.test.ts` (serviço 409 + trigger do banco) |
| 8 | Audiência INTERNO fora do arquivo CLIENTE | DONE | `tests/unit/documents.test.ts` + `tests/integration/documents.test.ts` (MD, DOCX, HTML/PDF) |
| 9 | IA: evidência inexistente rejeitada | DONE | `tests/unit/ai.test.ts` + `tests/integration/ai.test.ts` |
| 10 | E2E cliente → relatório | DONE | `scripts/e2e/fluxo.ts` (navegador) + aceites F1–F6 |

---

PRÓXIMO PASSO: MVP das fases 0–7 entregue. Pendências: (1) aceite real da IA — definir `ANTHROPIC_API_KEY`, reiniciar web e worker e rodar `ACCEPT_AI=1 npx tsx scripts/acceptance/fase5.ts`; (2) deploy no EasyPanel atrás de TLS (`APP_URL` https) e agendamento diário de `scripts/backup.sh` com cópia externa; (3) disco do host em 96% — liberar espaço antes de novos builds Docker; (4) melhorias futuras (seção 14, fases 8+): conectores ERP/CRM, RAG, CSP com nonce.
