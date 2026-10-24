from pathlib import Path
import os,stat,json,hashlib,math,datetime
R=Path.cwd();O=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-native-six-resource-assessment01';P2=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-native-six-execution01';T=Path('/private/tmp/obs009-bootstrap-observation-20261020-proof01/repo')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
assert not (O/'projection-attempt.json').exists()
assert sha(P2/'manifest.json')=='10ac0d966288a4d0eeb53ee0debad6dfaf39ea3684e70fc8d3e599e153d83220'
for r in json.loads((P2/'manifest.json').read_text())['artifacts']:assert sha(P2/r['path'])==r['sha256']
assert sha(R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-label-architecture/decision.md')=='13e8a1f6cb41430d903b388aa33f3fc3913200b4080cc00ef41b31e1bea71c02'
custody=json.loads((P2/'fresh-generated-opaque-hash-inventory.json').read_text());inventory=T/'bootstrap-six-raw/fresh-generated-full-hash-inventory.json';assert inventory.is_file() and not inventory.is_symlink() and sha(inventory)==custody['privateFullInventorySha256'];rows=json.loads(inventory.read_text());assert len(rows)==24 and [{k:r[k] for k in ['ordinal','sha256','bytes','extension']} for r in rows]==custody['files'];matches=[(i,r) for i,r in enumerate(rows) if r['path'].endswith('/runner-owner-preclear.json') and '/process-tree-committed-before-ready-orderly-' in r['path']]
if len(matches)!=1:
 wj('preclear-closed-projection.json',{'status':'UNBOUND_UNIQUE_FAILED_PRECLEAR_UNAVAILABLE','bodyReads':0,'matchingLeaves':len(matches),'otherMixedBodyRead':False});raise SystemExit(0)
index,row=matches[0];p=T/row['path'];assert p.resolve(strict=True).is_relative_to(T.resolve(strict=True));assert row['ordinal']==index
for parent in [p.parent,*p.parents]:
 if parent==T.parent:break
 assert stat.S_ISDIR(parent.lstat().st_mode) and not stat.S_ISLNK(parent.lstat().st_mode)
pre=p.lstat();assert stat.S_ISREG(pre.st_mode) and not stat.S_ISLNK(pre.st_mode) and pre.st_nlink==1 and pre.st_size==row['bytes'] and pre.st_size<=16384
wj('projection-attempt.json',{'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'attempt':1,'maximumBodyReads':1,'custodyManifestSha256':sha(P2/'manifest.json'),'freshInventorySha256':custody['privateFullInventorySha256'],'freshInventoryOrdinal':index,'leafSha256':row['sha256'],'leafBytes':row['bytes'],'uniqueSourceAllocatedFailedOrderlyPreclear':True,'sourceAllocation':'observed-bootstrap-process-tree.test.ts26-28 + nativeBlankVideo.ts12-16; source-owned mkdtemp and exclusive wx nativeJson','allowedProjection':['phase','quiescenceFacts.ok','quiescenceFacts.budget','quiescenceFacts.elapsedMs','nativeFacts.files.length','archivedVideos.length']})
result={'status':'UNKNOWN','projectionAttempt':1,'bodyReads':0,'rawBodyOrOtherFieldsExported':False}
try:
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  opened=os.fstat(fd);assert (opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns)==(pre.st_dev,pre.st_ino,pre.st_size,pre.st_mtime_ns,pre.st_ctime_ns)
  data=os.read(fd,16385);result['bodyReads']=1;post=os.fstat(fd);leaf=p.lstat();assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'];assert (opened.st_dev,opened.st_ino,opened.st_size,opened.st_mtime_ns,opened.st_ctime_ns)==(post.st_dev,post.st_ino,post.st_size,post.st_mtime_ns,post.st_ctime_ns)==(leaf.st_dev,leaf.st_ino,leaf.st_size,leaf.st_mtime_ns,leaf.st_ctime_ns)
 finally:os.close(fd)
 def pairs(entries):
  out={}
  for k,v in entries:
   if k in out:raise ValueError('DUPLICATE_KEY')
   out[k]=v
  return out
 def reject_constant(_):raise ValueError('NONFINITE_CONSTANT')
 value=json.loads(data.decode('utf-8'),object_pairs_hook=pairs,parse_constant=reject_constant);assert isinstance(value,dict) and set(value)=={'phase','quiescenceFacts','nativeFacts','archivedVideos'};assert value['phase']=='committed-before-ready-orderly'
 q=value['quiescenceFacts'];assert isinstance(q,dict) and set(q)=={'ok','budget','elapsedMs'} and type(q['ok']) is bool
 for k in ['budget','elapsedMs']:assert type(q[k]) in [int,float] and math.isfinite(q[k]) and q[k]>=0
 n=value['nativeFacts'];assert isinstance(n,dict) and isinstance(n.get('files'),list);assert isinstance(value['archivedVideos'],list)
 result.update(status='CLOSED_PROJECTION_AVAILABLE',phase=value['phase'],quiescence={'ok':q['ok'],'budget':q['budget'],'elapsedMs':q['elapsedMs']},nativeFactsFileCount=len(n['files']),archivedVideoCount=len(value['archivedVideos']),regularLeafNoFollow=True,boundedStableRead=True,exactFreshHash=True,historicalFullDescendantInventory='UNAVAILABLE_UNMEASURED',quiescenceNotAllDescendantsGone=True)
except Exception as e:
 result.update(status='UNKNOWN_PROJECTION_UNAVAILABLE',closedErrorType=type(e).__name__,errno=getattr(e,'errno',None))
wj('preclear-closed-projection.json',result);print(json.dumps(result))
