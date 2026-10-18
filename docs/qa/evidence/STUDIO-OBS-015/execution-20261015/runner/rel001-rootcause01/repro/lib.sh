#!/usr/bin/env bash
# REL-001 repro: shared helpers. Source it; sourcing has no side effects.
# Rule: this tooling signals ONLY processes it started itself (recorded in STARTED), never a PID it
# merely found, and never the protected PIDs below.

REL001_DENY_PIDS="22246 44737 13577 13581"
REL001_REPO="${REL001_REPO:-/Users/brunobuger/orca/workspaces/put-checks/ui-studio}"
REL001_EVIDENCE="$REL001_REPO/docs/qa/evidence/STUDIO-OBS-015/execution-20261015/runner/rel001-rootcause01"
REL001_SCRATCH="${REL001_SCRATCH:-/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/rel001}"
REPRO_HOME="${REPRO_HOME:-$REL001_SCRATCH/repro-run}"
NODE_BIN_DIR="${NODE_BIN_DIR:-$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin}"

STARTED=()      # "pid|lstart" of processes this run started
OWNED_DIRS=()   # directories this run created (each holds a .rel001-owned marker)

REL001_NODE_VERSION="${REL001_NODE_VERSION:-v24.20.0}"   # override together with NODE_BIN_DIR for a parity run
use_node24() {
  export PATH="$NODE_BIN_DIR:$PATH"
  local v; v="$(node --version 2>/dev/null)"
  if [ "$v" != "$REL001_NODE_VERSION" ]; then echo "need node $REL001_NODE_VERSION, found '$v' (NODE_BIN_DIR=$NODE_BIN_DIR)" >&2; return 1; fi
}

is_denied() { local d; for d in $REL001_DENY_PIDS; do [ "$1" = "$d" ] && return 0; done; return 1; }

# All descendants of a pid, breadth first.
descendants() {
  ps -A -o pid= -o ppid= | awk -v root="$1" '
    { kids[$2] = kids[$2] " " $1 }
    END { n = split(kids[root], q, " "); i = 1
          while (i <= n) { print q[i]; m = split(kids[q[i]], c, " "); for (j = 1; j <= m; j++) q[++n] = c[j]; i++ } }'
}

lstart_of() { ps -o lstart= -p "$1" 2>/dev/null | sed 's/^ *//'; }

# Record a process this run started. Call right after launching it: track $!
track() {
  local pid="$1"
  if is_denied "$pid"; then echo "refusing to track protected pid $pid" >&2; return 1; fi
  STARTED+=("$pid|$(lstart_of "$pid")")
}

# Signal a started process and its descendants (the browsers and dd it spawned).
kill_tree() {
  local pid="$1" sig="${2:-TERM}" d
  for d in $(descendants "$pid") "$pid"; do
    if is_denied "$d"; then echo "refusing to signal protected pid $d" >&2; continue; fi
    kill -"$sig" "$d" 2>/dev/null || true
  done
}

# Stop everything this run started; skip an entry whose start time changed (pid reuse).
stop_all() {
  local entry pid ls now i
  for ((i=${#STARTED[@]}-1; i>=0; i--)); do
    entry="${STARTED[$i]}"; pid="${entry%%|*}"; ls="${entry#*|}"
    now="$(lstart_of "$pid")"
    [ -z "$now" ] && continue
    [ "$now" = "$ls" ] || { echo "pid $pid is no longer ours (start time changed); not signalling" >&2; continue; }
    kill_tree "$pid" TERM
  done
  sleep 2
  for ((i=${#STARTED[@]}-1; i>=0; i--)); do
    entry="${STARTED[$i]}"; pid="${entry%%|*}"; ls="${entry#*|}"
    now="$(lstart_of "$pid")"
    [ -n "$now" ] && [ "$now" = "$ls" ] && kill_tree "$pid" KILL
  done
  STARTED=()
}

# Browsers a killed harness may leave behind are re-parented to launchd, so they are no longer
# descendants. They are still identifiable: their profile lives under a directory this run created.
# Signal only processes whose command line contains that private directory.
kill_by_private_dir() {  # kill_by_private_dir <dir> [signal]
  local dir="$1" sig="${2:-TERM}" pid
  [ -f "$dir/.rel001-owned" ] || return 0
  for pid in $(ps -A -o pid= -o command= | awk -v d="$dir/" 'index($0, d) { print $1 }'); do
    [ "$pid" = "$$" ] && continue
    if is_denied "$pid"; then echo "refusing to signal protected pid $pid" >&2; continue; fi
    kill -"$sig" "$pid" 2>/dev/null || true
  done
}

# mkdir a directory this run owns, with a marker, and remember it for removal.
own_dir() {
  local d; d="$(mktemp -d "${1:-${TMPDIR:-/tmp}}/rel001.XXXXXX")" || return 1
  : > "$d/.rel001-owned"; OWNED_DIRS+=("$d"); printf '%s\n' "$d"
}

remove_owned_dirs() {
  local d
  for d in "${OWNED_DIRS[@]:-}"; do
    [ -n "$d" ] && [ -f "$d/.rel001-owned" ] && case "$(basename "$d")" in rel001.*) rm -rf "$d" ;; esac
  done
  OWNED_DIRS=()
}

install_cleanup_trap() {
  trap 'stop_all; for d in "${OWNED_DIRS[@]:-}"; do [ -n "$d" ] && kill_by_private_dir "$d" KILL; done; remove_owned_dirs' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM HUP
}

# Stressors. Each is started in the background and tracked.
start_cpu() {  # start_cpu <n>
  local n="$1" i; for ((i=0; i<n; i++)); do yes >/dev/null & track $!; done
}
start_mem() {  # start_mem <gb> <min-free-swap-gb> <ready-file>
  node "$REL001_HERE/mem-hold.mjs" --gb "$1" --min-free-swap-gb "$2" --ready-file "$3" & track $!
}
start_io() {   # start_io <scratch-dir>
  local f="$1/io-stress.bin"
  bash -c 'while :; do dd if=/dev/zero of="$1" bs=1m count=256 2>/dev/null; rm -f "$1"; done' _ "$f" & track $!
}
