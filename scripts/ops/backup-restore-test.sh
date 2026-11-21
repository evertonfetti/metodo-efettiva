#!/usr/bin/env bash
# Teste ponta a ponta de backup e restauração (12.4/Fase 7) numa stack Docker DESCARTÁVEL e isolada:
# sobe, cria dados (cliente + arquivo), faz backup, altera e "perde" dados, restaura e confere banco e arquivos.
# Uso: sudo -E bash scripts/ops/backup-restore-test.sh   (precisa da imagem efettiva-os:latest e da senha do OWNER em OWNER_PASSWORD_TEST)
# Nunca toca a stack principal: projeto "efettiva-brtest", portas 3300/5435/6382; ao final remove os volumes do teste.
set -euo pipefail
cd "$(dirname "$0")/../.."
export COMPOSE_PROJECT_NAME=efettiva-brtest WEB_PORT=3300 DB_HOST_PORT=5435 REDIS_HOST_PORT=6382
export COMPOSE="docker compose -p efettiva-brtest"
BASE="http://localhost:3300"
PW="${OWNER_PASSWORD_TEST:?defina OWNER_PASSWORD_TEST com a senha do OWNER do .env}"
EMAIL="${OWNER_EMAIL_TEST:-owner@efettiva.local}"
OUT="$(mktemp -d)"; JAR="$OUT/cj"
trap '$COMPOSE down -v >/dev/null 2>&1 || true; rm -r "$OUT" 2>/dev/null || true' EXIT
fail() { echo "  ✕ $1" >&2; exit 1; }
ok() { echo "  ✓ $1"; }
api() { curl -s -b "$JAR" -c "$JAR" -H "origin: $BASE" "$@"; }

echo "[teste] subindo stack isolada…"
$COMPOSE up -d >/dev/null 2>&1
curl -s --retry 60 --retry-delay 3 --retry-all-errors -o /dev/null "$BASE/api/health" || fail "web não ficou saudável"
api -o /dev/null -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" "$BASE/api/v1/auth/login"
CID=$(api -H 'content-type: application/json' -d '{"name":"Cliente Backup","industry":"DISTRIBUICAO","tags":["teste-backup"]}' "$BASE/api/v1/clients" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
printf 'evidência do backup %s\n' "$(date +%s)" > "$OUT/ev.txt"
FID=$(api -F "file=@$OUT/ev.txt;filename=ev.txt" "$BASE/api/v1/clients/$CID/files" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
SHA=$(sha256sum "$OUT/ev.txt" | cut -d' ' -f1)
ok "dados criados (cliente + arquivo $SHA)"

bash scripts/backup.sh "$OUT/backups" >/dev/null
BK=$(ls -d "$OUT"/backups/efettiva-* | head -1)
( cd "$BK" && sha256sum -c SHA256SUMS >/dev/null ) || fail "backup com checksum inválido"
ok "backup gerado e íntegro ($(du -sh "$BK" | cut -f1))"

# perda/alteração após o backup
api -o /dev/null -H 'content-type: application/json' -d '{"name":"Cliente Pós-backup","industry":"VAREJO"}' "$BASE/api/v1/clients"
$COMPOSE exec -T web sh -c 'find /app/storage -type f -delete'
[ "$(api -o /dev/null -w '%{http_code}' "$BASE/api/v1/clients/$CID/files/$FID")" != "200" ] || fail "arquivo deveria estar perdido"
ok "dados alterados e arquivo apagado (simulação de perda)"

bash scripts/restore.sh "$BK" --yes >/dev/null
curl -s --retry 60 --retry-delay 3 --retry-all-errors -o /dev/null "$BASE/api/health" || fail "web não voltou após restore"
rm -f "$JAR"; api -o /dev/null -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" "$BASE/api/v1/auth/login"
NAMES=$(api "$BASE/api/v1/clients?pageSize=100" | python3 -c 'import json,sys;print("|".join(c["name"] for c in json.load(sys.stdin)["items"]))')
echo "$NAMES" | grep -q "Cliente Backup" || fail "cliente do backup ausente"
echo "$NAMES" | grep -q "Pós-backup" && fail "cliente criado após o backup não deveria existir"
GOT=$(api "$BASE/api/v1/clients/$CID/files/$FID" | sha256sum | cut -d' ' -f1)
[ "$GOT" = "$SHA" ] || fail "arquivo restaurado difere ($GOT)"
ok "restauração consistente: banco no ponto do backup e arquivo com o mesmo SHA-256"
echo "BACKUP/RESTORE: OK"
