# INACTIVE finite first read for install-loader.bash. Source08 actual root authority required.
# Args preserved for the exact reviewed source. Declared canonical BIN only.
[[ -z "${GATEWAY_FR05_READ_INSTALL_LOADER_SEEN-}" ]] || return 1
readonly GATEWAY_FR05_READ_INSTALL_LOADER_SEEN=1
GATEWAY_FR05_READ_INSTALL_LOADER_BUFFER=''
if IFS= LC_ALL=C builtin read -r -d '' -n 27899 GATEWAY_FR05_READ_INSTALL_LOADER_BUFFER < '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume8/install-loader.bash'; then return 1; else GATEWAY_FR05_READ_INSTALL_LOADER_STATUS=$?; fi
readonly GATEWAY_FR05_READ_INSTALL_LOADER_BUFFER
[[ "${GATEWAY_FR05_READ_INSTALL_LOADER_STATUS}" == 1 && "${#GATEWAY_FR05_READ_INSTALL_LOADER_BUFFER}" == 27898 ]] || return 1
# STOP HERE: exact separate approved trace-bearing bootstrap807/1690 verification
# must return separate actual0 and be fully inspected before SAME-buffer builtin
# eval under a fresh scope. No silent verifier/target invocation in this prefix.
