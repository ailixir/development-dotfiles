# INACTIVE finite first read for control-author-loader.bash. Source06 actual root authority required.
# Args preserved for the exact reviewed source. Declared canonical BIN only.
[[ -z "${GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_SEEN-}" ]] || return 1
readonly GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_SEEN=1
GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_BUFFER=''
if IFS= LC_ALL=C builtin read -r -d '' -n 35489 GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_BUFFER < '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume7/control-author-loader.bash'; then return 1; else GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_STATUS=$?; fi
readonly GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_BUFFER
[[ "${GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_STATUS}" == 1 && "${#GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_BUFFER}" == 35488 ]] || return 1
if '/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13' -B -c 'import hashlib,sys;sys.exit(0 if len(sys.argv[1].encode("ascii","strict"))==int(sys.argv[3]) and hashlib.sha256(sys.argv[1].encode("ascii","strict")).hexdigest()==sys.argv[2] else 1)' "${GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_BUFFER}" 'fbd8205820b7a13b812bb2a318ad893c81e710a8c38180031c0ed632df75082c' 35488 < /dev/null; then
  builtin eval "${GATEWAY_FR04_READ_CONTROL_AUTHOR_LOADER_BUFFER}"
else return 1
fi
