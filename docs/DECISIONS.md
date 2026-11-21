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
