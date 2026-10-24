"""Independent static review. No author code imported/executed; writes only this review."""
from pathlib import Path
import re,json,hashlib,collections,csv,xml.etree.ElementTree as ET,zipfile
ROOT=Path.cwd(); D=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/it-r-draft/resume2'; OUT=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-resume2-review'
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
audit={'scope':'independent static rereview only; no author code executed','manifestSha256':sha((D/'manifest.json').read_bytes()),'artifacts':{},'inputs':{},'stages':[],'patchForms':[]}
assert audit['manifestSha256']=='e420cd11a86d47c5f20d445d6ca7cbcaa0e601a86dfcc07e6c92ecc83c07f6cf'
for r in load(D/'manifest.json')['artifacts']:
 p=D/r['path'];b=p.read_bytes();assert sha(b)==r['sha256'] and len(b)==r['bytes'];audit['artifacts'][r['path']]=sha(b)
prior=load(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-draft-review/audit.json')
for path,digest in prior['artifacts'].items():assert sha((D.parent/path).read_bytes())==digest
assert sha((D.parent/'manifest.json').read_bytes())==prior['manifestSha256']
for path,digest in load(D/'immutable-package-before.json').items():assert sha((D.parent/path).read_bytes())==digest
assert (D/'input-hashes.json').read_bytes()==(D.parent/'input-hashes.json').read_bytes()
for r in load(D/'input-hashes.json'):
 h=sha((ROOT/r['path']).read_bytes());assert h==r['sha256'];audit['inputs'][r['path']]=h
refresh=load(D/'input-refresh-policy.json')['reviewedChange']
for field,key in [('path','afterSha256'),('reviewPath','reviewSha256'),('applicationReceiptPath','applicationReceiptSha256')]:assert sha((ROOT/refresh[field]).read_bytes())==refresh[key]
audit['reviewedHelperRefresh']=refresh
olds=sleeps(old);assert len(olds)==95
rows=list(csv.DictReader((D/'sleep-table.tsv').open(),delimiter='\t'));assert len(rows)==95 and [int(r['id']) for r in rows]==list(range(1,96))
assert collections.Counter(r['class'] for r in rows)=={'POLL':74,'DELIBERATE':21}
oldm=methods(old);olda=assertions(old);assert len(oldm)==74 and sum(olda.values())==2686
oldblocks=[t for t in lex(old) if t.startswith('"""')]
bases={sha(old.encode()):old};test001=None
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
 if r['stage']=='00-test001':test001=c;assert c==(D.parent/'stages/00-test001/repo'/REL).read_text()
 bases[sha(c.encode())]=c
for folder in ['mutations','negative-controls','variants']:
 for patch in sorted((D/folder).glob('*/from-test001.patch')):
  mutant=apply(patch.read_text(),test001);assert apply((patch.parent/'restore-test001.patch').read_text(),mutant)==test001
  assert mutant==(patch.parent/'repo'/REL).read_text()
  audit['patchForms'] += [str(patch.relative_to(D)),str((patch.parent/'restore-test001.patch').relative_to(D))]
assert len(audit['patchForms'])==34
edits=load(D/'poll-edits.json');assert len(edits)==73
seen=[]
for e,site in zip(edits,load(D/'loop-sites.json')):
 assert e['ids']==site['ids'] and old[site['start']:site['end']]==e['source']
 seen+=e['ids'];assert '.pollInSameThread().dontCatchUncaughtExceptions().ignoreNoExceptions()' in e['replacement']
 assert e['replacement'].count('org.awaitility.Awaitility.await(')==1
 assert (D/'stages/04-b4/repo'/REL).read_text().count(e['replacement'])==1
assert sorted(seen)==[int(r['id']) for r in rows if r['class']=='POLL']
for stage in load(D/'stages.json'):
 c=(D/'stages'/stage['stage']/'repo'/REL).read_text()
 for e in edits:
  if e['replacement'] in c:c=c.replace(e['replacement'],e['source'],1)
 assert c==test001,stage['stage']
audit['undoAllDeliveredWaitBlocksRecoversExactTest001']=True
# Exact instrumentation reconstruction using only literal reviewed operations, never generator execution.
bindings=load(D/'scratch/source-bindings.json');java=(D/'scratch/ItrWaitDifferentialScratch.java').read_text()
assert sha(java.encode())==bindings['javaSha256']=='5bfbde725744f735c5c60932882bbd6e72ac3c2fe63600df9a57d1620bf80aaf'
audit['scratchBlocks']=[]
for b in bindings['blocks']:
 n=b['row'];e=next(e for e in edits if e['ids'][0]==n);raw=e['source'] if b['side']=='original' else e['replacement']
 assert sha(raw.encode())==b['actualInputBlockSha256'];c=raw.replace('System.nanoTime()','Clock.nanoTime()')
 if b['side']=='original':c=re.sub(r'Thread\.sleep\((\d+)\);',r'Clock.startElapsed(); probeIntervalEntered.countDown(); Thread.sleep(\1); if (noAwaitGap) Clock.advance(1_000_000_000L);',c)
 else:
  c=re.sub(r'(itr\d{3}\.intervalOwed = true; )(itr\d{3}\.owedUntil)',r'\1Clock.startElapsed(); \2',c)
  needle=f'long itrNow{n:03d} = Clock.nanoTime();';assert c.count(needle)==1
  c=c.replace(needle,'if (noAwaitGap) { Clock.advance(1_000_000_000L); noAwaitGap = false; }\n'+needle,1)
  needle='return false; // Cached tick: no second immediate condition/read/effect.';assert c.count(needle)==1;c=c.replace(needle,'probeIntervalEntered.countDown(); '+needle,1)
  needle=f'long itrBound{n:03d} = Math.max(itrRemaining{n:03d}, itrOwed{n:03d});';assert c.count(needle)==1;c=c.replace(needle,needle+f' if (itrBound{n:03d} <= 0) noAwaitPathObserved = true;',1)
  c=c.replace('org.awaitility.Awaitility.await(',f'final long probeChainStarted{n:03d} = System.nanoTime();\norg.awaitility.Awaitility.await(',1)
  needle=f'boolean itrObserved{n:03d} = itrPoll{n:03d}.call();';assert c.count(needle)==1
  c=c.replace(needle,f'boolean itrObserved{n:03d}; try {{ itrObserved{n:03d} = itrPoll{n:03d}.call(); }} finally {{ if (scenario.startsWith("LATE_")) {{ lateCallbackEntered = true; lateCompletionBeyondBound = System.nanoTime() - probeChainStarted{n:03d} > itrBound{n:03d}; }} }}',1)
 instrumented=(D/b['path']).read_text();assert c+'\n'==instrumented and sha(instrumented.encode())==b['instrumentedBlockSha256']
 assert java.count(instrumented.rstrip())==1
 audit['scratchBlocks'].append({'row':n,'side':b['side'],'originalInputSha256':sha(raw.encode()),'actualInstrumentedSha256':sha(instrumented.encode())})
assert len(audit['scratchBlocks'])==20
plan=load(D/'scratch/edge-proof-plan.json');assert len(plan['pairs'])==53 and sum(p['scenario']=='DURING_INTERVAL_INTERRUPT' for p in plan['pairs'])==8
# Independently expand actual Java pair dispatch loops and compare the named plan.
body=java[java.index('  static void pairedCases()'):java.index('  public static void main(')]
actual_pairs=[]
pattern=r'for \(int row : new int\[\]\{([^}]+)\}\) \{([^}]+)\}'
for m in re.finditer(pattern,body):
 for n in [int(n.strip()) for n in m[1].split(',')]:
  actual_pairs += [(n,mode) for mode in re.findall(r'compare\(row,"([A-Z0-9_]+)"\)',m[2])]
body=re.sub(pattern,'',body)
actual_pairs += [(int(n),mode) for n,mode in re.findall(r'compare\((\d+),"([A-Z0-9_]+)"\)',body)]
assert collections.Counter(actual_pairs)==collections.Counter((r['row'],r['scenario']) for r in plan['pairs'])
for row in load(D/'scratch/classpath-manifest.json'):
 assert sha(Path(row['path']).read_bytes())==row['sha256']
commands=load(D/'future-commands.json')['commands'];full=[r for r in commands if 'full-class' in r['kind']];assert len(full)==12
for c in full:
 assert c['fullClassSlotCost']==1
 for word in ['--test-tasks test,guidedIncrementalTest','--require-exec-tasks test,guidedIncrementalTest','--continue','--rerun-tasks','--no-daemon']:assert word in c['command']
audit.update(directChains=73,pollRows=74,deliberateRows=21,originalPackageUnchanged=True,pairedScratchCases=53,duringIntervalPairs=8,minimumLiteralFullClassCommands=len(full),capFullClassCommands=6,allJavaExecution='NOT_RUN')
(OUT/'audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps({k:audit[k] for k in ['manifestSha256','stages','pairedScratchCases','minimumLiteralFullClassCommands','capFullClassCommands']}))
