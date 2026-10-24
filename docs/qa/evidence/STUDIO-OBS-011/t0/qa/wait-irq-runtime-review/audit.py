"""Independent archived IRQ proof audit. Hash/parse only; no Java/compiler/entrypoint execution."""
from pathlib import Path
from collections import Counter
import json,hashlib,re,struct,stat
R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-wait-irq-20261019-0617-once';A=D/'complete-scratch-archive';B=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/wait-irq-addendum';O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/wait-irq-runtime-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();hs=lambda s:hashlib.sha256(s.encode()).hexdigest()
context=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/wait-irq-runtime-review-context.txt';pins=re.findall(r'^(docs/[^\n]+) SHA256 ([a-f0-9]{64})$',context.read_text(),re.M);assert len(pins)==53,len(pins)
for path,digest in pins:assert h(R/path)==digest,path
terminal=json.loads((D/'root-terminal-archive.json').read_text());auth=json.loads((D/'root-authorization.json').read_text());identity=json.loads((D/'wrapper-identity.json').read_text());receipt=json.loads((A/'receipt.json').read_text());binding=json.loads((B/'bindings.json').read_text())
assert h(B/'WaitIrqConformance.java')==h(A/'WaitIrqConformance.java')==binding['generatedJavaSha256']=='8a3f05da3a3b5565758705ae70ba0f42f82d1c3ff0a9977fa92eeac1c3b21048'
assert h(B/'bindings.json')==receipt['bindingsSha256']=='c12176d573e311776bf4e6f112871b4d1e5d13053a63845b5b52a38d812b6174'
assert h(B/'run_later.py')==auth['launcherSha256']=='548a84200f9fe1196f1f16abad33d9d6fddc3c2bdd05d3d49caff509d837fb68'
assert h(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py')==auth['lockWrapperSha256']=='2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df'
assert h(R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/wait-irq-addendum-review/review.md')=='90e68936e0a07756abdcaab8cac964e3b453a29e5844d3d8358d2765cfd22077'
actual_files={str(p.relative_to(A)):h(p) for p in A.rglob('*') if p.is_file()};assert len(actual_files)==46 and actual_files==terminal['completeScratchFiles']
assert all(stat.S_IMODE(p.stat().st_mode)==384 for p in A.iterdir() if p.is_file()) and stat.S_IMODE(A.stat().st_mode)==448
assert terminal['wrapperExit']==0 and terminal['endPsExit']==1 and terminal['endPsOutput']=='' and terminal['wrapperPid']==identity['pid']==40417
assert identity['authorizationSha256']==h(D/'root-authorization.json') and identity['wrapperSourceSha256']==h(D/'execute_once.py')
cmd=identity['command'];assert cmd[1].endswith('/execute-008/with-gradle-lock.py') and cmd[3].endswith('/early/wait-irq-addendum/run_later.py') and cmd[4:]==['--execute','--java-home',auth['java21Home'],'--scratch-directory',auth['scratch']]
assert identity['kernelObservation'].startswith('40417 40416 Mon Oct 19 02:14:41 2026') and ' '.join(cmd) in identity['kernelObservation']
assert (D/'wrapper.stdout').read_text().splitlines()==['[gradle-lock] acquired after 0.0s','[gradle-lock] released, exit 0'] and (D/'wrapper.stderr').stat().st_size==0
consumed=json.loads((D/'launch-consumed.json').read_text());assert consumed['oneShot'] is True and consumed['automaticRetry'] is False
root_source=(D/'execute_once.py').read_text();assert ".open('x')" in root_source and root_source.count('subprocess.Popen(')==1 and 'process.wait()' in root_source
jars=json.loads((B/'classpath.json').read_text())['jars'];assert len(jars)==3
for row in jars:assert h(Path(row['path']))==row['sha256']
for name,digest in auth['jdkFiles'].items():assert h(Path(auth['java21Home'])/name)==digest
assert receipt['java21ReleaseSha256']==auth['jdkFiles']['release'];assert 'JAVA_VERSION="21.0.10"' in (Path(auth['java21Home'])/'release').read_text()
classpath=':'.join(x['path'] for x in jars);scratch=auth['scratch'];home=auth['java21Home']
assert receipt['phases']==[{'command':[home+'/bin/javac','-g:lines,source','-encoding','UTF-8','-cp',classpath,'-d',scratch,scratch+'/WaitIrqConformance.java'],'maximumSeconds':30,'exit':0},{'command':[home+'/bin/java','-cp',scratch+':'+classpath,'WaitIrqConformance',scratch+'/owned-interval-proof.log'],'maximumSeconds':60,'exit':0}]
assert receipt['status']=='OBSERVABLE_PROBE_PASS' and receipt['sourceApplied'] is False and receipt['automaticRetry'] is False and receipt['nativeGateCredit'] is False and receipt['timingIdentityClaim'] is False
assert all((A/name).stat().st_size==0 for name in ['phase0.stdout','phase0.stderr','phase1.stderr'])
assert (A/'phase1.stdout').read_text()=='Completed 26 paired during-interval probes; native gates and234 earlier comparisons remain separate\n'
# Independent bounded Java classfile reader: validates actual class identities, SourceFile,
# line tables and main invocation sites without javap/JVM/compiler.
def classfile(raw):
 pos=0
 def take(n):
  nonlocal pos
  b=raw[pos:pos+n];assert len(b)==n;pos+=n;return b
 def u1():return int.from_bytes(take(1),'big')
 def u2():return int.from_bytes(take(2),'big')
 def u4():return int.from_bytes(take(4),'big')
 assert u4()==0xcafebabe;minor=u2();major=u2();cp=[None]*u2();i=1
 while i<len(cp):
  tag=u1()
  if tag==1:cp[i]=(tag,take(u2()).decode('utf8'))
  elif tag in [3,4]:cp[i]=(tag,take(4))
  elif tag in [5,6]:cp[i]=(tag,take(8));i+=1
  elif tag in [7,8,16,19,20]:cp[i]=(tag,u2())
  elif tag in [9,10,11,12,17,18]:cp[i]=(tag,u2(),u2())
  elif tag==15:cp[i]=(tag,u1(),u2())
  else:raise AssertionError(('unknown constant tag',tag))
  i+=1
 def utf(n):assert cp[n][0]==1;return cp[n][1]
 def attrs():
  out={}
  for _ in range(u2()):name=utf(u2());out[name]=take(u4())
  return out
 access=u2();this=u2();super_=u2();interfaces=[u2() for _ in range(u2())]
 for _ in range(u2()):u2();u2();u2();attrs()
 methods={}
 for _ in range(u2()):
  flags=u2();name=utf(u2());descriptor=utf(u2());attributes=attrs();code=b'';line_numbers=[]
  if 'Code' in attributes:
   b=attributes['Code'];q=0
   def read(n):
    nonlocal q
    z=b[q:q+n];q+=n;return int.from_bytes(z,'big')
   read(2);read(2);size=read(4);code=b[q:q+size];q+=size;exception_count=read(2);q+=8*exception_count
   for _ in range(read(2)):
    attr_name=utf(read(2));length=read(4);data=b[q:q+length];q+=length
    if attr_name=='LineNumberTable':line_numbers=[int.from_bytes(data[z+2:z+4],'big') for z in range(2,len(data),4)]
   assert q==len(b)
  methods[(name,descriptor)]={'code':code,'lines':line_numbers}
 attributes=attrs();assert pos==len(raw)
 return dict(name=utf(cp[this][1]),major=major,minor=minor,sourceFile=utf(int.from_bytes(attributes['SourceFile'],'big')),methods=methods,cp=cp)
def invocations(c,code):
 result=[];pc=0
 while pc<len(code):
  op=code[pc];step=1
  if op in [0xb6,0xb7,0xb8,0xb9]:
   ref=c['cp'][int.from_bytes(code[pc+1:pc+3],'big')];owner=c['cp'][c['cp'][ref[1]][1]][1];nt=c['cp'][ref[2]];name=c['cp'][nt[1]][1];result.append((owner,name));step=5 if op==0xb9 else 3
  elif op==0xba:step=5
  elif op in [0xaa,0xab]:
   q=pc+1
   while q%4:q+=1
   if op==0xaa:low=int.from_bytes(code[q+4:q+8],'big',signed=True);high=int.from_bytes(code[q+8:q+12],'big',signed=True);step=q+12+4*(high-low+1)-pc
   else:count=int.from_bytes(code[q+4:q+8],'big');step=q+8+8*count-pc
  elif op==0xc4:step=6 if code[pc+1]==0x84 else 4
  elif op in [0x10,0x12,0xbc,0xa9] or 0x15<=op<=0x19 or 0x36<=op<=0x3a:step=2
  elif op in [0x11,0x13,0x14,0x84,0xb2,0xb3,0xb4,0xb5,0xbb,0xbd,0xc0,0xc1,0xc6,0xc7] or 0x99<=op<=0xa8:step=3
  elif op==0xc5:step=4
  elif op in [0xc8,0xc9]:step=5
  pc+=step
 assert pc==len(code);return result
classes={}
for p in A.glob('*.class'):
 c=classfile(p.read_bytes());assert c['major']==65 and c['sourceFile']=='WaitIrqConformance.java';assert p.stem==c['name'];classes[c['name']]=c
assert len(classes)==39
fixture=classes['WaitIrqConformance$Fixture'];sites=binding['cases'];assert len(sites)==26 and [x['index'] for x in sites]==list(range(26))
methods={name for name,desc in fixture['methods'] if re.fullmatch(r's\d+_(original|delivered)',name)};assert methods=={f's{i}_{v}' for i in range(26) for v in ['original','delivered']}
java=(A/'WaitIrqConformance.java').read_text();lines=java.splitlines();ids=re.findall(r'"([^"]+)"',re.search(r'String\[\] ids=\{([^}]+)\}',java)[1]);assert ids==[x['id'] for x in sites]
for c in sites:
 n=c['index'];sleep=c['originalSleepSourceLine'];throw=c['deliveredPostIntervalThrowSourceLine']
 assert 'Thread.sleep('+str(c['intervalMillisUnchanged'])+')' in lines[sleep-1] and 'throw new InterruptedException();' in lines[throw-1]
 assert sleep in next(x['lines'] for (name,d),x in fixture['methods'].items() if name==f's{n}_original')
 assert any(throw in x['lines'] for klass in classes.values() for (name,d),x in klass['methods'].items() if name=='step')
root=classes['WaitIrqConformance'];main=next(x for (name,d),x in root['methods'].items() if name=='main');calls=invocations(root,main['code']);names={name for owner,name in calls}
required={'run','entryProved','failure','getCause','getSuppressed','escapes','reads','result','interrupt','handlerStable','restoreSleepProved','trace','getStackTrace','isExactlyInstanceOf','isNull','isEmpty','isEqualTo','isTrue','saveProof'};assert required<=names,required-names
# Exact whole event sequence, owned native stack/line evidence, resleep acknowledgment and monotonic bounds.
proof=(A/'owned-interval-proof.log').read_text().splitlines();assert len(proof)==261 and hs('\n'.join(proof)+'\n')==receipt['proofSha256']
assert proof[-1]=='STATUS PASS 26 paired real-during-interval comparisons; no native-gate or timing credit'
assert not any(line.startswith(('FAIL','FATAL')) for line in proof)
index=0;site_results=[];hist=Counter()
regex=re.compile(r'^EVENT (\S+) (original|delivered) (\S+) observedMonotonicNs=(\d+) reads=(\d+) (.*)$')
for c in sites:
 events={}
 for variant in ['original','delivered']:
  expected=['first-read-held','native-interval-before-owned-interrupt','owned-interrupt-sent']+(['uninterruptible-resleep-ack'] if variant=='delivered' else [])+['joined'];group=[]
  for expected_name in expected:
   m=regex.fullmatch(proof[index]);index+=1;assert m and (m[1],m[2],m[3])==(c['id'],variant,expected_name) and int(m[5])==1
   extra=m[6];st=re.search(r'waitedCount=(\d+) state=(\w+) stack=\[(.*)\]$',extra);row=dict(name=expected_name,time=int(m[4]),reads=int(m[5]),waited=int(st[1]) if st else None,state=st[2] if st else None,stack=st[3] if st else '')
   group.append(row);hist[expected_name]+=1
  assert all(x['time']<y['time'] for x,y in zip(group,group[1:]));native=group[1]
  assert native['state']=='TIMED_WAITING' and 'java.lang.Thread.sleep' in native['stack'] and f'WaitIrqConformance$Fixture.s{c["index"]}_{variant}(' in native['stack']
  frame=re.search(r'WaitIrqConformance\$Fixture\.s'+str(c['index'])+'_'+variant+r'\(WaitIrqConformance.java:(\d+)\)',native['stack']);assert frame
  assert int(frame[1]) in next(x['lines'] for (name,d),x in fixture['methods'].items() if name==f's{c["index"]}_{variant}')
  if variant=='original':assert int(frame[1])==c['originalSleepSourceLine'] and 'Uninterruptibles.sleepUninterruptibly' not in native['stack']
  else:
   ack=group[3]
   for x in [native,ack]:assert x['state']=='TIMED_WAITING' and 'java.lang.Thread.sleep' in x['stack'] and 'org.awaitility.core.Uninterruptibles.sleepUninterruptibly' in x['stack'] and 'org.awaitility.core.ConditionAwaiter.await' in x['stack'] and f'WaitIrqConformance$Fixture.s{c["index"]}_delivered(' in x['stack']
   assert ack['waited']>native['waited']>=0
  events[variant]=group
 assert proof[index]=='PAIR_PASS '+c['id']+' original/delivered first-read interruption; latency not compared';index+=1
 site_results.append(dict(index=c['index'],id=c['id'],intervalMillis=c['intervalMillisUnchanged'],originalSleepLine=c['originalSleepSourceLine'],deliveredPostIntervalThrowLine=c['deliveredPostIntervalThrowSourceLine'],nativeEntries=2,ownedInterrupts=2,joins=2,readsPerVariant=1,deliveredNativeWaitedCount=events['delivered'][1]['waited'],deliveredAckWaitedCount=events['delivered'][3]['waited'],pairAssertionPass=True,expectedFlag=c['expectedCallerInterruptFlag']))
assert index==len(proof)-1 and hist==Counter({'first-read-held':52,'native-interval-before-owned-interrupt':52,'owned-interrupt-sent':52,'joined':52,'uninterruptible-resleep-ack':26})
# Exact original addendum and prepared-source package bindings remain preserved.
manifest=json.loads((B/'artifact-manifest.json').read_text());assert len(manifest)==11
assert {str(v.relative_to(B)) for v in B.rglob('*') if v.is_file()}==set(manifest)|{'artifact-manifest.json','receipt.json'}
for name,digest in manifest.items():assert h(B/name)==digest
sealed={}
for rel,info in binding['sealedPackages'].items():
 directory=R/rel;assert {str(v.relative_to(directory)) for v in directory.rglob('*') if v.is_file()}==set(info['files'])
 for name,digest in info['files'].items():assert h(directory/name)==digest
 sealed[rel]=len(info['files'])
def masked(text):return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/',lambda m:''.join('\n' if c=='\n' else ' ' for c in m[0]),text)
def method(text,n,kind):
 start=re.search(r'(?m)^ *Object s'+str(n)+'_'+kind+r'\(\) throws Exception \{',text).start();clean=masked(text);brace=clean.index('{',start);depth=1;end=brace+1
 while depth:depth+=(clean[end]=='{')-(clean[end]=='}');end+=1
 return text[start:end]
for case in sites:
 for variant in ['original','delivered']:assert hs(method(java,case['index'],variant))==case['copied'+variant.title()+'MethodSha256']
# Actual current original source/dist pins rehashed; no source capture regeneration or writes.
plan=json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/plan.json').read_text());source=plan['source'];assert len(source['files'])==1808 and len(source['dist']['files'])==238
for row in source['files']:assert h(R/row['path'])==row['sha256']
for row in source['dist']['files']:assert h(R/'studio-runner/dist'/row['path'])==row['sha256']
for row in json.loads((B/'input-bindings.json').read_text()):assert h(R/row['path'])==row['sha256']
out=dict(scope='ACTUAL_ONE_SHOT_26_PAIR_DURING_INTERVAL_IRQ_PROBE_ONLY',dispatchPinnedFiles=len(pins),archiveFiles=46,archivedCompiledClasses=39,classVersion=65,sourceSha256=h(A/'WaitIrqConformance.java'),proofSha256=h(A/'owned-interval-proof.log'),launcherSha256=h(B/'run_later.py'),wrapperIdentitySha256=h(D/'wrapper-identity.json'),rootTerminalArchiveSha256=h(D/'root-terminal-archive.json'),phaseExits=[x['exit'] for x in receipt['phases']],actualLockMessagesVerified=True,recordedWrapperPid=40417,recordedKernelStart='Mon Oct 19 02:14:41 2026',recordedWrapperAbsent=True,oneShotConsumed=True,noAutomaticRetry=True,actualIntervalsHistogram=dict(Counter(x['intervalMillis'] for x in site_results)),eventCounts=dict(hist),siteResults=site_results,compiledMainOracleInvocations=sorted(required),sourceFilesRehashed=1808,distFilesRehashed=238,cachedJarBindings=jars,jdkFilesRehashed=auth['jdkFiles'],sealedPreparedPackageFiles=sealed,sourceBoundCopiedMethodsVerified=52,deliveredWaitCountHistogram=dict(Counter(x['deliveredNativeWaitedCount'] for x in site_results)),deliveredResleepWaitCountHistogram=dict(Counter(x['deliveredAckWaitedCount'] for x in site_results)),prior234ComparisonsCredited=False,nativeGateCredit=False,AC5TimingCredit=False,reviewNativeCompilerCalls=0,sourceApplied=False)
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k not in ['siteResults','cachedJarBindings','jdkFilesRehashed','compiledMainOracleInvocations']}))
