#!/usr/bin/env bash
# REL-001 repro: read-only checks before any run. Exit 0 = OK to start; 1 = do not start.
#   preflight.sh <variant> [--allow-busy]
# --allow-busy lets you proceed while another gate is running; every result from such a run is
# contaminated and the runbook says not to use it as evidence.
set -uo pipefail
REL001_HERE="$(cd "$(dirname "$0")" && pwd)"; source "$REL001_HERE/lib.sh"
VARIANT="${1:?usage: preflight.sh a|ab [--allow-busy]}"; ALLOW_BUSY=0; [ "${2:-}" = "--allow-busy" ] && ALLOW_BUSY=1
fail=0; note() { printf '%-34s %s\n' "$1" "$2"; }
use_node24 && note "node" "$(node --version)" || { note "node" "WRONG"; fail=1; }

busy="$(pgrep -fl 'run-backend-tasked.py|GradleWorkerMain|Gradle Test Executor|vitest' | grep -v pgrep || true)"
if [ -n "$busy" ]; then
  note "other gates running" "YES"; echo "$busy" | sed 's/^/    /' | cut -c1-200
  [ "$ALLOW_BUSY" = 1 ] && note "" "continuing because --allow-busy; results are CONTAMINATED" || fail=1
else note "other gates running" "none"; fi

load="$(sysctl -n vm.loadavg | tr -d '{}' | awk '{print $1}')"; note "load average (1 min)" "$load"
awk -v l="$load" 'BEGIN{exit !(l>4)}' && { note "" "load above 4: wait or accept a noisy baseline"; [ "$ALLOW_BUSY" = 1 ] || fail=1; }
note "swap" "$(sysctl -n vm.swapusage)"
note "disk free on /System/Volumes/Data" "$(df -g /System/Volumes/Data | awk 'NR==2{print $4" GB"}')"
note "chrome for testing" "$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium-* 2>/dev/null | tr '\n' ' ')"
note "NODE_OPTIONS/DEBUG/PWDEBUG" "${NODE_OPTIONS:-}${DEBUG:-}${PWDEBUG:-}${NODE_DEBUG:-}"
[ -z "${NODE_OPTIONS:-}${DEBUG:-}${PWDEBUG:-}${NODE_DEBUG:-}" ] || { note "" "launchGuidedBrowser refuses these variables: unset them"; fail=1; }
RUNNER="$REPRO_HOME/$VARIANT/studio-runner"
[ -f "$RUNNER/dist-repro/src/guided/diagnostics.js" ] && note "scratch build ($VARIANT)" "$RUNNER" || { note "scratch build ($VARIANT)" "MISSING: run prepare-scratch.sh $VARIANT"; fail=1; }
note "protected pids (never signalled)" "$REL001_DENY_PIDS"
[ "$fail" = 0 ] && echo "PREFLIGHT OK" || echo "PREFLIGHT FAILED"; exit "$fail"
