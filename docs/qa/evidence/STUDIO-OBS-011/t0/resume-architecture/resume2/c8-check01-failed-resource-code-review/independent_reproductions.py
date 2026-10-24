"""Actual source boundaries with synthetic data/Path/OS. Never adapter imports or I/O."""
from pathlib import Path,PurePosixPath
from types import SimpleNamespace
import ast,copy,hashlib,json,stat,sys
R=next(p for p in Path(__file__).resolve().parents if (p/'AGENTS.md').is_file())
P=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume1'
source=(P/'failed_resource.py').read_text();tree=ast.parse(source)
def fn(name):return next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
def compile_nodes(nodes,scope):exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-source-synthetic-boundary>','exec'),scope)
class Hold(Exception):pass
def need(v,r):
 if not v:raise Hold(r)
def digest(v):return hashlib.sha256(v).hexdigest()
results=[]
# 01: exact package-set code, with original release manifest names as ordinary metadata.
release=json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-t0-c8-check01/root-actual-unit-release.json').read_text())
load=fn('load_authority');group=next(n for n in load.body if isinstance(n,ast.For) and isinstance(n.target,ast.Name) and n.target.id=='group')
actual=next(n for n in group.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='actual' for t in n.targets));guard=next(n for n in group.body if isinstance(n,ast.Expr) and 'ORIGINAL_PACKAGE_SET_CHANGED' in ast.get_source_segment(source,n))
class PackagePath(PurePosixPath):
 def iterdir(self):return [self/n.split('/',1)[1] for n in release['executionPackagePins' if self.name=='execution' else 'controlPackagePins']]
for role in ('execution','control'):
 scope={'UNIT':PackagePath('/fake/unit'),'directory':role,'group':role+'PackagePins','old':release,'need':need}
 try:compile_nodes([actual,guard],scope)
 except Hold as e:outcome=str(e)
 else:outcome='ALLOW'
 results.append({'finding':'C8-FR-01','component':role,'observedOutcome':outcome,'actualSelected':sorted(scope['actual']),'expectedPinned':sorted(release[role+'PackagePins'])})
assert results[0]['observedOutcome']=='ALLOW' and results[1]['observedOutcome']=='ORIGINAL_PACKAGE_SET_CHANGED'
# 02: load_authority performs HERE lstat/iterdir before safe_bytes rejects linked UNIT ancestor.
trace=[]
class FakePath(PurePosixPath):
 def resolve(self):return self
 def lstat(self):
  trace.append(('lstat',str(self)))
  return SimpleNamespace(st_mode=(stat.S_IFLNK|0o777 if str(self)=='/repo/unit' else stat.S_IFDIR|0o700))
 def is_symlink(self):return False
 def iterdir(self):trace.append(('enumerate',str(self)));return [self/'predicates.py']
ROOT=FakePath('/repo');UNIT=ROOT/'unit';HERE=UNIT/'failed-resource-disposition01'
reader={'Path':FakePath,'ROOT':ROOT,'sys':SimpleNamespace(executable='/python'),'stat':stat,'need':need,'os':SimpleNamespace()};compile_nodes([fn('safe_bytes')],reader)
# The prefix is the actual installation check, allowed-set and member iteration, no later reads.
scope={'HERE':HERE,'UNIT':UNIT,'stat':stat,'need':need,'safe_bytes':reader['safe_bytes']}
try:compile_nodes(load.body[:3],scope)
except Hold as e:reason=str(e)
else:raise AssertionError('unsafe prefix did not reject')
assert reason=='LINK_BEFORE_BODY' and any(x[0]=='enumerate' for x in trace)
results.append({'finding':'C8-FR-02','boundary':'load_authority prefix plus actual safe_bytes','outcome':reason,'unsafeEnumerationBeforeHold':True,'trace':trace})
# Actual writer independently has only leaf HERE checks; fake parent alias is followed into open/write.
trace=[]
class WritePath(PurePosixPath):
 def lstat(self):trace.append(('leaf-lstat',str(self)));return SimpleNamespace(st_mode=stat.S_IFDIR|0o700)
 def is_symlink(self):return False
 def exists(self):return False
class Sink:
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def write(self,b):trace.append(('body-write',len(b)))
 def flush(self):pass
 def fileno(self):return 7
class FakeOs:
 O_WRONLY=1;O_CREAT=2;O_EXCL=4;O_NOFOLLOW=8
 def open(self,path,*args):trace.append(('open-through-parent-alias',str(path)));return 7
 def fdopen(self,*args):return Sink()
 def fsync(self,*args):pass
scope={'HERE':WritePath('/repo/unit/failed-resource-disposition01'),'UNIT':WritePath('/repo/unit'),'canonical':lambda x:x=='new.json','need':need,'os':FakeOs(),'json':json}
compile_nodes([fn('write_new')],scope);scope['write_new']('new.json',{'synthetic':True})
assert any(x[0]=='body-write' for x in trace)
results.append({'finding':'C8-FR-02','boundary':'actual write_new','outcome':'WRITE_NOT_PARENT_CONFINED','trace':trace,'actualOSCalls':0})
# 03: complete observed client fingerprint is not compared to configured executable fingerprint.
def run_client(file_hash):
 who={'pid':42,'ppid':1,'start':'start','identityComplete':True,'argvHash':'a'*64,'commHash':'c'*64,'executableHash':digest(b'/configured/Python'),'executableFileHash':file_hash};writes=[]
 scope={'helpers':lambda b:({'table':lambda:{42:{'pid':42,'start':'start'}},'identity':lambda row:who},None),'os':SimpleNamespace(getpid=lambda:42),'need':need,'digest':digest,'write_new':lambda n,v:writes.append((n,v))}
 compile_nodes([fn('register_client')],scope);b={'sha':'f'*64,'a':{'pythonExecutable':'/configured/Python','pythonExecutableSha256':'e'*64}}
 scope['register_client'](b,'gate');return {'accepted':True,'configuredExecutableFileHash':b['a']['pythonExecutableSha256'],'observedExecutableFileHash':file_hash,'journalWritten':len(writes)==1}
for value in ('e'*64,'0'*64):results.append({'finding':'C8-FR-03',**run_client(value)})
assert results[-1]['accepted'] and results[-1]['observedExecutableFileHash']!=results[-1]['configuredExecutableFileHash']
# 04: actual pure predicates accept Boolean false as successful exit0, true as requested expected1/status1.
pred={'__name__':'actual_pure_predicates'};exec(compile((P/'predicates.py').read_text(),'<actual-pure-predicates>','exec'),pred)
r={'protocol':pred['PROTOCOL'],'kind':'QUALIFIED_FAILED_RESOURCE_READINESS','verificationExit':False,'releaseSha256':'a'*64,'retainedContractSha256':'b'*64,'expectedWrapperExit':True,'historicalGapCodes':pred['GAPS'],'C8Credit':False,'verifiedAtEpoch':100}
pred['readiness'](r,'a'*64,'b'*64,101)
ad={'kind':'ROOT_NEW_GUARD_ADMISSION','authorizedBy':'root','releaseSha256':'a'*64,'activeLockSha256':'c'*64,'negativeActualStatus':True,'separateStatusCaptured':True,'sameOriginalHolderAfterDenial':True,'readinessAbsentAtDenial':True,'permitAbsentAtDenial':True,'originalExitAndBindingsUnchanged':True,'newReadonlyFunctionInspected':True}
pred['admission'](ad,'a'*64,'c'*64)
results.append({'finding':'C8-FR-04','outcome':'MALFORMED_BOOLEAN_STATUS_FIELDS_ACCEPTED','readinessVerificationExit':False,'readinessExpectedWrapperExit':True,'negativeActualStatus':True})
# 04b: execute actual final branch with malformed negative record bytes and a matching root hash.
main_fn=fn('main');choice=next(n for n in main_fn.body if isinstance(n,ast.If) and isinstance(n.test,ast.Compare) and ast.unparse(n.test)=="mode == 'gate'")
final_branch=choice.orelse[0];assert ast.unparse(final_branch.test)=="mode == 'final'"
release_sha='a'*64;bad=b'{}';fake_ad=dict(ad,negativeActualStatus=1,negativeDenialSha256=digest(bad))
writes=[]
ns={**pred,'optional':lambda name:fake_ad if name=='root-admission.json' else None,
 'safe_bytes':lambda *args:bad,'HERE':Path('/synthetic/failed-resource-disposition01'),
 'b':{'sha':release_sha,'a':{'retainedContractSha256':'b'*64},'loaded':{}},
 'release_sha':release_sha,'PIN':'c'*64,'observe':lambda b:{'syntheticCurrent':True},
 'write_new':lambda name,value:writes.append((name,value)), 'time':SimpleNamespace(time=lambda:102.)}
compile_nodes(final_branch.body,ns)
assert len(writes)==1 and writes[0][0]=='readiness.json'
results.append({'finding':'C8-FR-04','boundary':'actual final branch with actual admission predicate','outcome':'MALFORMED_NEGATIVE_RECORD_STILL_WRITES_READINESS','negativeRecordBytes':'{}','rootHashMatchesThoseMalformedBytes':True,'actualOSOrRuntimeWrites':0})
print(json.dumps({'status':'SOURCE_COUNTEREXAMPLES_REPRODUCED','results':results,'actualAdapterImportsOrMainsOrOSOrRuntimeWrites':0},indent=2))
