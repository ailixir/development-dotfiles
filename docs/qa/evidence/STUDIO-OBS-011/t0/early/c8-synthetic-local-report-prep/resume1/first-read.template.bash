# INACTIVE exact finite first shell read; explicit later owner/root authority required.
# Args: declared BIN, actual manifest SHA, actual release SHA, shell PID, wrapper PID, unit.
if [[ $# != 6 || ${C8_S0_READ_BUFFER+x} || ${C8_S0_READ_SEEN+x} ]]; then return 1; fi
readonly C8_S0_READ_SEEN=1
C8_S0_READ_BUFFER=''
# An EOF return of 1 is expected because the cap is one byte beyond the exact file.
if LC_ALL=C builtin read -r -N 15173 C8_S0_READ_BUFFER < '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-synthetic-local-report-prep/resume1/root-caller.bash'; then return 1; else
  C8_S0_READ_STATUS=$?
fi
readonly C8_S0_READ_BUFFER
if [[ $C8_S0_READ_STATUS != 1 || ${#C8_S0_READ_BUFFER} != 15172 ]]; then return 1; fi
if "$1" -I -B -c 'import hashlib,sys;sys.exit(0 if hashlib.sha256(sys.argv[1].encode("utf-8","strict")).hexdigest()==sys.argv[2] else 1)' "$C8_S0_READ_BUFFER" '6f6f67bc2154087a88291483e1f3a28d350a988eba0b6373b73d5a4d7d4a33ca' < /dev/null; then
  builtin eval "$C8_S0_READ_BUFFER"
else return 1
fi
