from pathlib import Path
import re,json,hashlib,subprocess,datetime
root=Path.cwd();out=root/'docs/qa/evidence/STUDIO-OBS-011/t0/early/left-data-draft'
def sha(s):return hashlib.sha256(s).hexdigest()
def mask(s):
 return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/',lambda m:''.join('\n' if c=='\n' else ' ' for c in m[0]),s)
def balanced(s):
 stack=[]; pairs={'}':'{',')':'(',']':'['}
 for c in mask(s):
  if c in '{([':stack.append(c)
  if c in '})]':
   assert stack and stack.pop()==pairs[c]
 return not stack
manifest=json.loads((out/'manifest.json').read_text());checks={}
for f in manifest['files']:
 p=root/f['path'];assert sha(p.read_bytes())==f['beforeSha256']
 if f['operation']!='delete':
  s=(out/'repo'/f['path']).read_text();assert sha(s.encode())==f['afterSha256'];assert balanced(s),f['path']
  assert set(f['beforeTestMethods']).issubset(f['afterTestMethods'])
  checks[f['path']]={'actualSourceStillBefore':True,'candidateDelimitersBalanced':True,'existingMethodsRetained':True}
 else:checks[f['path']]={'actualSourceStillBefore':True,'deletionUnapplied':True,'namedSourceMethodsRemoved':f['beforeTestMethods']}
# Unmodified fixture helpers remain exact.
p='backend/src/test/java/com/citi/put/checks/studio/support/GuidedPublicationEvidenceFixture.java'
a=(root/p).read_text();b=(out/'repo'/p).read_text()
start=a.index('  public static void captureSharedBootstrap(');end=a.index('  private record Exercise(',start)
start2=b.index('  public static void captureSharedBootstrap(');end2=b.index('  private record Exercise(',start2)
assert a[start:end]==b[start2:end2]
assert a[a.index('  private static boolean contains('):]==b[b.index('  private static boolean contains('):]
# All migration files match S_011; no migration is a draft target.
s011=json.loads((root/'docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json').read_text());migration=[]
for item in s011['files']:
 if item['path'].startswith('backend/src/main/resources/db/migration/'):
  actual=sha((root/item['path']).read_bytes());assert actual==item['sha256'];migration.append({'path':item['path'],'sha256':actual})
assert migration
# Read-only git applicability check only; never apply to source.
run=subprocess.run(['git','apply','--check',str(out/'left-data-draft.patch')],cwd=root,capture_output=True,text=True)
assert run.returncode==0,(run.stdout,run.stderr)
# Apply each mutant to an in-memory string only, verifying every context line and output hash.
mutants=json.loads((out/'mutants/manifest.json').read_text());mutantchecks=[]
for item in mutants['mutants']:
 path=item['path'];base=(root/path).read_text() if item['base']=='frozen-production' else (out/'repo'/path).read_text()
 assert sha(base.encode())==item['baseSha256']
 patch=(out/'mutants'/(item['id']+'.patch')).read_text().splitlines(True);orig=base.splitlines(True);result=[];cursor=0;i=2
 while i<len(patch):
  h=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',patch[i]);assert h,patch[i]
  start=int(h[1])-1;result+=orig[cursor:start];cursor=start;i+=1
  while i<len(patch) and not patch[i].startswith('@@'):
   line=patch[i];flag=line[0];text=line[1:]
   if flag in ' -':assert orig[cursor]==text,(item['id'],cursor);cursor+=1
   if flag in ' +':result.append(text)
   i+=1
 result+=orig[cursor:];mutated=''.join(result)
 assert sha(mutated.encode())==item['mutantSha256'];assert balanced(mutated)
 mutantchecks.append({'id':item['id'],'inMemoryPatchApplies':True,'delimitersBalanced':True,'runtimeExecuted':False})
# Exact broad residuals remain V20 only, with bytes unchanged against S_011.
v20='backend/src/test/java/com/citi/put/checks/studio/support/LegacyV20ConfirmedBaseFixture.java'
v20hash=sha((root/v20).read_bytes());assert v20hash==next(x['sha256'] for x in s011['files'] if x['path']==v20)
grep=json.loads((out/'historical-grep.json').read_text());assert grep['beforeCount']==78 and grep['afterVirtualOverlayCount']==4
result={'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'draftOnly':True,'isQaOrLifecycleVerdict':False,'sourceChecks':checks,'preservedFixtureHelpers':['captureSharedBootstrap exact','contains and every following helper exact'],'immutableMigrationFiles':migration,'unownedV20Fixture':{'path':v20,'sha256':v20hash,'matchesS011':True,'retainedGenericHistoricalMatches':4},'mainDraftTargets':[],'readOnlyPatchCheck':{'command':'git apply --check left-data-draft.patch','exit':run.returncode,'stdout':run.stdout,'stderr':run.stderr},'mutantChecks':mutantchecks,'historicalGrep':{'baselinePositive':78,'virtualOverlayResidual':4,'broadZeroSatisfied':False},'noRuntimeProof':True,'limitations':['Lexical delimiter balance is not a Java compiler or semantic parser','No formatter/compiler/tests/Gradle/Docker/provider/model runtime invoked','Grep-zero ruling unresolved','All production and migration paths unchanged by this author']}
(out/'static-review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'readOnlyPatchCheck':run.returncode,'balancedCandidateFiles':4,'balancedMutants':len(mutantchecks),'migrationFilesEqualS011':len(migration),'broadHistoricalResiduals':4}))
