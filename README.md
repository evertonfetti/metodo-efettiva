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
