#!/usr/bin/env bash
#
# tools/corun.sh — the local co-run.
#
# Starts the REAL put-checks API and the REAL studio-runner in one session, with the LLM gateway
# stubbed and the runner's object store on the filesystem, and drives a draft through compile,
# confirm and dispatch across the seam between them.
#
# It does NOT yet cover the media route's ranged read: the API's object store is still the
# in-memory fake, and there is nothing to read until a dispatch is admitted and a browser
# records something. See StudioCoRunIT for the five legs it does cover; leg 4 runs a real
# Chromium against a loopback page and requires PASSED with the ledger row DONE.
#
# WHY THIS EXISTS
#
#   The API and the studio-runner had never run together — not in CI (there is none in this
#   repository), and not on a laptop. Every backend test dispatched to a fake client; every runner
#   test answered a fixture; dev.sh started the backend and the frontend and never the runner. Both
#   of Epic 10's HIGH integration defects were consequently found by READING code:
#
#     DEF-01  the API's dispatch body wrote 8 keys against a closed 14-required schema, so every
#             real dispatch would have been refused 400 JOB_INVALID.
#     DEF-02  every terminal report the merged runner sent was refused by the merged API.
#
#   Both are fixed. Neither had ever been exercised against the real runner. This script is what
#   makes that class of defect findable by running instead of by reading.
#
# WHAT IT DOES NOT DO
#
#   It does not weaken anything to go green. If the real dispatch path is broken, this script exits
#   non-zero and prints which component refused what. That is the intended outcome of a broken
#   seam, not a malfunction of the harness.
#
# USAGE
#
#   tools/corun.sh                 install (if needed), build the runner, run the co-run
#   tools/corun.sh --skip-build    reuse an existing studio-runner/dist
#   tools/corun.sh --help
#
# ENVIRONMENT
#
#   CORUN_API_PORT     pin the API's port     (default: an OS-allocated ephemeral port)
#   CORUN_RUNNER_PORT  pin the runner's port  (default: an OS-allocated ephemeral port)
#
#   Both default to ephemeral on purpose. Nothing here ever binds a well-known development port:
#   a harness that fights an unrelated process for a socket reports a connection failure that has
#   nothing to do with the system under test, which is the exact ambiguity it exists to remove.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_DIR="$ROOT_DIR/studio-runner"
BACKEND_DIR="$ROOT_DIR/backend"
TEST_CLASS="com.citi.put.checks.corun.StudioCoRunIT"
RESULT_XML="$BACKEND_DIR/build/test-results/test/TEST-${TEST_CLASS}.xml"

SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    -h|--help)    awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)            echo "corun: unknown argument '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[0;36m[co-run]\033[0m %s\n' "$*"; }
fail() { printf '\033[0;31m[co-run]\033[0m %s\n' "$*" >&2; }

# ── Port discipline ────────────────────────────────────────────────────────
# A pinned port is the operator's choice, but a pinned port that is already taken is a failure the
# harness must name before it starts, not a connection error 30 seconds in.
for var in CORUN_API_PORT CORUN_RUNNER_PORT; do
  value="${!var:-}"
  [ -z "$value" ] && continue
  if lsof -ti:"$value" >/dev/null 2>&1; then
    fail "$var=$value is already in use by PID $(lsof -ti:"$value" | tr '\n' ' ')— refusing to start."
    exit 2
  fi
done

# ── Preflight ──────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { fail "node is not on PATH"; exit 2; }

if [ ! -d "$RUNNER_DIR/node_modules" ]; then
  say "installing studio-runner dependencies (npm ci)…"
  (cd "$RUNNER_DIR" && npm ci >/dev/null)
fi

if [ "$SKIP_BUILD" = false ]; then
  say "building the studio-runner…"
  (cd "$RUNNER_DIR" && npm run build >/dev/null)
fi

[ -f "$RUNNER_DIR/dist/main.js" ] || { fail "studio-runner/dist/main.js is missing; drop --skip-build"; exit 2; }

# ── The co-run ─────────────────────────────────────────────────────────────
say "API + studio-runner, one session. Ports are allocated by the OS unless pinned."
rm -f "$RESULT_XML"

set +e
(
  cd "$BACKEND_DIR" && STUDIO_CORUN=1 ./gradlew test \
    --tests "$TEST_CLASS" --rerun --console=plain
)
set -e

# ── The result, read from the XML and never from the exit code ─────────────
exec node "$ROOT_DIR/tools/corun-report.mjs" "$RESULT_XML"
