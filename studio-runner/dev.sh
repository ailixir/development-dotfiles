#!/usr/bin/env bash
# Starts the studio-runner locally (no Docker): the first of the three local starts (runner, backend, frontend).
# It depends only on this folder; the other components share state with it through one directory
# (PUT_CHECKS_LOCAL_DIR), which this script fills in. See README.md, "Run locally".
set -euo pipefail

RUNNER_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_PID=""
ISSUER_PID=""
CLEANED_UP=false

# ── Colors ──────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { printf "${CYAN}[studio-runner]${NC} %s\n" "$*"; }
ok()   { printf "${GREEN}[✓]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[!]${NC} %s\n" "$*"; }
err()  { printf "${RED}[✗]${NC} %s\n" "$*" >&2; }

usage() {
  cat <<EOF
${BOLD}Usage:${NC} ./dev.sh [-h|--help]

Build and start the studio-runner on https://127.0.0.1:8090 (mutual TLS) with guided learning and
observed replay on, plus the local token issuer. Runs in the foreground; Ctrl+C drains the runner
(up to 30 s) and stops the issuer. Nothing else is touched.

The local TLS, service identities, guided tokens and the files the backend needs are written to
\$PUT_CHECKS_LOCAL_DIR and reused on every start, so the runner can restart on its own.
Start the backend (backend/dev.sh) and then the frontend (frontend/dev.sh) after it.

${BOLD}Prerequisites:${NC} Node 24, openssl, a JDK keytool (JDK 21), and Playwright's Chromium
(npm run browsers:install, once).

${BOLD}Environment${NC} (also read from studio-runner/.env.local when present):
  PUT_CHECKS_LOCAL_DIR     shared directory (default \$HOME/.put-checks/local)
  PUT_CHECKS_RUNNER_PORT   runner port (default 8090)
  PUT_CHECKS_BACKEND_PORT  backend port the runner reports back to (default 8080)
  PUT_CHECKS_GUIDED_PORT   backend guided connector port (default 8092)
  STUDIO_ALLOW_ALL_DOMAINS true|false, passed to the runner as STUDIO_RUNNER_ALLOW_ALL_DOMAINS
  STUDIO_RUNNER_SERVICE_TOKEN / STUDIO_CALLBACK_SERVICE_TOKEN
                           use these identities instead of the stored ones
  STUDIO_RUNNER_TLS_*      complete explicit TLS files instead of the generated local CA
  PLAYWRIGHT_BROWSERS_PATH where Chromium is installed (Playwright default)
EOF
}

case "${1:-}" in
  "") ;;
  -h|--help) usage; exit 0 ;;
  *) err "Unknown option: $1"; usage >&2; exit 1 ;;
esac

# ── Cleanup on exit ────────────────────────────────────────────────
#
# Only what this script started is stopped. `set -m` gives each background job its own process group, so
# Ctrl+C reaches this script and not the children directly: the runner gets SIGTERM on its own PID (it drains,
# and the drain is what ends the Chromium trees it forked), the issuer gets SIGTERM too.
set -m

# Waits up to $2 seconds for the process $1 to go, then KILLs it. Only ever used on this script's own children.
stop_and_wait() {
  local target=$1 seconds=$2 i
  for ((i = 0; i < seconds * 4; i++)); do
    kill -0 -- "$target" 2>/dev/null || return 0
    sleep 0.25
  done
  kill -KILL -- "$target" 2>/dev/null || true
}

cleanup() {
  [ "$CLEANED_UP" = true ] && return 0
  CLEANED_UP=true
  # Nothing below may abort the rest, and job control is off again so the shell does not narrate each job.
  set +e +m
  if [ -n "$RUNNER_PID" ] && kill -0 "$RUNNER_PID" 2>/dev/null; then
    log "Stopping studio-runner (drain)…"
    kill -TERM "$RUNNER_PID" 2>/dev/null
    stop_and_wait "$RUNNER_PID" 30
  fi
  if [ -n "$ISSUER_PID" ] && kill -0 "$ISSUER_PID" 2>/dev/null; then
    log "Stopping the token issuer…"
    kill -TERM "$ISSUER_PID" 2>/dev/null
    stop_and_wait "$ISSUER_PID" 5
  fi
  log "Done."
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ── Environment ────────────────────────────────────────────────────
# .env.local (gitignored) holds per-developer overrides; it is read before anything below uses them.
if [ -f "$RUNNER_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$RUNNER_DIR/.env.local"
  set +a
  ok "Loaded .env.local"
fi
export PUT_CHECKS_LOCAL_DIR="${PUT_CHECKS_LOCAL_DIR:-$HOME/.put-checks/local}"
RUNNER_PORT="${PUT_CHECKS_RUNNER_PORT:-8090}"
export PUT_CHECKS_RUNNER_PORT="$RUNNER_PORT"
DIR="$PUT_CHECKS_LOCAL_DIR"

# ── Prerequisites ──────────────────────────────────────────────────
for tool in node npm openssl lsof; do
  command -v "$tool" >/dev/null || { err "$tool not found on PATH."; exit 1; }
done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" != 24 ]; then
  err "Node 24 is required (found $(node -v)); studio-runner/.nvmrc pins it. Switch with fnm/nvm and retry."
  exit 1
fi

# The generated TLS needs a JDK keytool. Prefer JDK 21 as the backend does; otherwise whatever keytool is on PATH.
if [ -z "${JAVA_HOME:-}" ]; then
  if /usr/libexec/java_home -v 21 &>/dev/null; then
    export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
  elif [ -d "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  fi
fi
if [ -n "${JAVA_HOME:-}" ]; then
  [ -x "$JAVA_HOME/bin/keytool" ] || { err "keytool not found in JAVA_HOME ($JAVA_HOME). Install JDK 21: brew install openjdk@21"; exit 1; }
elif ! keytool -help &>/dev/null; then
  err "keytool (JDK) not found. Install JDK 21: brew install openjdk@21"
  exit 1
fi

if [ ! -d "$RUNNER_DIR/node_modules" ]; then
  log "Installing dependencies (npm ci)…"
  (cd "$RUNNER_DIR" && npm ci --no-audit --no-fund >/dev/null)
fi

# Playwright's own idea of where the pinned Chromium is; the runner launches exactly that build.
if ! (cd "$RUNNER_DIR" && node -e 'const { chromium } = require("playwright"); process.exit(require("fs").existsSync(chromium.executablePath()) ? 0 : 1)') 2>/dev/null; then
  err "The pinned Chromium is not installed. Run once: (cd $RUNNER_DIR && npm run browsers:install)"
  exit 1
fi

log "Building studio-runner…"
(cd "$RUNNER_DIR" && npm run build --silent)

# ── Port ───────────────────────────────────────────────────────────
# Only the LISTENING process counts (`lsof -ti:<port>` would also match clients such as a browser). It is stopped only
# when it runs from this checkout; anything else is somebody else's and is reported, never signalled.
free_port() {
  local port=$1 pid command_line cwd
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    command_line="$(ps -o command= -p "$pid" 2>/dev/null || true)"
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
    case "$command_line" in
      *"$RUNNER_DIR/"*) ;;
      *) if [ "$cwd" != "$RUNNER_DIR" ]; then
           err "Port $port is held by PID $pid (${command_line:0:100}), which does not run from $RUNNER_DIR."
           err "Stop it yourself or choose another port with PUT_CHECKS_RUNNER_PORT."
           exit 1
         fi ;;
    esac
    warn "Stopping the studio-runner already on port $port (PID $pid)…"
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 120); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.25
    done
    if kill -0 "$pid" 2>/dev/null; then
      err "PID $pid is still draining after 30 s; stop it yourself and retry."
      exit 1
    fi
  done
}
free_port "$RUNNER_PORT"

# ── Shared material ────────────────────────────────────────────────
umask 077
node "$RUNNER_DIR/scripts/local-stack.mjs" init "$DIR"
ok "Local material ready in $DIR"

# The tokens exist before the runner starts; the issuer then refreshes them every 30 s.
node "$RUNNER_DIR/scripts/local-tokens.mjs" once
(cd "$RUNNER_DIR" && exec node scripts/local-tokens.mjs serve >>"$DIR/logs/issuer.log" 2>&1) &
ISSUER_PID=$!

# ── Runner ─────────────────────────────────────────────────────────
# The runner's environment is enumerated (`env -i`): its config loader refuses any unknown STUDIO_RUNNER_* key, and the
# backend's own STUDIO_RUNNER_* variables are exactly such keys. local-stack.mjs hands it the complete environment from
# runner-environment.json and replaces itself with the runner, so the PID below is the runner's.
(
  cd "$RUNNER_DIR" && exec env -i PATH="$PATH" HOME="$HOME" \
    node "$RUNNER_DIR/scripts/local-stack.mjs" run "$DIR" \
    >"$DIR/logs/runner.log" 2>&1
) &
RUNNER_PID=$!
log "studio-runner PID: $RUNNER_PID"

RUNNER_READY=false
for _ in $(seq 1 30); do
  if node "$RUNNER_DIR/scripts/local-stack.mjs" health "$DIR" >/dev/null 2>&1; then
    RUNNER_READY=true
    break
  fi
  if ! kill -0 "$RUNNER_PID" 2>/dev/null; then
    err "studio-runner exited during startup (log: $DIR/logs/runner.log)"
    exit 1
  fi
  sleep 1
done
if [ "$RUNNER_READY" != true ]; then
  err "studio-runner did not pass mutual-TLS readiness in 30 s (log: $DIR/logs/runner.log)"
  exit 1
fi

# ── Summary ────────────────────────────────────────────────────────
echo ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Runner:     https://127.0.0.1:${RUNNER_PORT} (mutual TLS, guided learning + observed replay on)"
ok "Shared dir: $DIR"
ok "Log:        $DIR/logs/runner.log"
log "Next: start backend/dev.sh, then frontend/dev.sh."
log "Press Ctrl+C to stop the runner and the token issuer"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Keep alive until the runner exits or Ctrl+C ────────────────────
status=0
wait "$RUNNER_PID" || status=$?
err "studio-runner exited (status $status); see $DIR/logs/runner.log"
exit "$status"
