from pathlib import Path
import sys,json,hashlib,os,stat,datetime
R=Path.cwd().resolve();O=Path(__file__).resolve().parent
# Source-only prepared utility: execution requires root's separate exclusive quiet-window GO.
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert len(sys.argv)==3 and sys.argv[1] in ['code','documentation']
scope=sys.argv[1];out=Path(sys.argv[2]).absolute();runtime=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/rt-bootstrap-actual-application01'
assert out.parent.resolve()==runtime.resolve() and out.name==scope+'-application.json' and not os.path.lexists(out)
bindingPath=O/'application-binding.json';assert sha(bindingPath)=='c6b4a5502eb7b5b2835bae97bab11459d89b5e79edca1cf5431b7973f643bea8'
binding=json.loads(bindingPath.read_text());rows=binding[scope];assert len(rows)==(10 if scope=='code' else 2)
protected=json.loads((O/'protected-and-tool-source-pins.json').read_text());codeBinding=json.loads((O/'ten-code-path-binding.json').read_text())
def untouched():
 for row in protected['protected']:
  p=R/row['path'];assert stat.S_ISREG(p.lstat().st_mode) and sha(p)==row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
 actual=[]
 for p in sorted((R/'studio-runner/node_modules/.bin').iterdir()):
  st=p.lstat();assert stat.S_ISLNK(st.st_mode);actual.append({'path':str(p.relative_to(R)),'target':os.readlink(p),'mode':oct(stat.S_IMODE(st.st_mode)),'device':st.st_dev,'inode':st.st_ino})
 assert actual==protected['actualMeasuredBinSymlinks']
 for row in codeBinding['actualBeforeDist']['files']:assert sha(R/'studio-runner/dist'/row['path'])==row['sha256']
untouched()
if scope=='documentation':
 for row in binding['code']:assert sha(R/row['path'])==row['afterSha256']
initial={}
for row in rows:
 p=R/row['path'];assert p.parent.is_dir() and p.parent.resolve()==p.parent and os.path.lexists(p)==row['beforeExists']
 if row['beforeExists']:
  st=p.lstat();assert stat.S_ISREG(st.st_mode) and not stat.S_ISLNK(st.st_mode) and sha(p)==row['beforeSha256'] and oct(stat.S_IMODE(st.st_mode))==row['beforeStat']['mode'];initial[row['path']]=st
 src=O/row['stagedAfter'];assert src.resolve().is_relative_to(O) and stat.S_ISREG(src.lstat().st_mode) and sha(src)==row['afterSha256']
record={'scope':scope,'startedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bindingSha256':sha(bindingPath),'allPreimagesValidatedBeforeAnyWrite':True,'wrote':[],'actualConfiguredBuildExecuted':False,'privateDistCopied':False}
out.parent.mkdir(parents=True,exist_ok=True)
try:
 for row in rows:
  p=R/row['path'];src=O/row['stagedAfter'];record['attemptingPath']=row['path'];mode=int(row['afterMode'],8)
  flags=os.O_WRONLY|os.O_NOFOLLOW
  if not row['beforeExists']:flags|=os.O_CREAT|os.O_EXCL
  fd=os.open(p,flags,mode)
  with os.fdopen(fd,'wb') as stream:
   opened=os.fstat(stream.fileno())
   if row['beforeExists']:
    pre=initial[row['path']];assert (opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns)==(pre.st_dev,pre.st_ino,pre.st_size,pre.st_mtime_ns)
   assert stat.S_ISREG(opened.st_mode);os.ftruncate(stream.fileno(),0);stream.write(src.read_bytes());stream.flush();os.fchmod(stream.fileno(),mode)
  assert sha(p)==row['afterSha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['afterMode'];record['wrote'].append({'path':row['path'],'afterSha256':sha(p),'mode':row['afterMode']})
 for row in rows:assert sha(R/row['path'])==row['afterSha256']
 untouched();record['status']='APPLIED_ALL_EXACT_AFTER_HASHES_VERIFIED';record['protectedBinDependenciesDistUnchanged']=True
except BaseException as error:
 record['status']='STOP_PARTIAL_OR_UNEXPECTED_NO_BUILD';record['errorType']=type(error).__name__;record['errno']=getattr(error,'errno',None);raise
finally:
 record['endedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();out.write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'scope':scope,'exactPathsApplied':len(rows),'protectedInputsAndD698Unchanged':True,'buildExecuted':False}))
