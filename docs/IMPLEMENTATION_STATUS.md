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
| AiProvider + adaptador Anthropic, config segura | TODO | |
| Context assembly, evidências EV-xxx, minimização | TODO | |
| Geração de seção/playbook, revisão, bloqueios de publicação | TODO | |
| **Aceite:** sem chave o sistema segue; com chave gera rascunho com referências válidas | TODO | |

## Fase 6 — Acompanhamento, resultados e relatórios
| Item | Status | Evidência |
|---|---|---|
| Baseline imutável, snapshots, status de processo, evidências, reuniões | TODO | |
| Score de adoção, relatórios periódicos e exportações | TODO | |
| **Aceite:** 60 dias fictícios, baseline × atual, relatório com fonte e limitações | TODO | |

## Fase 7 — Robustez e operação contínua
| Item | Status | Evidência |
|---|---|---|
| Auditoria completa, testes de permissão, backup/restore testado | TODO | |
| Recuperação de jobs, performance, revisão visual e de segurança | TODO | |
| **Aceite:** reinstalação documentada, restore de teste, isolamento verificado, E2E | TODO | |

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
| 9 | IA: evidência inexistente rejeitada | TODO | |
| 10 | E2E cliente → relatório | TODO | |

---

PRÓXIMO PASSO: Fase 5 — IA supervisionada. Ler SPEC_INDEX: M09 (254), 5.5 AiGeneration (471), 8.1–8.6 (618–746) e UI_LAYOUT tela 06 (bloco de diferença "Aceitar/Editar/Rejeitar"). Construir AiProvider + adaptador Anthropic (SDK oficial, modelo configurável, timeout/retry, sem chave → desativado), ContextAssembler com evidências EV-xxx e minimização (respeitar `Client.externalAiAllowed`), saída JSON validada por Zod (PlaybookDraft 8.4), log em AiGeneration (hash de entrada, tokens, custo), job no worker, sugestão por seção no editor sem publicar nada automaticamente; teste 9 (evidência inexistente rejeitada). Sem chave configurada, o sistema segue 100% funcional.
