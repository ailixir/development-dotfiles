"""Read-only/light-Python package verification. No source application or Java/tool execution."""
from pathlib import Path
import ast,json,re,hashlib,collections
OUT=Path(__file__).resolve().parent
ROOT=next(p for p in OUT.parents if (p/'AGENTS.md').is_file())
REL=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
sha=lambda b:hashlib.sha256(b.encode() if isinstance(b,str) else b).hexdigest()
def apply(original,patch):
    source=original.splitlines(True); lines=patch.splitlines(True); output=[];cursor=0;i=2
    assert lines[0].startswith('--- a/') and lines[1].startswith('+++ b/')
    while i<len(lines):
        m=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i]);assert m,lines[i]
        old_start=int(m[1]);old_n=int(m[2] or 1);new_n=int(m[4] or 1);start=old_start-1 if old_n else old_start
        assert start>=cursor;output+=source[cursor:start];cursor=start;i+=1;oc=nc=0
        while i<len(lines) and not lines[i].startswith('@@ '):
            line=lines[i];kind=line[0];value=line[1:]
            assert kind in ' +-'
            if kind in ' -':assert source[cursor]==value,(cursor,source[cursor],value);cursor+=1;oc+=1
            if kind in ' +':output.append(value);nc+=1
            i+=1
        assert (oc,nc)==(old_n,new_n)
    output+=source[cursor:];return ''.join(output)

def main():
    for path in OUT.rglob('*.py'):ast.parse(path.read_text(),filename=str(path))
    before=json.loads((OUT/'immutable-package-before.json').read_text())
    for name,digest in before.items():assert sha((OUT.parent/name).read_bytes())==digest,('IMMUTABLE_PACKAGE_CHANGED',name)
    for row in json.loads((OUT/'input-hashes.json').read_text()):assert sha((ROOT/row['path']).read_bytes())==row['sha256'],('FROZEN_INPUT_CHANGED',row['path'])
    original=(OUT/'ReplayIT.original.java').read_text();assert sha(original)=='b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'
    stages=json.loads((OUT/'stages.json').read_text());by_sha={sha(original):original};patches=0
    for s in stages:
        candidate=(OUT/'stages'/s['stage']/'repo'/REL).read_text();assert sha(candidate)==s['candidateSha256'];by_sha[sha(candidate)]=candidate
        for name,key,base in [('incremental.patch','incrementalPatchSha256',by_sha[s['sourceSha256']]),('from-original.patch','fromOriginalPatchSha256',original)]:
            p=(OUT/'stages'/s['stage']/name).read_text();assert sha(p)==s[key];assert apply(base,p)==candidate;patches+=1
    base=by_sha[stages[0]['candidateSha256']]
    plans=json.loads((OUT/'mutation-plan.json').read_text())
    for folder,names in [('variants',['reversed-orders']),('mutations',[m['id'] for m in plans['mutants']]),('negative-controls',[m['id'] for m in plans['contentNegativeControlsPrepared']])]:
        for name in names:
            path=OUT/folder/name;candidate=(path/'repo'/REL).read_text()
            assert apply(base,(path/'from-test001.patch').read_text())==candidate
            assert apply(candidate,(path/'restore-test001.patch').read_text())==base;patches+=2
    assert patches==34 # Original32 preserved, explicit new force-true subset pair adds2.
    loops=json.loads((OUT/'loop-sites.json').read_text());edits=json.loads((OUT/'poll-edits.json').read_text())
    for s in stages:
        candidate=by_sha[s['candidateSha256']]
        for l,e in reversed(list(zip(loops,edits))):
            assert original[l['start']:l['end']]==e['source']==l['source']
            if l['rows'][0]['batch'] in s['batches'] and not set(l['ids']).intersection(s.get('carriedPollIds',[])):
                assert candidate.count(e['replacement'])==1
                candidate=candidate.replace(e['replacement'],e['source'],1)
        assert candidate==base,('NONLOCAL_CONVERSION_EDIT',s['stage'])
    rows=json.loads((OUT/'row-classification-proof-map.json').read_text());assert len(rows)==95
    assert collections.Counter(r['class'] for r in rows)=={'POLL':74,'DELIBERATE':21}
    for e in edits:
        n=e['ids'][0];block=e['replacement'];assert block.count('org.awaitility.Awaitility.await(')==1
        assert '.pollInSameThread().dontCatchUncaughtExceptions().ignoreNoExceptions()' in block
        assert f'while (!itr{n:03d}.terminal)' in block
        assert 'Math.max(itrRemaining' in block and 'itrOwed' in block
        assert 'intervalOwed' in block and 'owedUntil' in block
        if n in [83,86]:
            read=('P3_FINAL_REPORTS.get(execution)' if n==83 else 'p3Call(p3Cookie,')
            assert block.count(read)==1
            assert block.index(read)<block.index('if (!(',block.index('java.util.concurrent.Callable'))
        if n==84:
            assert block.count('privateImmutableJson(')==1
            assert 'H8: expired teardown not CONFIRMED within 120 s' in block
            assert 'methodReturned = true;' in block
    for m in plans['mutants']:
        candidate=(OUT/'mutations'/m['id']/'repo'/REL).read_text();assert sha(candidate)==m['mutantSha256']
        if m['id'] in ['M-empty-canaries','M-missing-admitted','M-missing-dispatch','M-gate-true-subset']:
            assert 'scanCompleteAuditStream(String itrBoundary, boolean itrDrained, boolean itrContextClosed) throws Exception' in candidate
            assert candidate.count('itrFinalFaultActive = true;')==1
            assert 'privacy-itr-final-fault-' in candidate
            assert 'scanCompleteAuditStream("OWNED_SINKS", drained, ownedApplicationQuiescent)' in candidate
            assert 'scanCompleteAuditStream("CONTEXT_CLOSED", finalProducersDrained, ownedApplicationQuiescent)' in candidate
            assert '    itrEstablishOwnAuditCorpus();\n    scanAuditContent();\n    itrAssertAuditCorpus();' in candidate
    bindings=json.loads((OUT/'scratch/source-bindings.json').read_text());assert bindings['javaSha256']==sha((OUT/'scratch/ItrWaitDifferentialScratch.java').read_bytes())
    assert len(bindings['blocks'])==20
    for b in bindings['blocks']:
        e=next(e for e in edits if e['ids'][0]==b['row']);l=next(l for l in loops if l['ids'][0]==b['row'])
        assert b['originalBlockSha256']==sha(l['source']);assert b['correctedBlockSha256']==sha(e['replacement'])
        assert b['instrumentedBlockSha256']==sha((OUT/b['path']).read_bytes())
    commands=json.loads((OUT/'future-commands.json').read_text())['commands']
    full=[r for r in commands if 'full-class' in r['kind']];assert len(full)==12
    for r in full:
        c=r['command'];assert r['fullClassSlotCost']==1
        assert '--test-tasks test,guidedIncrementalTest' in c and '--require-exec-tasks test,guidedIncrementalTest' in c
        assert "test --tests 'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'" in c
        assert "guidedIncrementalTest --tests 'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'" in c
        assert all(x in c for x in ['--continue','--rerun-tasks','--no-daemon'])
    static=json.loads((OUT/'static-review.json').read_text());assert all(s['originalAssertionStatements']==2686 and s['orderedAnnotatedTestMethods']==74 and s['embeddedTextBlockCount']==10 for s in static['stages'])
    refresh=json.loads((OUT/'input-refresh-policy.json').read_text())['reviewedChange']
    assert sha((ROOT/refresh['path']).read_bytes())==refresh['afterSha256']
    if (OUT/'manifest.json').exists():
        for r in json.loads((OUT/'manifest.json').read_text())['artifacts']:
            p=OUT/r['path'];assert p.is_file() and not p.is_symlink() and sha(p.read_bytes())==r['sha256'] and p.stat().st_size==r['bytes']
    inherited=json.loads((OUT/'inherited-resume2-manifest.json').read_text())
    assert sha((OUT.parent/'resume2/manifest.json').read_bytes())=='e420cd11a86d47c5f20d445d6ca7cbcaa0e601a86dfcc07e6c92ecc83c07f6cf'
    for row in inherited['artifacts']:
        old=OUT.parent/'resume2'/row['path'];assert sha(old.read_bytes())==row['sha256'] and old.stat().st_size==row['bytes']
    preservation=json.loads((OUT/'resume3-preservation.json').read_text())
    for row in preservation['supportedArtifactsByteExact']:
        assert sha((OUT/row['path']).read_bytes())==row['sha256']
    assert preservation['protectedSourceCount']==19 and preservation['protectedPatchCount']==34
    contracts=json.loads((OUT/'checker-contract-witnesses.json').read_text())
    assert contracts['checkerSha256']==sha((OUT/'verify_mutation_run.py').read_bytes())
    assert contracts['accepted']==7 and contracts['rejected']==99
    assert all(r['expected']==r['actual'] and r['fakeOnly'] is True and r['rawStatusUnchanged'] is True for r in contracts['results'])
    profile=json.loads((OUT/'profile-proof-map.json').read_text())['profiles']
    assert profile['test']['expectedOrder39BodyCalls']==1 and profile['guidedIncrementalTest']['expectedOrder39BodyCalls']==0
    assert profile['test']['caseCount']==46 and profile['guidedIncrementalTest']['singletons']==27 and profile['guidedIncrementalTest']['variants']==35
    budget=json.loads((OUT/'budget-proof-conflict.json').read_text());assert budget['capFullClassAttempts']==6 and budget['literalIndependentTotalMinimum']==12
    ordering=json.loads((OUT/'future-commands.json').read_text())['fullClassSourceBoundOrdering']
    assert len(ordering)==12 and ordering[0]['sourceSha256']==stages[0]['candidateSha256']
    assert all(row['kind']=='full-class-mutation' and row['restoreSha256']==stages[0]['candidateSha256'] for row in ordering[1:7])
    assert [row['sourceSha256'] for row in ordering[7:]]==[stages[i]['candidateSha256'] for i in [1,2,3,4,4]]
    assert all(row['executionAuthorized'] is False and row['cap6StillApplies'] is True for row in ordering)
    assignment=json.loads((OUT/'assignment-inputs.json').read_text())
    for path,digest in assignment['inputs'].items():assert sha((ROOT/path).read_bytes())==digest
    provenance=json.loads((OUT/'checker-input-provenance.json').read_text())
    for path,digest in provenance['helpers'].items():assert sha((ROOT/path).read_bytes())==digest
    previous=json.loads((OUT/'inherited-resume3-manifest.json').read_text())
    assert sha((OUT.parent/'resume3/manifest.json').read_bytes())=='f840729b24cb0ea7b0d0502da8c5faa537c78889220fa6075d366ca48ddb0e97'
    for row in previous['artifacts']:
        assert sha((OUT.parent/'resume3'/row['path']).read_bytes())==row['sha256']
    delta=json.loads((OUT/'resume4-preservation.json').read_text())
    assert delta['inverseWireDeltaRecoversExactOldChecker'] is True and delta['reconcileAndAllNonWireFunctionsByteExact'] is True
    assert delta['checkerNewSha256']==sha((OUT/'verify_mutation_run.py').read_bytes())
    assert delta['inverseCheckerSha256']==sha((OUT.parent/'resume3/verify_mutation_run.py').read_bytes())
    replay=json.loads((OUT/'wire-independent-contracts.json').read_text())
    wire=json.loads((OUT/'wire-contract-witnesses.json').read_text())
    assert replay['checkerSha256']==wire['checkerSha256']==delta['checkerNewSha256']
    assert (replay['accepted'],replay['rejected'])==(11,89) and (wire['accepted'],wire['rejected'])==(4,149)
    summary=json.loads((OUT/'wire-proof-summary.json').read_text())
    assert summary['priorIndependentInvalidNamesPreserved']==89 and len(summary['priorFourWireCounterexamplesCorrectedWithCoherentRawCompatibleFixtures'])==4
    assert wire['actualHistoricalB1ValidMutant'] is False and wire['rawPrivateTextExported'] is False
    assert all(r['fullCorrectedCoreRejected'] for r in wire['historicalFailureTransplants'])
    print(json.dumps(dict(status='AUTHOR_STATIC_ONLY',immutableOriginalPackageFiles=len(before),stages=6,
      exactPatchReconstructions=34,rows=95,pollRows=74,deliberateRows=21,originalAssertions=2686,
      annotatedMethods=74,variants=35,textBlocks=10,pairedScratchActualBlocks=10,
      minimumFullClassAttempts=12,cap=6,pythonFakeContractsAccepted=7,pythonFakeContractsRejected=99,supportedArtifactsByteExact=92,priorIndependentWireContractsAccepted=11,priorIndependentInvalidRejected=89,focusedWireAccepted=4,focusedWireRejected=149,budgetConflict='UNRESOLVED',javaCompilerProbeNativeExecution='NOT_RUN')))
if __name__=='__main__':main()
