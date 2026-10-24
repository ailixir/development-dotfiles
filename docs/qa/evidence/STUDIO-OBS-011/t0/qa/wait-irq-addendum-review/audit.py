"""Independent read-only binding audit. No author entrypoint/import or Java execution."""
from pathlib import Path
import hashlib,json,re,zipfile
R=Path.cwd(); O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/wait-irq-addendum'; Q=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/wait-irq-addendum-review'
def H(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def S(s): return hashlib.sha256(s.encode()).hexdigest()
m=json.loads((O/'artifact-manifest.json').read_text()); b=json.loads((O/'bindings.json').read_text())
assert len(m)==11
assert {str(p.relative_to(O)) for p in O.rglob('*') if p.is_file()}==set(m)|{'artifact-manifest.json','receipt.json'}
for p,h in m.items(): assert H(O/p)==h,p
rc=json.loads((O/'receipt.json').read_text())
assert H(O/'artifact-manifest.json')==rc['artifactManifestSha256']
assert H(O/'receipt.md')==rc['receiptMarkdownSha256']
j=(O/'WaitIrqConformance.java').read_text(); old=(O.parent/'it-s-draft/resume2/conformance/WaitConformance.java').read_text()
assert S(j)==b['generatedJavaSha256']; assert S(old)==b['sealedOriginalJavaSha256']
# All copied method bodies contain no literal braces outside strings/comments that
# prevent this lexer from recovering balanced method extents.
def masked(s):
 return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/',lambda x: ''.join('\n' if c=='\n' else ' ' for c in x[0]),s)
def method(s,n,kind):
 a=re.search(r'(?m)^ *Object s'+str(n)+'_'+kind+r'\(\) throws Exception \{',s).start(); t=masked(s); p=t.index('{',a); d=1; e=p+1
 while d: d+=(t[e]=='{')-(t[e]=='}'); e+=1
 return a,s[a:e]
checks=[]
for c in b['cases']:
 n=c['index']; assert n==len(checks)
 for variant in ('original','delivered'):
  a,body=method(j,n,variant); assert body==method(old,n,variant)[1]
  assert S(body)==c['copied'+variant.title()+'MethodSha256']
 a,body=method(j,n,'original'); sl=re.search(r'Thread\.sleep\((\d+)\)',masked(body))
 assert int(sl[1])==c['intervalMillisUnchanged']; assert j.count('\n',0,a+sl.start())+1==c['originalSleepSourceLine']
 a,body=method(j,n,'delivered'); k=body.index('if (slept && Thread.interrupted())'); k=body.index('throw new InterruptedException();',k)
 assert j.count('\n',0,a+k)+1==c['deliveredPostIntervalThrowSourceLine']
 assert body.count('throw new InterruptedException();')==2
 directory=O.parent/('gs-t2-draft/resume2' if n<14 else 'it-s-draft/resume2')
 rows=json.loads((directory/'loop-edits.json').read_text()); row=next(x for x in rows if x['id']==c['id'])
 assert S(row['replacement'])==c['deliveredBoundSha256']
 target=directory/('candidates' if n<14 else 'repo')/c['path']; assert target.read_text().count(row['replacement'])==1
 assert c['expectedCallerInterruptFlag']==c['id'].startswith('Transport-route-idle')
 checks.append({'index':n,'id':c['id'],'intervalMillis':int(sl[1]),'originalLine':c['originalSleepSourceLine'],'deliveredLine':c['deliveredPostIntervalThrowSourceLine']})
start='  static final class Fixture {'
fixture=j[j.index(start):j.index('  static final java.lang.management.ThreadMXBean')].removesuffix('\n')
assert fixture==old[old.index(start):old.index('  record Outcome(')]
assert S(fixture)==b['fixtureCopiedByteExactSha256']
sealed={}
for rel,info in b['sealedPackages'].items():
 p=R/rel; actual={str(v.relative_to(p)) for v in p.rglob('*') if v.is_file()}; assert actual==set(info['files'])
 for name,h in info['files'].items(): assert H(p/name)==h
 sealed[rel]=len(actual)
inputs=json.loads((O/'input-bindings.json').read_text())
for row in inputs: assert H(R/row['path'])==row['sha256'],row['path']
jars=json.loads((O/'classpath.json').read_text())['jars']
for row in jars: assert H(Path(row['path']))==row['sha256']
owned=[]
for package in ['gs-t2-draft/resume2','it-s-draft/resume2']:
 data=json.loads((O.parent/package/'manifest.json').read_text()); rows=data['owned'] if isinstance(data,dict) else data
 for row in rows:
  p=R/row['path']; actual=H(p) if p.exists() else None
  assert actual==row.get('actualS011Sha256',row['preimageSha256'])
  owned.append({'path':row['path'],'sha256':actual})
zip_path=Path('/Users/brunobuger/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home/lib/src.zip')
with zipfile.ZipFile(zip_path) as z:
 source=z.read('java.management/java/lang/management/ThreadInfo.java').decode(); at=source.index('public long getWaitedCount()'); doc=source[source.rfind('/**',0,at):at+len('public long getWaitedCount()')]
(Q/'ThreadInfo-getWaitedCount.txt').write_text(doc+'\n')
summary={'status':'INDEPENDENT_STATIC_BINDINGS_MATCH_RUNTIME_UNEXECUTED','authorEntrypointsExecuted':False,'manifestEntries':len(m),'totalPackageFiles':len(m)+2,'copiedMethods':52,'fixtureByteExact':True,'cases':checks,'sealedPackageCounts':sealed,'inputBindings':len(inputs),'cachedJars':jars,'actualSourcePreimages':owned,'hashes':{n:H(O/n) for n in ['receipt.md','receipt.json','artifact-manifest.json','WaitIrqConformance.java','bindings.json','run_later.py','expected-oracle.json']},'jdkSourceZipSha256':H(zip_path),'runtimeCredit':False}
(Q/'audit.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'status':summary['status'],'methods':52,'sites':26,'manifest':len(m),'sealedCounts':sealed,'inputBindings':len(inputs)}))
