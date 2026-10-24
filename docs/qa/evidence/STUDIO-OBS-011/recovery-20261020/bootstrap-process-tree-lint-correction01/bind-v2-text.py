from pathlib import Path
from collections import Counter
import json,hashlib,re,difflib,datetime
R=Path.cwd();O=Path(__file__).resolve().parent;V1=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/bootstrap-process-tree-observation-candidate';fixture='studio-runner/test/fixtures-tier/observed-bootstrap-process-tree.test.ts';helper='studio-runner/test/helpers/bootstrapProcessTreeObservation.ts';unit='studio-runner/test/run/bootstrapProcessTreeObservation.test.ts';paths=[fixture,helper,unit]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
b={p:(O/'before'/p).read_text() for p in paths};a={p:(O/'after'/p).read_text() for p in paths}
normalizedFixture=a[fixture].replace('const inventoryState:{failed:boolean}={failed:false};','let inventoryWriteFailed=false;').replace('inventoryState.failed','inventoryWriteFailed');assert normalizedFixture==b[fixture]
oldPredicate=r'/[\u0000-\u001f\u007f]/u.test(command)';newPredicate='Array.from(command).some(character=>{const code=character.charCodeAt(0);return code<=0x1f||code===0x7f;})';assert a[helper].count(newPredicate)==1 and a[helper].replace(newPredicate,oldPredicate)==b[helper]
oldHelper=(O/'before-old-algorithm'/helper).read_text();v2Old=(O/'red'/helper).read_text();assert v2Old.replace(newPredicate,oldPredicate)==oldHelper
normalizedUnit=a[unit].replace("import type { MockInstance } from 'vitest';\n",'').replace('let killSpy: MockInstance<typeof process.kill>;\n','').replace("killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);","vi.spyOn(process, 'kill').mockImplementation(() => true);");assert normalizedUnit.count('killSpy')==17;normalizedUnit=normalizedUnit.replace('killSpy','vi.mocked(process.kill)').replace('${String(row.pid)}','${row.pid}').replace('${String(row.ppid)}','${row.ppid}');assert normalizedUnit==b[unit]
for p in paths:
 assert a[p].count('eslint-disable')==b[p].count('eslint-disable')
assert a[helper].splitlines()[0]==b[helper].splitlines()[0]
assert a[unit].count('process.kill(')==b[unit].count('process.kill(');assert "afterEach(() => { vi.restoreAllMocks(); });" in a[unit]
# The entire v2 fixture normalizes exactly to v1; v1's original15 expectations/native/timer/finally proof is preserved.
original=(V1/'before'/fixture).read_text();expectSpans=re.findall(r'expect\([^\n]*?;',original);assert expectSpans==re.findall(r'expect\([^\n]*?;',a[fixture]) and len(expectSpans)==15
for timer in ['1300','1500','4000','10000','5000','30000']:assert original.count(timer)==a[fixture].count(timer)
names=lambda text:[json.loads(x) for x in re.findall(r'^  it\(("(?:[^"\\]|\\.)*"), \(\) => \{$',text,re.M)]
spec=json.loads((V1/'proof-specification.json').read_text());assert names(a[unit])==names(b[unit])==[r['title'] for r in spec['expectedUnitIdentities']] and len(names(a[unit]))==37
primaryBefore=next(i+1 for i,l in enumerate(b[unit].splitlines()) if 'COHERENT_CAPTURE_INVENTORY_POSTCONDITION' in l);primaryAfter=next(i+1 for i,l in enumerate(a[unit].splitlines()) if 'COHERENT_CAPTURE_INVENTORY_POSTCONDITION' in l);assert primaryBefore==52 and primaryAfter==54
for p in [fixture,unit]:assert (O/'red'/p).read_bytes()==(O/'after'/p).read_bytes()
start=a[helper].index('export function captureBootstrapTree(');end=a[helper].index('/** One fresh confirmation only;');captureGreen=a[helper][start:end];startOld=v2Old.index('export function captureBootstrapTree(');endOld=v2Old.index('/** One fresh confirmation only;');captureOld=v2Old[startOld:endOld];assert a[helper].replace(captureGreen,'<CAPTURE>')==v2Old.replace(captureOld,'<CAPTURE>')
rows=[]
for p in paths:
 for folder,before,after,fromname,toname in [('v1-to-v2',b[p],a[p],'a/'+p,'b/'+p),('v2-to-v1',a[p],b[p],'a/'+p,'b/'+p)]:
  dest=O/'patches'/folder/(p+'.patch');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(''.join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile=fromname,tofile=toname)))
 before=(V1/'before'/p).read_text() if p==fixture else ''
 for name,src,dst,fn,tn in [('actual-to-v2',before,a[p],'a/'+p if p==fixture else '/dev/null','b/'+p),('v2-to-actual',a[p],before,'a/'+p,'b/'+p if p==fixture else '/dev/null'),('actual-to-v2-red',before,(O/'red'/p).read_text(),'a/'+p if p==fixture else '/dev/null','b/'+p)]:
  dest=O/'patches'/name/(p+'.patch');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(''.join(difflib.unified_diff(src.splitlines(keepends=True),dst.splitlines(keepends=True),fromfile=fn,tofile=tn)))
 rows.append({'path':p,'v1Sha256':sha(O/'before'/p),'v2GreenSha256':sha(O/'after'/p),'v2RedSha256':sha(O/'red'/p),'actualBeforeExists':p==fixture,'requiredActualBeforeSha256':sha(V1/'before'/p) if p==fixture else None,'actualApplication':'UNEXECUTED_NOT_RELEASED'})
for folder in ['v1-to-v2','v2-to-v1','actual-to-v2','v2-to-actual','actual-to-v2-red']:
 (O/(folder+'.patch')).write_text(''.join((O/'patches'/folder/(p+'.patch')).read_text() for p in (reversed(paths) if folder in ['v2-to-v1','v2-to-actual'] else paths)))
for name,before,after in [('v1-old-to-v2-old',oldHelper,v2Old),('v2-old-to-v1-old',v2Old,oldHelper),('v2-helper-green',v2Old,a[helper]),('v2-helper-green.inverse',a[helper],v2Old)]:
 (O/(name+'.patch')).write_text(''.join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='a/'+helper,tofile='b/'+helper)))
# Future stage starts from the frozen v1GREEN tree and deliberately installs v2OLD helper plus v2 fixture/unit.
(O/'private-v1green-to-v2old.patch').write_text(''.join(''.join(difflib.unified_diff(b[p].splitlines(keepends=True),(O/'red'/p).read_text().splitlines(keepends=True),fromfile='a/'+p,tofile='b/'+p)) for p in paths))
(O/'private-v1green-to-v2old.inverse.patch').write_text(''.join(''.join(difflib.unified_diff((O/'red'/p).read_text().splitlines(keepends=True),b[p].splitlines(keepends=True),fromfile='a/'+p,tofile='b/'+p)) for p in reversed(paths)))
wj('v2-source-bindings.json',{'paths':rows,'sameFourFunctionApi':True,'sameFixtureUnitAcrossV2RedGreen':True,'oldGreenHelperDifferenceOnlyCaptureFunction':True,'v1ProofSpecSha256':sha(V1/'proof-specification.json'),'v1ActualRedFrame':52,'v2FuturePrimaryPostconditionFrame':primaryAfter,'v2RuntimeProof':'UNEXECUTED','actualApplication':'UNEXECUTED_NOT_RELEASED'})
wj('normalization-and-equivalence-proof.json',{'method':'Text/hash/JSON operations only, no program parse/compiler/test','v2FixtureWithFailureStateRepresentationRevertedEqualsV1Exactly':True,'v2HelperWithOnlyAsciiPredicateRevertedEqualsV1Exactly':True,'v2OldHelperWithOnlyAsciiPredicateRevertedEqualsV1OldExactly':True,'v2UnitWithOnlyTypeSpyAndStringRepresentationsRevertedEqualsV1Exactly':True,'same37LiteralNamesAndOrder':True,'all15OriginalNativeExpectSpansExact':True,'originalSixCaseDeclarationAndTimersAndBothFinallySpansPreservedViaExactNormalization':True,'actualFakeProcessKillInvocationsUnchanged':True,'originalSigstopRecordingLoopsUnchanged':True,'spyBeforeEachAndAfterEachRestorationPreserved':True,'noNewLintSuppressions':True,'existingImportJustificationExact':True,'noOriginalAssertionsRemovedOrExpectedValuesChanged':True,'v1ValidRuntimeProofAndFailedLintUnchanged':True,'v2PrimaryLine':primaryAfter,'oldLine52NotRelabeled':True,'asciiEquivalence':{'oldRejectedSet':'U+0000 through U+001F inclusive, and U+007F','newPredicate':'For each StringIterator character, first UTF16 code unit <=0x1f or ===0x7f','proof':'Each ASCII code point is one identical UTF16 unit; every nonASCII scalar begins with a code unit >=128 and isolated surrogates are >=0xD800, so neither predicate rejects it. Empty strings yield false in both. Both are existential over the same ASCII-member set; command trim and all other row predicates remain exact.','nonAsciiAndSurrogatesUnchanged':True,'executionOrNewTestMatrix':False},'callbackEquivalence':'Only failure boolean storage becomes a typed mutable object property. Initfalse/catchtrue/afterawaitread/closedthrow and synchronous listener-capture-marker-cancel sequence remain exact after representation normalization. No callback await, timer or new promise.'})
findings=json.loads((O/'complete-findings-before-fix.json').read_text())['findings'];mapped=[]
for row in findings:
 rule=row['rule'];p=row['file'];oldLine=b[p].splitlines()[row['line']-1]
 if rule=='@typescript-eslint/no-unnecessary-condition':cause='C1_TYPED_MUTABLE_FAILURE_STATE';needle='inventoryState.failed';targetLine=row['line']
 elif rule=='no-control-regex':cause='C2_EQUIVALENT_ASCII_CONTROL_PREDICATE';needle='Array.from(command)';targetLine=row['line']
 elif rule=='@typescript-eslint/restrict-template-expressions':
  cause='C3_EXPLICIT_NUMERIC_STRING_CONVERSION';needle='String(row.pid)' if row['column'] in [54,85] else 'String(row.ppid)';targetLine=row['line']+2
 else:cause='C4_TYPED_STORED_KILL_SPY';needle='killSpy';targetLine=row['line']+2
 line=a[p].splitlines()[targetLine-1];assert needle in line;mapped.append({**row,'status':'FIXED_IN_CANDIDATE_UNEXECUTED','cause':cause,'v2Line':targetLine,'v2Column':line.index(needle)+1,'replacement':needle,'oldContextSha256':hashlib.sha256(oldLine.encode()).hexdigest(),'newContextSha256':hashlib.sha256(line.encode()).hexdigest(),'gateRerun':False,'independentQa':'PENDING'})
assert len(mapped)==23;wj('complete-resolution-notes.json',{'all23Mapped':True,'causeCounts':dict(Counter(r['cause'] for r in mapped)),'findings':mapped,'lintOrTypeGateClaim':'UNEXECUTED_V2','originalLintGate':'FAIL_RETAINED','storyFileListAndQaResultsEdited':False,'selfApproval':False})
print(json.dumps({'all23Mapped':True,'fourCauses':dict(Counter(r['cause'] for r in mapped)),'v2PrimaryLine':primaryAfter,'paths':rows,'checksExecuted':False},indent=2))
