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
| Docker (Dockerfile, compose com postgres/redis/migrate/web/worker, volumes) | PARTIAL | build da imagem em validação |
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
| **Aceite:** iniciar, criar OWNER, entrar/sair, persistir após reinício | PARTIAL | entrar/sair OK; persistência após rebuild dos containers em validação |

## Fase 1 — Cadastro e diagnóstico operacional
| Item | Status | Evidência |
|---|---|---|
| Clientes (CRUD, busca, filtros, paginação) | TODO | |
| Visão 360° | TODO | |
| Modelos de questionário versionados, 12 áreas, 96 perguntas seed | TODO | |
| Regras condicionais (segmento/resposta) editáveis | TODO | |
| Anexos/evidências e notas | TODO | |
| Autosave | TODO | |
| Score/cobertura (não sei / não se aplica não penalizam) | TODO | |
| Achados manuais | TODO | |
| Finalização com snapshot + revisão | TODO | |
| **Aceite:** 2 empresas, diagnóstico completo em uma, fechar e exportar resumo sem misturar | TODO | |

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
| 1 | Isolamento por troca de ID | PARTIAL | `tests/integration/access.test.ts` (base); ampliar por recurso nas fases |
| 2 | Importação idempotente | TODO | |
| 3 | Moeda `1.234,56` | TODO | |
| 4 | Cancelamentos não inflam vendas | TODO | |
| 5 | Ausência de custo → margem indisponível | TODO | |
| 6 | Questionário: não sei/não se aplica | TODO | |
| 7 | Versão aprovada imutável | TODO | |
| 8 | Audiência INTERNO fora do arquivo CLIENTE | TODO | |
| 9 | IA: evidência inexistente rejeitada | TODO | |
| 10 | E2E cliente → relatório | TODO | |

---

PRÓXIMO PASSO: concluir validação Docker da Fase 0 (`sudo docker compose up -d --build` com `WEB_PORT=3100`, testar persistência após `docker compose restart`) e iniciar Fase 1 pelo schema de clientes/diagnóstico (`prisma/schema.prisma`) + seed do questionário.
