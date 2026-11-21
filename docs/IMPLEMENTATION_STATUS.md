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
| Seed 146 processos + 10 fichas completas (Anexo C) | TODO | |
| Biblioteca e ficha versionada | TODO | |
| Mapa de oportunidades + priorização I×C÷E + risco crítico | TODO | |
| Vínculo oportunidade ↔ processos | TODO | |
| Projetos, processos no projeto, tarefas, kanban/lista | TODO | |
| Cronograma 30/60/90 | TODO | |
| **Aceite:** 3 achados, 2 oportunidades aprovadas, processos, projeto com tarefas | TODO | |

## Fase 3 — Playbook sem IA (MARCO CENTRAL)
| Item | Status | Evidência |
|---|---|---|
| Geração determinística do playbook (diagnóstico + biblioteca + projeto) | TODO | |
| Editor por seções, revisão, aprovação, versões imutáveis | TODO | |
| Audiência INTERNO/CLIENTE filtrada no servidor | TODO | |
| Exportação DOCX, PDF, MD (marca d'água em rascunho) | TODO | |
| QA pré-exportação | TODO | |
| **Aceite:** playbook real exportado nos 3 formatos com POPs, KPIs, responsáveis e cronograma | TODO | |

## Fase 4 — Importações e KPIs reais
| Item | Status | Evidência |
|---|---|---|
| Arquivos-modelo, wizard CSV/XLSX, mapeamento | TODO | |
| Deduplicação/idempotência Customer/Product/Sale/Quote | TODO | |
| KPIs determinísticos, inatividade, ABC, orçamentos parados | TODO | |
| Dashboard de dados + DataQualityBanner | TODO | |
| **Aceite:** importar, reimportar sem duplicar, métricas e oportunidades com fonte | TODO | |

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
| 1 | Isolamento por troca de ID | PARTIAL | access/clients/assessments tests + aceite fase 1 (diagnóstico e arquivo); ampliar a projetos/documentos/exports |
| 2 | Importação idempotente | TODO | |
| 3 | Moeda `1.234,56` | TODO | |
| 4 | Cancelamentos não inflam vendas | TODO | |
| 5 | Ausência de custo → margem indisponível | TODO | |
| 6 | Questionário: não sei/não se aplica | DONE | `tests/unit/scoring.test.ts` |
| 7 | Versão aprovada imutável | TODO | |
| 8 | Audiência INTERNO fora do arquivo CLIENTE | TODO | |
| 9 | IA: evidência inexistente rejeitada | TODO | |
| 10 | E2E cliente → relatório | TODO | |

---

PRÓXIMO PASSO: Fase 2 — schema de ProcessDefinition/ProcessRevision, Opportunity, OpportunityProcess, Project, ProjectProcess, ActionTask etc.; seed dos 146 processos + `prisma/seed-data/processos-detalhados.json` (Anexo C, linhas 1510–1615 da especificação).
