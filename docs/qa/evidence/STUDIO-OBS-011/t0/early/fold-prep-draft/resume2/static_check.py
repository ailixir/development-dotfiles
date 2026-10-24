"""Lightweight draft checks only: no compiler, build, test runner, formatter or source writes."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path.cwd(); OUT=Path(__file__).parent;TREE=OUT/'tree'
manifest=json.loads((OUT/'draft-manifest.json').read_text());checks={}
hashof=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
checks['sourceHashesStillMatch']=all((row['sourceSha256'] is None and not (ROOT/row['path']).exists()) or ((ROOT/row['path']).exists() and hashof(ROOT/row['path'])==row['sourceSha256']) for row in manifest['files'])
checks['exact17Main3TestScope']=sum('/src/main/' in r['path'] for r in manifest['files'])==17 and sum('/src/test/' in r['path'] for r in manifest['files'])==3
checks['draftHashesStillMatch']=all(hashof(TREE/r['path'])==r['draftSha256'] for r in manifest['files'])
for label,files,directory in [('prep', ['01-red-first-clock.patch','02-prep-main-preserving-old-wiring.patch','03-prep-tests.patch'],None),('proposedFinalWiring',['04-PROPOSED-final-wiring-baton.patch'],TREE),('mutations',[f'm{i}-{name}.patch' for i,name in enumerate(['mint','judge','claim','budget','worker'],1)],TREE)]:
 cmd=['git','apply','--check']
 if directory:cmd+=['--directory='+str(directory.relative_to(ROOT))]
 cmd +=[str(OUT/'patches'/f) for f in files]
 result=subprocess.run(cmd,capture_output=True,text=True)
 checks[label+'PatchApplicable']={'exit':result.returncode,'output':result.stdout+result.stderr}

# Exact original @Test bodies retained in client and by-name authorization ports.
def bodies(text):
 matches=list(re.finditer(r'@Test\s+void\s+(\w+)\s*\([^)]*\)(?:\s+throws[^\{]+)?\s*\{',text))
 result={}
 for m in matches:
  start=m.end()-1; depth=0;state='normal';i=start
  while i<len(text):
   c=text[i];n=text[i:i+2]
   if state=='line':
    if c=='\n':state='normal'
   elif state=='block':
    if n=='*/':state='normal';i+=1
   elif state in ('string','char'):
    if c=='\\':i+=1
    elif c==('"' if state=='string' else "'"):state='normal'
   elif n=='//':state='line';i+=1
   elif n=='/*':state='block';i+=1
   elif c=='"':state='string'
   elif c=="'":state='char'
   elif c=='{':depth+=1
   elif c=='}':
    depth-=1
    if depth==0:result[m.group(1)]=text[start:i+1];break
   i+=1
 return result
for old,new,label in [('backend/src/test/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClientTest.java','backend/src/test/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClientTest.java','client'),('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorizationIT.java','backend/src/test/java/com/citi/put/checks/studio/dispatch/DispatchAuthorizationIT.java','authority')]:
 oldb=bodies((ROOT/old).read_text());newb=bodies((TREE/new).read_text())
 checks[label+'OriginalBodiesByteIdentical']={'count':len(oldb),'equal':all(k in newb and newb[k]==v for k,v in oldb.items())}
# Distinct source bodies retained, rather than regenerated from a generic combined wire document.
old=(ROOT/'backend/src/main/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClient.java').read_text();new=(TREE/'backend/src/main/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClient.java').read_text()
a=old.index('  public DispatchOutcome send(RunJob job)');b=old.index('\n  /**\n   * {@code DELETE',a)
checks['dispatchSendBodyByteIdentical']=old[a:b] in new
checks['singleSecretSerializerImplementation']=len([p for p in (ROOT/'backend/src/main').rglob('*.java') if 'extends JsonSerializer<SecretValue>' in p.read_text()])==1 and 'extends JsonSerializer<SecretValue>' not in new
checks['legacyClassesUnmodified']=all(not (TREE/('backend/src/main/java/com/citi/put/checks/studio/'+f)).exists() for f in ['guided/bridge/GuidedRunnerClient.java','guided/publication/ObservedValidationClient.java','guided/publication/GuidedPublicationAuthorization.java'])
checks['noGuidedSessionServiceDraft']=not list(TREE.rglob('GuidedSessionService.java'))
checks['shapeOnlyRunnerValidateGone']='runner.validate()' not in (TREE/'backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioRunnerConfiguration.java').read_text()
checks['tlsSecurityCodeByteIdenticalExceptJavadoc']=(ROOT/'backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioRunnerTls.java').read_text().replace('or for {@code\n   * GuidedRunnerClient}\'s constructor.','or for the folded guided transport.')==(TREE/'backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioRunnerTls.java').read_text()
result={'kind':'LIGHTWEIGHT_STATIC_ONLY','runtime':'UNVERIFIED','isQaVerdict':False,'checks':checks}
(OUT/'static-check.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
