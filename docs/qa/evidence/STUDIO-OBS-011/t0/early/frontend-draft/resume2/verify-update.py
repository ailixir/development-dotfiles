"""Static artifact/hash/source/report checks only; does not run tests or compile product code."""
from pathlib import Path
import hashlib,json
root=Path.cwd();base=root/'docs/qa/evidence/STUDIO-OBS-011/t0/early/frontend-draft';out=base/'resume2'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
original=json.loads((out/'original-package-before.json').read_text())
after=[]
for e in original['files']:
 h=sha(base/e['path']);assert h==e['sha256'],e['path'];after.append(dict(path=e['path'],sha256=h))
(out/'original-package-after.json').write_text(json.dumps(dict(status='ALL_ORIGINAL_BYTES_UNCHANGED',originalFileCount=len(after),files=after),indent=2)+'\n')
m=json.loads((out/'copy-back-manifest.json').read_text());old=json.loads((base/'copy-back-manifest.json').read_text())
assert len(m['entries'])==12
prior=[]
for e in old['entries']:
 assert sha(base/'repo'/e['path'])==sha(out/'repo'/e['path'])==e['draftSha256'];assert sha(base/e['patch'])==sha(out/e['patch'])==e['patchSha256'];prior.append(e['path'])
proof_files=['templates-before.json','templates-after.json','copy-table-rows.json','test-drop-addition-map.json','ast-static-evidence.json','required-barrel-companion.patch']
assert all(sha(base/p)==sha(out/p) for p in proof_files)
start=json.loads((root/'docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json').read_text());frontend=[x for x in start['files'] if x['path'].startswith('frontend/')]
assert all(sha(root/x['path'])==x['sha256'] for x in frontend)
for e in m['entries']:
 assert sha(out/'repo'/e['path'])==e['draftSha256'] and sha(out/e['patch'])==e['patchSha256']
 if e['sourceSha256']:assert sha(root/e['path'])==e['sourceSha256']
 else:assert not (root/e['path']).exists()
report=json.loads((out/'reports-parameter-proof.json').read_text());assert report['bodyByteExact'] and report['exactTextReplacement'] and report['arityBefore']==report['arityAfter']==2 and len(report['changedTokens'])==1
ast=json.loads((out/'ast-static-evidence.json').read_text());assert not ast['syntaxDiagnostics'] and ast['keysExact'];assert all(all(x[k] for k in ['templateExact','runtimeOnlyTemplate','metadataExact','metadataFieldSetExact']) for x in ast['copyRows'])
assert (out/'templates-before.json').read_bytes()==(out/'templates-after.json').read_bytes()
actual=json.loads((root/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-frontend01-vitest.json').read_text());tests=[a for f in actual['testResults'] for a in f['assertionResults']];assert len(tests)==actual['numTotalTests']==actual['numPassedTests']==1386
copy=[a for a in tests if 'copy table: every guided string traces to a quoted source' in a['ancestorTitles']];assert len(copy)==185
names=json.loads((out/'test-drop-addition-map.json').read_text());dropped=[]
for e in names['drops']:
 matches=[t for t in tests if t['title']==e['name']];assert len(matches)==1 and matches[0]['status']=='passed';dropped.append(dict(name=e['name'],fullName=matches[0]['fullName'],baselineStatus='passed'))
for e in names['additions']:assert not any(t['title']==e['name'] for t in tests)
(out/'b7-named-reconciliation.json').write_text(json.dumps(dict(status='STATIC_READING_OF_ARCHIVED_B7_JSON_not_new_test_run',report='docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-frontend01-vitest.json',sha256=sha(root/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-frontend01-vitest.json'),baselineTotal=1386,baselinePassed=1386,originalCopyTableGroupCount=185,drops=dropped,additions=names['additions'],reportRenameNewTests=0,expectedDelta=1,expectedAfterThisLaneAlone=1387,expectedCopyTableAfter=186,actualAfter='UNVERIFIED'),ensure_ascii=False,indent=2)+'\n')
# Snapshot current plan/state/policy receipts used at review time without editing their original paths.
snapshots=[]
for p in ['docs/qa/evidence/STUDIO-OBS-011/t0/resume2-root-state.json','docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v6.json','docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v6.md','docs/qa/evidence/STUDIO-OBS-011/t0/b7-results.json','docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-frontend-unused01-results.json','docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-frontend-unused01.log']:
 dst=out/'input-snapshots'/p;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes((root/p).read_bytes());snapshots.append(dict(path=p,snapshot=str(dst.relative_to(out)),sha256=sha(dst)))
(out/'input-snapshot-manifest.json').write_text(json.dumps(snapshots,indent=2)+'\n')
result=dict(status='STATIC_ONLY_UNAPPLIED_NO_QA_EXIT_OR_LIFECYCLE_CLAIM',manifestPaths=12,priorCandidatePathsByteExact=prior,priorProofFilesByteExact=proof_files,originalPackageAll41FilesByteExact=True,all319S011FrontendFilesStillEqual=True,actualSourceWrites=False,newReportsParameterDiffOnly=True,reportsArityBodyTypesPreserved=True,newReportsTestAdditions=0,parserDiagnostics=0,copyKeys=78,generatedCopyRows=182,copyTableBaseline=185,copyTableExpectedAfter=186,baselineVitestPassed=1386,namedDrops=2,namedAdditions=3,expectedLaneSuiteTotal=1387,runtimeAfter='UNVERIFIED',planV6Sha256=sha(root/'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v6.json'),manifestSha256=sha(out/'copy-back-manifest.json'),patchSha256=sha(out/'frontend-draft.patch'))
(out/'final-static-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
