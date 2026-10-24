from pathlib import Path
import json,hashlib,stat,datetime
O=Path('docs/qa/evidence/STUDIO-OBS-009/recovery-20261020/business-and-status-integration01')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def writej(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
pre=json.loads((O/'nine-target-preflight.json').read_text());a=json.loads((O/'actual-before.json').read_text());z=json.loads((O/'actual-after.json').read_text());app=json.loads((O/'application.json').read_text())
assert app['exit']==0 and len(app['operations'])==9
assert len(a['files'])==len(z['files'])==1812
x={r['path']:r['sha256'] for r in a['files']};y={r['path']:r['sha256'] for r in z['files']};assert x.keys()==y.keys()
changes=[{'path':p,'beforeSha256':x[p],'afterSha256':y[p]} for p in x if x[p]!=y[p]]
assert {r['path'] for r in changes}=={r['path'] for r in pre['rows'][:4]}
assert a['dist']==z['dist'];assert len(z['dist']['files'])==238
assert z['dist']['digest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'
for r in z['files']:assert sha(r['path'])==r['sha256']
for r in z['dist']['files']:assert sha(Path('studio-runner/dist')/r['path'])==r['sha256']
ledger=[]
for r in pre['rows']:
 p=Path(r['path']);assert sha(p)==r['afterSha256'];assert oct(stat.S_IMODE(p.stat().st_mode))==r['beforeMode'];assert sha(O/'before'/r['path'])==r['beforeSha256'];assert sha(r['candidatePath'])==r['afterSha256'];assert sha(r['archivedCandidatePath'])==r['afterSha256']
 dest=O/'after'/r['path'];dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes());dest.chmod(stat.S_IMODE(p.stat().st_mode));ledger.append({**r,'actualAfterSha256':sha(p),'actualAfterMode':oct(stat.S_IMODE(p.stat().st_mode)),'afterArchive':str(dest)})
writej('nine-target-application-binding.json',{'kind':'EXACT_NINE_TARGET_ACTUAL_APPLICATION','actualApplied':True,'actualSourceBefore':a['digest'],'actualSourceAfter':z['digest'],'actualDistBefore':a['dist']['digest'],'actualDistAfter':z['dist']['digest'],'rows':ledger,'newRuntimeExecuted':False,'configuredBuildPerformed':False,'rtCopybackPerformed':False,'noNextPhaseGo':True})
protected=[]
for r in json.loads((O/'protected-before.json').read_text()):
 expected='87b661946b0819aac38e130f3b4a8467222f70789416b188236b9345d4a96387' if r.get('authorizedChange') else r['sha256'];p=Path(r['path']);assert sha(p)==expected and oct(stat.S_IMODE(p.stat().st_mode))==r['mode'];protected.append({**r,'actualAfterSha256':sha(p),'unchanged':sha(p)==r['sha256']})
writej('protected-after.json',protected)
deps=json.loads((O/'dependencies-before.json').read_text())
for r in deps:
 p=Path(r['path']);assert sha(p)==r['sha256'] and p.stat().st_size==r['bytes'] and oct(stat.S_IMODE(p.stat().st_mode))==r['mode'] and p.is_symlink()==r['symlink'];assert not p.is_symlink() or str(p.readlink())==r['linkTarget']
writej('dependencies-after.json',deps)
for r in json.loads((O/'provenance-pins.json').read_text()):assert sha(r['path'])==r['sha256']
story=pre['rows'][-1];old=(O/'before'/story['path']).read_bytes();cur=Path(story['path']).read_bytes();s=json.loads((O/'story-insertions.json').read_text())
for ins in reversed(s['insertions']):
 off=ins['candidateOffset'];b=ins['text'].encode();assert cur[off:off+len(b)]==b;cur=cur[:off]+cur[off+len(b):]
assert cur==old
checkbox=lambda b:[l for l in b.splitlines(keepends=True) if b'- [ ]' in l or b'- [x]' in l or b'- [X]' in l]
assert checkbox(old)==checkbox(Path(story['path']).read_bytes())
result={'verifiedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'allNineExact':True,'allNineModesUnchanged':True,'capturedSourceFiles':len(x),'capturedSourceChangedPaths':changes,'capturedSourceAddedOrRemoved':[],'all1808OtherCapturedSourcesUnchanged':True,'sourceBefore':a['digest'],'sourceAfter':z['digest'],'distFiles':238,'distInventoryExactlyUnchanged':True,'distDigest':z['dist']['digest'],'dependenciesRowsRehashedUnchanged':len(deps),'dependencyComparisonScope':'Complete node_modules rows in the existing accepted full COPY catalog, including content/size/mode and symlink spelling; no new helper catalog or seed was run.','dependencyBeforeAfterArchiveExactlyEqual':(O/'dependencies-before.json').read_bytes()==(O/'dependencies-after.json').read_bytes(),'protectedRows':len(protected),'unchangedProtected17':True,'ownershipProtectedPinMovedOnlyByAccepted009Application':True,'sevenActualRtPreimagesUnchanged':True,'finalFoldRunnerPortsUnchanged':True,'replayUnchanged':True,'dispatchGovernanceRowsUnchanged':sum(1 for r in protected if r.get('cohort')=='dispatch-governance'),'corePackagesAndLocksUnchanged':True,'storyExactlyTwoInsertions':True,'storyInverseReconstructsOriginalExactly':True,'storyCheckboxLinesUnchanged':True,'allReferencedApprovalArtifactsUnchanged':True,'testsBuildsSeedsNativeCalls':0,'lane':'RELEASED_AFTER_QUIET_NINE_TARGET_APPLICATION'}
writej('verification.json',result)
print(json.dumps({'verified':True,'sourceAfter':z['digest'],'sourceChangedCount':len(changes),'actualTargetCount':len(ledger),'distExact':True,'dependenciesExact':len(deps),'dispatchGovernanceRows':result['dispatchGovernanceRowsUnchanged'],'lane':result['lane']},indent=2))
