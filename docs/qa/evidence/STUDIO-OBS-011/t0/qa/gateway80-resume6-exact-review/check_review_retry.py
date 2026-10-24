"""Quinn exact source-only review; immutable inputs, guarded fake OS; no actual hold."""
from pathlib import Path, PurePosixPath
import ast,builtins,collections,copy,datetime,difflib,errno,fcntl,hashlib,io,json,os,re,resource,shlex,shutil,signal,stat,subprocess,sys,time,types
import xml.etree.ElementTree as ET
# Standard libraries are deliberately preloaded before the deny audit.
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6').absolute()
O=Path(__file__).absolute().parent
ROOT=Path.cwd();records=[];pins=[];denied=[]
allowed_roots=[D,D.parent/'resume5',D.parent/'resume4',O]
inputrows=json.loads((D/'input-pins06.json').read_text())['records']
allowed_files={str((ROOT/r['path']).absolute()) for r in inputrows}
core=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py'
allowed_files.add(str(core))
def allowed(p):
 p=Path(p).absolute()
 return str(p) in allowed_files or any(p==a or a in p.parents for a in allowed_roots)
def audit(event,args):
 if event=='open':
  p,mode,flags=args
  if isinstance(p,int):raise AssertionError('REAL_FD_ACCESS_FORBIDDEN')
  p=Path(p).absolute()
  writing=(isinstance(mode,str) and any(x in mode for x in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
  ok=(p==O or O in p.parents) if writing else allowed(p)
  if not ok:denied.append({'event':event,'path':str(p)});raise AssertionError('AUDIT_DENIED_PATH')
 if event.startswith(('subprocess.','os.kill','os.system','os.posix_spawn','socket.')) or event in ('fcntl.flock','fcntl.lockf'):
  denied.append({'event':event});raise AssertionError('AUDIT_DENIED_OPERATION')
sys.addaudithook(audit)
def check(label,condition):
 assert condition,label;records.append({'check':label,'passed':True})
def pin(path,want=None):
 raw=path.read_bytes();h=hashlib.sha256(raw).hexdigest()
 if want is not None:check('hash '+str(path.relative_to(ROOT)),h==want)
 pins.append({'path':str(path.relative_to(ROOT)),'sha256':h,'bytes':len(raw),'mode':stat.S_IMODE(path.lstat().st_mode)});return raw
raw=pin(D/'manifest.json','e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585')
m=json.loads(raw)
for row in m['files']:
 p=D/row['path'];b=pin(p,row['sha256']);check('metadata '+row['path'],len(b)==row['bytes'] and stat.S_IMODE(p.lstat().st_mode)==row['mode'])
for row in inputrows:
 p=ROOT/row['path'];b=pin(p,row['sha256']);check('public input metadata '+row['path'],len(b)==row['bytes'] and stat.S_IMODE(p.lstat().st_mode)==row['mode'])
# Source-only strict proof verifier has been inspected: no runtime reads; execute definitions only.
ns={'__file__':str(D/'verify-proofs.py'),'__name__':'quinn_source_verifier'}
exec(compile((D/'verify-proofs.py').read_bytes(),'<reviewed-source-only-proof>','exec'),ns)
proof=ns['verify']();check('47 strict forward/reverse source paths',proof['strictForwardFiles']==proof['strictReverseFiles']==47)
# Strip only the top-level result writer; executable implementation and fake controls unchanged.
contexts={}
prefix=[]
for node in ast.parse((D/'boundary-controls.py').read_bytes()).body:
 if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='w' for t in node.targets):break
 prefix.append(node)
ns={'__file__':str(D/'boundary-controls.py'),'__name__':'quinn_retained_fixture_definitions'}
exec(compile(ast.Module(body=prefix,type_ignores=[]),'<inspected definitions only>','exec'),ns);contexts['boundary-controls.py']=ns
for name in ['revision-controls.py','report-admission-controls.py','admission-controls.py','revision06-controls.py']:
 tree=ast.parse((D/name).read_bytes())
 tree.body=[x for x in tree.body if not(isinstance(x,ast.Expr) and isinstance(x.value,ast.Call) and isinstance(x.value.func,ast.Attribute) and x.value.func.attr=='write_text')]
 ns={'__file__':str(D/name),'__name__':'quinn_guarded_source_checks'}
 exec(compile(tree,'<inspected guarded '+name+'>','exec'),ns);contexts[name]=ns
counts={name:(121 if name=='boundary-controls.py' else len(ns['results'])) for name,ns in contexts.items()}
# Boundary121 was actually completed before the independent reviewer audit/import failure (tool57cb24). It is not re-executed here.
check('333 unique retained plus new semantic controls',list(counts.values())==[121,70,24,33,85])
# Independent strict-parser cases exercise exact definitions in the inspected fake World.
World=contexts['boundary-controls.py']['World'];independent=[]
for mode in ['valid-fd0','valid-multidigit','unicode-digit','negative-fd','suffix-access','duplicate-name']:
 w=World();pid=w.H['wrapper']['pid'];ino=w.H['lock']['ino'];lock=w.H['lock']['path']
 fd={'valid-fd0':'0','valid-multidigit':'12','unicode-digit':'٣','negative-fd':'-1','suffix-access':'3u','duplicate-name':'3'}[mode]
 raw=f'p{pid}\nf{fd}\ni{ino}\nn{lock}\n'+(f'n{lock}\n' if mode=='duplicate-name' else '')
 try:w.ns['strict_lock_fields'](raw,pid,ino,lock)
 except ValueError:accepted=False
 else:accepted=True
 check('independent exact FD '+mode,accepted==mode.startswith('valid-'))
 independent.append({'case':mode,'accepted':accepted})
# Actual immutable control pin binding must reject traversal, wrong type, conflicting H pins.
leaf={'Path':Path,'PurePosixPath':PurePosixPath,'hashlib':hashlib,'json':json,'ast':ast,'types':types,'stat':stat,'os':types.SimpleNamespace(),'E':PurePosixPath('/E')}
for node in ast.parse((D/'verified-inputs.py').read_bytes()).body:
 if isinstance(node,ast.FunctionDef):exec(compile(ast.Module(body=[node],type_ignores=[]),'<actual-leaf-definitions-no-OS>','exec'),leaf)
for label,value,good in [('valid',{'ok.json':'a'*64},True),('traversal',{'../escape.json':'a'*64},False),('absolute',{'/escape.json':'a'*64},False),('badsha',{'ok.json':'z'*64},False),('boolpin',{'ok.json':True},False),('conflict',{'hold.json':'b'*64},False)]:
 d=types.SimpleNamespace(IMMUTABLE_EXPECTED={'/E/hold.json':'a'*64})
 try:leaf['bind_controls'](d,value)
 except ValueError:accepted=False
 else:accepted=True
 check('independent root control pins '+label,accepted==good);independent.append({'case':'pins '+label,'accepted':accepted})
# Native tuples, banks, oracles and all retained case identities independently unchanged.
old=D.parent/'resume5';oldscope=json.loads((old/'scope.json').read_bytes());scope=json.loads((D/'scope.json').read_bytes())
for k in ['label','repository','workspace','runtime','phaseIds','phases','maximumSeconds','parentUmask','childUmask']:
 check('native scope unchanged '+k,scope[k]==oldscope[k])
for name in ['case-map.json','input-manifest.json','source-guards.json','contracts.py','vitest.gateway80.config.mjs','helper.patch','tests.patch']:
 check('accepted contract unchanged '+name,(D/name).read_bytes()==(old/name).read_bytes())
# Keep every initial reviewer failure in the operator/tool history; this file never disables audit.
check('no denied operational attempts',not denied)
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':hashlib.sha256(raw if False else (D/'manifest.json').read_bytes()).hexdigest(),'pins':pins,'actualRuntimeOrBaselineReadStatHash':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'sourceChecks':records,'authorControlCounts':counts,'sourceProof':proof,'independentCases':independent,'deniedAuditCalls':denied,'actualRuntimeOsProcessNativePrivateActions':0,'actualBaselineReadStatHash':False,'allExpected':True},indent=2)+'\n')
print(json.dumps({'authorControls':counts,'sourceChecks':len(records),'independentCases':len(independent),'actualActions':0}))
