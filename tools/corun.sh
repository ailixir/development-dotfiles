#!/usr/bin/env bash
#
# tools/corun.sh — the local co-run (STUDIO-OBS-009 AC-11, lane F; ruling A16).
#
# Starts the REAL put-checks API (Spring, Postgres in a Testcontainer, its dispatcher, ledger,
# reapers and internal callback routes) and the REAL studio-runner (`dist/main.js`, the one folded
# entry point, over mutual TLS), and drives published observed plans across the seam between them
# with a real Chromium against a loopback page. The class is ObservedCoRunIT; it replaces the
# retired StudioCoRunIT, which drove the compile path that no longer exists.
#
# WHAT IT COVERS (AC-11 base legs; each run is counted, see the report)
#
#   base          one published plan runs to PASSED through the real dispatcher and runner
#   duplicate     repeated public Run under one key, racing dispatchers, the same job on the wire
#                 twice, the runner's own callbacks replayed while the run is live
#   ackLoss       the runner admits the request and the answer is lost: never a resend
#   publicCancel  public HTTP cancel while the browser is stuck mid-step: CANCELLED, tree gone
#   runnerKill    SIGKILL of the runner mid-run: recovery settles it STALE, tree gone, no redispatch
#   restart       a new runner process on the same address is handed nothing; the old owner's
#                 recorded callbacks are refused for its own run and for another run
#   lateCallback  every callback of a finished run sent again changes nothing
#   afterFaults   a run still passes after every fault
#   secretCanary  a secret saved over the public route is resolved into the real runner's job, typed
#                 by the real browser into a password field (the page reports what it received) and
#                 then found nowhere: not in any column of any public table (D3's scanner, eleven
#                 forms of the value), not in the runner's log, its callbacks as the backend received
#                 them, or any file it stored
#   guidedPublicCancel
#                 public HTTP cancel of a LIVE GUIDED browser in the middle of an action (a session
#                 started over the public route and driven into the same folded runner by the
#                 backend's coordinator; the model is replaced at its seam, nowhere else): the
#                 session ends CANCELLED, the guided browser tree is gone, the one navigation was
#                 dispatched once, the slot is free; then the runner's own guided callbacks are said
#                 again with its certificate and change nothing
#   guidedWorkerKill
#                 SIGKILL of the folded runner with a live guided browser: its browser tree is gone
#                 at once, the in-flight action ends the session UNKNOWN_OUTCOME, a new runner process
#                 is handed no dispatch
#
# "Zero repeated dispatches" is measured three ways that must agree: what the dispatcher sent
# (backend client), what the runner admitted and how many replay children it forked (a
# measurement prelude in the runner process), and the attempt identity the ledger kept.
#
# Every runner generation is also scanned for GUIDED_START_FAILED lines, which are classified by the
# AC-11 REL-001 pointer and the AC-12 15 s-edge rule (RUNNER-LAUNCH attribution). A count of zero is
# reported as a count.
#
# THE MEASUREMENTS ARE JUDGED HERE, NOT IN THE TEST
#
#   The test writes backend/build/corun/fault-injection-raw.json. tools/corun-report.mjs recomputes
#   every invariant from it, refuses a run whose dist digest is not the one you expect, and writes
#   the evidence document when CORUN_EVIDENCE_OUT names a path.
#
# WHY THIS EXISTS
#
#   The API and the studio-runner had never run together — not in CI (there is none in this
#   repository), and not on a laptop. Every backend test dispatched to a fake client; every runner
#   test answered a fixture. Both of Epic 10's HIGH integration defects were consequently found by
#   READING code:
#
#     DEF-01  the API's dispatch body wrote 8 keys against a closed 14-required schema, so every
#             real dispatch would have been refused 400 JOB_INVALID.
#     DEF-02  every terminal report the merged runner sent was refused by the merged API.
#
#   Both are fixed. This script is what makes that class of defect findable by running instead of
#   by reading.
#
# WHAT IT DOES NOT DO
#
#   It does not weaken anything to go green. If the real dispatch path is broken, this script exits
#   non-zero and prints which component refused what. It installs nothing: the runner's
#   node_modules must already exist (PID-1 c: the runner is started by the test as a host process,
#   so its pid is greater than 1 and the guided launch-tree guard passes; no container is used).
#
# USAGE
#
#   tools/corun.sh                 build the runner with pnpm, then run the co-run
#   tools/corun.sh --skip-build    reuse an existing studio-runner/dist (the credited form: the
#                                  dist digest is then whatever was built, and the report says so)
#   tools/corun.sh --help
#
# ENVIRONMENT
#
#   CORUN_EXPECT_DIST     a dist digest the run must have; any other digest means the run does not
#                         count (exit 1)
#   CORUN_EVIDENCE_OUT    where the report writes the evidence document (default: not written)
#   CORUN_GRADLE_ARGS     extra Gradle arguments, for example --no-daemon
#   CORUN_GUIDED=0        run the replay legs only: guided mode off in the context and the runner;
#                         the guided leg is then skipped, and the report refuses to call that a
#                         complete co-run
#
#   No port is configurable. The runner's port is chosen by the test as exclusively free on both
#   loopback families, and the API's by the OS. Nothing here ever binds a well-known development
#   port: a harness that fights an unrelated process for a socket reports a connection failure
#   that has nothing to do with the system under test, which is the exact ambiguity it exists to
#   remove.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_DIR="$ROOT_DIR/studio-runner"
BACKEND_DIR="$ROOT_DIR/backend"
TEST_CLASS="com.citi.put.checks.corun.ObservedCoRunIT"
RESULT_XML="$BACKEND_DIR/build/test-results/test/TEST-${TEST_CLASS}.xml"
RAW_JSON="$BACKEND_DIR/build/corun/fault-injection-raw.json"

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

# ── Preflight ──────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { fail "node is not on PATH"; exit 2; }
command -v pnpm >/dev/null 2>&1 || { fail "pnpm is not on PATH (the runner is built with pnpm)"; exit 2; }

# No install branch: a harness must not change what it measures. A missing node_modules is a
# failure to report, not a reason to fetch packages.
if [ ! -d "$RUNNER_DIR/node_modules" ]; then
  fail "studio-runner/node_modules is missing; install it yourself (pnpm install) — this script installs nothing"
  exit 2
fi

if [ "$SKIP_BUILD" = false ]; then
  say "building the studio-runner (pnpm)…"
  (cd "$RUNNER_DIR" && pnpm --config.package-manager-strict=false run build >/dev/null)
fi

[ -f "$RUNNER_DIR/dist/main.js" ] || { fail "studio-runner/dist/main.js is missing; drop --skip-build"; exit 2; }

# ── The co-run ─────────────────────────────────────────────────────────────
say "API + studio-runner (dist/main.js over TLS), one session. Ports are chosen by the test."
rm -f "$RESULT_XML" "$RAW_JSON"

set +e
(
  # shellcheck disable=SC2086 # CORUN_GRADLE_ARGS is a list of flags on purpose
  cd "$BACKEND_DIR" && ./gradlew test \
    --tests "$TEST_CLASS" --rerun --console=plain ${CORUN_GRADLE_ARGS:-}
)
set -e

# ── The result, read from the XML and the raw measurements, never from the exit code ──────
REPORT_ARGS=("$RESULT_XML" --raw "$RAW_JSON")
[ -n "${CORUN_EXPECT_DIST:-}" ] && REPORT_ARGS+=(--expect-dist "$CORUN_EXPECT_DIST")
[ -n "${CORUN_EVIDENCE_OUT:-}" ] && REPORT_ARGS+=(--out "$CORUN_EVIDENCE_OUT")
exec node "$ROOT_DIR/tools/corun-report.mjs" "${REPORT_ARGS[@]}"
