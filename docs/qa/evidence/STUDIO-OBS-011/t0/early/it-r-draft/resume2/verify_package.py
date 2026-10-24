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
    print(json.dumps(dict(status='AUTHOR_STATIC_ONLY',immutableOriginalPackageFiles=len(before),stages=6,
      exactPatchReconstructions=34,rows=95,pollRows=74,deliberateRows=21,originalAssertions=2686,
      annotatedMethods=74,variants=35,textBlocks=10,pairedScratchActualBlocks=10,
      minimumFullClassAttempts=12,cap=6,budgetConflict='UNRESOLVED',javaCompilerProbeNativeExecution='NOT_RUN')))
if __name__=='__main__':main()
