# INACTIVE finite first read for binding-functions.bash. Source06 actual root authority required.
# Args preserved for the exact reviewed source. Declared canonical BIN only.
[[ -z "${GATEWAY_FR04_READ_BINDING_FUNCTIONS_SEEN-}" ]] || return 1
readonly GATEWAY_FR04_READ_BINDING_FUNCTIONS_SEEN=1
GATEWAY_FR04_READ_BINDING_FUNCTIONS_BUFFER=''
if LC_ALL=C builtin read -r -N 30118 GATEWAY_FR04_READ_BINDING_FUNCTIONS_BUFFER < '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume7/binding-functions.bash'; then return 1; else GATEWAY_FR04_READ_BINDING_FUNCTIONS_STATUS=$?; fi
readonly GATEWAY_FR04_READ_BINDING_FUNCTIONS_BUFFER
[[ "${GATEWAY_FR04_READ_BINDING_FUNCTIONS_STATUS}" == 1 && "${#GATEWAY_FR04_READ_BINDING_FUNCTIONS_BUFFER}" == 30117 ]] || return 1
if '/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13' -B -c 'import hashlib,sys;sys.exit(0 if len(sys.argv[1].encode("ascii","strict"))==int(sys.argv[3]) and hashlib.sha256(sys.argv[1].encode("ascii","strict")).hexdigest()==sys.argv[2] else 1)' "${GATEWAY_FR04_READ_BINDING_FUNCTIONS_BUFFER}" '00eaf7dc0795287f30398ee47545f813089338d7f637c9a3a30ba6c7d8046e35' 30117 < /dev/null; then
  builtin eval "${GATEWAY_FR04_READ_BINDING_FUNCTIONS_BUFFER}"
else return 1
fi
