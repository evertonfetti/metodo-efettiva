#!/usr/bin/env bash
# Gera .env a partir de .env.example com segredos aleatórios.
# Não sobrescreve um .env existente. A senha do OWNER é exibida uma única vez.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  echo ".env já existe — nada a fazer." >&2
  exit 0
fi

OWNER_EMAIL_IN="${1:-owner@efettiva.local}"
DB_PW="$(openssl rand -hex 16)"
ENC_KEY="$(openssl rand -base64 32)"
OWNER_PW="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"

sed -e "s/troque-esta-senha/${DB_PW}/g" \
    -e "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=${ENC_KEY}|" \
    -e "s|^OWNER_EMAIL=.*|OWNER_EMAIL=${OWNER_EMAIL_IN}|" \
    -e "s|^OWNER_NAME=.*|OWNER_NAME=Proprietário Efettiva|" \
    -e "s|^OWNER_PASSWORD=.*|OWNER_PASSWORD=${OWNER_PW}|" \
    .env.example > .env
chmod 600 .env

echo ".env criado. Login inicial: ${OWNER_EMAIL_IN}"
echo "Senha do OWNER (anote; está apenas no .env): ${OWNER_PW}"
