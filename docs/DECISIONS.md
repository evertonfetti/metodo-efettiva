# Decisões técnicas e de produto

Uma linha por decisão: **decisão** — motivo.

## Fase 0
- **Next.js 16.4.6 + React 19.3.1** — versão estável atual; `proxy.ts` substitui `middleware.ts` no Next 16.
- **TypeScript 6.0.3 (não 7.x)** — 7.x é o port nativo recém-lançado; 6.x tem compatibilidade comprovada com o type-check do Next.
- **Prisma 7.10.1 (não a tag `latest` 8.0.0-rc)** — a tag `latest` aponta para RC; 7.10.1 é o último estável. Prisma 7 exige driver adapter (`@prisma/adapter-pg`) e `prisma.config.ts`.
- **Vulnerabilidade `effect` (ReDoS) via `@prisma/config`** — afeta só o CLI do Prisma em tempo de configuração, não o runtime web; aceita até correção upstream.
- **BullMQ 6 + ioredis 6 instanciado** — BullMQ 6 em ESM exige instância de cliente Redis, não opções de conexão.
- **Autenticação própria (sessão em tabela + cookie HTTP-only, token só como hash SHA-256)** — atende RF-001 sem dependência externa; revogação imediata no logout.
- **Argon2id via `@node-rs/argon2` (m=19 MiB, t=2, p=1)** — recomendação OWASP; binário nativo disponível para arm64/amd64.
- **Bloqueio: 5 tentativas → 15 min** — rate limit de login por conta, persistido no banco (sobrevive a reinício).
- **Acesso negado responde 404 para cliente inexistente ou não autorizado** — não revelar existência de clientes de outros consultores.
- **CSRF: Server Actions (checagem nativa do Next) + `assertSameOrigin` nas rotas REST mutáveis** — cookies `SameSite=Lax` como defesa adicional.
- **Imagem Docker única (web, worker, migrate) com `next start`** — mais simples que standalone + imagem separada; o worker usa `tsx` com o mesmo código.
- **Postgres 17 e Redis 7.4 no compose, portas publicadas só em 127.0.0.1 (5433/6380)** — evita conflito com Postgres local e não expõe serviços na rede.
- **Serviço `migrate` one-shot (migrate deploy + seed idempotente + bootstrap do OWNER)** — `docker compose up -d --build` deixa tudo pronto sem passos manuais.
- **OWNER inicial por variáveis `OWNER_*`, só se não houver OWNER** — sem senha padrão no repositório (seção 1.1).
- **Testes de integração em banco separado `<db>_test`, criado e migrado no globalSetup** — nunca tocar o banco de desenvolvimento.
- **Configurações (fases do método, rótulos da escala, parâmetros) em `SystemSetting` com schema Zod e padrões em código** — editáveis em /configuracoes; valor inválido no banco cai para o padrão.
- **Itens de menu de fases futuras aparecem desabilitados com "Fase N"** — regra "nenhum botão sem ação real" (UI_LAYOUT §9).
- **Push via SSH (`url.git@github.com:.pushInsteadOf`) mantendo `origin` em HTTPS** — a máquina tem chave SSH autorizada e não tem credencial HTTPS.
- **Neste host a porta 3000 já está ocupada por outra aplicação; validação local na 3100** — compose usa `WEB_PORT` (padrão 3000) configurável.
- **docker-compose-v2 instalado via apt do Ubuntu** — o plugin compose não estava presente; Docker usado via sudo.

## Fase 1
- **Um template base (BASE_360 v1) + regras por segmento, em vez de 5 templates separados** — "modelo por segmento" = perfil de segmento do diagnóstico; evita duplicar 96 perguntas e mantém scores comparáveis.
- **Regras condicionais em tabela `AssessmentRule` (efeito SHOW/HIDE + DSL JSON validada por Zod)** — o seed não trazia condições; regras iniciais em `prisma/seed-data/diagnostico-condicional.json` (10 perguntas por segmento, 4 complementares por resposta, 3 ocultações); editáveis em Configurações por formulário estruturado (sem JSON livre).
- **HIDE prevalece sobre SHOW; regra com JSON inválido é ignorada** — nunca quebra o questionário.
- **Perguntas complementares (texto/número/escolha) têm peso 0** — registram contexto sem distorcer o score.
- **Score em escala 0–5 (média ponderada), cobertura separada; "não sei" vira lacuna e não zero** — RF-023/024.
- **Diagnóstico fechado usa visibilidade/scores do snapshot** — edição posterior de regras não altera o passado.
- **Seed não sobrescreve regras existentes** — preserva personalizações do consultor.
- **Achados por regra: score < 2,0 com cobertura ≥ 50% → problema; cobertura < 50% → lacuna** — idempotentes por (diagnóstico, ruleKey); sempre "preliminar, validar".
- **Evidência exige resposta prévia** — evita resposta fantasma que alteraria cobertura.
- **Upload: tipo detectado pela assinatura do arquivo, executáveis e OOXML com macro rejeitados, nome sanitizado, prefixo `clients/<clientId>/`** — RF-031 e seção 12.1.
- **Resumo exportado em Markdown na Fase 1** — "resumo simples"; DOCX/PDF chegam com o exportador da Fase 3.
- **Playwright instalado já na Fase 1** — usado para revisão visual por screenshot; será o renderizador de PDF na Fase 3.

## Fase 2
- **Ficha detalhada em `ProcessDefinition.contentJson` (schema Zod único) em vez de colunas requirements/kpis/steps/templates** — um formato versionável inteiro em `ProcessRevision`; 10 fichas extraídas do Anexo C para `prisma/seed-data/processos-detalhados.json`.
- **Ficha do Anexo C vira v2 sobre a v1 do catálogo; seed nunca sobrescreve processo personalizado** — preserva seed original e personalizações (RF-063).
- **Edição da biblioteca por OWNER e CONSULTANT, com nota de mudança obrigatória e lock otimista** — catálogo é global; VIEWER só lê.
- **Projeto guarda snapshot da versão da ficha (`ProjectProcess.snapshotJson`)** — edição posterior da biblioteca não altera projetos em andamento.
- **Sugestão de processos: área do diagnóstico → letra do catálogo + âncoras do Anexo C; sugestões ficam "não selecionadas"** — RF-064 determinístico; consultor decide.
- **"Registrar achado" na tela de oportunidades cria achado CONSULTANT + oportunidade** — mantém rastreabilidade achado → oportunidade mesmo sem diagnóstico.
- **Fluxo DETECTED → REVIEWED → APPROVED; aprovar exige revisão; motivo obrigatório em descarte, reabertura e retirada de aprovação; LINKED_TO_PROJECT só via projeto** — seção 5.6/RF-048.
- **Ordenação: risco crítico primeiro, descartadas por último, depois score** — seção 7.3.
- **Plano 30/60/90: janelas proporcionais à duração real; ~60% dos passos da ficha na janela 1 (piloto), restantes + POP/treino na 2, validação + transferência na 3; processo sem ficha recebe 5 tarefas genéricas** — RF-071; idempotente por `planKey`.
- **Prazos em dia útil (fins de semana e feriados nacionais fixos + Carnaval, Sexta-feira Santa, Corpus Christi); feriados locais fora do MVP** — calendário integrado é F2 (RF-077).
- **Validado = tarefas vinculadas concluídas + indicadores verificados com nota + ≥1 evidência; Sustentado = Validado + responsável do cliente treinado + auditoria com data posterior** — RF-076 com critérios verificados no servidor.
- **Tarefa exige responsável interno ou do cliente; bloqueio exige impedimento; tarefa concluída ou com evidência não é excluída** — RF-072.
- **Jornada do método: Ativar concluída com processo em piloto+, Estruturar com processo Validado; Escalar/Sustentar sem critério objetivo até a Fase 6** — nunca marcar fase sem dado.
- **Colunas `@db.Date` formatadas em UTC (`formatDay`)** — evita exibir o dia anterior no fuso de São Paulo.
- **404 de página com streaming responde HTTP 200 com tela "não encontrado" + noindex** — comportamento do Next com `loading.tsx`; nenhum dado é exposto; APIs respondem 404 real.
- **Kanban com até 8 cartões por coluna e "Mostrar mais"** — planos de 4 processos geram ~50 tarefas.

## Fase 3
- **Conteúdo como AST de blocos JSON (título, parágrafo, lista, tabela, destaque) validado por Zod, em vez de TipTap/HTML** — editor seguro sem HTML (sem XSS), mesmo conteúdo renderizado em editor, MD, DOCX e PDF; TipTap pode entrar depois sem migrar dados.
- **Texto puro com marcadores `[PENDENTE: …]` onde falta dado validado** — "separação entre instrução validada e sugestão pendente" (9.1); destacados em âmbar no editor e nos arquivos; contam como alerta na QA.
- **Fórmulas dos KPIs das 10 fichas adicionadas ao seed (`kpiFormulas`), aplicadas como nova revisão da ficha** — QA 9.4 bloqueia KPI sem fórmula; processos personalizados não são alterados.
- **Tipos de documento: PLAYBOOK (geral, 9.1) e POP (por processo, 9.2); checklist, script, agenda de rotinas e plano de treinamento entram como seções do playbook** — cobre RF-080/081/082 sem multiplicar tipos.
- **Estados: seção PENDING/IN_REVIEW/APPROVED; revisão DRAFT → READY_FOR_REVIEW (todas as seções aprovadas) → APPROVED → PUBLISHED** — editar seção volta a revisão para DRAFT; aprovar versão exige todas as seções aprovadas e QA sem erros.
- **Imutabilidade em duas camadas: serviço (409) + trigger PostgreSQL que rejeita alteração de conteúdo/fontes/hash de revisão APPROVED/PUBLISHED** — nem bug nem acesso direto ao banco alteram versão aprovada.
- **Nova versão copia a última aprovada mantendo a aprovação das seções até serem editadas** — revisão incremental, como no mockup (v3 com seções já aprovadas).
- **Regenerar seção substitui só aquela seção; se editada à mão, exige confirmação explícita** — RF-087.
- **Lock otimista por `lockVersion` na revisão** — duas abas não sobrescrevem silenciosamente.
- **Audiências: CLIENTE e INTERNO (mockup cita "gestor/equipe do cliente", unificados em CLIENTE)** — RF-085 exige só a distinção interno × cliente; visibilidade por seção.
- **Exportação sempre no worker (job `document.export` com só o ID); worker revalida clientId do job contra a exportação** — seção 4.3; download só por rota autenticada.
- **Versão não aprovada exporta como RASCUNHO com marca d'água; versão aprovada/publicada exporta como final** — RF-086.
- **PDF via Playwright/Chromium com HTML autocontido (fonte Manrope embutida em base64, JS desligado, rede bloqueada)** — paginação previsível e sem dependência externa; Chromium instalado na imagem Docker.
- **DOCX com `docx` 9.15.1 (não 9.16.0, publicado há 2 dias)** — política de versão estável com ≥ 2 semanas.
- **Marca d'água no DOCX como cabeçalho textual "RASCUNHO" em todas as páginas** — a lib não suporta marca d'água diagonal; atende "marca d'água textual" (RF-086).
- **Logo da marca como arquivo de sistema privado (`system/…`, sem clientId), servido só autenticado** — RF-084 sem URL pública.
- **Editor abre em "Prévia" (formato de documento) e edita por blocos ao clicar "Editar"** — capítulos de processo são longos; leitura primeiro, como no mockup 06.
- **Comparação de versões por seção com diff de linhas (LCS) sobre o Markdown de cada seção** — sem dependência; mostra alterada/nova/removida.
