"""Finish two complete corrected off-tree packages, never execute their Java/commands."""
from pathlib import Path
import difflib
import hashlib
import json

B = Path(__file__).resolve().parent
E = B.parents[1]
I = E/'it-s-draft/resume2'
ROOT = B.parents[7]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
audit = json.loads((B/'static-audit.json').read_text())
bm = json.loads((B/'manifest.json').read_text())
im = json.loads((I/'manifest.json').read_text())
review = 'docs/qa/evidence/STUDIO-OBS-011/t0/qa/bridge-its-drafts/review.md'

inputs = [review, 'AGENTS.md', 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md',
          'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json',
          'docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v7.md',
          'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-root-state.json',
          'docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json',
          str((E/'gs-t-draft/gs-t-draft.patch').relative_to(ROOT)),
          str((E/'gs-t-draft/repo'/im[0]['path']).relative_to(ROOT)),
          str((B.parent/'manifest.json').relative_to(ROOT)),
          str((I.parent/'artifact-manifest.json').relative_to(ROOT))]
facts = {'status':'captured read-only for corrected off-tree preparation; changing documentary/baton inputs must be rebound before application',
         'inputs':[{'path':p,'sha256':sha(ROOT/p)} for p in inputs]}
for out in [B,I]:
    (out/'input-bindings.json').write_text(json.dumps(facts,indent=2)+'\n')
(I/'main-s011-hashes.json').write_bytes((B/'main-s011-hashes.json').read_bytes())
(B/'case-preservation.json').write_text(json.dumps(audit['bridge']['cases'],indent=2)+'\n')
old_orphans=json.loads((B/'orphan-helpers.json').read_text())['GuidedBridgeIntegrationTest']
orphan_assertions=sum(text.count('assertThat(') for text in old_orphans.values())
assert orphan_assertions==3
(B/'orphan-closure.json').write_text(json.dumps({'removedHelpers':list(old_orphans),'unreachableAssertionStarts':3,
                                              'targetPresenceStarts':2,'uniquenessStarts':1,
                                              'reachableAssertionDrops':0,'testMethodDrops':0},indent=2)+'\n')

delta=[]
for row in im:
    rel=row['path']
    before=(I.parent/'repo'/rel).read_text();after=(I/'repo'/rel).read_text()
    patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+rel,tofile='b/'+rel))
    (I/'patches'/f'{Path(rel).stem}.from-reviewed.patch').write_text(patch)
    delta.append(patch)
(I/'incremental-from-reviewed.patch').write_text(''.join(delta))

common = '''Both complete resume2 packages address Quinn's BRIDGE-WAIT-01, BRIDGE-WAIT-02, ITS-WAIT-01 and ITS-META-01 source/evidence findings; independent re-review and execution remain required. The original review/packages and GS-T are immutable. Actual source, story, plans, current diagnostic74442 and unrelated evidence were not edited. Only lightweight Python/read-only inspection ran; no Java/compiler/formatter/native test/Gradle/Node/build/Helm/Docker/provider/process/Git operation ran.

Every site now uses a local terminal latch. A step that has observed success, reached its original deadline/fallthrough, stored a result/completion, or captured its first Throwable becomes terminal before returning. A later framework timeout checks that latch and cannot repeat that finished step or replace its failure/result. Cached initial Awaitility ticks return the already-observed false result without evaluating the condition/body again; later real steps occur after the old interval. The original absolute deadline and evaluation order remain, using remaining time rather than a fresh whole budget. All26 direct chains use same-thread polling and dontCatchUncaughtExceptions, without global default changes/shared helpers/dependencies/executors/retries.

Bridge's original helper ordering is kept at each site: deadline capture → immediate condition → deadline short circuit → original sleep transition → next guard; the independent final fresh condition assertion remains reachable after timeout fallthrough. Initially true/preinterrupted performs no sleep and leaves its flag untouched; a false condition at a real sleep transition uses Thread.interrupted to clear and capture the original InterruptedException. After a library interval restores an interrupt, the next step detects/clears it before another read. Original callers keep their cleanup/reinterrupt responsibility. Exception/Error identity is retained in the first terminal slot and rethrown before final assertions. Library interval scheduling can still defer interrupt recognition to the next old polling transition; no exact latency or native success is claimed.

UNEXECUTED conformance is under `early/it-s-draft/resume2/conformance/`: the generated source copies all26 exact hash-bound delivered local blocks and original loop/helper bodies, with identical instrumented external condition/SQL/file/process seams and explicit bounded scratch deadline/void-return adaptations. Its234 planned differential comparisons cover initial true/preinterrupt/no sleep, false/preinterrupt, false→interrupt, immediate/late RuntimeException and Error identity, slow terminal true beyond the remaining budget, final fresh reads/effect counts, stored marker/row results and deadline fallthrough. It compares observable original/delivered outcomes rather than asserting internal implementation fields. No compiler or probe was executed, and no synthetic result replaces the real ownership/DB/worker/cleanup/privacy/timing gates. Local cached jars/source hashes and an explicit bounded scratch launcher/command are supplied. This adds no retained product test method/file or product requirement.

Application remains after original diagnostic restoration, root source/W1 gates, the literal unchanged-main complete GS-T five-class pass and GS-Mb's unchanged bridge/Planning/Replay freeze proof. Revalidate/rebase all actual incoming batons and changing documentary bindings first. The declared-package full bridge/IT-S runs, prescribed F1/GS-M/FOLD sets and both-task full Replay class, staged red/green/mutants where already prescribed, final clock cleanup, fresh coverage/full11G, per-name/variant/skip/privacy/cohort reconciliation, no-survivor checks and valid AC5 exact-set before/after timing remain mandatory and UNEXECUTED. There is no W1 opening, lane start/exit, QA/gate pass, lifecycle or release approval here.
'''

(B/'receipt.md').write_text('''# GS-T2 complete corrected preparation — resume2

All3 full candidates, exact actual-S011 patch and reviewed-draft incremental patch are in this directory; `preimages/` holds actual existing sources and `reviewed-preimages/` binds the prior full3-path draft. New fixture `guided/bridge/support/GuidedBridgeFixture.java` retains the declared `guided.session` package and is byte-identical to the independently supported earlier candidate. Both classes retain separately owned ENV/resources/state; unique Integration hand-manifest/non-planning access and Planned real provider/planner/reservation/admission authority stay local. Worker assignment precedes readiness, and existing latch release/teardown/finally/privacy/no-survivor checks stay unchanged.

All14 bridge chains now disable unrelated uncaught-thread interception and implement the explicit original wait transitions described below. All26 case names/order and surrounding test bodies are independently recoverable by inverse mapping, with zero reachable assertion drops/additions. The nine Integration orphan helpers remove exactly3 unreachable assertion starts: two target-presence plus one uniqueness; `orphan-closure.json` corrects the earlier two-start wording. Four original DELIBERATE source rows stay: the two duplicate dormant slow-navigation stimuli fold once into independently configured fixture state, and Planned's100ms locked-row/200ms late-renewal windows remain unchanged. Both actual test preimages and506 main files remain S011; this census is not the executed GS-T gate.

`loop-edits.json` contains14 literal final blocks with legal local names/hashes/conditions/old budgets and separate final fresh assertions. `static-audit.json`, `case-preservation.json`, `state-reader-map.json`, main/input bindings and full candidates are current. Both bridge files plus the fixture accompany the later FOLD-final baton; current client/constructor ports must use those exact accepted hashes.

- Full actual-S011 patch SHA256: `'''+sha(B/'candidate.patch')+'''`
- Incremental from independently reviewed draft SHA256: `'''+sha(B/'incremental-from-reviewed.patch')+'''`
- Static correction audit SHA256: `'''+sha(B/'static-audit.json')+'''`

'''+common)

(I/'receipt.md').write_text('''# IT-S complete corrected preparation — resume2

All6 complete repo-shaped candidates, per-file incremental/from-S011/reviewed-delta patches and all3 combined forms are current here. Transport's incremental preimage remains the exact GS-T candidate SHA `10d3706043430730edc921804dd1b8eb06a5326eb690f8c33f2571d7300fe1b5`; actual-S011→GS-T→IT-S reconstructs identically to the composed actual-S011 patch. Never apply the composed patch over a runtime-accepted changed baton. Five other sources retain their exact actual S011 preimages. All original packages and actual owned sources are unchanged.

All12 local steps now latch each terminal success/deadline/failure/stored result before return, and framework timeout fallback is guarded. Existing generic waits keep their independent final fresh assertion; route cleanup's original reinterrupt/aggregation mapping stays outside the same transformed blocks. No whole-operation retry, extra query/marker read, wider deadline, weaker assertion, new worker/resource or main/build/dependency change is introduced.

`loop-edits.json` was regenerated by extracting each exact final block from its complete candidate, not by correcting an intermediate identifier string. All12 literal replacements occur in their named candidates and their hashes match. Legal local identifiers and the real `String stageContent = initialStageContent` are bound; the one outer initial marker read remains, and later marker reads occur after intervals. This metadata repair is static evidence, never a runtime result.

All112 methods/149 source-expected invocations and1171 ordered assertion roots remain, with only the explicit waited/waiting holder rebindings. All10 deliberate sleeps retain their exact original expressions/order; 12 POLL rows remain converted. Source-method/variant/assertion/sleep maps and historical B1 XML bindings were rebuilt. B1's failed whole-check is not a green timing comparison, and there is no after timing. Four exact FOLD handoffs are Transport, Planning, Focus and Evidence; Secret/Race release directly. The new correction audit verifies all506 main paths/bytes remain S011 without claiming the executed frozen-main gate.

- GS-T-based incremental patch SHA256: `'''+sha(I/'it-s-incremental.patch')+'''`
- Composed actual-S011 patch SHA256: `'''+sha(I/'it-s-from-s011.patch')+'''`
- Incremental from reviewed IT-S draft SHA256: `'''+sha(I/'incremental-from-reviewed.patch')+'''`
- Static correction audit SHA256: `'''+sha(I/'correction-audit.json')+'''`

'''+common)

# No circular hashes: artifact indexes exclude their own index and final receipt files.
for out in [B,I]:
    artifacts={str(p.relative_to(out)):sha(p) for p in sorted(out.rglob('*')) if p.is_file() and p.name not in ['artifact-manifest.json','receipt.json','receipt.md']}
    (out/'artifact-manifest.json').write_text(json.dumps(artifacts,indent=2)+'\n')
    receipt={'status':'complete corrected off-tree preparation, independent re-review and ALL runtime gates pending',
             'sourceApplied':False,'compileVerified':False,'runtimeVerified':False,'conformanceExecuted':False,
             'independentReviewSha256':sha(ROOT/review),'artifactManifestSha256':sha(out/'artifact-manifest.json'),
             'receiptMarkdownSha256':sha(out/'receipt.md'),'orderedAssertionDrops':0,
             'bridgeCases':26,'itsMethods':112,'itsInvocations':149,'itsOrderedAssertions':1171,
             'terminalLatchedDirectSites':26,'literalFinalMetadataBlocks':26,'scratchComparisonsUnexecuted':234,
             'originalSourcesPackagesGsTAndReviewUnchanged':True,
             'findingsImplementedAwaitingReReview':['BRIDGE-WAIT-01','BRIDGE-WAIT-02','ITS-WAIT-01','ITS-META-01'],
             'patches':{p.name:sha(p) for p in out.glob('*.patch')}}
    if out==I:
        receipt['transportGsTPreimageSha256']=im[0]['preimageSha256']
        receipt['foldBatons']=audit['its']['foldHandoffs'];receipt['directRelease']=audit['its']['directRelease']
    else:
        receipt['owned']=bm['owned'];receipt['orphanUnreachableAssertionStarts']=3
    (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'package':str(out.relative_to(ROOT)), 'receiptSha256':sha(out/'receipt.md'),
                      'artifactManifestSha256':sha(out/'artifact-manifest.json'),'artifactCount':len(artifacts)}))
