#!/usr/bin/env bash
# Restauração do Efettiva OS a partir de um diretório criado por scripts/backup.sh.
# Uso: bash scripts/restore.sh ./backups/efettiva-AAAAMMDD-HHMMSS [--yes]
# ATENÇÃO: substitui TODO o banco e os arquivos atuais. Faça um backup antes.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${1:?informe o diretório do backup}"
CONFIRM="${2:-}"
COMPOSE="${COMPOSE:-docker compose}"

# Lê só usuário e nome do banco do .env (não exporta segredos nem sobrescreve portas/variáveis já definidas)
envval() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '"' || true; }
DB_USER="${POSTGRES_USER:-$(envval POSTGRES_USER)}"; DB_USER="${DB_USER:-efettiva}"
DB_NAME="${POSTGRES_DB:-$(envval POSTGRES_DB)}"; DB_NAME="${DB_NAME:-efettiva}"

[ -f "${SRC}/db.dump" ] || { echo "db.dump não encontrado em ${SRC}" >&2; exit 1; }
( cd "$SRC" && sha256sum -c SHA256SUMS ) || { echo "Falha na verificação de integridade (SHA256SUMS)" >&2; exit 1; }

if [ "$CONFIRM" != "--yes" ]; then
  read -r -p "Isto vai SUBSTITUIR o banco '${DB_NAME}' e os arquivos. Digite RESTAURAR para continuar: " ans
  [ "$ans" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
fi

echo "[restore] parando web e worker…"
$COMPOSE stop web worker >/dev/null 2>&1 || true

echo "[restore] banco…"
$COMPOSE exec -T postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" -c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";" >/dev/null
$COMPOSE exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --exit-on-error < "${SRC}/db.dump"

echo "[restore] arquivos…"
if $COMPOSE config --services | grep -q '^web$'; then
  $COMPOSE run --rm --no-deps -T --entrypoint sh web -c 'find /app/storage -mindepth 1 -delete && tar -C /app/storage -xzf -' < "${SRC}/storage.tar.gz"
else
  mkdir -p ./storage && find ./storage -mindepth 1 -delete && tar -C ./storage -xzf "${SRC}/storage.tar.gz"
fi

echo "[restore] religando serviços…"
$COMPOSE up -d web worker >/dev/null 2>&1 || true
echo "[restore] concluído a partir de ${SRC}"
