#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

compose_cmd() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return 0
  fi
  echo "error: docker compose (or docker-compose) not found" >&2
  return 1
}

need() {
  if [ -z "${2:-}" ]; then
    echo "error: missing required env var: $1" >&2
    exit 2
  fi
}

cmd="${1:-help}"
shift || true

cd "$ROOT"
COMPOSE_FILE="docker-compose.duel.yml"

case "$cmd" in
  up)
    COMPOSE="$(compose_cmd)"
    # Optional but recommended: pin EDOPro build to a known commit/tag for demo-day stability.
    # Example: EDOPRO_REF=<sha-or-tag> ./scripts/demo.sh up
    # Tip: `./scripts/pin-edopro-ref.sh main` writes a pinned SHA you can reuse.
    echo "[demo] using ${COMPOSE_FILE}"
    $COMPOSE -f "$COMPOSE_FILE" up -d --build
    ;;
  down)
    COMPOSE="$(compose_cmd)"
    echo "[demo] using ${COMPOSE_FILE}"
    $COMPOSE -f "$COMPOSE_FILE" down
    ;;
  logs)
    COMPOSE="$(compose_cmd)"
    echo "[demo] using ${COMPOSE_FILE}"
    $COMPOSE -f "$COMPOSE_FILE" logs -f --tail=200
    ;;
  ps)
    COMPOSE="$(compose_cmd)"
    echo "[demo] using ${COMPOSE_FILE}"
    $COMPOSE -f "$COMPOSE_FILE" ps
    ;;
  smoke)
    if ! command -v rg >/dev/null 2>&1; then
      echo "error: rg (ripgrep) is required for smoke checks" >&2
      exit 2
    fi
    PORT="${PORT:-8787}"
    BASE="http://127.0.0.1:${PORT}"
    DEMO_URL="${BASE}/?demo=1&view=demo"
    echo "[smoke] GET ${BASE}/healthz"
    curl -fsS "${BASE}/healthz" >/dev/null
    echo "[smoke] GET ${BASE}/ (expect 200)"
    curl -fsS "${BASE}/" | rg -q "Duelist ARC" || {
      echo "error: homepage did not look like Duelist ARC" >&2
      exit 1
    }
    echo "[smoke] GET ${DEMO_URL} (expect 200)"
    curl -fsS "${DEMO_URL}" | rg -q "Duelist ARC" || {
      echo "error: demo landing did not look like Duelist ARC" >&2
      exit 1
    }
    echo "[smoke] GET ${BASE}/robots.txt"
    curl -fsS "${BASE}/robots.txt" >/dev/null
    echo "[smoke] GET ${BASE}/sitemap.xml"
    # sitemap may 404 in NODE_ENV=production with PUBLIC_INDEXING=false
    curl -fsS "${BASE}/sitemap.xml" >/dev/null || true
    echo "[smoke] GET ${BASE}/does-not-exist (expect 404)"
    code="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE}/does-not-exist" || true)"
    if [ "$code" != "404" ]; then
      echo "error: expected 404 from /does-not-exist, got ${code}" >&2
      exit 1
    fi
    echo "[smoke] ok"
    ;;
  *)
    cat <<'EOF'
Usage: ./scripts/demo.sh <command>

Commands:
  up       Build + start demo stack (docker-compose.duel.yml)
  down     Stop demo stack
  ps       Show stack status
  logs     Follow stack logs
  smoke    Run quick HTTP smoke checks against localhost:8787

Environment:
  EDOPRO_REF   (recommended) pin EDOpro-server-ts ref (commit SHA or tag)
  PORT         (optional) port for smoke checks (default 8787)

EOF
    ;;
esac
