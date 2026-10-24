# INERT: exact literal guard buffer; fill only two root-adopted SHA arguments.
source /dev/stdin '__ENTRY_SHA_FROM_ROOT__' '__AUTH_SHA_FROM_ROOT__' <<'GATEWAY_FAILED_REVIEWED_SOURCE'
# PREPARATION ONLY. Source only after new exact root exception/install. No operation here.
# Arguments: externally adopted ENTRY_SHA AUTHORITY_SHA, both lowercase SHA256.
[[ "$1" =~ ^[0-9a-f]{64}$ && "$2" =~ ^[0-9a-f]{64}$ ]] || return 1
readonly GATEWAY_FAILED_ENTRY_SHA="$1"
readonly GATEWAY_FAILED_ROOT_SHA="$2"
readonly GATEWAY_FAILED_PYTHON='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13'
readonly GATEWAY_FAILED_ENTRY='/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019/failed-red-resource-disposition01/entry.py'
gateway80_failed_red_invoke() {
  # Readonly SAME-shell consumption precedes Python and publishes no current facts.
  # Failed prequalification cannot create an N record, and cannot be retried here.
  case "$1" in
    negative) [[ -z "${GATEWAY_FAILED_NEGATIVE_STARTED-}" ]] || return 1; readonly GATEWAY_FAILED_NEGATIVE_STARTED=1 ;;
    held-proof) [[ -z "${GATEWAY_FAILED_HELD_STARTED-}" ]] || return 1; readonly GATEWAY_FAILED_HELD_STARTED=1 ;;
    archive) [[ -z "${GATEWAY_FAILED_ARCHIVE_STARTED-}" ]] || return 1; readonly GATEWAY_FAILED_ARCHIVE_STARTED=1 ;;
    final) [[ -z "${GATEWAY_FAILED_FINAL_STARTED-}" ]] || return 1; readonly GATEWAY_FAILED_FINAL_STARTED=1 ;;
    gate) [[ -z "${GATEWAY_FAILED_GATE_STARTED-}" ]] || return 1; readonly GATEWAY_FAILED_GATE_STARTED=1 ;;
    postclose) [[ -z "${GATEWAY_FAILED_POSTCLOSE_STARTED-}" ]] || return 1; readonly GATEWAY_FAILED_POSTCLOSE_STARTED=1 ;;
    *) return 1 ;;
  esac
  "$GATEWAY_FAILED_PYTHON" -B -c '
import hashlib,json,os,stat,sys
class FailureSink:
    """One root/operator trace record; never an N fact or qualified observation."""
    def __init__(self,emit,pid=None,ppid=None):
        self.emit,self.pid,self.ppid=emit,pid,ppid;self.owner=None;self.sent=False;self.bootstrap_fds=[];self.resources=[];self.bounded_metadata_omitted=False
    def text(self,value,maximum):
        if value is None:return None
        if type(value)is str and len(value)<=maximum:return value
        self.bounded_metadata_omitted=True;return None
    def number(self,value,minimum,maximum):
        if value is None:return None
        if type(value)is int and minimum<=value<=maximum:return value
        self.bounded_metadata_omitted=True;return None
    def forward(self,error):
        if self.sent:return
        self.sent=True;owner=self.owner
        current=(getattr(owner,"client",None) or getattr(owner,"provisional_client",None)) if owner is not None else None
        known=[];utilities=getattr(owner,"utilities",[]) if owner is not None else []
        prequalified=getattr(owner,"prequalified",False) is True
        selected=[r for r in utilities if not prequalified or r.get("classification")!="WAITED_POPEN_CHILD" or r.get("terminal") is not True]
        # Launch bounds guarantee this is closed; no truncation of unknown children.
        if len(selected)>64:raise ValueError("FAILURE_SINK_CHILD_BOUND")
        for row in selected:
            command=row.get("command")
            if type(command)is not list or len(command)>16 or not all(type(x)is str and len(x)<=1024 for x in command):raise ValueError("FAILURE_SINK_ARGV_BOUND")
            status=row.get("status");pid=row.get("pid")
            known.append(dict(pid=self.number(pid,1,2147483647),command=command,
                executableSha256=self.text(row.get("executableSha256"),64),start=self.text(row.get("observedStart"),128),
                startObserved=type(row.get("observedStart"))is str and len(row["observedStart"])<=128,fullFingerprint=None,
                waited=row.get("terminal") is True,status=self.number(status,-2147483648,2147483647),
                stdoutComplete=row.get("stdoutComplete") is True,stderrComplete=row.get("stderrComplete") is True,
                partialStdoutAvailable=row.get("partialStdoutAvailable") is True,partialStderrAvailable=row.get("partialStderrAvailable") is True,
                classification=self.text(row.get("classification"),64),ownership="PROVISIONAL_UNQUALIFIED"))
        client=dict(pid=self.number(self.pid,1,2147483647),ppid=self.number(self.ppid,0,2147483647),start=None,argvHash=None,fullFingerprint=None)
        if type(current)is dict:
            client.update(pid=self.number(current.get("pid"),1,2147483647),ppid=self.number(current.get("ppid"),0,2147483647),start=self.text(current.get("start"),128),argvHash=self.text(current.get("argvHash"),64))
            if current.get("identityComplete") is True:client["fullFingerprint"]={key:self.text(current[key],64) for key in ("commHash","executableHash","executableFileHash")}
        resources=self.resources
        unresolved=sum(len(getattr(c,"chain",[]))+len(getattr(c,"leaves",[])) for c in resources)
        value=dict(kind="FAILED_RESOURCE_PROVISIONAL_OWNERSHIP",sink="ROOT_OPERATOR_TOOL_TRACE",status="HOLD",
            errorType=type(error).__name__[:128],qualified=False,NFact=False,credit=False,
            qualificationReached=prequalified,client=client,children=known,
            priorQualifiedUtilityRecordCount=len(utilities)-len(selected),
            unresolvedDescriptorCount=unresolved+len(self.bootstrap_fds),
            descriptorCompletion="UNKNOWN" if unresolved or self.bootstrap_fds else "CLOSED",
            childCompletion="UNKNOWN" if any(not r["waited"] for r in known) else "KNOWN_WAIT_RESULTS_ONLY",
            historicalRepair=False,outerObserverCompletionOwed=True,boundedMetadataOmitted=self.bounded_metadata_omitted)
        if len(json.dumps(value,ensure_ascii=True,separators=(",",":"),allow_nan=False).encode())>8388608:raise ValueError("FAILURE_SINK_BYTES_BOUND")
        self.emit(value)

def require(ok):
 if not ok:raise ValueError("FAILED_BOOTSTRAP_INTEGRITY")
sink=FailureSink(lambda value:print(json.dumps(value,sort_keys=True,separators=(",",":"),allow_nan=False),flush=True),os.getpid(),os.getppid())
status=1;failure=None;fds=[];chain=[]
key=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_uid)
def own(fd):fds.append(fd);sink.bootstrap_fds.append(fd)
try:
 path,expected,mode,authority,*control=sys.argv[1:]
 require(len(control)<=1 and ((mode=="negative")== (not control)))
 fd=os.open("/",os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);own(fd);chain.append((None,"/",fd,key(os.fstat(fd))))
 for name in path.split("/")[1:-1]:
  parent=fd;fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);own(fd);chain.append((parent,name,fd,key(os.fstat(fd))))
 parent=fd;fd=os.open(path.rsplit("/",1)[1],os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent);own(fd);before=os.fstat(fd)
 require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode)==0o600 and before.st_uid==os.getuid() and before.st_nlink==1 and 0<=before.st_size<=1048576)
 raw=b"";left=before.st_size
 while left:
  piece=os.read(fd,min(left,65536));require(type(piece)is bytes and 0<len(piece)<=min(left,65536));raw+=piece;left-=len(piece)
 after=os.fstat(fd);named=os.stat(path.rsplit("/",1)[1],dir_fd=parent,follow_symlinks=False)
 require(key(before)+(before.st_size,before.st_mtime_ns,before.st_ctime_ns)==key(after)+(after.st_size,after.st_mtime_ns,after.st_ctime_ns)==key(named)+(named.st_size,named.st_mtime_ns,named.st_ctime_ns))
 for p,name,handle,want in chain:
  named=os.stat(name,follow_symlinks=False) if p is None else os.stat(name,dir_fd=p,follow_symlinks=False)
  require(key(os.fstat(handle))==want==key(named))
 require(hashlib.sha256(raw).hexdigest()==expected)
 ns={"__name__":"_externally_verified_failed_entry"};exec(compile(raw,path,"exec"),ns)
 status=ns["execute"](mode,authority,control[0] if control else None,failure_sink=sink)
except BaseException as error:
 failure=error;status=1
finally:
 for fd in reversed(fds):
  try:os.close(fd);sink.bootstrap_fds.remove(fd)
  except BaseException as error:failure=error;status=1
 if failure is not None:sink.forward(failure)
sys.exit(status)
' "$GATEWAY_FAILED_ENTRY" "$GATEWAY_FAILED_ENTRY_SHA" "$1" "$GATEWAY_FAILED_ROOT_SHA" "${@:2}" < /dev/null
}
readonly -f gateway80_failed_red_invoke
gateway80_failed_red_exit() {
  [[ "$1" == '1' && "$#" -le 2 ]] || return 1
  if [[ "$#" == 1 ]]; then
    gateway80_failed_red_invoke negative
    return 1
  fi
  [[ "$2" =~ ^[0-9a-f]{64}$ ]] || return 1
  if gateway80_failed_red_invoke gate "$2"; then
    builtin exit 1
  fi
  return 1
}
readonly -f gateway80_failed_red_exit
GATEWAY_FAILED_REVIEWED_SOURCE
