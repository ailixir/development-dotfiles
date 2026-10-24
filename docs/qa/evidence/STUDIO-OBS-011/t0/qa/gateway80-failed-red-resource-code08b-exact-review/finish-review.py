"""Seal bounded review and verify unchanged source packet; no target execution."""
from pathlib import Path
import ast, hashlib, json, stat
R=Path.cwd();D=Path(__file__).absolute().parent;T=D.parent.parent
B=T/'early/gateway80-failed-red-resource-prep/resume8b'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def info(p):
    raw=p.read_bytes();s=p.lstat()
    assert stat.S_ISREG(s.st_mode) and stat.S_IMODE(s.st_mode)==0o644
    return dict(path=str(p.relative_to(R)),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(s.st_mode))
def put(n,v):
    with (D/n).open('x') as f:json.dump(v,f,indent=2);f.write('\n')
adopt=T/'resume2-gateway-failed-resource-source08-all-findings-root-adoption.json'
adoptpin=info(adopt);assert adoptpin['sha256']=='1e70ebf9a8a07eea2107d74783e0e0be8150183aa356414673b1a25705161706'
a=json.loads(adopt.read_bytes())
handoff=R/'docs/qa/evidence/STUDIO-OBSERVED-NEXT/RESUME-HANDOFF-20261019-CODEX.md'
refs=json.loads((B/'unchanged-proof-references.json').read_bytes())
conditions=dict(kind='QUINN_SOURCE08B_FULL_CURRENT_AND_INHERITED_CONDITIONS',source08CompleteRootAdoption=adoptpin,
    completeSource08Findings={n:r['completeFindings'] for n,r in a['reviews'].items()},
    completeSource08Conditions={n:r['completeConditions'] for n,r in a['reviews'].items()},
    completeCurrentAndInheritedReferences=refs['completeConditionCarriers'],
    completePhaseBRetainedConditions=json.loads((B.with_name('resume8')/'phase-b-authorization-bindings.json').read_bytes())['completeRulingAndConditions'],
    completePhaseAReference=info(B.with_name('resume8')/'phase-a-impact.json'),
    currentHandoff=info(handoff),
    fullTransitiveConditionsRemainByExactCompleteReferences=True,allActualGatesOwed=True,
    source08ImmutableHold=True,rootAcknowledgmentOfBothCurrentReviewsAndAllFindingsConditionsOwed=True,
    technicalOwnerFollowupSeparate=True,technicalOwnerDecisionIssued=False,
    reconnectionBlocker='Tool29815 unavailable. Root last read-only ps reports wrapper3720/shell3749 alive at recorded start; no new query/restart or runtime authority.',
    actualAuthority=False,credit=False,sharedUsd500Aggregate='UNKNOWN')
put('conditions.json',conditions)
status=json.loads((D/'dispatcher-command-status.json').read_bytes());result=json.loads((D/'dispatcher-results.json').read_bytes())
assert status['actualExternalExit']==0 and status['executions']==1 and result['passed']==45 and result['failure'] is None and result['realBoundaryCalls']==[]
assert (D/'dispatcher-results.json').read_bytes()==(B/'dispatcher-results.json').read_bytes()
bindings=json.loads((B/'static-bindings.json').read_bytes())
for r in bindings['unchangedComponents']:
    body=ast.parse((B/r['path']).read_bytes()).body
    for part in r['component'].split('.'):
        item=next(n for n in body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name==part);body=item.body
    assert sha(ast.dump(item,include_attributes=False).encode())==r['sha256']
subject=info(B/'manifest.json');assert subject['sha256']=='7fec05dfe1ea4d59447b10f2b79ed9516c0a56fce51236581381edc001f7e8e6' and subject['bytes']==6592
m=json.loads((B/'manifest.json').read_bytes())
for row in m['files']:
    actual=info(B/row['path']);assert all(actual[k]==row[k] for k in ('sha256','bytes','mode'))
assert set(p.name for p in B.iterdir())=={row['path'] for row in m['files']}|{'manifest.json','SHA256SUMS'}
expected={row['path']:row['sha256'] for row in m['files']};expected['manifest.json']=subject['sha256']
lines=(B/'SHA256SUMS').read_text().splitlines();assert len(lines)==34 and {p:h for h,p in (line.split('  ',1) for line in lines)}==expected
put('post-replay-packet-verification.json',dict(subject=subject,all33PayloadHashesBytesModesMembershipRechecked=True,all34ChecksumsRechecked=True,sourcePacketUnchanged=True,independentResultByteExactToAuthorResult=True,all11DeclaredASTHashesVerified=True,dispatcherExecutions=1,oldSuiteExecutions=0,actualTargetEffects=0))
verdict='PASS_BOUNDED_SOURCE_ONLY_ALL_ACTUAL_AUTHORITY_HOLD'
put('findings.json',dict(kind='QUINN_SOURCE08B_COMPLETE_FINDINGS',reviewer='Quinn',subject=subject,verdict=verdict,
    mandatoryFindingCount=0,mandatoryFindings=[],advisories=[],allMandatoryFindingsTogether=True,
    disposition=[dict(id='FR08-REGISTERED-READER-PATH-ALIAS-BYPASS',status='CORRECTED_IN_EXACT_SOURCE08B',oldSource08HoldRetained=True,
        explanation='Approved self.s.path constructor precedes membership and same normalized object flows to bound/fallback. Independent real System/Custody four-callback synthetic alias replay verifies accepted, wrongmode before body, wronghash before use and unchanged unregistered policy.')],
    findingsConditionsReference=info(D/'conditions.json'),sourceOnly=True,ownerDecisionIssued=False,actualRuntimeAuthority=False))
put('review-record.json',dict(kind='INDEPENDENT_QUINN_EXACT_SOURCE08B_REVIEW',subject=subject,verdict=verdict,
    sourceOnly=True,mandatoryFindingCount=0,currentDispatcherAssertions=45,currentFixedScenarios=4,currentHarnessExecutions=1,
    inherited41SevenCases='EXACT_COMPONENT_PROOF_REUSE_ONLY_NOT_RERUN',staticChecks=198,staticPinRecords=72,
    staticAuthorErrorPreserved='static-attempt01.json',commandStatusReference=info(D/'dispatcher-command-status.json'),
    independentResultReference=info(D/'dispatcher-results.json'),oneSinkLauncherReference=info(D/'replay-launcher.py'),
    oneSinkDeltaReference=info(D/'one-sink-source-delta.patch'),exactReplayBindingsReference=info(D/'replay-bindings.json'),
    fullConditionsReference=info(D/'conditions.json'),reviewProseReference=info(D/'review.md'),
    allActualGatesOwed=True,ownerDecisionIssued=False,phaseBEntered=False,actualAuthority=False,
    originalPrivateBodyStatHashAcquired=False,actualTargetEffects=0,credit=False,storyCompletion=False,sharedUsd500Aggregate='UNKNOWN'))
files=[]
for p in sorted(D.iterdir()):
    row=info(p);row['path']=p.name;files.append(row)
put('manifest.json',dict(kind='INDEPENDENT_QUINN_SOURCE08B_EXACT_REVIEW_SEAL',subject=subject,verdict=verdict,
    files=files,manifestSelfExcluded=True,checksumCompanionExcluded=True,allActualAuthority='HOLD',technicalOwnerDecisionIssued=False,credit=False))
manifest=info(D/'manifest.json')
with (D/'SHA256SUMS').open('x') as f:
    for row in files:f.write(row['sha256']+'  '+row['path']+'\n')
    f.write(manifest['sha256']+'  manifest.json\n')
print(json.dumps(dict(reviewManifest=manifest,payloads=len(files),checksumRows=len(files)+1,reviewRecord=info(D/'review-record.json'),reviewProse=info(D/'review.md'),verdict=verdict)))
