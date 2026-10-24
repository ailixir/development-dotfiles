"""Author-only finite metadata generation. Never imports or executes target sources."""
from pathlib import Path
import json,hashlib,stat,ast
OUT=Path(__file__).parent

def digest(raw):return hashlib.sha256(raw).hexdigest()
def write(name,value):
    (OUT/name).write_text(json.dumps(value,indent=2,sort_keys=True)+'\n')
def shellquote(text):return "'"+text.replace("'","'\"'\"'")+"'"
entry=(OUT/'entry.py').read_text()
caller=(OUT/'root-caller.template.bash').read_text().replace('# @LITERAL_VERIFIED_ENTRY_ASSIGNMENT@','readonly C8_S0_ENTRY='+shellquote(entry))
(OUT/'root-caller.bash').write_text(caller)
raw=caller.encode();cap=len(raw)+1
# The source file is read once up to exact known bytes+1 before the hash helper or
# interpretation. The same fresh readonly buffer is hashed and evaluated.
load='''# INACTIVE exact finite first shell read; explicit later owner/root authority required.
# Args: declared BIN, actual manifest SHA, actual release SHA, shell PID, wrapper PID, unit.
if [[ $# != 6 || ${C8_S0_READ_BUFFER+x} || ${C8_S0_READ_SEEN+x} ]]; then return 1; fi
readonly C8_S0_READ_SEEN=1
C8_S0_READ_BUFFER=''
# An EOF return of 1 is expected because the cap is one byte beyond the exact file.
if LC_ALL=C builtin read -r -N CAP C8_S0_READ_BUFFER < SOURCE; then return 1; else
  C8_S0_READ_STATUS=$?
fi
readonly C8_S0_READ_BUFFER
if [[ $C8_S0_READ_STATUS != 1 || ${#C8_S0_READ_BUFFER} != BYTES ]]; then return 1; fi
if "$1" -I -B -c 'import hashlib,sys;sys.exit(0 if hashlib.sha256(sys.argv[1].encode("utf-8","strict")).hexdigest()==sys.argv[2] else 1)' "$C8_S0_READ_BUFFER" SHA < /dev/null; then
  builtin eval "$C8_S0_READ_BUFFER"
else return 1
fi
'''
# ASCII is required for Bash byte count to match the UTF8 hash helper buffer.
raw.decode('ascii')
load=load.replace('CAP',str(cap)).replace('SOURCE',shellquote(str((OUT/'root-caller.bash').absolute()))).replace('BYTES',str(len(raw))).replace(' SHA ', ' '+shellquote(digest(raw))+' ')
(OUT/'first-read.template.bash').write_text(load)
write('caller-literal-map.json',dict(entrySha256=digest(entry.encode()),callerSha256=digest(raw),callerBytes=len(raw),firstReadCap=cap,
    initialRead='builtin read exact bytes+1, new readonly buffer, exact EOF1 and byte count',interpretation='same buffer foreground SHA then builtin eval; no reopened entry or local imports',
    firstReadTarget='root-caller.bash',manifestAndRelease='external readonly root arguments; no self/future cycles',
    inheritedStdout='exclusive0600 empty named actual FD1 supplied/retained by exact later enclosing root wrapper; binding checked by entry before target work; root wrapper actual receipt still owed'))
# Preserve attempt1 script by exact inverse of the only harness edits. This is
# reconstructed, not a contemporaneously frozen source/hash capture.
s=(OUT/'fake_check.py').read_text().replace('fake-results-attempt2.json','fake-results-attempt1.json').replace('(P.Hold,M.Hold,ValueError,RuntimeError,K.Hold,OSError)','(P.Hold,M.Hold,ValueError,RuntimeError,K.Hold)')
s=s.replace("sourceHashes={name:sha(raw) for name,raw in SOURCES.items()},",'')
(OUT/'fake-check-attempt1.reconstructed.py.txt').write_text(s)
write('attempt-history.json',dict(attempts=[dict(number=1,command='python3 -B '+str(OUT/'fake_check.py'),actualExit=1,toolChunk='f96a77',executed=24,passed=23,failed=1,
    stdout='fake-attempt1.stdout',stderr='fake-attempt1.stderr',result='fake-results-attempt1.json',
    scriptSnapshot='fake-check-attempt1.reconstructed.py.txt',snapshotKind='RECONSTRUCTED_AFTER_RUN_FROM_EXACT_HARNESS_DELTA',
    contemporaneousSourceHashesCaptured=False,hashEqualityToOriginalRun='UNPROVED_NOT_CLAIMED',failure='test helper did not catch expected OSError from fake unknown closer')],
    sourceCorrectionsAfterAttempt1=['relay selector/socket/accept attempt-before-call ownership and unreturned UNKNOWN retention',
        'release validator independently enforces exact later review/owner paths already present in factory',
        'storage read/create saves first exception before fallible cleanup and retains separate cleanup errors'],
    harnessCorrection='include OSError in expected-hold helper; final run records actual source hashes; same24 no added cases',actualQualification=0))
# Finite static source checks execute no target definitions.
static=[]
for path in sorted(OUT.glob('*.py')):
    raw=path.read_bytes();tree=ast.parse(raw.decode(),filename=path.name)
    static.append(dict(path=path.name,sha256=digest(raw),bytes=len(raw),definitions=sum(isinstance(x,(ast.FunctionDef,ast.ClassDef)) for x in ast.walk(tree)),
        runtimeAssertCount=sum(isinstance(x,ast.Assert) for x in ast.walk(tree))))
write('static-source-checks.json',dict(kind='AUTHOR_AST_ONLY_NO_TARGET_IMPORT',files=static,allPythonParsed=True,
    runtimeCriticalChecks='explicit if/raise; no runtime asserts',actualTargetDefinitionsExecuted=False))
