#!/usr/bin/env bash
# Start the PUT Checks frontend (Vite standalone) against a local backend.
# Depends only on this folder. Start order for the full local stack: studio-runner, backend, frontend.
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$FRONTEND_DIR"

log()  { printf '[frontend] %s\n' "$*"; }
warn() { printf '[frontend] WARN: %s\n' "$*" >&2; }
die()  { printf '[frontend] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
Usage: ./dev.sh [--port N] [-h]

Starts the Vite dev server (standalone mode) for the Checks frontend. It proxies /api/v1 to the
backend and adds the local dev session cookie.

Options:
  --port N    frontend port (default: \$PUT_CHECKS_FRONTEND_PORT, else 5173)
  -h, --help  this help

Environment:
  PUT_CHECKS_FRONTEND_PORT  frontend port (default 5173). Set the same value for backend/dev.sh:
                            it adds http://localhost:<port> to the backend CORS list.
  PUT_CHECKS_BACKEND_PORT   backend port the proxy targets (default 8080)
USAGE
}

PORT="${PUT_CHECKS_FRONTEND_PORT:-5173}"
BACKEND_PORT="${PUT_CHECKS_BACKEND_PORT:-8080}"

while [ $# -gt 0 ]; do
  case "$1" in
    --port)
      [ $# -ge 2 ] || die "--port needs a value"
      PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#--port=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

case "$PORT" in ''|*[!0-9]*) die "invalid frontend port: $PORT" ;; esac
case "$BACKEND_PORT" in ''|*[!0-9]*) die "invalid backend port: $BACKEND_PORT" ;; esac

# ── Prerequisites ───────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "node not found. Install Node.js 20 or newer."
command -v pnpm >/dev/null 2>&1 || die "pnpm not found. Install it (https://pnpm.io/installation); npm and yarn are not used here."

if [ ! -d node_modules ]; then
  log "node_modules missing; running pnpm install --frozen-lockfile"
  pnpm install --frozen-lockfile
fi

# @put/core-components is a file: dependency (../../put-core-components) that pnpm copies into
# node_modules; the copy is only usable once that package was built before the install.
if [ ! -f node_modules/@put/core-components/dist/index.js ]; then
  warn "@put/core-components is not built in node_modules."
  warn "Run: (cd ../../put-core-components && npm run build) && pnpm install"
fi

# ── Port: free it only if it is this checkout's frontend Vite ───────
listeners="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
for pid in $listeners; do
  cmd="$(ps -o command= -p "$pid" 2>/dev/null || true)"
  # Vite is started as `node ./node_modules/.bin/vite`, so the checkout shows in its cwd, not its argv.
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  if printf '%s' "$cmd" | grep -qi vite \
    && { [ "$cwd" = "$FRONTEND_DIR" ] || printf '%s' "$cmd" | grep -qF "$FRONTEND_DIR/node_modules"; }; then
    log "Port $PORT is held by this checkout's Vite (PID $pid); stopping it"
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 40); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.25
    done
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
  else
    die "Port $PORT is in use by PID $pid (${cmd:-unknown command}), which is not this checkout's frontend. Stop it or pick another port with --port."
  fi
done

# ── Backend reachability (informational only) ───────────────────────
if ! curl -fsS --max-time 2 "http://localhost:$BACKEND_PORT/actuator/info" >/dev/null 2>&1; then
  log "Note: no backend answering on http://localhost:$BACKEND_PORT/actuator/info yet; /api/v1 calls fail until it is up (start backend/dev.sh)."
fi
if [ "$PORT" != 5173 ]; then
  log "Note: the backend CORS list must include http://localhost:$PORT; backend/dev.sh adds it when started with the same PUT_CHECKS_FRONTEND_PORT=$PORT."
fi

log "Starting Vite on http://localhost:$PORT (proxy /api/v1 -> http://localhost:$BACKEND_PORT)"
exec env \
  VITE_API_URL="http://localhost:$BACKEND_PORT" \
  VITE_DEV_SESSION_COOKIE=local-dev-session \
  pnpm exec vite --port "$PORT" --strictPort
