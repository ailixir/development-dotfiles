"""Lean author-only caller generation from same reviewed source buffers."""
from pathlib import Path
import ast,hashlib,json
D=Path(__file__).parent;source=(D/'control-author-cli.py').read_text();tree=ast.parse(source)
selected=[]
for n in tree.body:
 if isinstance(n,(ast.Import,ast.ImportFrom)):selected.append(n)
 elif isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('R','E','N','SOURCE','STAGES','REASON_REGISTRY') for t in n.targets):selected.append(n)
 elif isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name in ('BootstrapValueError','FailureSink','bootstrap_read'):selected.append(n)
body='import sys\n'+'\n'.join(ast.get_source_segment(source,n) for n in selected)+'\n'
body+='''sink=FailureSink(lambda value:print(json.dumps(value,sort_keys=True,separators=(",",":"),allow_nan=False),flush=True),os.getpid(),os.getppid())
finalizer=sink.claim_finalizer("CONTROL_AUTHOR_LOADER")
status=1
try:
 expected,source_sha,authority_sha,request_sha,request_buffer=sys.argv[1:]
 if type(request_buffer)is not str or len(request_buffer)>1048576:raise BootstrapValueError("AUTHOR_REQUEST_RAW_PIN")
 raw=bootstrap_read(SOURCE/"control-author-cli.py",0o644,sink)
 if hashlib.sha256(raw).hexdigest()!=expected:raise BootstrapValueError("INSTALL_LOADER_SHA")
 ns={"__name__":"_verified_control_author_entry"};exec(compile(raw,"<verified-control-author-cli>","exec"),ns)
 result=ns["execute"](request_buffer.encode("ascii","strict"),request_sha,authority_sha,source_sha,failure_sink=sink,verified_self_sha=expected)
 encoded=json.dumps(result,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False)
 if len(encoded)>1048576:raise BootstrapValueError("BOUNDED_JSON")
 print(encoded,flush=True)
 status=0
except BaseException as error:
 sink.primary(error);status=1
finally:
 sink.finalize(finalizer)
sys.exit(status)
'''
def quote(text):return "'"+text.replace("'","'\"'\"'")+"'"
loader='''# INACTIVE Source06-only control author; actual root install/control scopes owed.
# Args: own exact control-author-cli SHA, source06 manifest SHA, installed authority SHA.
[[ "$#" == 3 && "$1" =~ ^[0-9a-f]{64}$ && "$2" =~ ^[0-9a-f]{64}$ && "$3" =~ ^[0-9a-f]{64}$ && -z "${GATEWAY_FR04_AUTHOR_SHA-}" ]] || return 1
readonly GATEWAY_FR04_AUTHOR_SHA="$1" GATEWAY_FR04_AUTHOR_SOURCE_SHA="$2" GATEWAY_FR04_AUTHOR_AUTHORITY_SHA="$3"
readonly GATEWAY_FR04_AUTHOR_PYTHON='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13'
readonly GATEWAY_FR04_AUTHOR_BODY=BODY
# Own actual Python PID/parent/pending self evidence is captured by the same process
# as this bootstrap/CLI/author; no separate last-author hash or verifier child.
gateway80_fr04_author_control() {
  [[ "$#" == 3 && "$2" =~ ^[0-9a-f]{64}$ ]] || return 1
  case "$1" in
    SETUP_OWNERSHIP_ADMISSION) [[ -z "${GATEWAY_FR04_AUTHOR_SETUP-}" ]] || return 1; readonly GATEWAY_FR04_AUTHOR_SETUP=1 ;;
    NEGATIVE_ACTUAL_STATUS) [[ -z "${GATEWAY_FR04_AUTHOR_HELD-}" ]] || return 1; readonly GATEWAY_FR04_AUTHOR_HELD=1 ;;
    FAILED_GUARD_ADMISSION) [[ -z "${GATEWAY_FR04_AUTHOR_ADMISSION-}" ]] || return 1; readonly GATEWAY_FR04_AUTHOR_ADMISSION=1 ;;
    ARCHIVE_FAILED_STATE) [[ -z "${GATEWAY_FR04_AUTHOR_ARCHIVE-}" ]] || return 1; readonly GATEWAY_FR04_AUTHOR_ARCHIVE=1 ;;
    ACTUAL_ARCHIVE_REVIEW) [[ -z "${GATEWAY_FR04_AUTHOR_FINAL-}" ]] || return 1; readonly GATEWAY_FR04_AUTHOR_FINAL=1 ;;
    FAILED_EXIT_PERMIT) [[ -z "${GATEWAY_FR04_AUTHOR_GATE-}" ]] || return 1; readonly GATEWAY_FR04_AUTHOR_GATE=1 ;;
    ACTUAL_WRAPPER_RESULT) [[ -z "${GATEWAY_FR04_AUTHOR_POSTCLOSE-}" ]] || return 1; readonly GATEWAY_FR04_AUTHOR_POSTCLOSE=1 ;;
    *) return 1 ;;
  esac
  "$GATEWAY_FR04_AUTHOR_PYTHON" -B -c "$GATEWAY_FR04_AUTHOR_BODY" "$GATEWAY_FR04_AUTHOR_SHA" "$GATEWAY_FR04_AUTHOR_SOURCE_SHA" "$GATEWAY_FR04_AUTHOR_AUTHORITY_SHA" "$2" "$3" < /dev/null
}
readonly -f gateway80_fr04_author_control
# Outside postclose is the same reviewed function in a separately approved parent;
# root supplies only the actual wrapper result/source/state facts. No old holder
# identity is inherited from the earlier parent and no actual outside scope exists.
'''.replace('=BODY','= '+quote(body))
(D/'control-author-loader.bash').write_text(loader)
# All current caller surfaces are read once with a finite builtin cap before any
# verifier process/interpretation. The same readonly buffer is hashed then evaled.
readers=[]
for name in ('install-loader.bash','binding-functions.bash','control-author-loader.bash'):
 raw=(D/name).read_bytes();raw.decode('ascii');h=hashlib.sha256(raw).hexdigest();tag=name.split('.')[0].replace('-','_').upper()
 readers.append(dict(path=name,sha256=h,bytes=len(raw),firstReadCap=len(raw)+1))
 prefix='GATEWAY_FR04_READ_'+tag
 text=f'''# INACTIVE finite first read for {name}. Source06 actual root authority required.
# Args preserved for the exact reviewed source. Declared canonical BIN only.
[[ -z "${{{prefix}_SEEN-}}" ]] || return 1
readonly {prefix}_SEEN=1
{prefix}_BUFFER=''
if LC_ALL=C builtin read -r -N {len(raw)+1} {prefix}_BUFFER < {quote(str((D/name).absolute()))}; then return 1; else {prefix}_STATUS=$?; fi
readonly {prefix}_BUFFER
[[ "${{{prefix}_STATUS}}" == 1 && "${{#{prefix}_BUFFER}}" == {len(raw)} ]] || return 1
if '/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13' -B -c 'import hashlib,sys;sys.exit(0 if len(sys.argv[1].encode("ascii","strict"))==int(sys.argv[3]) and hashlib.sha256(sys.argv[1].encode("ascii","strict")).hexdigest()==sys.argv[2] else 1)' "${{{prefix}_BUFFER}}" {quote(h)} {len(raw)} < /dev/null; then
  builtin eval "${{{prefix}_BUFFER}}"
else return 1
fi
'''
 (D/(name+'.first-read.bash')).write_text(text)
(D/'caller-bindings.json').write_text(json.dumps(dict(currentCallerSources=readers,controlAuthorCliSha256=hashlib.sha256((D/'control-author-cli.py').read_bytes()).hexdigest(),operatorHelperSha256=hashlib.sha256((D/'operator-completion.js').read_bytes()).hexdigest(),
    beforeUse='own exact code06 reviews + three owners + fresh applicability/source proof + distinct actual scopes',
    completion='same verified pureJS operator memory computes JSON/SHA/builtin binder after actual captured status; no final hashing child',
    allActualHelperIds='Every source-reader/buffer-verifier/author is recorded with actual PID/parent/outer status. Existing verifier process is never hidden: include its actual tool facts in the next control request. No helper is introduced to hash completion.',
    guard='original permit checked at final GUARD acceptance after selected cleanup/delivery preparation; physical parent scheduling interval UNPROVED; actual wrapper/postclose QA separate'),indent=2)+'\n')
print(json.dumps(dict(callerSources=len(readers),sourceOnly=True)))
