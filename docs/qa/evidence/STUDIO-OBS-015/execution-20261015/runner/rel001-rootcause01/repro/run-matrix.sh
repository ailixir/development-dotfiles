#!/usr/bin/env bash
# REL-001 repro: run the guided-start stress (and the version-race probe) under load modes.
#   run-matrix.sh --variant a|ab --n 100 [--modes baseline,cpu,mem,cpu+mem,throttle,throttle+cpu,io]
#                 [--concurrency 1] [--hold-ms 1500] [--cpu-procs <n>] [--mem-gb 5] [--probe-n 0]
#                 [--inject-lag-ms 0] [--out <dir>] [--allow-busy]
# DO NOT START while another gate runs (preflight refuses). Everything it starts is tracked and stopped
# on exit/INT/TERM; temp dirs it makes are removed. See runbook.md.
set -uo pipefail
REL001_HERE="$(cd "$(dirname "$0")" && pwd)"; source "$REL001_HERE/lib.sh"; use_node24 || exit 1
VARIANT=a; N=100; MODES="baseline,cpu,mem,cpu+mem,throttle,throttle+cpu"; CONC=1; HOLD=1500; CPUP="$(sysctl -n hw.ncpu)"; MEMGB=5; PROBE_N=0; LAG=0; OUT=""; ALLOW=""
while [ $# -gt 0 ]; do case "$1" in
  --variant) VARIANT="$2"; shift 2;; --n) N="$2"; shift 2;; --modes) MODES="$2"; shift 2;; --concurrency) CONC="$2"; shift 2;;
  --hold-ms) HOLD="$2"; shift 2;; --cpu-procs) CPUP="$2"; shift 2;; --mem-gb) MEMGB="$2"; shift 2;; --probe-n) PROBE_N="$2"; shift 2;;
  --inject-lag-ms) LAG="$2"; shift 2;; --out) OUT="$2"; shift 2;; --allow-busy) ALLOW="--allow-busy"; shift;;
  *) echo "unknown arg $1" >&2; exit 2;; esac; done
RUNNER="$REPRO_HOME/$VARIANT/studio-runner"
"$REL001_HERE/preflight.sh" "$VARIANT" $ALLOW || exit 1
[ -n "$OUT" ] || OUT="$REPRO_HOME/results/$(date +%Y%m%dT%H%M%S)-$VARIANT"
mkdir -p "$OUT"; install_cleanup_trap
RUNTMP="$(own_dir "${TMPDIR:-/tmp}")"; export TMPDIR="$RUNTMP"   # Chrome scratch lands here and is removed with it
echo "results: $OUT   variant: $VARIANT   n: $N   modes: $MODES   scratch: $RUNTMP"

run_one() {  # run_one <mode>
  local mode="$1" hp rc ready
  local prefix; prefix=()
  ready="$OUT/$mode.mem.ready"
  rm -f "$ready"
  case "$mode" in *throttle*) prefix=(taskpolicy -b);; esac
  case "$mode" in *cpu*) start_cpu "$CPUP";; esac
  case "$mode" in *mem*) start_mem "$MEMGB" 1.5 "$ready"
      for _ in $(seq 1 120); do [ -f "$ready" ] && break; sleep 1; done
      [ -f "$ready" ] && cat "$ready" || echo "memory holder did not become ready in 120 s" >&2;; esac
  case "$mode" in *io*) start_io "$RUNTMP";; esac
  sleep 3
  echo "--- $mode: start $(date +%T), load $(sysctl -n vm.loadavg), swap $(sysctl -n vm.swapusage)"
  ${prefix[@]+"${prefix[@]}"} node "$REL001_HERE/harness-stress.mjs" --runner "$RUNNER" --out "$OUT/$mode.jsonl" --n "$N" --concurrency "$CONC" \
      --hold-ms "$HOLD" --mode "$mode" --variant "$VARIANT" --inject-lag-ms "$LAG" & hp=$!; track "$hp"; wait "$hp"; rc=$?
  echo "--- $mode: harness exit $rc at $(date +%T)"
  if [ "$PROBE_N" -gt 0 ]; then
    ${prefix[@]+"${prefix[@]}"} node "$REL001_HERE/probe-version-race.mjs" --runner "$RUNNER" --out "$OUT/$mode.probe.jsonl" --n "$PROBE_N" --mode "$mode" & hp=$!; track "$hp"; wait "$hp"
  fi
  stop_all; kill_by_private_dir "$RUNTMP" TERM   # stop this mode's stressors and any browser it orphaned
}

IFS=',' read -r -a LIST <<< "$MODES"
for m in "${LIST[@]}"; do run_one "$m"; done
node "$REL001_HERE/tally.mjs" "$OUT"/*.jsonl | tee "$OUT/tally.txt"
echo "done. Raw per-iteration files hold local paths: keep *.raw.jsonl out of committed evidence."
