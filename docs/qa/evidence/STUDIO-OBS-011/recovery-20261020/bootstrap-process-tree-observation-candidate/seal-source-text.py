from pathlib import Path
import json,re,hashlib,difflib
R=Path.cwd();O=Path(__file__).resolve().parent;fixture='studio-runner/test/fixtures-tier/observed-bootstrap-process-tree.test.ts';helper='studio-runner/test/helpers/bootstrapProcessTreeObservation.ts';unit='studio-runner/test/run/bootstrapProcessTreeObservation.test.ts';paths=[fixture,helper,unit]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
old=(O/'before'/fixture).read_text();new=(O/'after'/fixture).read_text();edits=json.loads((O/'fixture-edit-ledger.json').read_text());work=old;positioned=[]
for e in edits:
 assert work.count(e['before'])==1;offset=work.index(e['before']);work=work[:offset]+e['after']+work[offset+len(e['before']):];positioned.append({**e,'offsetInResultingStage':offset})
assert work==new;restored=new
for e in reversed(positioned):
 offset=e['offsetInResultingStage'];assert restored[offset:offset+len(e['after'])]==e['after'];restored=restored[:offset]+e['before']+restored[offset+len(e['after']):]
assert restored==old and sha(R/fixture)==sha(O/'before'/fixture)=='7b928dc51eef99343cdeefdb1cbf8055c70b7d46c2ed086073ec380f92c17fb1'
wj('exact-inverse-edit-ledger.json',positioned)
assert not (R/helper).exists() and not (R/unit).exists()
originalExpect=re.findall(r'expect\([^\n]*?;',old);candidateExpect=re.findall(r'expect\([^\n]*?;',new);assert originalExpect==candidateExpect and len(originalExpect)==15
caseLine=next(line for line in old.splitlines() if line.startswith('it.each('));assert caseLine in new
stop="if(phase!=='committed-before-ready-orderly'&&phase!=='ready-received-stop')for(const p of pids){try{process.kill(p,'SIGSTOP');suspended.push(p);}catch{throw Error('LIVE_TREE_CHANGED');}}";assert old.count(stop)==new.count(stop)==1
finalInner='}finally{await app.drain();}';finalOuter=next(line for line in old.splitlines() if '}finally{for(const pid of suspended)' in line);assert old.count(finalInner)==new.count(finalInner)==1 and finalOuter in new
for timer in ['1300','1500','4000','10000','5000','30000']:assert old.count(timer)==new.count(timer)
expected=json.loads((O/'proof-specification.json').read_text())['expectedUnitIdentities'];unitText=(O/'after'/unit).read_text();caseNames=re.findall(r'^  it\(("(?:[^"\\]|\\.)*"), \(\) => \{$',unitText,re.M);caseNames=[json.loads(n) for n in caseNames];assert caseNames==[r['title'] for r in expected] and len(caseNames)==37
primaryLine=next(i+1 for i,line in enumerate(unitText.splitlines()) if 'COHERENT_CAPTURE_INVENTORY_POSTCONDITION' in line)
for p in paths:
 src=O/'old-algorithm'/p if p==helper else O/'after'/p;dest=O/'red'/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(src.read_bytes())
rows=[]
for p in paths:
 before=(O/'before'/p).read_text() if p==fixture else '';after=(O/'after'/p).read_text();beforeName='a/'+p if p==fixture else '/dev/null';afterName='b/'+p
 forward=''.join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile=beforeName,tofile=afterName));inverse=''.join(difflib.unified_diff(after.splitlines(keepends=True),before.splitlines(keepends=True),fromfile='a/'+p,tofile='b/'+p if p==fixture else '/dev/null'))
 for folder,text in [('patches',forward),('inverse-patches',inverse)]:
  dest=O/folder/(p+'.patch');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text)
 rows.append({'path':p,'beforeExists':p==fixture,'beforeSha256':sha(O/'before'/p) if p==fixture else None,'afterSha256':sha(O/'after'/p),'redSha256':sha(O/'red'/p),'candidatePath':str((O/'after'/p).relative_to(R)),'redCandidatePath':str((O/'red'/p).relative_to(R)),'actualApplied':False})
(O/'combined.patch').write_text(''.join((O/'patches'/(p+'.patch')).read_text() for p in paths));(O/'combined.inverse.patch').write_text(''.join((O/'inverse-patches'/(p+'.patch')).read_text() for p in reversed(paths)))
(O/'red-overlay.patch').write_text(''.join(''.join(difflib.unified_diff(((O/'before'/p).read_text() if p==fixture else '').splitlines(keepends=True),(O/'red'/p).read_text().splitlines(keepends=True),fromfile='a/'+p if p==fixture else '/dev/null',tofile='b/'+p)) for p in paths))
(O/'product-helper-green.patch').write_text(''.join(difflib.unified_diff((O/'red'/helper).read_text().splitlines(keepends=True),(O/'after'/helper).read_text().splitlines(keepends=True),fromfile='a/'+helper,tofile='b/'+helper)))
(O/'product-helper-green.inverse.patch').write_text(''.join(difflib.unified_diff((O/'after'/helper).read_text().splitlines(keepends=True),(O/'red'/helper).read_text().splitlines(keepends=True),fromfile='a/'+helper,tofile='b/'+helper)))
assert (O/'red'/unit).read_bytes()==(O/'after'/unit).read_bytes() and (O/'red'/fixture).read_bytes()==(O/'after'/fixture).read_bytes()
wj('source-preservation.json',{'method':'Exact declared string substitutions, full in-memory offset-based inverse reconstruction and literal text-span comparison only; NO parser/AST/compiler executed','originalFixtureSha256':sha(O/'before'/fixture),'candidateFixtureSha256':sha(O/'after'/fixture),'inverseReconstructsOriginalExactly':True,'allBytesOutsideEightDeclaredSubstitutionsPreserved':True,'originalSixModeDeclarationExact':caseLine,'all15OriginalExpectStatementSpansExactAndOrdered':True,'expectStatementSpans':originalExpect,'originalStrictSigstopAndImmediateRecordingExact':stop,'originalInnerFinallyExact':finalInner,'originalOuterFinallyEntireLineExact':True,'originalTimerStringMultiplicitiesPreserved':{t:old.count(t) for t in ['1300','1500','4000','10000','5000','30000']},'original1000PerPidQueryLimitMigratedToOneCoherentSnapshotLimit':True,'nativeRuntimeExecution':False,'compilerOrAstProof':'UNEXECUTED_NOT_CLAIMED','unitLiteralCaseNamesExact37':True,'unitRuntimeDiscoveryCount':'UNMEASURED','primaryAssertionLine':primaryLine,'sameUnitAndFixtureBuffersAcrossRedGreen':True,'newSourceFilesBeforeAbsent':True})
wj('application-binding-unexecuted.json',{'kind':'UNAPPLIED_THREE_TEST_TIER_FILE_CANDIDATE','paths':rows,'onlyThreePaths':True,'oldAlgorithmHelperSha256':sha(O/'old-algorithm'/helper),'sameCompleteApiAndOtherHelperBytes':json.loads((O/'capture-algorithm-bindings.json').read_text())['allOtherHelperBytesIdentical'],'primaryOldRedExpected':{'file':unit,'line':primaryLine,'fullName':expected[0]['fullName'],'postcondition':'COHERENT_CAPTURE_INVENTORY_POSTCONDITION','expected':'complete child/PID/label inventory and undefined failureCode','oldActualExpected':'capture undefined and failureCode ESRCH','notSetupOrMissingApi':True,'executed':False},'newGreenExpectedLiteralRows':expected,'actualDefaultBaseline':{'total':2676,'passed':2651,'skipped':25,'source':'runner-functional-base-phase2-execution01/unit-reconciliation.json'},'futureFullUnitPredictionOnly':{'total':2713,'passed':2688,'skipped':25,'executed':False},'actualApplicationGo':False,'nativeGo':False,'independentCandidateQa':'PENDING'})
print(json.dumps({'threeSourcePaths':rows,'originalExpectSpans':15,'sixModesUnchanged':True,'primaryAssertionLine':primaryLine,'declaredLiteralUnitCases':37,'parseCompileRuntime':False},indent=2))
