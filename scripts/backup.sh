#!/usr/bin/env bash
# Backup consistente do Efettiva OS: dump do PostgreSQL + volume de arquivos privados.
# Uso: bash scripts/backup.sh [diretório_destino]   (padrão: ./backups)
# Agende no host (cron/EasyPanel). Ex.: 0 2 * * * cd /opt/efettiva-os && bash scripts/backup.sh
# Retenção: apaga backups com mais de RETENTION_DAYS (padrão 30).
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${1:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${DEST}/efettiva-${STAMP}"
COMPOSE="${COMPOSE:-docker compose}"

set -a; [ -f .env ] && . ./.env; set +a
DB_USER="${POSTGRES_USER:-efettiva}"
DB_NAME="${POSTGRES_DB:-efettiva}"

mkdir -p "$OUT"
chmod 700 "$DEST" "$OUT"

echo "[backup] banco ${DB_NAME}…"
$COMPOSE exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --no-owner > "${OUT}/db.dump"

echo "[backup] arquivos privados…"
if $COMPOSE ps --services --status running 2>/dev/null | grep -q '^web$'; then
  $COMPOSE exec -T web tar -C /app/storage -czf - . > "${OUT}/storage.tar.gz"
elif [ -d ./storage ]; then
  tar -C ./storage -czf "${OUT}/storage.tar.gz" .
else
  echo "[backup] aviso: nenhum diretório de arquivos encontrado" >&2
  tar -czf "${OUT}/storage.tar.gz" --files-from /dev/null
fi

( cd "$OUT" && sha256sum db.dump storage.tar.gz > SHA256SUMS )
chmod 600 "${OUT}"/*
echo "[backup] concluído: ${OUT}"

find "$DEST" -maxdepth 1 -type d -name 'efettiva-*' -mtime "+${RETENTION_DAYS}" -exec rm -r {} + 2>/dev/null || true
