#!/usr/bin/env bash
# Starts the dev stack. Creates dev/.env with random RPC credentials on first run.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  umask 077
  printf 'RPC_USER=dev\nRPC_PASS=%s\n' "$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')" > .env
fi
# Always use the pinned official image.
sed -i '/^PEARLD_IMAGE=/d' .env
echo "PEARLD_IMAGE=$(tr -d '[:space:]' < ../pearld/image)" >> .env
mkdir -p ../data/pearld
[ "$(stat -c %u ../data/pearld)" = 1000 ] || sudo chown 1000:1000 ../data/pearld
docker compose up -d "$@"
