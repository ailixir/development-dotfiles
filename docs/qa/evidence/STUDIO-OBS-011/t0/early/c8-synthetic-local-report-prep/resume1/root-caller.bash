# INACTIVE: exact later code/owner/root approval and actual root wrapper required.
# Factory substitutes only inspected positional parameters and literal ENTRY bytes.
# Must be sourced as a finite readonly buffer inside the SAME root-held Bash shell.
# No command substitution, global set/shopt, process substitution, eval of disk data,
# background receiver, new launcher discovery or unqualified builtin exit is allowed.
if [[ $# != 6 || ! $1 =~ ^/ || ! $2 =~ ^[0-9a-f]{64}$ || ! $3 =~ ^[0-9a-f]{64}$ || ! $4 =~ ^[0-9]+$ || ! $5 =~ ^[0-9]+$ || $$ != "$4" || $PPID != "$5" || ${C8_S0_INSTALLED+x} ]]; then return 1; fi
readonly C8_S0_INSTALLED=1
readonly C8_S0_BIN="$1" C8_S0_MANIFEST_SHA="$2" C8_S0_RELEASE_SHA="$3" C8_S0_SHELL_PID="$4" C8_S0_WRAPPER_PID="$5" C8_S0_UNIT="$6"
readonly C8_S0_ENTRY='"""Inactive exact verified-buffer entry. Embedded literally in reviewed root shell.

Invocation supplies one strict JSON bootstrap descriptor as an argument. No module
is imported from a path; every local code buffer is pinned before interpretation.
"""
import os,sys,stat,json,re,hashlib,types,time
from pathlib import PurePosixPath
BOOT_OWNED=[]
BOOT_RETAINED=[]
CONSUMED=False
CODE=('"'"'profile.py'"'"','"'"'qualification_custody.py'"'"','"'"'storage.py'"'"','"'"'mode_predicates.py'"'"','"'"'public_contract.py'"'"','"'"'runtime.py'"'"')
INPUT_KEYS=dict(capture=(),negative=('"'"'capture'"'"','"'"'captureOuter'"'"'),held=('"'"'capture'"'"','"'"'captureOuter'"'"','"'"'negative'"'"','"'"'negativeStatus'"'"'),
 archive=('"'"'held'"'"','"'"'heldOuter'"'"'),final=('"'"'archive'"'"','"'"'archiveQaRoot'"'"'),gate=('"'"'readiness'"'"','"'"'readinessStatus'"'"','"'"'permit'"'"'),postclose=('"'"'guard'"'"','"'"'wrapperOuter'"'"'))

def need(ok,code):
    if ok is not True:raise ValueError(code)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def decode(raw):
    def pairs(items):
        result={}
        for key,value in items:need(key not in result,'"'"'DUPLICATE_JSON'"'"');result[key]=value
        return result
    need(type(raw) is bytes and 0<len(raw)<=16777216,'"'"'BOOT_JSON_CAP'"'"')
    return json.loads(raw.decode('"'"'utf-8'"'"','"'"'strict'"'"'),object_pairs_hook=pairs,parse_constant=lambda unused:(_ for _ in ()).throw(ValueError('"'"'NONFINITE_JSON'"'"')))
def key(info):return (info.st_dev,info.st_ino,info.st_mode,info.st_uid,info.st_size,info.st_mtime_ns,info.st_ctime_ns,info.st_nlink)
def identity(info):return (info.st_dev,info.st_ino,info.st_mode,info.st_uid)
def opened(name,flags,parent=None):
    fd=os.open(name,flags,dir_fd=parent)
    token=dict(fd=fd,state='"'"'OPEN'"'"',closer=os.close);BOOT_OWNED.append(token);return token

def closed(token):
    need(token['"'"'state'"'"']=='"'"'OPEN'"'"','"'"'BOOT_CLOSE_NEVER_RETRY'"'"');token['"'"'state'"'"']='"'"'UNKNOWN'"'"'
    token['"'"'closer'"'"'](token['"'"'fd'"'"']);token['"'"'state'"'"']='"'"'CLOSED'"'"'
def pin(spec):
    need(type(spec) is dict and set(spec)=={'"'"'path'"'"','"'"'sha256'"'"','"'"'bytes'"'"','"'"'mode'"'"','"'"'uid'"'"'},'"'"'BOOT_PIN_SCHEMA'"'"')
    path=spec['"'"'path'"'"'];need(type(path) is str and path.startswith('"'"'/'"'"') and '"'"'\x00'"'"' not in path and str(PurePosixPath(path))==path
        and '"'"'..'"'"' not in PurePosixPath(path).parts and len(PurePosixPath(path).parts)<=64,'"'"'BOOT_PATH'"'"')
    need(type(spec['"'"'sha256'"'"']) is str and re.fullmatch('"'"'[0-9a-f]{64}'"'"',spec['"'"'sha256'"'"']) is not None
        and type(spec['"'"'bytes'"'"']) is int and 0<=spec['"'"'bytes'"'"']<=16777216 and type(spec['"'"'mode'"'"']) is int and spec['"'"'mode'"'"'] in (0o600,0o644)
        and type(spec['"'"'uid'"'"']) is int and spec['"'"'uid'"'"']>=0,'"'"'BOOT_PIN_TYPES'"'"')
    return spec

def read(spec):
    pin(spec);parts=PurePosixPath(spec['"'"'path'"'"']).parts;chain=[];leaf=None;failure=None;tokens=[]
    try:
        parent=opened('"'"'/'"'"',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);tokens.append(parent)
        chain.append((None,'"'"'/'"'"',parent,identity(os.fstat(parent['"'"'fd'"'"']))))
        for name in parts[1:-1]:
            old=parent;parent=opened(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,old['"'"'fd'"'"']);tokens.append(parent)
            info=os.fstat(parent['"'"'fd'"'"']);need(stat.S_ISDIR(info.st_mode),'"'"'BOOT_ANCESTOR_TYPE'"'"');chain.append((old,name,parent,identity(info)))
        leaf=opened(parts[-1],os.O_RDONLY|os.O_NOFOLLOW,parent['"'"'fd'"'"']);tokens.append(leaf);before=os.fstat(leaf['"'"'fd'"'"'])
        need(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_uid==spec['"'"'uid'"'"'] and before.st_uid in (0,os.getuid())
            and stat.S_IMODE(before.st_mode)==spec['"'"'mode'"'"'] and before.st_size==spec['"'"'bytes'"'"'],'"'"'BOOT_OPENED_PIN'"'"')
        chunks=[];used=0
        while used<spec['"'"'bytes'"'"']:
            amount=min(65536,spec['"'"'bytes'"'"']-used);raw=os.read(leaf['"'"'fd'"'"'],amount)
            need(type(raw) is bytes and 0<len(raw)<=amount,'"'"'BOOT_READ_CAP'"'"');chunks.append(raw);used+=len(raw)
        need(os.read(leaf['"'"'fd'"'"'],1)==b'"'"''"'"','"'"'BOOT_GROWTH'"'"');raw=b'"'"''"'"'.join(chunks)
        need(key(before)==key(os.fstat(leaf['"'"'fd'"'"']))==key(os.stat(parts[-1],dir_fd=parent['"'"'fd'"'"'],follow_symlinks=False)),'"'"'BOOT_LEAF_STABILITY'"'"')
        for ancestor,name,token,expected in chain:
            named=os.stat(name,follow_symlinks=False) if ancestor is None else os.stat(name,dir_fd=ancestor['"'"'fd'"'"'],follow_symlinks=False)
            need(expected==identity(os.fstat(token['"'"'fd'"'"']))==identity(named),'"'"'BOOT_CHAIN_STABILITY'"'"')
        need(digest(raw)==spec['"'"'sha256'"'"'],'"'"'BOOT_SHA_BEFORE_INTERPRETATION'"'"');return raw
    except BaseException as error:failure=error;BOOT_RETAINED.append(error);raise
    finally:
        cleanup=None
        for token in reversed(tokens):
            if token['"'"'state'"'"']=='"'"'OPEN'"'"':
                try:closed(token)
                except BaseException as error:cleanup=error;BOOT_RETAINED.append(error)
        if cleanup is not None and failure is None:raise cleanup

def foreground_boot_hold():
    # A failed close retains actual references. It is not clean shutdown or exit proof.
    BOOT_RETAINED.extend(BOOT_OWNED)
    while True:time.sleep(.1)

def modules(buffers):
    result={}
    for name in CODE:
        module=types.ModuleType('"'"'_verified_c8_'"'"'+name[:-3]);module.__file__='"'"'<verified:'"'"'+name+'"'"'>'"'"'
        exec(compile(buffers[name],module.__file__,'"'"'exec'"'"'),module.__dict__);result[name]=module
    p,k,f,m,c,r=(result[name] for name in CODE)
    f.K=k;r.P=p;r.K=k;r.F=f;r.M=m;r.C=c
    return p,k,f,m,c,r

def execute(unit,operation,inputs,expected_exit):
    result=None;code=1
    try:
        result=unit.dispatch(operation,inputs)
        if operation=='"'"'gate'"'"':need(type(result) is dict and result.get('"'"'purpose'"'"')=='"'"'FINAL_GUARD_DELIVERY'"'"' and result.get('"'"'allow'"'"') is True
            and type(result.get('"'"'expectedWrapperExit'"'"')) is int and result['"'"'expectedWrapperExit'"'"']==expected_exit,'"'"'GUARD_STATUS_DELIVERY'"'"')
        code=2 if operation=='"'"'negative'"'"' else 1 if operation=='"'"'held'"'"' and unit.primary!='"'"'NONE'"'"' else 0
    except BaseException as error:
        unit.latch(unit.P.reason(error) if hasattr(unit,'"'"'P'"'"') else unit_reason(unit,error))
    finally:
        # Outer finalizer includes failures before native() setup, and precedes operator sink.
        unit.finish()
    p=unit_profile(unit)
    if result is None:
        result=p.claim(purpose='"'"'TYPED_OPERATOR_HOLD'"'"',unit=unit.release['"'"'unit'"'"'],releaseSha256=unit.release_sha,
            sourceManifestSha256=unit.manifest_sha,operation=operation,primaryReason=unit.primary,cleanupReason=unit.cleanup,
            nativeWait=unit.child.closed_projection(),actualOuterCompletionCaptured=False)
    need(not unit.owner.blockers(),'"'"'OPERATOR_OWNERSHIP_UNKNOWN'"'"')
    raw=p.wire(result)+b'"'"'\n'"'"';need(len(raw)<=16777216,'"'"'OPERATOR_SINK_CAP'"'"')
    # Sole inherited stdout sink is opened exclusive0600 by the inspected root caller;
    # direct os.write is bounded and actual short writes are handled. No exception body.
    offset=0
    while offset<len(raw):
        count=os.write(1,raw[offset:]);need(type(count) is int and 0<count<=len(raw)-offset,'"'"'OPERATOR_WRITE'"'"');offset+=count
    return code

def unit_profile(unit):return unit.__class__.__init__.__globals__['"'"'P'"'"']
def unit_reason(unit,error):return unit_profile(unit).reason(error)

def launch(descriptor_raw,operation,expected_exit,manifest_sha,release_sha):
    global CONSUMED
    need(CONSumed_value() is False,'"'"'BOOT_ONCE_CAP'"'"');CONSUMED=True # before parsing/setup
    desc=decode(descriptor_raw)
    need(type(desc) is dict and set(desc)=={'"'"'purpose'"'"','"'"'manifest'"'"','"'"'package'"'"','"'"'release'"'"','"'"'decision'"'"','"'"'operation'"'"','"'"'previous'"'"','"'"'expectedShellPid'"'"','"'"'expectedWrapperPid'"'"','"'"'stdoutSink'"'"'},'"'"'BOOT_DESCRIPTOR'"'"')
    need(desc['"'"'purpose'"'"']=='"'"'EXACT_SYNTHETIC_ROOT_ENTRY'"'"' and desc['"'"'operation'"'"'] in INPUT_KEYS and type(desc['"'"'package'"'"']) is str,'"'"'BOOT_PURPOSE'"'"')
    need(desc['"'"'operation'"'"']==operation and desc['"'"'manifest'"'"']['"'"'sha256'"'"']==manifest_sha and desc['"'"'release'"'"']['"'"'sha256'"'"']==release_sha,'"'"'BOOT_SHELL_BOUND_PINS'"'"')
    need(type(desc['"'"'expectedShellPid'"'"']) is int and os.getppid()==desc['"'"'expectedShellPid'"'"'] and type(desc['"'"'expectedWrapperPid'"'"']) is int,'"'"'BOOT_PARENT'"'"')
    manifest_raw=read(desc['"'"'manifest'"'"']);manifest=decode(manifest_raw)
    need(type(manifest) is dict and manifest.get('"'"'kind'"'"')=='"'"'C8_SYNTHETIC_LOCAL_REPORT_SOURCE01_PREPARATION'"'"' and type(manifest.get('"'"'files'"'"')) is list,'"'"'BOOT_MANIFEST'"'"')
    rows={row['"'"'path'"'"']:row for row in manifest['"'"'files'"'"']};need(len(rows)==len(manifest['"'"'files'"'"']),'"'"'BOOT_DUPLICATE_MEMBER'"'"')
    buffers={};total=0
    for name in CODE:
        row=rows[name];spec=dict(path=desc['"'"'package'"'"']+'"'"'/'"'"'+name,sha256=row['"'"'sha256'"'"'],bytes=row['"'"'bytes'"'"'],mode=row['"'"'mode'"'"'],uid=desc['"'"'manifest'"'"']['"'"'uid'"'"'])
        total+=spec['"'"'bytes'"'"'];need(total<=16777216,'"'"'BOOT_SOURCE_AGGREGATE'"'"');buffers[name]=read(spec)
    release_raw=read(desc['"'"'release'"'"']);decision_raw=read(desc['"'"'decision'"'"'])
    p,k,f,m,c,r=modules(buffers);release=p.release(p.decode(release_raw),desc['"'"'manifest'"'"']['"'"'sha256'"'"'])
    decision=p.decode(decision_raw)
    p.fields(decision,('"'"'schemaVersion'"'"','"'"'protocol'"'"','"'"'purpose'"'"','"'"'authorizedBy'"'"','"'"'releaseSha256'"'"','"'"'unit'"'"','"'"'operation'"'"','"'"'previous'"'"','"'"'attemptCap'"'"','"'"'inputs'"'"'))
    core={name:value for name,value in decision.items() if name!='"'"'inputs'"'"'}
    p.decision(core,desc['"'"'release'"'"']['"'"'sha256'"'"'],release['"'"'unit'"'"'],desc['"'"'operation'"'"'],desc['"'"'previous'"'"'])
    need(type(decision['"'"'inputs'"'"']) is dict and set(decision['"'"'inputs'"'"'])==set(INPUT_KEYS[desc['"'"'operation'"'"']]),'"'"'BOOT_OPERATION_INPUTS'"'"')
    for spec in decision['"'"'inputs'"'"'].values():p.pin(spec)
    need(release['"'"'holder'"'"']['"'"'shell'"'"']['"'"'pid'"'"']==desc['"'"'expectedShellPid'"'"'] and release['"'"'holder'"'"']['"'"'wrapper'"'"']['"'"'pid'"'"']==desc['"'"'expectedWrapperPid'"'"'],'"'"'BOOT_HOLDER'"'"')
    sink=desc['"'"'stdoutSink'"'"'];pin(sink);info=os.fstat(1)
    need(stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==0o600 and info.st_nlink==1 and info.st_size==0,'"'"'BOOT_STDOUT_PRIVATE'"'"')
    # Named stdout equality is sampled, never a postexit or immutable-object assertion.
    named=os.stat(sink['"'"'path'"'"'],follow_symlinks=False);need(identity(info)==identity(named),'"'"'BOOT_STDOUT_NAME'"'"')
    need(sink['"'"'bytes'"'"']==0 and sink['"'"'sha256'"'"']==digest(b'"'"''"'"'),'"'"'BOOT_EMPTY_SINK'"'"')
    unit=r.Unit(release,desc['"'"'release'"'"']['"'"'sha256'"'"'],desc['"'"'manifest'"'"']['"'"'sha256'"'"'],buffers)
    BOOT_RETAINED.append(unit)
    return execute(unit,desc['"'"'operation'"'"'],decision['"'"'inputs'"'"'],expected_exit)

def CONSumed_value():return CONSUMED

def main(arguments):
    result=1
    try:
        need(type(arguments) is list and len(arguments)==5,'"'"'BOOT_ARGC'"'"')
        need(arguments[1] in INPUT_KEYS and (arguments[2] in ('"'"'0'"'"','"'"'1'"'"') if arguments[1]=='"'"'gate'"'"' else arguments[2]=='"'"'-'"'"'),'"'"'BOOT_EXPECTED_STATUS'"'"')
        result=launch(arguments[0].encode('"'"'utf-8'"'"','"'"'strict'"'"'),arguments[1],int(arguments[2]) if arguments[1]=='"'"'gate'"'"' else None,arguments[3],arguments[4])
    except BaseException as error:
        BOOT_RETAINED.append(error)
        for token in reversed(BOOT_OWNED):
            if token['"'"'state'"'"']=='"'"'OPEN'"'"':
                try:closed(token)
                except BaseException as cleanup:BOOT_RETAINED.append(cleanup)
        if any(token['"'"'state'"'"']!='"'"'CLOSED'"'"' for token in BOOT_OWNED):foreground_boot_hold()
        # Closed public code only, no raw strings/exceptions/private data.
        raw=b'"'"'{"purpose":"TYPED_BOOTSTRAP_HOLD","actualOuterCompletionCaptured":false}\n'"'"'
        offset=0
        while offset<len(raw):
            count=os.write(2,raw[offset:]);need(type(count) is int and 0<count<=len(raw)-offset,'"'"'BOOT_STDERR'"'"');offset+=count
    return result

if __name__=='"'"'__main__'"'"':sys.exit(main(sys.argv[1:]))
'
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
