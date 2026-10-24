"""Independent static review. No author code imported/executed; writes only this review."""
from pathlib import Path
import re,json,hashlib,collections,csv,xml.etree.ElementTree as ET,zipfile
ROOT=Path.cwd(); D=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/it-r-draft'; OUT=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-draft-review'
REL='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
def sha(x):return hashlib.sha256(x).hexdigest()
def load(p):return json.loads(p.read_text())
def lex(s):
 p=r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S'
 return [m.group() for m in re.finditer(p,s) if not m.group().startswith(('//','/*'))]
def bal(t,i,a='(',b=')'):
 n=0
 for j in range(i,len(t)):
  n+=t[j]==a;n-=t[j]==b
  if n==0:return j
 raise AssertionError('balance')
def assertions(s):
 t=lex(s);out=[]
 for i,v in enumerate(t):
  if v in ('assertThat','assertThatThrownBy','assertThatCode','assertThrows','assertTrue','assertFalse') and t[i+1]=='(':
   j=i;n=0
   while j<len(t):
    n+=t[j] in ('(','[','{');n-=t[j] in (')',']','}')
    if t[j]==';' and n<=0:break
    j+=1
   v=t[i:j+1];a=' '.join(v)
   a=re.sub(r'itrRead\d{3}_(\w+)',r'\1',a);a=re.sub(r'itr\d{3} \. (\w+)',r'\1',a)
   a=a.replace('RECEIPTS . subList ( itrRec0 , RECEIPTS . size ( ) )','RECEIPTS').replace('VALUES . subList ( itrVal0 , VALUES . size ( ) )','VALUES').replace('VALUES . get ( itrVal0 )','VALUES . get ( 0 )')
   a=re.sub(r'itr(?:Nav|Rec)0 \+ ([13])',r'\1',a);out.append(a)
 return collections.Counter(out)
def methods(s):
 t=lex(s);out=[]
 for i,v in enumerate(t):
  if v!='@':continue
  j=i+2
  while t[j]=='.':j+=2
  kind=''.join(t[i+1:j]).split('.')[-1]
  if kind not in ('Test','ParameterizedTest'):continue
  if t[j]=='(':j=bal(t,j)+1
  while t[j]=='@':
   j+=2
   while t[j]=='.':j+=2
   if t[j]=='(':j=bal(t,j)+1
  while t[j]!='(':j+=1
  end=bal(t,j);out.append((t[j-1],t[i:end+1]))
 return out
def sleeps(s):
 t=lex(s);out=[]
 for i,v in enumerate(t):
  if v=='sleep' and t[i+1]=='(' and t[i-1]=='.':
   j=i-2
   while j>1 and t[j-1]=='.':j-=2
   out.append(' '.join(t[j:bal(t,i+1)+1]))
 return out
def apply(p,base):
 ls=p.splitlines(keepends=True);assert ls[0].startswith('--- ') and ls[1].startswith('+++ ')
 src=base.splitlines(keepends=True);dst=[];pos=0;i=2
 while i<len(ls):
  m=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',ls[i]);assert m,ls[i]
  start=int(m[1])-1 if int(m[1]) else 0;assert start>=pos
  dst+=src[pos:start];pos=start;i+=1;oc=nc=0
  while i<len(ls) and not ls[i].startswith('@@'):
   q=ls[i];assert q[0] in ' +-\\'
   if q[0]==' ':assert src[pos]==q[1:];dst.append(q[1:]);pos+=1;oc+=1;nc+=1
   elif q[0]=='-':assert src[pos]==q[1:];pos+=1;oc+=1
   elif q[0]=='+':dst.append(q[1:]);nc+=1
   i+=1
  assert (oc,nc)==(int(m[2] or 1),int(m[4] or 1))
 dst+=src[pos:];return ''.join(dst)
old=(D/'ReplayIT.original.java').read_text();assert sha(old.encode())=='b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'
audit={'scope':'independent static only; no Java/runtime test','manifestSha256':sha((D/'manifest.json').read_bytes()),'artifacts':{},'inputs':{},'stages':[],'patchForms':[]}
assert audit['manifestSha256']=='d46e65e9591f18f1fdfa7dfe7587f86ee1c000631dcd819eaef971c71c970f60'
for r in load(D/'manifest.json')['files']:
 p=D/r['path'];b=p.read_bytes();assert sha(b)==r['sha256'] and len(b)==r['bytes'];audit['artifacts'][r['path']]=sha(b)
assert len(audit['artifacts'])==74
for r in load(D/'input-hashes.json'):
 h=sha((ROOT/r['path']).read_bytes());assert h==r['sha256'];audit['inputs'][r['path']]=h
olds=sleeps(old);assert len(olds)==95
rows=list(csv.DictReader((D/'sleep-table.tsv').open(),delimiter='\t'));assert len(rows)==95 and [int(r['id']) for r in rows]==list(range(1,96))
assert collections.Counter(r['class'] for r in rows)=={'POLL':74,'DELIBERATE':21}
oldm=methods(old);olda=assertions(old);assert len(oldm)==74 and sum(olda.values())==2686
oldblocks=[t for t in lex(old) if t.startswith('"""')]
prev=old;test001=None;bases={sha(old.encode()):old}
for r in load(D/'stages.json'):
 c=(D/'stages'/r['stage']/'repo'/REL).read_text();assert sha(c.encode())==r['candidateSha256']
 for name,base in [('from-original.patch',old),('incremental.patch',bases[r['sourceSha256']])]:
  assert apply((D/'stages'/r['stage']/name).read_text(),base)==c
  audit['patchForms'].append(str(Path('stages')/r['stage']/name))
 assert methods(c)==oldm
 a=assertions(c);assert not olda-a,(r['stage'],olda-a)
 assert [t for t in lex(c) if t.startswith('"""')]==oldblocks
 exp=[s for row,s in zip(rows,olds) if row['class']=='DELIBERATE' or row['batch'] not in r['batches'] or int(row['id']) in r.get('carriedPollIds',[])]
 assert sleeps(c)==exp
 audit['stages'].append({'stage':r['stage'],'sha256':sha(c.encode()),'methods':len(methods(c)),'originalAssertionsRetained':sum(olda.values()),'textBlocks':len(oldblocks),'remainingSleeps':len(exp)})
 if r['stage']=='00-test001':test001=c
 bases[sha(c.encode())]=c
for folder in ['mutations','negative-controls','variants']:
 for patch in sorted((D/folder).glob('*/from-test001.patch')):
  mutant=apply(patch.read_text(),test001);assert apply((patch.parent/'restore-test001.patch').read_text(),mutant)==test001
  audit['patchForms'] += [str(patch.relative_to(D)),str((patch.parent/'restore-test001.patch').relative_to(D))]
  if folder=='variants':assert mutant==(patch.parent/'repo'/REL).read_text()
assert len(audit['patchForms'])==32
edits=load(D/'poll-edits.json');assert len(edits)==73
seen=[]
for e,site in zip(edits,load(D/'loop-sites.json')):
 assert e['ids']==site['ids'] and old[site['start']:site['end']]==e['source']
 seen+=e['ids'];assert '.pollInSameThread().dontCatchUncaughtExceptions().ignoreNoExceptions()' in e['replacement']
 assert e['replacement'].count('org.awaitility.Awaitility.await(')==1
 # exact delivered blocks, not a metadata-only intermediate.
 assert (D/'stages/04-b4/repo'/REL).read_text().count(e['replacement'])==1
assert sorted(seen)==[int(r['id']) for r in rows if r['class']=='POLL']

for stage in load(D/'stages.json'):
 c=(D/'stages'/stage['stage']/'repo'/REL).read_text()
 for e in edits:
  if e['replacement'] in c:c=c.replace(e['replacement'],e['source'],1)
 assert c==test001,stage['stage']
audit['undoAllDeliveredWaitBlocksRecoversExactTest001']=True
audit['pollRows']=len(seen);audit['directChains']=len(edits);audit['deliberateRows']=[int(r['id']) for r in rows if r['class']=='DELIBERATE']
# Derive exact original case corpus from the real class's closed lists, compare archive names.
def stringset(field):
 a=old.index(field+' =');b=old.index(';',a);return re.findall(r'"([^"\n]+)"',old[a:b])
single=stringset('SINGLETON_METHODS');inc=set(stringset('INCREMENTAL_METHODS'));vs=stringset('INCREMENTAL_VARIANTS')
assert len(single)==73 and len(vs)==35
expected=[]
for m in single:expected.append(('guidedIncrementalTest' if m in inc else 'test',m+'()'))
expected += [('guidedIncrementalTest','incremental joined '+v) for v in vs]
assert collections.Counter(t for t,n in expected)=={'test':46,'guidedIncrementalTest':62}
wanted=load(D/'expected-cases.json');assert collections.Counter((r['task'],r['name']) for r in wanted['cases'])==collections.Counter(expected)
archive=load(ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-results.json')
actual=[(r['task'],r['name']) for r in archive['testcases'] if r['class']=='com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT' and r['name']!='executionError']
# B1 is deliberately fail-stop truncated; compare profile membership without asserting full discovery.
audit['b1ObservedReplayCases']=dict(collections.Counter(t for t,n in actual));audit['b1UnknownCases']=list((collections.Counter(actual)-collections.Counter(expected)).elements())
assert not audit['b1UnknownCases']
audit['expectedCorpus']=expected
# Bind installed exact JAR bytes using the declared evidence; no Java class execution.
jars=list((Path.home()/'.gradle/caches').rglob('awaitility-4.2.2.jar'))
audit['awaitilityJars']=[{'path':str(p),'sha256':sha(p.read_bytes())} for p in jars]
assert any(r['sha256']=='e831fee30ed401e2208f1bd5a0ef9add538d9cb1103c0e43216691b647bde9c6' for r in audit['awaitilityJars'])
# Dedicated review never derives its baseline from the staged source. Only record its hash.
audit['actualReplayHashAtReview']=sha((ROOT/REL).read_bytes())
(OUT/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps({k:audit[k] for k in ('manifestSha256','stages','directChains','pollRows','b1ObservedReplayCases','actualReplayHashAtReview')}))
