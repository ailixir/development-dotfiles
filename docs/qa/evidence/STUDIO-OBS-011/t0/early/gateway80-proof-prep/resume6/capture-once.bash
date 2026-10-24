# PREPARED ONLY. Root must explicitly authorize and source this ONCE in shell3749.
# Local readonly backstop; not a hostile-operator or OS security boundary.
if [[ $# != 3 || ! $1 =~ ^[0-9a-f]{64}$ || ! $3 =~ ^[0-9a-f]{64}$ || $$ != 3749 || $PPID != 3720 || ${GATEWAY80_CAPTURE_MANIFEST_SHA+x} || ${GATEWAY80_CAPTURE_ATTEMPTED+x} ]]; then
  return 1
fi
readonly GATEWAY80_CAPTURE_MANIFEST_SHA="$1"
readonly GATEWAY80_CAPTURE_AUTH_PATH="$2"
readonly GATEWAY80_CAPTURE_AUTH_SHA="$3"
readonly GATEWAY80_CAPTURE_DIR="/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6"
readonly GATEWAY80_CAPTURE_PYTHON="/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13"
function gateway80_capture_once() {
  if [[ $# != 0 || ${GATEWAY80_CAPTURE_ATTEMPTED+x} ]]; then
    return 1
  fi
  readonly GATEWAY80_CAPTURE_ATTEMPTED=1
  "$GATEWAY80_CAPTURE_PYTHON" -B "$GATEWAY80_CAPTURE_DIR/capture-admission.py" "$GATEWAY80_CAPTURE_MANIFEST_SHA" "$GATEWAY80_CAPTURE_AUTH_PATH" "$GATEWAY80_CAPTURE_AUTH_SHA" --same-shell-once-consumed < /dev/null
  local gateway80_capture_actual_status=$?
  return "$gateway80_capture_actual_status"
}
readonly -f gateway80_capture_once
