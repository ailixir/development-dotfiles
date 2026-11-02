#!/usr/bin/env bash
# Start the PUT Checks backend locally (Spring Boot, `local` profile, embedded Postgres) plus the
# Core stand-in it needs for guided Studio. Depends only on this folder and, optionally, the shared
# local directory the studio-runner prepares ($PUT_CHECKS_LOCAL_DIR). See README.md "Run locally".
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd -P)"
CORE_SCRIPT="$BACKEND_DIR/scripts/local-core.mjs"
GRADLE_WRAPPER_PROPERTIES="$BACKEND_DIR/gradle/wrapper/gradle-wrapper.properties"
GRADLE_WRAPPER_BACKUP=""
BACKEND_PID=""
BACKEND_WATCHER_PID=""
BACKEND_APP_PID=""
CORE_PID=""
CLEANED_UP=false

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { printf "${CYAN}[backend]${NC} %s\n" "$*"; }
ok()   { printf "${GREEN}[✓]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[!]${NC} %s\n" "$*"; }
err()  { printf "${RED}[✗]${NC} %s\n" "$*"; }

# ── Usage ──────────────────────────────────────────────────────────
usage() {
  printf '%b\n' "$(cat <<USAGE
${BOLD}Usage:${NC} ./dev.sh [--seed] [-h]

Start the backend locally: Spring Boot (local profile, embedded Postgres) with hot reload, and
the Core stand-in (guided Studio re-checks the caller against Core).
Start studio-runner/dev.sh first so Studio runs have a browser runner to dispatch to.

${BOLD}Options:${NC}
  --seed        Start with the local,dev profile (3 CSIs, 15 checks, sample executions)
  -h, --help    Show this help

${BOLD}Environment:${NC} (a .env.local next to this script is loaded when present)
  PUT_CHECKS_LOCAL_DIR      shared local directory (default \$HOME/.put-checks/local);
                            backend.env there, written by studio-runner/dev.sh, wires the runner
  PUT_CHECKS_BACKEND_PORT   backend port (default 8080)
  PUT_CHECKS_CORE_PORT      Core stand-in port (default 8081)
  PUT_CHECKS_FRONTEND_PORT  frontend port, added to the CORS origins (default 5173)
  GRADLE_DISTRIBUTION_URL   Override Gradle wrapper distribution URL for this run only
  STUDIO_GATEWAY_PROVIDER   disabled (default) or vertex; vertex also needs
                            STUDIO_GATEWAY_ENDPOINT, _PROJECT, _LOCATION and credentials (ADC)
  STUDIO_GATEWAY_MODEL      translation model (default gemini-3.8-flash)
USAGE
)"
}

SEED=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed)    SEED=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# ── Cleanup on exit ────────────────────────────────────────────────
#
# Only what this script started is stopped. `set -m` gives every background job its own process
# group, so a group signal reaches the whole tree a job spawned (the Gradle client, the watcher)
# and nothing outside it. The bootRun JVM is forked by the Gradle *daemon*, not by the client this
# script started, so it is outside every group here: it is found by the backend port and only
# when its command line runs this checkout's backend classes. The Gradle daemon itself is shared
# and was not necessarily started here, so it is left alone.
set -m

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
    if ps -o command= -p "$pid" 2>/dev/null | grep -qF "$BACKEND_DIR/build"; then
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
  stop_group "$CORE_PID" "Core stand-in"
  if [ -n "$GRADLE_WRAPPER_BACKUP" ] && [ -f "$GRADLE_WRAPPER_BACKUP" ]; then
    mv "$GRADLE_WRAPPER_BACKUP" "$GRADLE_WRAPPER_PROPERTIES"
    log "Restored Gradle wrapper configuration"
  fi
  log "Done."
}
# INT and TERM exit, and the EXIT trap does the work once, whichever way the script ends.
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ── Prerequisite checks ────────────────────────────────────────────
check_prereqs() {
  local failed=false
  if ! command -v java &>/dev/null; then
    err "Java not found. Install JDK 21: brew install openjdk@21"
    failed=true
  fi
  if [ ! -x "$BACKEND_DIR/gradlew" ]; then
    err "$BACKEND_DIR/gradlew not found or not executable"
    failed=true
  fi
  if ! command -v node &>/dev/null; then
    err "Node.js not found (runs the Core stand-in). Install: brew install node"
    failed=true
  fi
  if ! command -v lsof &>/dev/null; then
    err "lsof not found (used to check the ports)"
    failed=true
  fi
  if [ "$failed" = true ]; then
    err "Prerequisites not met. Fix the issues above and retry."
    exit 1
  fi
  ok "Prerequisites OK"
}
check_prereqs

# ── Load .env.local (secrets not committed to git) ────────────────
if [ -f "$BACKEND_DIR/.env.local" ]; then
  set -a
  source "$BACKEND_DIR/.env.local"
  set +a
  ok "Loaded .env.local"
fi

BACKEND_PORT="${PUT_CHECKS_BACKEND_PORT:-8080}"
CORE_PORT="${PUT_CHECKS_CORE_PORT:-8081}"
FRONTEND_PORT="${PUT_CHECKS_FRONTEND_PORT:-5173}"
LOCAL_DIR="${PUT_CHECKS_LOCAL_DIR:-$HOME/.put-checks/local}"
export PUT_CHECKS_CORE_PORT="$CORE_PORT"

# ── Optional Gradle wrapper URL override (session only, restored on exit) ──
apply_gradle_distribution_override() {
  [ -n "${GRADLE_DISTRIBUTION_URL:-}" ] || return 0
  if [ ! -f "$GRADLE_WRAPPER_PROPERTIES" ]; then
    warn "Gradle wrapper properties not found: $GRADLE_WRAPPER_PROPERTIES"
    return 0
  fi

  local current_url
  current_url="$(awk -F= '/^distributionUrl=/{print $2}' "$GRADLE_WRAPPER_PROPERTIES" || true)"
  if [ "$current_url" = "$GRADLE_DISTRIBUTION_URL" ]; then
    ok "Gradle distribution URL already configured"
    return 0
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
apply_gradle_distribution_override

export SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true

# ── Resolve JAVA_HOME for JDK 21 ──────────────────────────────────
# `java_home -v 21` can answer with another version when no 21 is installed, so every candidate is
# checked by asking its own java.
is_jdk21() { "$1/bin/java" -version 2>&1 | grep -q '"21\.'; }
if java -version 2>&1 | grep -q '"21\.'; then
  : # default java is already 21
else
  JDK21=""
  for candidate in \
    "$(/usr/libexec/java_home -v 21 2>/dev/null || true)" \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    "$HOME"/.jdks/*21*/Contents/Home; do
    if [ -n "$candidate" ] && [ -x "$candidate/bin/java" ] && is_jdk21 "$candidate"; then
      JDK21="$candidate"
      break
    fi
  done
  if [ -n "$JDK21" ]; then
    export JAVA_HOME="$JDK21"
    ok "Using JDK 21 at $JAVA_HOME"
  else
    warn "JDK 21 not found — Gradle toolchain will attempt auto-provisioning"
  fi
fi

# ── Ports: stop a leftover of this checkout, never anything else ───
# Only the LISTENING process counts (`lsof -tiTCP:<port> -sTCP:LISTEN`): a bare `lsof -ti:<port>` also
# matches clients of the port, such as a browser tab. A listener is stopped only when its command line
# runs from this checkout ($2); any other listener is reported and left alone.
free_port() {
  local port=$1 owner=$2 label=$3 pid command
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
    command="$(ps -o command= -p "$pid" 2>/dev/null || true)"
    if [[ "$command" == *"$owner"* ]]; then
      warn "Stopping the previous ${label} still listening on :${port} (PID $pid)"
      kill -TERM "$pid" 2>/dev/null || true
      stop_and_wait "$pid" 30
    else
      err "Port ${port} (${label}) is held by PID ${pid}, which is not from this checkout:"
      err "  ${command:-unknown command}"
      err "Stop it yourself, or set PUT_CHECKS_BACKEND_PORT / PUT_CHECKS_CORE_PORT to a free port."
      exit 1
    fi
  done
  if [ -n "$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)" ]; then
    err "Port ${port} (${label}) is still in use after stopping the previous one"
    exit 1
  fi
}
free_port "$BACKEND_PORT" "$BACKEND_DIR" "backend"
free_port "$CORE_PORT" "$CORE_SCRIPT" "Core stand-in"

# ── Studio runner wiring (shared local directory) ─────────────────
# studio-runner/dev.sh writes backend.env: the runner's URL, both service tokens, the TLS stores,
# the shared evidence directory and a config overlay that turns on the guided bridge. Without it the
# backend still starts, but a Studio run closes ERROR/DISPATCH_FAILED.
RUNNER_WIRED=false
if [ -f "$LOCAL_DIR/backend.env" ]; then
  set -a
  source "$LOCAL_DIR/backend.env"
  set +a
  RUNNER_WIRED=true
  ok "Studio runner wiring loaded from $LOCAL_DIR/backend.env"
else
  warn "studio-runner not prepared: start studio-runner/dev.sh first; Studio runs will close ERROR/DISPATCH_FAILED"
fi

# Guided publication and replay re-check the caller against Core; locally that is the stand-in below.
export CHECKS_CORE_SERVICE_URL="http://localhost:${CORE_PORT}"
# The dev proxy forwards the browser's Origin, and the backend's CORS list names only the default
# dev ports: any other frontend port would get 403 "Invalid CORS request" on every POST.
if [ -z "${CHECKS_CORS_ALLOWED_ORIGINS:-}" ]; then
  CORS="http://localhost:3000,http://localhost:3002,http://localhost:5173"
  [[ ",$CORS," == *",http://localhost:${FRONTEND_PORT},"* ]] || CORS="$CORS,http://localhost:${FRONTEND_PORT}"
  export CHECKS_CORS_ALLOWED_ORIGINS="$CORS"
fi
# Local default is disabled (the backend accepts only disabled or vertex). Set vertex in .env.local,
# with endpoint, project and location, to let Run Test learn.
export STUDIO_GATEWAY_PROVIDER="${STUDIO_GATEWAY_PROVIDER:-disabled}"
export STUDIO_GATEWAY_MODEL="${STUDIO_GATEWAY_MODEL:-gemini-3.8-flash}"

# ── Core stand-in ─────────────────────────────────────────────────
log "Starting Core stand-in (:${CORE_PORT})…"
node "$CORE_SCRIPT" &
CORE_PID=$!
CORE_READY=false
for _ in $(seq 1 20); do
  # 401 without the cookie is the stand-in answering.
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${CORE_PORT}/api/v1/users/me" 2>/dev/null || true)" = "401" ]; then
    CORE_READY=true
    break
  fi
  kill -0 "$CORE_PID" 2>/dev/null || break
  sleep 0.25
done
if [ "$CORE_READY" != true ]; then
  err "Core stand-in did not start on :${CORE_PORT}"
  exit 1
fi

# ── Backend ───────────────────────────────────────────────────────
if [ "$SEED" = true ]; then
  SPRING_PROFILE="local,dev"
  log "Starting backend (Spring Boot :${BACKEND_PORT}, sample data enabled)…"
else
  SPRING_PROFILE="local"
  log "Starting backend (Spring Boot :${BACKEND_PORT})…"
fi
(cd "$BACKEND_DIR" && exec ./gradlew bootRun --args="--spring.profiles.active=$SPRING_PROFILE --server.port=$BACKEND_PORT" --console=plain -q) &
BACKEND_PID=$!
log "Backend PID: $BACKEND_PID"

# Continuous compilation: DevTools restarts the app on classpath changes. Each restart gets a fresh
# embedded database.
(cd "$BACKEND_DIR" && exec ./gradlew -t classes -x spotlessCheck -x checkstyleMain --console=plain -q) &
BACKEND_WATCHER_PID=$!
log "File watcher PID: $BACKEND_WATCHER_PID (hot reload via DevTools)"

# ── Wait for backend health ───────────────────────────────────────
log "Waiting for backend health…"
BACKEND_READY=false
for _ in $(seq 1 60); do
  # `/actuator/health` includes database-backed operational indicators and can legitimately wait
  # on their own bounds. Local startup only needs proof that the HTTP application is serving.
  if curl -sf "http://localhost:${BACKEND_PORT}/actuator/info" &>/dev/null; then
    BACKEND_READY=true
    BACKEND_APP_PID="$(backend_app_pid)"
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    err "Backend process exited unexpectedly"
    exit 1
  fi
  sleep 2
done
if [ "$BACKEND_READY" = true ]; then
  ok "Backend healthy"
else
  warn "Backend not healthy after 120s — still starting; API calls fail until it is ready"
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Backend:     http://localhost:${BACKEND_PORT}"
ok "Swagger UI:  http://localhost:${BACKEND_PORT}/swagger-ui.html"
ok "Health:      http://localhost:${BACKEND_PORT}/actuator/health"
ok "Core:        http://localhost:${CORE_PORT} (stand-in)"
ok "Hot reload:  enabled (DevTools + continuous compilation; the embedded database resets on each restart)"
if [ "$SEED" = true ]; then
  ok "Profile:     dev (3 CSIs, 15 checks, ~450 execution results)"
fi
if [ "$RUNNER_WIRED" = true ]; then
  ok "Runner:      wired yes (${STUDIO_RUNNER_BASE_URL:-see backend.env})"
else
  warn "Runner:      wired no — Studio runs will close ERROR/DISPATCH_FAILED"
fi
if [ "$STUDIO_GATEWAY_PROVIDER" = "disabled" ]; then
  ok "Translate:   disabled (Run Test answers learning unavailable; see README for vertex)"
else
  ok "Translate:   ${STUDIO_GATEWAY_PROVIDER} (${STUDIO_GATEWAY_MODEL})"
fi
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Press Ctrl+C to stop"
echo ""

# ── Keep alive until a child exits or Ctrl+C ──────────────────────
while kill -0 "$BACKEND_PID" 2>/dev/null; do
  if ! kill -0 "$CORE_PID" 2>/dev/null; then
    err "Core stand-in exited unexpectedly"
    exit 1
  fi
  sleep 1
done
err "Backend process exited"
exit 1
