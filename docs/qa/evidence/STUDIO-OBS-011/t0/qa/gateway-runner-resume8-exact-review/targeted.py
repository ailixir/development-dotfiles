"""Bounded actual inventory acquisition pair. All effects use inspected same-namespace fakes.
Only author harness definition prefix is evaluated; required159 are not replayed.
Budget constants are reduced to10 bytes, retaining all actual checks/implementation.
"""
import ast,builtins,collections,copy,datetime,errno,fcntl,hashlib,json,os,pathlib,re,stat,subprocess,sys,time,types
S=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume8')
raw=(S/'controls.py').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='4a4337827bf275acb2ac47ff4307e17172e7b6030caaec8dd7d63e1dd492e72f'
# Definition prefix only, same standard imports/source checks/persistent audit intact.
tree=ast.parse(raw); cut=next(n.lineno for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='whole' for t in n.targets))
prefix='\n'.join(raw.decode().splitlines()[:cut-1])+'\n'
sys.argv=['targeted.py','fa0e8d03cc75f5c855034dd4fe21f09e3bb924c230198a39f47eabb50ef65b97','a1b078b9d8832c78b18ef55c23adea6cab079aa79f9a530a79906a30fc44d26a']
ns={'__file__':str(S/'controls.py'),'__name__':'_qa_definitions_only'}
exec(compile(prefix,'<inspected-author-definitions-with-unchanged-audit>','exec'),ns)
results=[]
for grow in (False,True):
 m=ns['Model']();ctx=m.context('capture');m.directory('/model/inventory')
 for name in ('a','b'):m.file('/model/inventory/'+name,b'x' if grow else b'1234',0o644)
 realBudget=m.ns['Budget'];m.ns['Budget']=lambda **kwargs:realBudget(entries=8,total=10,per_file=10)
 consumed=[];orig_open=m.os.open;orig_read=m.os.read
 def opened(path,flags,mode=0o600,dir_fd=None):
  p=m.path(path,dir_fd)
  if grow and p in ('/model/inventory/a','/model/inventory/b'):
   m.nodes[p]['data']=b'12345678';m.nodes[p]['mtime']+=1
  return orig_open(path,flags,mode,dir_fd)
 def read(fd,count):
  b=orig_read(fd,count)
  if m.live(fd)['path'].startswith('/model/inventory/'):consumed.append(len(b))
  return b
 m.os.open=opened;m.os.read=read
 try:
  rows=m.ns['inventory'](ctx,m.P('/model/inventory'));denial=None
 except ValueError as e:denial=str(e);rows=None
 finally:ctx.owner.finish()
 acquired=sum(consumed)
 if grow:assert acquired==16 and denial=='ACTUAL_AGGREGATE_CAP'
 else:assert acquired==8 and denial is None and sum(r['bytes'] for r in rows)==8
 results.append({'case':'growth-before-open' if grow else 'stable-positive','totalCap':10,'perFileCap':10,'acquiredBytesBeforeReturnOrDenial':acquired,'denial':denial,'accepted':rows is not None,'actualTargetOrOsActions':0})
assert ns['denied']==[]
print(json.dumps({'kind':'INDEPENDENT_ACTUAL_INVENTORY_ACQUISITION_PAIR','results':results,'realBoundaryAttempts':ns['denied'],'actualActions':0,'subjectSafetyStatementsRemoved':False,'harnessAdaptation':'Definition prefix only; no required-control rerun. Budget constants10 only, actual inventory/read/budget logic unchanged.'},indent=2))
