"""Quinn exact Source06 review metadata/seal only; no owner or target action."""
import hashlib,json,stat
from pathlib import Path
H=Path(__file__).absolute().parent;T=H.parents[1];S=T/'early/gateway80-failed-red-resource-prep/resume6'
SUBJECT='b751602e38355042033e1a1b86ad0996c30a0377e56fae064f1eb383866e7976'
def sha(b):return hashlib.sha256(b).hexdigest()
def put(n,v):(H/n).write_text(json.dumps(v,indent=2)+'\n')
finding=dict(id='FR06-INITIAL-AUTHORIZATION-ACTOR-COMPLETENESS',mandatory=True,severity='HIGH',title='Initial authorization declares completeness before outside actor facts can enter the derived roster',locations=['install-cli.py:149-152 allowed scope','install-cli.py:185-195 derived initial authority','protocol.py:designated_author','control-author.py:assemble actual_extra_actors','operator-completion.js:actualActor/request'],establishedBehavior='The installer forbids caller-supplied typedPriorActors/typedActorEvidencePins, has no narrow actualPriorActors input in its allowed scope/candidate graph, and derives the initial authorization as knownPostBaseActors plus its own pending installer row with typedActorRosterComplete:true. New owner-record writers/install-scope authors/source readers necessarily precede installation but can first enter through a later control-author request. The actual source-authored SETUP carrier is implemented and independently exercised, including outside PID901001, original separate tool trace, current-control evidence carrier and a qualifying fake negative. That later union cannot retroactively complete the immutable initial authorization.',impact='The initial completeness assertion omits already known external actors under the inherited full-roster obligation. Its source-produced snapshot repeats that incomplete base. This is a missing initial producer/input binding, not a failure of the later pure-memory completion or carrier mechanism. No actual actor omission or unauthorized runtime operation was observed.',requiredCorrection='Provide a concrete reviewed initial-install input/producer path for narrow independently captured actual outside/install-scope/owner/source-reader actor facts and their provenance, deriving the initial typed roster/evidence from those facts before declaring it complete. Preserve no root-built binary/code/loader/member/input maps and no future self-completion/hash cycle. Alternatively, an explicitly limited initial record must remain non-complete/non-admitting until a separately defined complete boundary, with the full consumer/factory contract changed accordingly; do not relabel the present assertion by interpretation or treat later setup as retroactive completion. Keep every actual known ID/status meaning, pending designated installer and separately captured completion. All other source/physical/freshness safeguards remain.',evidence=['critical-results.json: actual installer and later outside-carrier composition','operator-results.json: actualActor/request/completion exchanges','install-cli.py exact closed scope and base.update source graph','finite-results.json: all258 and exact source/reuse bindings'],allMandatoryFindingsTogether=True)
put('findings.json',dict(reviewer='Quinn',subjectManifestSha256=SUBJECT,verdict='HOLD_EXACT_SOURCE_CORRECTION_REQUIRED',mandatoryFindingCount=1,mandatoryFindings=[finding],allFourSource05CategoriesReviewed=True,ownerRulingIssued=False,actualRuntimeAuthority=False))
conditions=[
 'Exact inactive Source06 code review only. One complete initial-authorization roster/provenance category remains mandatory; no owner decision, install, actual scope, phase or credit is issued.',
 'All complete original conditions in source06 complete-root-all-findings-adoption.json rawSHA7abc98e0eb0dadbff1a21476cc38faff0c551e4ea59bff78c288ebd785560b7d/202238B and its bound Source05/typed-role/design/source04 lineage remain adopted by reference, without deletion or transfer of old approvals.',
 'The N03 actualActor evidence path is a source-authored current-control carrier, not the outside writer original pathname. Independently observed actual tool/PID/parent/status and original trace must be explicitly retained in root operatorFacts/evidence. The current fake composition includes that original trace; it establishes no actual outside provenance or physical/direct-wait fact.',
 'Actor input capacity changed from Source05 256 to Source06 8192. This is explicitly disclosed, not described as unchanged Source05 capacity. The attempt10/current incremental fix retains8192 and reconciles exact duplicates before cumulative input; original per-file/shared archive/JSON/census bounds remain. Any later exact source/owner/root decision must acknowledge the actual bound and preserve every unique actor/conflict HOLD, with no truncation or weakening of identity/absence predicates.',
 'The proof subject is ORIGINAL_PERMIT_AT_FINAL_GUARDED_ACCEPTANCE_AFTER_SELECTED_CLEANUP. Original readiness/permit/raw pins and existing clock remain; the unobserved parent physical scheduling interval is UNPROVED. No selected fallible action may follow that accepted boundary; actual wrapper1/postclose0/outer completion/independent actual QA/root remain separate duties.',
 'Typed self-text scope is only original obs009-gateway80-offtree03-20261019/PTY29815/wrapper3720/shell3749/failed wrapper1. Legacy canonical and equivalence remainfalse; raw reported text stays UNKNOWN/opaque. Fresh strict UTF8 bounds/literal origAPP and seven physical witnesses plus all holder/source/kernel/history/wait/UNKNOWN predicates remain.',
 'Both prior namespaces, oldE2263 regulars, all known11, dynamic actors and status meanings/null start/fingerprint gaps remain. Actual tool/foreground statuses never become direct Popen waits. Old caps/functions/readonly buffers remain immutable; N03/FR04 is still prospective.',
 'Only after corrected exact source and BOTH clean independent reviews plus root acknowledgement may the three named unit/code/contract-specific technical owners rule. No Source09/old C8 grant or clock/domain/permit substitution. Current HOLD produces no Quinn owner staging leaf.',
 'Fresh unchanged-f9/Node-only/no-backend-compile applicability and actual install/buffer/binding/negative1 separate1/SAMEheld0/archive0 actualQAroot/final0 separate inspection/original60s permit/gate0/guardwrapper1/postclose0 actualcompletionQAroot remain owed. Original failed native1/collector1/HOLD/UNKNOWN cause/report95-48-47 component-only unchanged.',
 'C8/GST custom frameworks remain parked. Baseline check+JaCoCo and final affected T5 suites remain required; AC-5 unchanged. Default4000/Order17/original tests/skips/Live/business/sourcewindow/root731/T0/preF1/NONIR/Replayb8wholef9restore/atmostonecompile/C8-before-credit/mainIR/external21/privateC5C212/lifecycle/cleanup holds remain. USD500 shared aggregateUNKNOWN.'
]
put('conditions.json',dict(kind='QUINN_SOURCE06_COMPLETE_RETAINED_CONDITIONS_BY_EXACT_REFERENCES',conditions=conditions,completeInheritedSource=S.name+'/complete-root-all-findings-adoption.json',completeInheritedRawSha256='7abc98e0eb0dadbff1a21476cc38faff0c551e4ea59bff78c288ebd785560b7d',originalAndLeanTasksBound=True,source05BothFullReviewsBound=True,allActualGatesOwed=True))
critical=json.loads((H/'critical-results.json').read_bytes());finite=json.loads((H/'finite-results.json').read_bytes());op=json.loads((H/'operator-results.json').read_bytes())
put('review-record.json',dict(reviewer='Quinn',subjectManifestSha256=SUBJECT,verdict='HOLD_EXACT_SOURCE_CORRECTION_REQUIRED',mandatoryFindingCount=1,mandatoryFindings=[finding['id']],sourceOnly=True,technicalOwnerRulingIssued=False,actualRuntimeAuthorized=False))
put('history.json',dict(skill='aiox-qa Quinn',noDelegation=True,nodeGreetingSkipped=True,safe=dict(preflight='dad298',actualExit=0,inspection='e56248',safe=True,threats=[],providedBy='root'),finite=dict(tool='3c41cf',actualExit=0,checks=finite['checks'],pinRecords=finite['pins'],payloads=258,checksumRows=259,failedAttempts=0),critical=dict(session=88087,observedOuterExit=op['actualOuterExit'],terminalNestedToolChunkId=None,independentAssertions=critical['passed'],fixtureCompositionAssertions=len(critical['compositionChecks']),pureJSChecks=len(op['checks']),operatorExchanges=len(critical['operatorSteps']),realBoundaryCalls=critical['realBoundaryCalls'],noOld13Or78Or34Or17Or313Plus19Replay=True),reuse='Author attempt13 actual0/39 assertions/13 exchanges is attributed evidence; terminal nestedtool chunkID null. Four exact late denials reuse attempt10 with exact one-line runtime delta and final actual Python AST binding. Ten historical JS checks bind an unchanged function dependency prefix, not current whole helper. Final shell bytes were not dynamically rerun by author; this independent batch executes the actual final shlex-decoded GUARD and control-author-loader arguments.',ownerPhase='Not eligible: HOLD, no owner decision or staged owner leaf.'))
(H/'review.md').write_text('''# Quinn exact Source06 review

**HOLD — one mandatory initial-authorization roster/provenance finding.** Subject
`b751602e38355042033e1a1b86ad0996c30a0377e56fae064f1eb383866e7976`,258 payloads.
All four Source05 categories and the whole corrected caller/state/guard graph were
assessed. No source or runtime bytes were changed and no owner ruling is issued.

The remaining issue is narrow. install-cli creates the initial authorization with
known11 plus the pending installer and calls that roster complete. Its scope has
no narrow input for already observed outside owner/install-scope/source-reader
authors, while caller-built actor/maps are prohibited. Those facts can enter later
SETUP/current controls, but cannot retroactively complete the immutable initial
assertion. findings.json gives the complete category and correction alternatives.

The later mechanism works: the bounded independent composition runs the actual
installer, strict factory owner checks, pure-JS adoptState/actualActor/request,
actual control-author loader/CLI/assembler, completion serializer/SHA/binder and
the actual final quoted GUARD/entry negative path. A known outside writer is carried
in the new N03 control together with its separate original fake tool trace; its
original outside pathname correctly rejects the helper's carrier-only rule. The
carrier is not a claim that the outside file physically resided in N03. Actual root
facts must be tied to real separately observed traces before use. No root binary,
code, loader, input or member map is accepted by this composition.

Twenty independent assertions and eight fixture composition assertions passed in
one batch, observed outer0/session88087, two actual pure-V8 operator exchanges and
five pure-JS checks, zero real boundary calls. Exact owner Booleans/ints pass;
numeric Boolean, Boolean PID and float Boolean/PID pairs reject via the common
factory. Missing/precompleted/wrong-producer designated authors reject. A control
with5000 exact duplicate old observations qualifies through the actual negative
consumer because each control is reconciled before cumulative input; every unique
row remains. Conflicts and above8192 reject. The final sink/qualification timely
and late-delivery-preparation pair independently confirms original-permit acceptance
after selected cleanup. All effects are fake in SAME compiled namespaces after
stdlib preload/-B under the unchanged persistent inherited deny audit. No old broad
suite or13-exchange replay ran. The terminal nested tool chunkID was not retained
and remains null; actual outer0 was separately observed, not invented.

Finite verification passed1905 exact pin/AST/evidence checks over405 pin records,
actual0/3c41cf. All258 payload SHA/bytes/modes/exact membership and259 checksum rows
matched. Original and lean tasks, full Source05/root conditions and actual source
graphs were read. Final POSIX argument bytes, shared failure sink/registry and
historical intended Python AST agree across the four corrected shells. Source04/05
custody remains literal. The historical four late denials, one-line incremental
runtime delta and unchanged dependencies are exact component reuse, not a current
whole-byte replay. Attempt13's39/13 actual0 and all earlier failures remain attributed.
The ten historical pure-JS checks bind the exact unchanged function dependency
prefix; current request/state/completion transport has separate new coverage here.

The actor input cap did expand256→8192 from Source05. That is disclosed, not laundered
as unchanged. The incremental fix keeps the current8192 bound and conservative
numeric absence/duplicate conflict rules. Resource/JSON/archive/census caps remain;
future exact technical/root decisions must acknowledge the actual bounded contract.

Owner scalar types, pending author source/path/role identity and immutable null
completion are materially corrected for source-authored controls. Complete current
state is reconstructed from opened custodied members and checked against its external
rawSHA before interpretation. Seven physical witnesses/readset/preflight precede
mutation. Both prior namespaces, known11/status meanings, old numeric rules, all
physical client/holder/source/kernel/history predicates and primary/cleanup/partial
ownership remain. The final guard checks the unchanged original readiness/permit
after allow IO, Unit/outer cleanup and selected delivery preparation. It qualifies
that sampled acceptance point only; parent scheduling is UNPROVED. Actual wrapper1,
outside postclose0/observer completion and independent actual QA/root remain duties.

No fake direct method/printed status or staged artifact establishes actual resource
closure. No actual E/W/N/holder/lock/census/kernel/tool/cache/home/private/protected
baseline/raw report/native/API/provider/network/signal/cleanup/shared-source action
occurred. Only this review directory was written. All inherited conditions remain
bound in conditions.json/input pins. No Quinn owner staging leaf exists because the
review is HOLD. C8/GST auxiliary frameworks remain parked; baseline check+JaCoCo,
affected T5 suites/AC-5 and all business/privacy/source-window/lifecycle gates remain.
USD500 shared aggregate UNKNOWN.
''')
files=sorted(p for p in H.iterdir() if p.name not in ('manifest.json','SHA256SUMS'))
rows=[dict(path=p.name,sha256=sha(p.read_bytes()),bytes=p.stat().st_size,mode=stat.S_IMODE(p.stat().st_mode)) for p in files]
put('manifest.json',dict(kind='QUINN_SOURCE06_EXACT_INDEPENDENT_REVIEW',reviewer='Quinn',subjectManifestSha256=SUBJECT,verdict='HOLD_EXACT_SOURCE_CORRECTION_REQUIRED',mandatoryFindingCount=1,sourceOnly=True,ownerDecisionExcluded=True,technicalOwnerRulingIssued=False,files=rows,memberCount=len(rows),manifestAndChecksumSelfExcluded=True,independentAssertions=20,fixtureCompositionAssertions=8,pureJSChecks=5,finiteChecks=1905,pinRecords=405,actualTargetActions=0))
files.append(H/'manifest.json');(H/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in sorted(files)))
print(json.dumps(dict(manifestSha256=sha((H/'manifest.json').read_bytes()),payloads=len(rows),verdict='HOLD',mandatoryFindings=1,ownerDecisionIssued=False)))
