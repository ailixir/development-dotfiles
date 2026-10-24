# INACTIVE. Execute only under later exact reviewed metadata authorization.
# Args: externally raw-pinned author-request SHA and SAME ASCII request buffer.
[[ "$#" == 2 && "$1" =~ ^[0-9a-f]{64}$ && -z "${GATEWAY_S07_META_STARTED-}" ]] || return 1
readonly GATEWAY_S07_META_STARTED=1
GATEWAY_S07_META_BUFFER=''
if IFS= LC_ALL=C builtin read -r -d '' -n 17385 GATEWAY_S07_META_BUFFER < '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-source07-install-input-author/resume1/metadata-author.py'; then return 1; else GATEWAY_S07_META_READ_STATUS=$?; fi
readonly GATEWAY_S07_META_BUFFER
[[ "$GATEWAY_S07_META_READ_STATUS" == 1 && "${#GATEWAY_S07_META_BUFFER}" == 17384 ]] || return 1
'/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13' -B -c 'import hashlib,json,os,sys
ids={"pid":None,"ppid":None,"start":None,"fullFingerprint":None,"actualStatus":None,"completionOwedToOuterTool":True}
status=1
try:
 ids["pid"]=os.getpid();ids["ppid"]=os.getppid()
 buffer,expected,request_sha,request_buffer=sys.argv[1:]
 raw=buffer.encode("ascii","strict")
 if len(raw)!=17384 or hashlib.sha256(raw).hexdigest()!=expected:raise ValueError("SAME_BUFFER_SHA")
 ns={"__name__":"_verified_source07_install_metadata_author"}
 exec(compile(raw,"<verified-source07-install-metadata-author>","exec"),ns)
 terminal=ns["execute"](request_buffer.encode("ascii","strict"),request_sha,expected)
 status=terminal["selectedReturnStatus"]
except BaseException as error:
 print(json.dumps({"kind":"SOURCE07_INSTALL_METADATA_BOOTSTRAP_HOLD","process":ids,"errorType":type(error).__name__,"actualOwnCompletion":None,"outerCompletionOwed":True,"actualRuntimeAuthority":False},sort_keys=True,separators=(",",":")),flush=True)
 status=1
sys.exit(status)
' "$GATEWAY_S07_META_BUFFER" 'da0cc360580b7b4a8e70cebaa2c5add4aa0959811d31f48e1119eee77af880ce' "$1" "$2" < /dev/null
