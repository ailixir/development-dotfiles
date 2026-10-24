# INACTIVE: exact later code/owner/root approval and actual root wrapper required.
# Factory substitutes only inspected positional parameters and literal ENTRY bytes.
# Must be sourced as a finite readonly buffer inside the SAME root-held Bash shell.
# No command substitution, global set/shopt, process substitution, eval of disk data,
# background receiver, new launcher discovery or unqualified builtin exit is allowed.
if [[ $# != 6 || ! $1 =~ ^/ || ! $2 =~ ^[0-9a-f]{64}$ || ! $3 =~ ^[0-9a-f]{64}$ || ! $4 =~ ^[0-9]+$ || ! $5 =~ ^[0-9]+$ || $$ != "$4" || $PPID != "$5" || ${C8_S0_INSTALLED+x} ]]; then return 1; fi
readonly C8_S0_INSTALLED=1
readonly C8_S0_BIN="$1" C8_S0_MANIFEST_SHA="$2" C8_S0_RELEASE_SHA="$3" C8_S0_SHELL_PID="$4" C8_S0_WRAPPER_PID="$5" C8_S0_UNIT="$6"
# @LITERAL_VERIFIED_ENTRY_ASSIGNMENT@
# Descriptor and stdout are exact separately inspected root controls. The enclosing
# root wrapper supplies an exclusive0600 stdout FD and retains it until actual child
# completion; entry verifies empty/nlink/mode/UID/named equality before target work.
# This inherited sink contract is a separate explicit prerequisite, not invented by
# copying a historical wrapper. Missing same-holder sink ownership remains HOLD.
function c8_s0_invoke() {
  if [[ $# != 2 ]]; then return 1; fi
  case "$1" in capture|negative|held|archive|final|postclose) ;; *) return 1 ;; esac
  case ":${C8_S0_USED:-}:" in *":$1:"*) return 1 ;; esac
  C8_S0_USED="${C8_S0_USED:-}:$1:"
  local c8_s0_status
  if "$C8_S0_BIN" -I -B -c "$C8_S0_ENTRY" "$2" "$1" - "$C8_S0_MANIFEST_SHA" "$C8_S0_RELEASE_SHA" < /dev/null; then c8_s0_status=0; else c8_s0_status=$?; fi
  return "$c8_s0_status"
}
function exit() {
  # Root separately inspected final0/readiness and distinct60s permit before this.
  if [[ $# != 3 || $1 != 0 || ! $3 =~ ^[01]$ || ${C8_S0_GATE_USED+x} ]]; then return 1; fi
  readonly C8_S0_GATE_USED=1
  local c8_s0_gate_status
  if "$C8_S0_BIN" -I -B -c "$C8_S0_ENTRY" "$2" gate "$3" "$C8_S0_MANIFEST_SHA" "$C8_S0_RELEASE_SHA" < /dev/null; then c8_s0_gate_status=0; else c8_s0_gate_status=$?; fi
  if [[ $c8_s0_gate_status == 0 ]]; then builtin exit "$3"; fi
  return 1
}
readonly -f c8_s0_invoke exit
