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
def require(ok):
 if not ok:raise ValueError("FAILED_BOOTSTRAP_INTEGRITY")
path,expected,mode,authority,*control=sys.argv[1:]
require(len(control)<=1 and ((mode=="negative")== (not control)))
fds=[];chain=[]
key=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_uid)
try:
 fd=os.open("/",os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);fds.append(fd);chain.append((None,"/",fd,key(os.fstat(fd))))
 for name in path.split("/")[1:-1]:
  parent=fd;fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);fds.append(fd);chain.append((parent,name,fd,key(os.fstat(fd))))
 parent=fd;fd=os.open(path.rsplit("/",1)[1],os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent);fds.append(fd);before=os.fstat(fd)
 require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode)==0o600 and before.st_uid==os.getuid() and before.st_size<=1048576)
 raw=b"";left=before.st_size
 while left:
  piece=os.read(fd,min(left,65536));require(bool(piece));raw+=piece;left-=len(piece)
 after=os.fstat(fd);named=os.stat(path.rsplit("/",1)[1],dir_fd=parent,follow_symlinks=False)
 require(key(before)+(before.st_size,before.st_mtime_ns)==key(after)+(after.st_size,after.st_mtime_ns) and key(after)==key(named))
 for p,name,handle,want in chain:
  named=os.stat(name,follow_symlinks=False) if p is None else os.stat(name,dir_fd=p,follow_symlinks=False)
  require(key(os.fstat(handle))==want==key(named))
 require(hashlib.sha256(raw).hexdigest()==expected)
 ns={"__name__":"_externally_verified_failed_entry"};exec(compile(raw,path,"exec"),ns)
 status=ns["execute"](mode,authority,control[0] if control else None)
except BaseException as error:
 print(json.dumps({"status":"HOLD","errorType":type(error).__name__,"credit":False}));status=1
finally:
 for fd in reversed(fds):os.close(fd)
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
