from pathlib import Path
import json,hashlib,re
root=Path(__file__).parent;rel=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
a=(root/'before'/rel).read_text();b=(root/'candidate'/rel).read_text();sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
# Source lexical boundaries only; never compile/load/run any fixture.
def tokens(s):
 out=[];i=0
 while i<len(s):
  if s[i].isspace():i+=1;continue
  if s.startswith('//',i):
   k=s.find('\n',i);i=len(s) if k<0 else k+1;continue
  if s.startswith('/*',i):
   k=s.find('*/',i+2);assert k>=0;i=k+2;continue
  start=i
  if s.startswith('"""',i):
   i+=3
   while i<len(s):
    if s[i]=='\\':i+=2;continue
    if s.startswith('"""',i):i+=3;break
    i+=1
   out.append(('textblock',s[start:i],start,i));continue
  if s[i] in ['"',"'"]:
   quote=s[i];i+=1
   while i<len(s):
    if s[i]=='\\':i+=2;continue
    if s[i]==quote:i+=1;break
    i+=1
   out.append(('literal',s[start:i],start,i));continue
  if s[i].isalnum() or s[i] in '_$':
   i+=1
   while i<len(s) and (s[i].isalnum() or s[i] in '_$'):i+=1
  else:i+=1
  out.append(('token',s[start:i],start,i))
 return out
def test_bodies(s):
 ts=tokens(s);found={}
 for i,t in enumerate(ts):
  if t[1]!='@' or ts[i+1][1]!='Test':continue
  j=i+2
  while ts[j][1]!='void':j+=1
  name=ts[j+1][1]
  while ts[j][1]!='{':j+=1
  first=ts[j][2];depth=1;k=j+1
  while depth:
   if ts[k][0]=='token':
    if ts[k][1]=='{':depth+=1
    if ts[k][1]=='}':depth-=1
   k+=1
  assert name not in found;found[name]=s[first:ts[k-1][3]]
 return found
old=test_bodies(a);new=test_bodies(b);assert len(old)==37;assert old==new
oldtb=[t[1] for t in tokens(a) if t[0]=='textblock'];newtb=[t[1] for t in tokens(b) if t[0]=='textblock'];assert oldtb==newtb
oldliteral=[t[1] for t in tokens(a) if t[0] in ['literal','textblock']]
newliteral=[t[1] for t in tokens(b) if t[0] in ['literal','textblock']]
iterator=iter(newliteral);assert all(any(x==y for y in iterator) for x in oldliteral)
inverse=b
changes=json.loads((root/'inverse-transformations.json').read_text())
for c in reversed(changes):
 assert inverse.count(c['after'])==1
 inverse=inverse.replace(c['after'],c['before'],1)
assert inverse==a
catalog=lambda s:s[s.index('            String catalog =',s.index('    private void snapshotPg')):s.index('            try (var rows = statement.executeQuery(catalog))',s.index('    private void snapshotPg'))]
assert catalog(a)==catalog(b)
pgstages=lambda s:s[s.index('    private static int pgStage('):s.index('    private void snapshotPg(')]
assert pgstages(a)==pgstages(b)
assert a.count('target.getStackTrace()')==b.count('target.getStackTrace()')==1
assert a.count('Thread.sleep(20)')==b.count('Thread.sleep(20)')
assert a[a.index('    private void sample() {'):a.index('    private void triggerPgOnce')].count('Thread.sleep(20)')==1
assert b[b.index('    private void sample() {'):b.index('    private int unionSizeLocked')].count('Thread.sleep(20)')==1
native=lambda s:s[s.index('            || !(manager instanceof org.springframework.orm.jpa.JpaTransactionManager'):s.index('        synchronized (gate) {',s.index('            || !(manager instanceof org.springframework.orm.jpa.JpaTransactionManager'))]
assert native(a)==native(b)
proof={'baseSha256':sha(a),'candidateSha256':sha(b),'wholeInverseExact':True,'uniqueTransformations':len(changes),'testBodiesExact':True,'testCount':len(old),'testNames':list(old),'testBodyHashes':{k:sha(v) for k,v in old.items()},'textblockRawSequenceExact':True,'textblockCount':len(oldtb),'allOriginalLiteralTokenSequencePreserved':True,'originalLiteralCount':len(oldliteral),'catalogSqlBytesExact':True,'sqlStageWaitEventClassifiersExact':True,'oneExistingStackAcquisitionSite':True,'originalCadenceExact':True,'nativeAlreadyPhysicalGuardBytesExact':True,'liveSourceStillExactBase':rel.read_text()==a,'runtimeExecuted':False,'compileExecuted':False}
assert proof['liveSourceStillExactBase']
(root/'source-preservation-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k not in ['testNames','testBodyHashes']},indent=2))
