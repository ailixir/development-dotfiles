#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PID=""
BACKEND_WATCHER_PID=""
FRONTEND_PID=""
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
cleanup() {
  log "Shutting down…"
  [ -n "$FRONTEND_PID" ]         && kill "$FRONTEND_PID"         2>/dev/null && wait "$FRONTEND_PID"         2>/dev/null
  [ -n "$BACKEND_WATCHER_PID" ]  && kill "$BACKEND_WATCHER_PID"  2>/dev/null && wait "$BACKEND_WATCHER_PID"  2>/dev/null
  [ -n "$BACKEND_PID" ]          && kill "$BACKEND_PID"           2>/dev/null && wait "$BACKEND_PID"          2>/dev/null
  if [ -n "$GRADLE_WRAPPER_BACKUP" ] && [ -f "$GRADLE_WRAPPER_BACKUP" ]; then
    mv "$GRADLE_WRAPPER_BACKUP" "$GRADLE_WRAPPER_PROPERTIES"
    log "Restored Gradle wrapper configuration"
  fi
  log "Done."
}
trap cleanup EXIT INT TERM

# ── Usage ──────────────────────────────────────────────────────────
usage() {
  cat <<EOF
${BOLD}Usage:${NC} ./dev.sh [OPTIONS]

Start the full PUT Checks stack locally.
Frontend proxies /api/v1/* to backend at :8080.

${BOLD}Options:${NC}
  --backend-only       Start only the backend (Spring Boot :8080)
  --frontend-only      Start only the frontend (Vite :5173)
  --federated          Use Webpack/Module Federation (:3002) instead of Vite
  --seed               Use dev profile (pre-populated sample data)
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
EOF
  exit 0
}

# ── Parse args ───────────────────────────────────────────────────���─
BACKEND=true
FRONTEND=true
FEDERATED=false
SEED=false
SKIP_CHECKS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-only)  FRONTEND=false; shift ;;
    --frontend-only) BACKEND=false;  shift ;;
    --federated)     FEDERATED=true; shift ;;
    --seed)          SEED=true;      shift ;;
    --skip-checks)   SKIP_CHECKS=true; shift ;;
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
  # Stop any leftover Gradle bootRun daemons before port cleanup
  (cd "$ROOT_DIR/backend" && ./gradlew --stop 2>/dev/null) || true
  kill_port 8080
fi
if [ "$FRONTEND" = true ]; then
  kill_port 5173; kill_port 5174; kill_port 5175
  if [ "$FEDERATED" = true ]; then kill_port 3002; fi
fi

# ── Start Backend ──────────────────────────────────────────────────
if [ "$BACKEND" = true ]; then
  if [ "$SEED" = true ]; then
    SPRING_PROFILE="local,dev"
    log "Starting backend (Spring Boot :8080, sample data enabled)…"
  else
    SPRING_PROFILE="local"
    log "Starting backend (Spring Boot :8080)…"
  fi
  (cd "$ROOT_DIR/backend" && ./gradlew bootRun --args="--spring.profiles.active=$SPRING_PROFILE" --console=plain -q) &
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
    if curl -sf http://localhost:8080/actuator/health &>/dev/null; then
      ok "Backend healthy"
      break
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      err "Backend process exited unexpectedly"
      exit 1
    fi
    sleep 2
  done
  if ! curl -sf http://localhost:8080/actuator/health &>/dev/null; then
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
    log "Starting frontend — Vite standalone :5173…"
    (cd "$ROOT_DIR/frontend" && npm run dev:standalone) &
    FRONTEND_PORT=5173
  fi
  FRONTEND_PID=$!
  log "Frontend PID: $FRONTEND_PID"
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$BACKEND" = true ]; then
  ok "Backend:    http://localhost:8080"
  ok "Swagger UI: http://localhost:8080/swagger-ui.html"
  ok "Health:     http://localhost:8080/actuator/health"
  ok "Hot-reload: enabled (DevTools + continuous compilation)"
  if [ "$SEED" = true ]; then
    ok "Profile:    dev (3 CSIs, 15 checks, ~450 execution results)"
  fi
fi
if [ "$FRONTEND" = true ]; then
  ok "Frontend:   http://localhost:${FRONTEND_PORT}"
  ok "API proxy:  /api/v1/* -> http://localhost:8080/api/v1/*"
fi
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Press Ctrl+C to stop all services"
echo ""

# ── Keep alive until a child exits or Ctrl+C ──────────────────────
wait
