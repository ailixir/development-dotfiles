"""Static correction audit only; no Java compiler, formatter, tests, or execution."""
from pathlib import Path
import hashlib
import json
import re
import collections

O = Path(__file__).resolve().parent
EARLY = O.parents[1]
I = EARLY / 'it-s-draft/resume2'
ROOT = O.parents[7]
sha = lambda data: hashlib.sha256(data).hexdigest()
review = ROOT / 'docs/qa/evidence/STUDIO-OBS-011/t0/qa/bridge-its-drafts'
assert sha((review / 'review.md').read_bytes()) == '3b5eaa17edcd2d30b708989b1a0b60592f0ef064e3e44a2f4975e949942e3f0d'
ns = {}
exec((review / 'audit.py').read_text().split("audit={'scope'")[0], ns)
apply, lex, tests, assertion_roots, testbody = [ns[x] for x in ['apply', 'lex', 'tests', 'assertion_roots', 'testbody']]
result = {'status': 'static only, all Java/conformance/native execution UNRUN', 'bridge': {}, 'its': {}}

bridge_man = json.loads((O / 'manifest.json').read_text())
its_man = json.loads((I / 'manifest.json').read_text())
for out, rows, folder, patchforms, section in [
    (O, bridge_man['owned'], 'candidates', [('candidate.patch', 'actual'), ('incremental-from-reviewed.patch', 'reviewed')], 'bridge'),
    (I, its_man, 'repo', [('it-s-incremental.patch', 'preimages'), ('it-s-from-s011.patch', 'actual'), ('incremental-from-reviewed.patch','reviewed')], 'its')]:
    actual = {r['path']: (ROOT/r['path']).read_bytes() for r in rows if (ROOT/r['path']).exists()}
    pre = {r['path']: (out/'preimages'/r['path']).read_bytes() for r in rows if (out/'preimages'/r['path']).exists()}
    expected = {r['path']: (out/folder/r['path']).read_bytes() for r in rows}
    reviewed = {r['path']: (out.parent/('candidates' if section=='bridge' else 'repo')/r['path']).read_bytes() for r in rows}
    for patchname, base in patchforms:
        recon = apply((out/patchname).read_text(), {'actual': actual, 'preimages': pre, 'reviewed': reviewed}[base])
        # An unchanged fixture is omitted from incremental diff; carry its exact reviewed bytes.
        if base == 'reviewed': recon = reviewed | recon
        assert recon == expected, patchname
    if section=='its':
        for r in rows:
            for suffix,base in [('incremental','preimages'),('from-s011','actual'),('from-reviewed','reviewed')]:
                patch=(out/'patches'/(Path(r['path']).stem+'.'+suffix+'.patch')).read_text()
                assert apply(patch,{'actual':actual,'preimages':pre,'reviewed':reviewed}[base])=={r['path']:expected[r['path']]}
    case_rows = []
    for r in rows:
        rel = r['path']
        assert sha(expected[rel]) == r['candidateSha256']
        if rel in actual:
            assert sha(actual[rel]) == r.get('actualS011Sha256', r['preimageSha256'])
        else:
            assert section=='bridge' and r['operation']=='new'
        if rel in pre: assert sha(pre[rel]) == r['preimageSha256']
        old, new = pre.get(rel,b'').decode(), expected[rel].decode()
        before, after = tests(old), tests(new)
        assert before == after
        before_asserts, after_asserts = assertion_roots(old), assertion_roots(new)
        if section=='its':
            normalize = lambda ts:' '.join(ts).replace('itsPoll . waited','waited').replace('itsPoll . waiting','waiting')
            assert [' '.join(t) for t in before_asserts] == [normalize(t) for t in after_asserts], rel
        else:
            inverse = new
            for edit in json.loads((O/'loop-edits.json').read_text()):
                if edit['path'] != rel: continue
                assert inverse.count(edit['replacement']) == 1
                inverse = inverse.replace(edit['replacement'], edit['originalReviewedBlock'])
            assert inverse.encode() == reviewed[rel], (rel,'outside wait bytes changed')
            for case in before:
                actual_tokens = ns['undo_directwaits'](ns['undo_env'](testbody(inverse,case['method'])))
                assert testbody(old,case['method']) == actual_tokens
        case_rows.append({'path':rel,'testMethods':before,'methods':len(before),'namedDrops':[], 'namedAdds':[],
                          'assertionRootsBefore':len(before_asserts),'assertionRootsAfter':len(after_asserts),
                          'actualS011Sha256': sha(actual[rel]) if rel in actual else None,'candidateSha256':sha(expected[rel])})
    result[section]['cases'] = case_rows

all_edits = []
for out, count, folder in [(O,14,'candidates'), (I,12,'repo')]:
    edits = json.loads((out/'loop-edits.json').read_text())
    assert len(edits)==count
    for edit in edits:
        text=(out/folder/edit['path']).read_text()
        assert edit['replacement'] in text
        assert sha(edit['replacement'].encode())==edit['newSha256']
        assert re.fullmatch(r'[A-Za-z_$][\w$]*',edit['classIdentifier'])
        assert '.dontCatchUncaughtExceptions()' in edit['replacement']
        assert '.pollInSameThread()' in edit['replacement']
        assert 'if (terminal)' in edit['replacement']
        assert 'terminal = true;' in edit['replacement']
        assert 'initialAwaitTick' in edit['replacement']
        assert 'Thread.interrupted()' in edit['replacement']
        for name in ['bridgePoll','itsPoll']:
            if name+'.terminal' in edit['replacement']:
                assert 'if (!'+name+'.terminal)' in edit['replacement']
        if edit['id']=='Transport-controller-stage':
            assert 'String stageContent = initialStageContent;' in edit['replacement']
            assert 'String stageContent = readStageOrEmpty(stageFile);' not in edit['replacement']
            assert text.count('String initialStageContent = readStageOrEmpty(stageFile);')==1
        all_edits.append({'id':edit['id'],'path':edit['path'],'blockSha256':edit['newSha256'],
                          'literalReplacementInCandidate':True,'legalClassIdentifier':edit['classIdentifier'],
                          'terminalLatchAndGuardedFallback':True,'javaExecutionVerified':False})
result['waitRecords'] = all_edits
assert sum(r['methods'] for r in result['bridge']['cases'])==26
assert sum(r['methods'] for r in result['its']['cases'])==112
assert sum(r['assertionRootsBefore'] for r in result['its']['cases'])==1171
expected_invocations=json.loads((I/'source-expected-invocations.json').read_text())
assert len(expected_invocations)==149
result['its']['sourceExpectedInvocations']=149

# Preserve every named deliberate row, not merely count all remaining sleep strings.
old_sleep=json.loads((I.parent/'sleep-table.json').read_text())
new_sleep=json.loads((I/'sleep-table.json').read_text())
old_deliberate=[(r['file'],r['originalLine'],r['expression']) for r in old_sleep if r['classification']=='DELIBERATE']
new_deliberate=[(r['file'],r['originalLine'],r['expression']) for r in new_sleep if r['classification']=='DELIBERATE']
assert old_deliberate==new_deliberate and len(new_deliberate)==10
result['its']['deliberateRowsExact']=new_deliberate
original_bridge=json.loads((O.parent/'static-audit.json').read_text())
assert len([r for r in original_bridge['sleepRows'] if r['classification']=='DELIBERATE'])==4
assert (O/'candidates'/bridge_man['owned'][2]['path']).read_bytes()==(O.parent/'candidates'/bridge_man['owned'][2]['path']).read_bytes()
result['bridge']['fixtureByteIdenticalToReviewed']=True
result['bridge']['deliberateRowsSourceCensus']=4
result['bridge']['orphanAssertionStartsUnreachable']=3

tp=next(r for r in its_man if r['path'].endswith('GuidedServiceTransportFaultIT.java'))
gs=EARLY/'gs-t-draft/repo'/tp['path']
assert sha(gs.read_bytes())==tp['preimageSha256']=='10d3706043430730edc921804dd1b8eb06a5326eb690f8c33f2571d7300fe1b5'
result['its']['transportGsTBinding']=tp['preimageSha256']
aliases=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json').read_text())['resolvedAliases']['FOLD_TESTS']
fold={r['path'] for r in aliases}
result['its']['foldHandoffs']=[r['path'] for r in its_man if r['path'] in fold]
result['its']['directRelease']=[r['path'] for r in its_man if r['path'] not in fold]
assert len(result['its']['foldHandoffs'])==4 and len(result['its']['directRelease'])==2

main=json.loads((O.parent/'main-s011-hashes.json').read_text())
assert {r['path'] for r in main}=={str(p.relative_to(ROOT)) for p in (ROOT/'backend/src/main').rglob('*') if p.is_file()}
for r in main:assert sha((ROOT/r['path']).read_bytes())==r['sha256']
result['mainS011PathHashCount']=len(main)

# Original package manifests and independent review remain immutable. Resume2 is excluded.
for row in json.loads((O.parent/'manifest.json').read_text())['artifacts']:
    assert sha((O.parent/row['path']).read_bytes())==row['sha256']
for rel,digest in json.loads((I.parent/'artifact-manifest.json').read_text()).items():
    assert sha((I.parent/rel).read_bytes())==digest
previous_review=json.loads((review/'audit.json').read_text())
assert set(previous_review['previousGsTStart'])=={str(p.relative_to(EARLY/'gs-t-draft')) for p in (EARLY/'gs-t-draft').rglob('*') if p.is_file()}
for rel,digest in previous_review['previousGsTStart'].items():
    assert sha((EARLY/'gs-t-draft'/rel).read_bytes())==digest
result['originalPackagesGsTAndReviewUnchanged']=True
bindings=json.loads((I/'conformance/bindings.json').read_text())
assert bindings['siteCount']==26 and bindings['modesPerSite']==9
assert sha((I/'conformance/WaitConformance.java').read_bytes())==bindings['generatedJavaSha256']
byid={r['id']:r['blockSha256'] for r in all_edits}
for r in bindings['cases']:assert r['deliveredBoundSha256']==byid[r['id']]
result['unexecutedConformance']={'sites':26,'comparisons':234,'generatedJavaSha256':bindings['generatedJavaSha256']}
result['reviewBinding']=sha((review/'review.md').read_bytes())
(O/'static-audit.json').write_text(json.dumps(result,indent=2)+'\n')
(I/'correction-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'bridgeCases':26,'itsMethods':112,'itsInvocations':149,'itsOrderedAssertions':1171,
                  'exactLoopMetadata':len(all_edits),'mainS011':len(main),'conformance':'234 comparisons UNEXECUTED'}))
