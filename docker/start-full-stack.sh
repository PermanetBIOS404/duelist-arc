#!/usr/bin/env bash
set -euo pipefail

echo "[duelist-arc] Starting bundled EDOPro service..."

cd /opt/edopro/repo
HOST_PORT="${HOST_PORT:-7911}" \
HTTP_PORT="${HTTP_PORT:-7922}" \
WEBSOCKET_PORT="${WEBSOCKET_PORT:-4000}" \
NODE_ENV="${EDOPRO_NODE_ENV:-production}" \
npm run dev &

EDOPRO_PID="$!"

echo "[duelist-arc] Waiting for EDOPro HTTP service on 127.0.0.1:7922..."

for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:7922/api/rooms" >/dev/null 2>&1; then
    echo "[duelist-arc] EDOPro service is ready."
    break
  fi

  if ! kill -0 "$EDOPRO_PID" >/dev/null 2>&1; then
    echo "[duelist-arc] EDOPro service exited before becoming ready."
    exit 1
  fi

  if [ "$i" -eq 60 ]; then
    echo "[duelist-arc] Timed out waiting for EDOPro service."
    exit 1
  fi

  sleep 2
done

echo "[duelist-arc] Starting Duelist ARC web server..."

cd /app
exec node server/src/index.js
