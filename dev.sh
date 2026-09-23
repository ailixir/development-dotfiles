#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PID=""
BACKEND_WATCHER_PID=""
FRONTEND_PID=""
RUNNER_PID=""
RUNNER_WORK_DIR=""
GRADLE_WRAPPER_PROPERTIES="$ROOT_DIR/backend/gradle/wrapper/gradle-wrapper.properties"
GRADLE_WRAPPER_BACKUP=""

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { printf "${CYAN}[put-checks]${NC} %s\n" "$*"; }
ok()   { printf "${GREEN}[✓]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[!]${NC} %s\n" "$*"; }
err()  { printf "${RED}[✗]${NC} %s\n" "$*"; }

# ── Cleanup on exit ────────────────────────────────────────────────
#
# Only what this script started is stopped, and all of it is.
#
# `set -m` gives every background job its own process group, so a group signal reaches the whole
# tree a job spawned (npx → node vite, the Gradle client, the watcher) and nothing outside it. Two
# processes need more than that:
#   - the bootRun JVM is forked by the Gradle *daemon*, not by the client this script started, so
#     it is outside every group here. It is found by the backend port once it listens, and only
#     when its command line runs this checkout's backend classes (BACKEND_APP_PID below);
#   - the studio-runner gets SIGTERM on its own PID, not its group: it drains, and the drain is what
#     ends the browser trees it forked (Chromium leads its own groups).
# The Gradle daemon itself is shared and was not necessarily started here, so it is left alone.
set -m
BACKEND_APP_PID=""
RUNNER_WORK_DIR=""
CLEANED_UP=false

# Waits up to $2 seconds for the process (or, with a leading "-", the group) $1 to go, then KILLs it.
stop_and_wait() {
  local target=$1 seconds=$2 i
  for ((i = 0; i < seconds * 4; i++)); do
    kill -0 -- "$target" 2>/dev/null || return 0
    sleep 0.25
  done
  kill -KILL -- "$target" 2>/dev/null || true
}

stop_group() {
  local pid=$1 label=$2
  [ -n "$pid" ] || return 0
  kill -0 -- "-$pid" 2>/dev/null || return 0
  log "Stopping ${label}…"
  kill -TERM -- "-$pid" 2>/dev/null || true
  stop_and_wait "-$pid" 10
}

# The PID listening on the backend port, if it is this checkout's bootRun JVM.
backend_app_pid() {
  local pid
  for pid in $(lsof -tiTCP:"$BACKEND_PORT" -sTCP:LISTEN 2>/dev/null); do
    if ps -o command= -p "$pid" 2>/dev/null | grep -qF "$ROOT_DIR/backend/build"; then
      echo "$pid"
      return 0
    fi
  done
  return 0
}

cleanup() {
  [ "$CLEANED_UP" = true ] && return 0
  CLEANED_UP=true
  # Nothing below may abort the rest: one child that already exited must not leave the others up.
  # Job control is off again so the shell does not narrate each job it is about to reap.
  set +e +m
  log "Shutting down…"
  stop_group "$FRONTEND_PID" "frontend"
  if [ -n "$RUNNER_PID" ] && kill -0 "$RUNNER_PID" 2>/dev/null; then
    log "Stopping studio-runner (drain)…"
    kill -TERM "$RUNNER_PID" 2>/dev/null
    stop_and_wait "$RUNNER_PID" 30
  fi
  stop_group "$BACKEND_WATCHER_PID" "file watcher"
  if [ -n "$BACKEND_PID" ] && [ -z "$BACKEND_APP_PID" ]; then
    BACKEND_APP_PID="$(backend_app_pid)"
  fi
  stop_group "$BACKEND_PID" "Gradle bootRun client"
  if [ -n "$BACKEND_APP_PID" ] && kill -0 "$BACKEND_APP_PID" 2>/dev/null; then
    log "Stopping backend JVM (PID $BACKEND_APP_PID)…"
    kill -TERM "$BACKEND_APP_PID" 2>/dev/null
    stop_and_wait "$BACKEND_APP_PID" 30
  fi
  if [ -n "$GRADLE_WRAPPER_BACKUP" ] && [ -f "$GRADLE_WRAPPER_BACKUP" ]; then
    mv "$GRADLE_WRAPPER_BACKUP" "$GRADLE_WRAPPER_PROPERTIES"
    log "Restored Gradle wrapper configuration"
  fi
  if [ -n "$RUNNER_WORK_DIR" ] && [[ "$RUNNER_WORK_DIR" == "${TMPDIR:-/tmp}/put-checks-studio-runner."* ]] && [ -d "$RUNNER_WORK_DIR" ]; then
    rm -rf -- "$RUNNER_WORK_DIR"
  fi
  log "Done."
}
# INT and TERM exit, and the EXIT trap does the work once, whichever way the script ends.
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ── Usage ──────────────────────────────────────────────────────────
usage() {
  cat <<EOF
${BOLD}Usage:${NC} ./dev.sh [OPTIONS]

Start the full PUT Checks stack locally.
Frontend proxies /api/v1/* to backend at :8080 (DEV_BACKEND_PORT).
The backend dispatches Studio runs to a local studio-runner (:8090), which
runs a real Chromium and reports back.

${BOLD}Options:${NC}
  --backend-only       Start only the backend (Spring Boot :8080)
  --frontend-only      Start only the frontend (Vite :5173)
  --federated          Use Webpack/Module Federation (:3002) instead of Vite
  --seed               Use dev profile (pre-populated sample data)
  --no-studio-runner   Do not start the studio-runner (Studio runs then close
                       ERROR/DISPATCH_FAILED instead of running a browser)
  --skip-checks        Skip prerequisite checks
  -h, --help           Show this help

${BOLD}Examples:${NC}
  ./dev.sh                      # Full stack (backend + frontend)
  ./dev.sh --seed               # Full stack with sample data
  ./dev.sh --frontend-only      # Frontend only (proxy to :8080 if running)
  ./dev.sh --federated          # Full stack, frontend in MF mode (:3002)
  ./dev.sh --backend-only       # Backend only

${BOLD}Environment:${NC}
  GRADLE_DISTRIBUTION_URL       Override Gradle wrapper distribution URL
                                (e.g. Artifactory mirror)
  DEV_BACKEND_PORT              backend port (default 8080)
  DEV_FRONTEND_PORT             Vite standalone port (default 5173)
  DEV_STUDIO_RUNNER_PORT        studio-runner port (default 8090)
  STUDIO_RUNNER_SERVICE_TOKEN   bearer the backend presents to the runner
  STUDIO_CALLBACK_SERVICE_TOKEN bearer the runner presents to the backend
                                (both generated per session when unset)
  STUDIO_GATEWAY_PROVIDER       translation provider: recorded-fixture (local default),
                                vertex (needs endpoint, project, location) or disabled
EOF
  exit 0
}

# ── Parse args ───────────────────────────────────────────────────���─
BACKEND=true
FRONTEND=true
FEDERATED=false
SEED=false
SKIP_CHECKS=false
STUDIO_RUNNER=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-only)  FRONTEND=false; shift ;;
    --frontend-only) BACKEND=false;  shift ;;
    --federated)     FEDERATED=true; shift ;;
    --seed)          SEED=true;      shift ;;
    --skip-checks)   SKIP_CHECKS=true; shift ;;
    --no-studio-runner) STUDIO_RUNNER=false; shift ;;
    -h|--help)       usage ;;
    *) err "Unknown option: $1"; usage ;;
  esac
done

# ── Prerequisite checks ────────────────────────────────────────��──
check_prereqs() {
  local failed=false

  if [ "$BACKEND" = true ]; then
    if ! command -v java &>/dev/null; then
      err "Java not found. Install JDK 21: brew install openjdk@21"
      failed=true
    fi
    if [ ! -x "$ROOT_DIR/backend/gradlew" ]; then
      err "backend/gradlew not found or not executable"
      failed=true
    fi
  fi

  if [ "$FRONTEND" = true ]; then
    if ! command -v node &>/dev/null; then
      err "Node.js not found. Install: brew install node"
      failed=true
    fi
    if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
      warn "frontend/node_modules missing — running npm install…"
      (cd "$ROOT_DIR/frontend" && npm install)
    fi
    local core_comp="$ROOT_DIR/../put-core-components/dist/index.js"
    if [ ! -f "$core_comp" ]; then
      warn "@put/core-components not built at ../put-core-components/dist/"
      warn "Run: cd ../put-core-components && npm run build"
    fi
  fi

  if [ "$failed" = true ]; then
    err "Prerequisites not met. Fix the issues above and retry."
    exit 1
  fi

  ok "Prerequisites OK"
}

if [ "$SKIP_CHECKS" = false ]; then
  check_prereqs
fi

# ── Optional Gradle wrapper URL override (session only) ────────────
apply_gradle_distribution_override() {
  if [ "$BACKEND" != true ] || [ -z "${GRADLE_DISTRIBUTION_URL:-}" ]; then
    return
  fi

  if [ ! -f "$GRADLE_WRAPPER_PROPERTIES" ]; then
    warn "Gradle wrapper properties not found: $GRADLE_WRAPPER_PROPERTIES"
    return
  fi

  local current_url
  current_url="$(awk -F= '/^distributionUrl=/{print $2}' "$GRADLE_WRAPPER_PROPERTIES" || true)"
  if [ "$current_url" = "$GRADLE_DISTRIBUTION_URL" ]; then
    ok "Gradle distribution URL already configured"
    return
  fi

  GRADLE_WRAPPER_BACKUP="$(mktemp "${TMPDIR:-/tmp}/gradle-wrapper.properties.XXXXXX")"
  cp "$GRADLE_WRAPPER_PROPERTIES" "$GRADLE_WRAPPER_BACKUP"

  awk -v url="$GRADLE_DISTRIBUTION_URL" '
    BEGIN { updated=0 }
    /^distributionUrl=/ { print "distributionUrl=" url; updated=1; next }
    { print }
    END { if (!updated) print "distributionUrl=" url }
  ' "$GRADLE_WRAPPER_PROPERTIES" > "${GRADLE_WRAPPER_PROPERTIES}.tmp"
  mv "${GRADLE_WRAPPER_PROPERTIES}.tmp" "$GRADLE_WRAPPER_PROPERTIES"
  ok "Applied Gradle distribution override for this run"
}

# ── Load .env.local (secrets not committed to git) ────────────────
if [ -f "$ROOT_DIR/.env.local" ]; then
  set -a
  source "$ROOT_DIR/.env.local"
  set +a
  ok "Loaded .env.local"
fi

apply_gradle_distribution_override

export SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true

# ── Resolve JAVA_HOME for JDK 21 ──────────────────────────────────
if [ "$BACKEND" = true ]; then
  if java -version 2>&1 | grep -q '"21\.'; then
    : # default java is already 21
  elif /usr/libexec/java_home -v 21 &>/dev/null; then
    export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
    ok "Using JDK 21 at $JAVA_HOME"
  elif [ -d "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
    ok "Using Homebrew JDK 21"
  else
    warn "JDK 21 not found — Gradle toolchain will attempt auto-provisioning"
  fi
fi

# ── Banner ─────────────────────────────────────────────────────────
echo ""
printf "${BOLD}${CYAN}"
cat <<'BANNER'
  ╔═══════════════════════════════════════╗
  ║       PUT Checks — Local Stack        ║
  ╚═══════════════════════════════════════╝
BANNER
printf "${NC}"

BACKEND_PORT="${DEV_BACKEND_PORT:-8080}"
VITE_PORT="${DEV_FRONTEND_PORT:-5173}"
# The Vite proxy forwards the browser's Origin, and the backend's CORS list (application.yml) only
# names the default dev ports — a non-default frontend port would get 403 "Invalid CORS request"
# on every POST.
if [ "$VITE_PORT" != 5173 ] && [ -z "${CHECKS_CORS_ALLOWED_ORIGINS:-}" ]; then
  export CHECKS_CORS_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:3002,http://localhost:5173,http://localhost:${VITE_PORT}"
fi

# ── Kill stale processes on target ports ───────────────────────────
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    warn "Killing existing processes on port $port"
    echo "$pids" | xargs kill -15 2>/dev/null || true
    for i in $(seq 1 10); do
      if ! lsof -ti:"$port" &>/dev/null; then break; fi
      sleep 0.5
    done
    if lsof -ti:"$port" &>/dev/null; then
      warn "Port $port still held after SIGTERM — sending SIGKILL"
      lsof -ti:"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
    if lsof -ti:"$port" &>/dev/null; then
      err "Port $port still occupied after cleanup"
    fi
  fi
}

if [ "$BACKEND" = true ]; then
  # No `gradlew --stop` here: it stops every daemon of this Gradle version, including other builds'.
  # A backend this script left behind is on BACKEND_PORT, which kill_port clears.
  kill_port "$BACKEND_PORT"
fi
if [ "$FRONTEND" = true ]; then
  if [ "$VITE_PORT" = 5173 ]; then kill_port 5173; kill_port 5174; kill_port 5175; else kill_port "$VITE_PORT"; fi
  if [ "$FEDERATED" = true ]; then kill_port 3002; fi
fi

# ── Studio runner (the local e2e path, Studio v1 WP2) ──────────────
# The backend (local profile) is the API and the worker in one JVM: it dispatches accepted runs to
# the runner over POST /v1/runs with STUDIO_RUNNER_SERVICE_TOKEN, and the runner reports back to
# /internal/studio/executions/** with STUDIO_CALLBACK_SERVICE_TOKEN. Both sides get the same two
# values from here. The runner's environment is enumerated (`env -i`), as in the chart and in
# StudioCoRunIT: its config loader refuses any unknown STUDIO_RUNNER_* key, and the backend's
# STUDIO_RUNNER_BASE_URL / STUDIO_RUNNER_SERVICE_TOKEN exported below are exactly such keys.
RUNNER_PORT="${DEV_STUDIO_RUNNER_PORT:-8090}"
if [ "$BACKEND" = true ] && [ "$STUDIO_RUNNER" = true ]; then
  RUNNER_DIR="$ROOT_DIR/studio-runner"
  new_token() { openssl rand -hex 32 2>/dev/null || node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"; }
  export STUDIO_RUNNER_SERVICE_TOKEN="${STUDIO_RUNNER_SERVICE_TOKEN:-$(new_token)}"
  export STUDIO_CALLBACK_SERVICE_TOKEN="${STUDIO_CALLBACK_SERVICE_TOKEN:-$(new_token)}"
  export STUDIO_RUNNER_BASE_URL="http://127.0.0.1:${RUNNER_PORT}"
  # The Studio pages are gated on the UI_TEST source, which is off by default (application-local.yml).
  export CHECKS_SOURCE_UI_TEST="${CHECKS_SOURCE_UI_TEST:-true}"
  # Local Studio uses the real Vertex path. Missing project, endpoint, location, or credentials
  # must stop startup instead of producing fixture-backed output that looks successful.
  # Local default is the recorded corpus: it needs no credential, and it answers only the
  # sources recorded verbatim, so a local run can never be mistaken for proof that
  # free-form English translates. Set STUDIO_GATEWAY_PROVIDER=vertex (with endpoint,
  # project and location) to exercise the real provider locally.
  export STUDIO_GATEWAY_PROVIDER="${STUDIO_GATEWAY_PROVIDER:-recorded-fixture}"
  export STUDIO_GATEWAY_MODEL="${STUDIO_GATEWAY_MODEL:-gemini-3.8-flash}"

  kill_port "$RUNNER_PORT"
  if [ ! -d "$RUNNER_DIR/node_modules" ]; then
    log "Installing studio-runner dependencies (npm ci)…"
    (cd "$RUNNER_DIR" && npm ci >/dev/null)
  fi
  log "Building studio-runner…"
  (cd "$RUNNER_DIR" && npm run build >/dev/null)

  RUNNER_WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/put-checks-studio-runner.XXXXXX")"
  mkdir -p "$RUNNER_WORK_DIR/objects"
  # The local backend reads the exact directory the runner writes. This makes recording playback
  # and manifest recovery the real path in local development, not two unrelated local stores.
  export STUDIO_EVIDENCE_PROVIDER="local"
  export STUDIO_EVIDENCE_DIRECTORY="$RUNNER_WORK_DIR/objects"
  # scratch/ is a CHILD of the work dir on purpose: the runner removes its scratch root on exit.
  (
    cd "$RUNNER_DIR" && exec env -i \
      PATH="$PATH" HOME="$HOME" TMPDIR="$RUNNER_WORK_DIR" \
      ${PLAYWRIGHT_BROWSERS_PATH:+PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH"} \
      STUDIO_RUNNER_HOST=127.0.0.1 \
      STUDIO_RUNNER_PORT="$RUNNER_PORT" \
      STUDIO_RUNNER_POOL_SIZE=1 \
      STUDIO_RUNNER_SERVICE_IDENTITY="$STUDIO_RUNNER_SERVICE_TOKEN" \
      STUDIO_RUNNER_CALLBACK_IDENTITY="$STUDIO_CALLBACK_SERVICE_TOKEN" \
      STUDIO_RUNNER_CALLBACK_BASE_URL="http://127.0.0.1:${BACKEND_PORT}" \
      STUDIO_RUNNER_SCRATCH_DIR="$RUNNER_WORK_DIR/scratch" \
      STUDIO_RUNNER_OBJECT_STORE_PROVIDER=local \
      STUDIO_RUNNER_OBJECT_STORE_DIR="$RUNNER_WORK_DIR/objects" \
      node dist/main.js >"$RUNNER_WORK_DIR/studio-runner.log" 2>&1
  ) &
  RUNNER_PID=$!
  log "studio-runner PID: $RUNNER_PID (log: $RUNNER_WORK_DIR/studio-runner.log)"

  for i in $(seq 1 30); do
    if curl -sf -H "Authorization: Bearer $STUDIO_RUNNER_SERVICE_TOKEN" \
        "http://127.0.0.1:${RUNNER_PORT}/health" >/dev/null 2>&1; then
      ok "studio-runner healthy on :${RUNNER_PORT}"
      break
    fi
    if ! kill -0 "$RUNNER_PID" 2>/dev/null; then
      err "studio-runner exited during startup — last lines of its log:"
      tail -20 "$RUNNER_WORK_DIR/studio-runner.log" >&2 || true
      exit 1
    fi
    sleep 1
  done
fi

# ── Start Backend ──────────────────────────────────────────────────
if [ "$BACKEND" = true ]; then
  if [ "$SEED" = true ]; then
    SPRING_PROFILE="local,dev"
    log "Starting backend (Spring Boot :${BACKEND_PORT}, sample data enabled)…"
  else
    SPRING_PROFILE="local"
    log "Starting backend (Spring Boot :${BACKEND_PORT})…"
  fi
  (cd "$ROOT_DIR/backend" && ./gradlew bootRun --args="--spring.profiles.active=$SPRING_PROFILE --server.port=$BACKEND_PORT" --console=plain -q) &
  BACKEND_PID=$!
  log "Backend PID: $BACKEND_PID"

  # Continuous compilation — DevTools auto-restarts the app on classpath changes
  (cd "$ROOT_DIR/backend" && ./gradlew -t classes -x spotlessCheck -x checkstyleMain --console=plain -q) &
  BACKEND_WATCHER_PID=$!
  log "File watcher PID: $BACKEND_WATCHER_PID (hot-reload via DevTools)"
fi

# ── Wait for backend health (if starting both) ────────────────────
if [ "$BACKEND" = true ] && [ "$FRONTEND" = true ]; then
  log "Waiting for backend health…"
  for i in $(seq 1 30); do
    # `/actuator/health` includes database-backed operational indicators and can legitimately wait
    # on their own bounds. Local startup only needs proof that the HTTP application is serving.
    if curl -sf "http://localhost:${BACKEND_PORT}/actuator/info" &>/dev/null; then
      ok "Backend healthy"
      BACKEND_APP_PID="$(backend_app_pid)"
      break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      err "Backend process exited unexpectedly"
      exit 1
    fi
    sleep 2
  done
  if ! curl -sf "http://localhost:${BACKEND_PORT}/actuator/info" &>/dev/null; then
    warn "Backend not healthy after 60s — starting frontend anyway"
    warn "API calls will fail until backend is ready"
  fi
fi

# ── Start Frontend ─────────────────────────────────────────────────
if [ "$FRONTEND" = true ]; then
  if [ "$FEDERATED" = true ]; then
    log "Starting frontend — Webpack/Module Federation :3002…"
    (cd "$ROOT_DIR/frontend" && npm run dev) &
    FRONTEND_PORT=3002
  else
    log "Starting frontend — Vite standalone :${VITE_PORT}…"
    # vite.config.ts reads VITE_API_URL for the /api proxy target.
    (cd "$ROOT_DIR/frontend" && VITE_API_URL="http://localhost:${BACKEND_PORT}" npx vite --port "$VITE_PORT") &
    FRONTEND_PORT="$VITE_PORT"
  fi
  FRONTEND_PID=$!
  log "Frontend PID: $FRONTEND_PID"
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$BACKEND" = true ]; then
  ok "Backend:    http://localhost:${BACKEND_PORT}"
  ok "Swagger UI: http://localhost:${BACKEND_PORT}/swagger-ui.html"
  ok "Health:     http://localhost:${BACKEND_PORT}/actuator/health"
  ok "Hot-reload: enabled (DevTools + continuous compilation)"
  if [ "$SEED" = true ]; then
    ok "Profile:    dev (3 CSIs, 15 checks, ~450 execution results)"
  fi
  if [ -n "$RUNNER_PID" ]; then
    ok "Runner:     http://127.0.0.1:${RUNNER_PORT} (Studio runs dispatch here)"
    if [ "${STUDIO_GATEWAY_PROVIDER}" = "recorded-fixture" ]; then
      ok "Translate:  recorded-fixture corpus (no model call; recorded sources only)"
    else
      ok "Translate:  ${STUDIO_GATEWAY_PROVIDER} (${STUDIO_GATEWAY_MODEL})"
    fi
  else
    warn "Runner:     not started — Studio runs will close ERROR/DISPATCH_FAILED"
  fi
fi
if [ "$FRONTEND" = true ]; then
  ok "Frontend:   http://localhost:${FRONTEND_PORT}"
  ok "API proxy:  /api/v1/* -> http://localhost:${BACKEND_PORT}/api/v1/*"
  ok "Studio production alpha: backend + runner connected"
fi
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Press Ctrl+C to stop all services"
echo ""

# ── Keep alive until a child exits or Ctrl+C ──────────────────────
wait
