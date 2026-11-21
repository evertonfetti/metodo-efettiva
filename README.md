# Efettiva OS

Sistema web **interno** da Efettiva Gestão para diagnóstico 360°, oportunidades, implantação de processos, playbooks e comprovação de resultados. Uma instalação atende várias empresas-clientes isoladas por `clientId`.

- Requisitos: `ESPECIFICACAO_MESTRA_EFETTIVA_OS.md` (índice em `docs/SPEC_INDEX.md`)
- Interface: `docs/UI_LAYOUT.md` + mockups em `docs/design/`
- Progresso: `docs/IMPLEMENTATION_STATUS.md` · Decisões: `docs/DECISIONS.md`

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 6 (strict) · Tailwind CSS 4 · PostgreSQL 17 · Prisma 7 (adapter `pg`) · Redis 7 + BullMQ 6 (worker separado) · Argon2id · Vitest · Docker Compose.

## Subir com Docker (produção / EasyPanel)

```bash
cp .env.example .env          # ou: bash scripts/setup-env.sh  (gera segredos e senha do OWNER)
# edite .env: POSTGRES_PASSWORD, APP_ENCRYPTION_KEY, APP_URL, OWNER_EMAIL/NAME/PASSWORD
docker compose up -d --build
```

Serviços: `postgres`, `redis`, `migrate` (aplica migrations, seeds idempotentes e cria o OWNER; depois encerra), `web` (porta `WEB_PORT`, padrão 3000) e `worker`.
Volumes persistentes: `pgdata`, `redisdata`, `storage` (arquivos privados). Dados sobrevivem a `docker compose down` e rebuild (não use `down -v`).

Health check: `GET /api/health` → `200 {"status":"ok"}` ou `503` se banco/Redis indisponíveis.

Em servidor exposto, publique atrás de proxy reverso com TLS (EasyPanel/Traefik/Caddy) e defina `APP_URL=https://…` (o cookie de sessão passa a ser `Secure`).

## Primeiro usuário (OWNER)

Não existe usuário ou senha padrão no repositório. O OWNER é criado a partir de `OWNER_EMAIL`, `OWNER_NAME` e `OWNER_PASSWORD` (mín. 12 caracteres):

- no Docker, automaticamente pelo serviço `migrate`;
- localmente, com `npm run bootstrap:owner`.

O comando só cria se ainda não houver OWNER. Depois do primeiro acesso, remova `OWNER_PASSWORD` do `.env`.

## Execução local (desenvolvimento)

Pré-requisitos: Node 24+, Docker (para Postgres e Redis).

```bash
npm ci                                  # instala e gera o Prisma Client
bash scripts/setup-env.sh               # cria .env (não sobrescreve se existir)
docker compose up -d postgres redis     # Postgres em 127.0.0.1:5433, Redis em 127.0.0.1:6380
npx prisma migrate deploy               # aplica migrations
npm run db:seed                         # seeds idempotentes (catálogo, questionário…)
npm run bootstrap:owner                 # cria o OWNER a partir do .env
npm run dev                             # http://localhost:3000  (ou: npx next dev -p 3100)
npm run worker                          # em outro terminal: worker BullMQ (exportações DOCX/PDF/MD)
npx playwright install chromium         # uma vez: Chromium usado para gerar PDF (na imagem Docker já vem instalado)
```

Comandos úteis:

| Comando | O que faz |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Vitest (cria e migra automaticamente o banco `<db>_test`) |
| `npm run build` | Build de produção |
| `npm run db:migrate -- --name x` | Cria nova migration (desenvolvimento) |
| `npx prisma migrate deploy` | Aplica migrations pendentes (produção) |
| `npx tsx scripts/check-queue.ts` | Verifica fila ponta a ponta (precisa do worker rodando) |
| `npx tsx scripts/acceptance/faseN.ts` | Aceite automatizado da fase N contra o servidor (`ACCEPT_EMAIL`, `ACCEPT_PASSWORD`, `BASE`); fase 3 precisa do worker |

### Dados comerciais (Fase 4)
Em **Dados e importações** baixe os modelos (CSV/XLSX) e importe nesta ordem: clientes → produtos → vendas (declare pedido ou faturamento) → itens de venda → orçamentos.
Fluxo: upload → mapeamento (salvo por cliente) → validação de todas as linhas com prévia e arquivo de erros → confirmação (gravada no worker) → recálculo automático dos indicadores.
Reimportar o mesmo arquivo não duplica (origem + ID externo); linhas alteradas são atualizadas. Parâmetros de inatividade, ABC e orçamentos parados ficam em Configurações → Parâmetros.

### Resultados e relatórios (Fase 6)
No projeto, aba **Indicadores**: congele o baseline (90 dias antes do início) e registre snapshots; aba **Reuniões** para decisões e impedimentos; auditorias de processo alimentam a aderência. Em **Relatórios**, gere o relatório do período (11 seções, com fonte e limitações), aprove e exporte.

### Dados de demonstração
`npm run db:seed:demo` cria as empresas fictícias "Distribuidora Modelo B2B" (60 dias de projeto) e "Varejo Demonstração Sul", com selo DEMO. `-- --reset` recria somente essas duas.

### IA supervisionada (Fase 5, opcional)
Sem `ANTHROPIC_API_KEY` o sistema funciona por inteiro com templates. Para ativar: defina a chave no `.env`, reinicie web e worker, ajuste modelo/limites em Configurações → Provedor de IA e autorize cada cliente em Editar cadastro → IA externa.
No editor do documento, "Sugerir com IA" mostra exatamente o que será enviado (dados minimizados e pseudonimizados) antes de enviar; a sugestão volta como rascunho com antes/depois, evidências e problemas de validação, e só entra no documento ao ser aceita.

### Documentos (Fase 3)
Playbooks e POPs são gerados **sem IA** a partir do cadastro, do diagnóstico fechado, das oportunidades, do projeto e das fichas versionadas.
Fluxo: gerar → revisar/editar por seção → aprovar seções → aprovar versão (imutável; trigger no banco) → publicar → exportar.
Exportações rodam no worker; arquivo de audiência **Cliente** nunca contém seções INTERNO; rascunho sai com marca d'água “RASCUNHO”.
A marca (nome, assinatura, classificação, rodapé e logo) fica em Configurações → Marca. A fonte Manrope (OFL) está em `assets/fonts`.

## Migrations

- Versionadas em `prisma/migrations/`. Em produção rodam no serviço `migrate` a cada `docker compose up`.
- Nunca edite uma migration já aplicada; crie outra. Migrations destrutivas são sinalizadas em `docs/DECISIONS.md`.

## Backup e restauração

```bash
bash scripts/backup.sh                 # gera ./backups/efettiva-AAAAMMDD-HHMMSS/{db.dump,storage.tar.gz,SHA256SUMS}
bash scripts/restore.sh ./backups/efettiva-AAAAMMDD-HHMMSS   # pede confirmação digitando RESTAURAR
```

- O backup inclui banco (pg_dump custom) e o volume de arquivos, com verificação SHA-256.
- Retenção padrão: 30 dias (`RETENTION_DAYS`). Agende no host, ex.: `0 2 * * * cd /opt/efettiva-os && bash scripts/backup.sh`.
- Guarde os backups fora do servidor, com acesso restrito (contêm dados de clientes).
- Use `COMPOSE="sudo docker compose"` se o usuário não estiver no grupo docker.

## Reinstalação do zero (servidor Linux limpo)

1. Instale Docker Engine + plugin Compose e clone o repositório.
2. `bash scripts/setup-env.sh` (gera `.env` com segredos aleatórios; anote a senha do OWNER exibida) — ou copie `.env.example` e preencha.
3. `docker compose up -d --build` — o serviço `migrate` aplica migrations, roda os seeds idempotentes e cria o OWNER; `web` (porta `WEB_PORT`, padrão 3000) e `worker` sobem em seguida.
4. Confira `curl http://localhost:3000/api/health` e faça login.
5. Para restaurar um backup no servidor novo: copie o diretório do backup e rode `bash scripts/restore.sh <dir>` (os volumes `pgdata` e `storage` passam a conter os dados restaurados).
6. Opcional: `docker compose exec web npx tsx scripts/seed-demo.ts` para os dados de demonstração.

Publique atrás de um proxy reverso com TLS (EasyPanel/Caddy/Nginx), com `APP_URL` em `https://…` (cookies passam a `Secure`). Postgres e Redis ficam só em 127.0.0.1.

## Operação contínua

- **Jobs:** o worker recupera sozinho jobs presos (worker reiniciado) a cada 5 minutos; falhas aparecem em Configurações → Backups e saúde, com "Tentar de novo" (operações idempotentes, sem duplicar).
- **Auditoria:** Configurações → Auditoria (OWNER) lista aprovações, importações, exportações, exclusões e edições críticas, com usuário e data.
- **LGPD:** em Editar cadastro do cliente (OWNER): exportar todos os dados em JSON e exclusão assistida (nome + motivo; remove banco e arquivos, registra a eliminação na auditoria).
- **Testes de aceite e E2E:** `scripts/acceptance/fase1..6.ts` e `scripts/e2e/fluxo.ts` (navegador) contra o servidor; `npm test` para unitários/integração.
- **Atualização de dependências:** mensalmente `npm outdated` + `npm audit`; atualize versões fixas uma a uma (preferir versões publicadas há ≥ 2 semanas), rode `npm test`, `npm run build` e os aceites, e registre em `docs/DECISIONS.md`.
- **Incidente de segurança/dados:** (1) revogue sessões (`DELETE FROM "Session"`) e troque `OWNER_PASSWORD`/chaves no `.env`; (2) preserve logs e a trilha de auditoria; (3) identifique clientes afetados pela auditoria (`clientId`); (4) restaure do último backup íntegro se houver corrupção; (5) comunique os responsáveis conforme contrato/LGPD.

## Segurança (resumo)

Senhas Argon2id · sessão em cookie HTTP-only com hash do token no banco · bloqueio após 5 tentativas (15 min) · autorização por cliente no servidor (`assertClientAccess`) · verificação de origem nas rotas REST · headers de segurança · segredos só em `.env`.

## Estrutura

```
prisma/            schema, migrations, seed
src/app/           rotas (App Router): (auth)/login, (app)/dashboard, configuracoes, api/
src/components/    shell e componentes de UI
src/features/      domínio por módulo (auth, settings, system, …)
src/lib/           db, segurança, formatação, jobs, auditoria
src/worker/        worker BullMQ e handlers
scripts/           bootstrap do OWNER, backup/restore, utilitários
tests/             unitários e integração (Vitest)
```
