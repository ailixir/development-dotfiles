#!/usr/bin/env bash
# REL-001 repro: same loop with patch A+B. Expectation: 0 failures over N in every mode where variant a failed.
#   run-fix-validation.sh --n 300 --modes <the modes where variant a failed> [--a-results <dir of the variant a run>]
# Builds the ab scratch copy if needed, runs run-matrix.sh --variant ab with the same options, and, when
# --a-results is given, prints the Fisher exact comparison against the variant a counts.
set -uo pipefail
REL001_HERE="$(cd "$(dirname "$0")" && pwd)"; source "$REL001_HERE/lib.sh"; use_node24 || exit 1
A_RES=""; ARGS=()
while [ $# -gt 0 ]; do case "$1" in --a-results) A_RES="$2"; shift 2;; *) ARGS+=("$1"); shift;; esac; done
[ -f "$REPRO_HOME/ab/studio-runner/dist-repro/src/guided/diagnostics.js" ] || "$REL001_HERE/prepare-scratch.sh" ab || exit 1
OUT="$REPRO_HOME/results/$(date +%Y%m%dT%H%M%S)-ab"
"$REL001_HERE/run-matrix.sh" --variant ab --out "$OUT" ${ARGS[@]+"${ARGS[@]}"} || exit 1
if [ -n "$A_RES" ]; then
  echo; echo "=== variant a vs variant ab (Fisher exact, per mode) ==="
  node "$REL001_HERE/tally.mjs" --compare "$A_RES" "$OUT"
fi
