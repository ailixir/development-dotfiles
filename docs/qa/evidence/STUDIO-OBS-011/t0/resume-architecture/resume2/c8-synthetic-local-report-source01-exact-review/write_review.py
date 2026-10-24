"""Review metadata writer/sealer; only this exact review directory is written."""
import hashlib,json,stat
from pathlib import Path
H=Path(__file__).absolute().parent;T=H.parents[2];S=T/'early/c8-synthetic-local-report-prep/resume1'
SUBJECT='bf6ff7d9cd627c40c6df37c9edc841cb7242170a287d3d15c9f1681899d764b7'
def sha(b):return hashlib.sha256(b).hexdigest()
def put(n,v):(H/n).write_text(json.dumps(v,indent=2)+'\n')
def item(i,title,sites,evidence,impact,required,severity='HIGH'):
    return dict(id='C8S01-ARCH-'+str(i).zfill(2),mandatory=True,severity=severity,title=title,locations=sites,evidence=evidence,impact=impact,requiredCorrection=required,status='OPEN_SOURCE_IMPLEMENTATION_HOLD')
F=[
 item(1,'Bound utility output acquisition before communicate and preserve independent completion facts',
 ['runtime.py:Inspector.utility:80-110','runtime.py:Unit.drain_step:452-479'],
 'Independent utility-acquisition case supplies16777217 bytes. communicate returns the full buffer before len(out) is checked; waitReturned is True but known returncode0 is omitted from actualExit and completion remains UNKNOWN. The source documentation expressly acknowledges this pre-acquisition gap.',
 'The advertised16MiB cap does not bound communicate internal allocation. A later owner opinion or unexecuted-platform disclaimer cannot implement that limit. Independent actual returned/wait/type facts must not disappear merely because another acceptance predicate fails.',
 'Implement a concrete approved bounded acquisition/drain path before allocation, with retained returned process/pipe/partial output ownership and independently projected strict status/wait/drain facts. If approved mechanisms cannot supply it, retain precise implementation HOLD; do not run or approve the existing path on an owner Boolean.'),
 item(2,'Implement the enclosing per-entry private failure/output caller and bind requested launch',
 ['root-caller.bash:c8_s0_invoke/exit','first-read.template.bash:1-14','entry.py:launch:116-147','entry.py:main:151-169'],
 'The shell invokes Python without creating/rebinding/retaining a per-entry exclusive sink. Entry validates inherited FD1 only after manifest/code/release/decision reads and module interpretation. Independent bootstrap-private-channel case proves an earlier error writes to unchecked inherited FD2. The next entry requires an empty FD1 although the previous entry writes it; the missing enclosing wrapper is prose only. C8_S0_BIN is a shell parameter while the release BIN role is separately declared; no concrete enclosing caller/attestation graph binds those actual requested-launch values.',
 'A pre-E/bootstrap/constructor failure has no implemented fully owned private failure channel. A single inherited output file cannot satisfy successive empty-sink checks without reviewed rebinding. Actual wrapper custody/closing/status is a missing implementation surface, alongside later actual evidence; future owner records cannot fill it.',
 'Include the concrete enclosing caller/wrapper and per-entry exclusive0600 named descriptor acquisition/retention/confirmed close/external status path. Protect failures before first helper/interpretation, including stderr or its explicitly private replacement. Bind the actual readonly requested BIN and source/release/unit controls to the independently declared role contract through an exact reviewed parent attestation. Preserve cap-before-acquisition, SAME buffers, old holder, no root scans/signals/cleanup and external completion distinct from snapshots.'),
 item(3,'Resolve the explicitly unimplemented UNKNOWN external disposition before claiming completeness',
 ['runtime.py:Unit.retain_foreground:480-490','entry.py:foreground_boot_hold:73-76','REVIEW-AND-ACTUAL-OBLIGATIONS.md:UNKNOWN disposition'],
 'Both actual loops intentionally never return. The source explicitly calls the external disposition UNIMPLEMENTED; the author StopForeground exception merely stops fake observation and is not actual exit/drain proof. References remain retained, which is safer than discarding them, but no completing external boundary exists in this source.',
 'This is a known protocol implementation dependency, not a missing Java/path/ABI input that existing guards can qualify. Normal cases do not establish the required failure closure.',
 'Provide a separately reviewed concrete existing-mechanism disposition with honest actual ownership/outer completion, or keep the exact consumer source/actual use HOLD for that unresolved boundary. Do not replace the loop with normal return/raise, interpreter teardown, signal, close retry or fabricated status, and do not add new provider/API research as an automatic workaround.'),
 item(4,'Preserve first primary throughout Storage write and remaining finally/partial paths',
 ['storage.py:Storage.write:139-146','storage.py:Storage.info:46-49','storage.py:Storage.mkdir:94-109','storage.py:Storage.inventory:147-164'],
 'Independent storage-write-primary case raises a write ValueError followed by a close OSError; Storage.write raises the latter and loses the original as the propagated primary. The positive storage-read-primary case confirms read retains the first error plus two cleanup records/UNKNOWN references. create saves its first exception, while several remaining bare finally closers have the same replacement pattern as write.',
 'Entry/native latch can receive the cleanup as its first primary, contrary to the declared first-error and separate-cleanup contract. Partial ownership retention alone does not preserve the original failure reason.',
 'Apply one consistent first-primary-before-fallible-cleanup/publication rule across all selected Storage/custody/partial caller paths, preserving separate closed cleanup outcomes and actual references. Recheck read/create retained fixes rather than regressing them. Fix the full category, not only the demonstrated write branch.'),
 item(5,'Enforce the UTF8 byte bound before encoding and retain independent self metadata',
 ['runtime.py:self_text:16-21','runtime.py:Unit.self_roles:299-306'],
 'Finite AST proves value.encode executes before len(raw)>4096. The independent multibyte case has2049 characters/4098 UTF8 bytes and is rejected only after encoding. Hash failure is not caught by self_text, so it can also abort the sequential second-field collection.',
 'The adopted4096-character AND4096-byte-before-encoding/hash requirement is not implemented. Declaring memory-only roles does not satisfy the acquisition bound or independent known metadata retention.',
 'Count strict UTF8 byte width in bounded exact-str memory first, reject NUL/surrogate/nonstring/unavailable/overcap without encoding/hash, then hash only permitted bytes. Collect and preserve independently known reported/orig metadata even when the other field/hash fails. Never guess, follow, normalize or operationalize the unknown raw reported text.'),
 item(6,'Bind freshness to original readiness and the whole final allow/publication suffix',
 ['runtime.py:Unit.permit_check:595-603','runtime.py:Unit.gate:604-618','entry.py:execute:87-111','root-caller.bash:exit'],
 'Three independent actual-function fake counterexamples: readiness.createdAtNs=1 is admitted with a fresh permit at roughly1e12ns; PRE1000000009000 then POST1000000003000 is accepted; and the inherited operator write advances past permit expiry while entry still returns guard0/allowTrue. POST occurs before Unit.finish, serialization, sink writes and shell status delivery.',
 'A fresh permit alone does not make the original readiness fresh. Clock reversal and expired final delivery can authorize builtin exit despite the mandatory original-readiness60s PRE/afterallow/POST contract.',
 'Carry one exact frozen readiness/permit binding through the complete selected caller boundary; enforce strict types, original readiness age, issued/expiry ordering and nondecreasing observations. Put the last same-permit check after all fallible finalization/publication/allow preparation that precedes the actual accepted delivery. Preserve once caps, status inspection and no permit renewal/retry.'),
 item(7,'Keep the active lease and exact outer deadline valid through setup and launch',
 ['runtime.py:Unit.owners:338-342','runtime.py:Unit.native:491-510','runtime.py:Unit.current:346-352'],
 'Independent expired-lease-launch case advances wall time beyond the12h lease at attempt.json publication. Native still launches and finishes with primary NONE. owners checked the lease earlier, current does not recheck it, and the native clock begins only after preadmit/phase/initial namespace publication.',
 'Fallible setup can consume or outlast the selected scope before native starts. The supplied native budget is not an enforced deadline over the full required setup/launch interval.',
 'Bind and check the same exact lease/deadline from the selected before-fallible-work point through every authorized setup/write/launch/phase boundary, without renewal or clock reversal. Expiry must consume the attempt and stay HOLD with partial resources retained; no late launch, retry or cleanup.'),
 item(8,'Give postclose its own exact outer caller binding instead of the dead held parent',
 ['entry.py:launch:124-145','controls.py:descriptor:38-43','runtime.py:Inspector.controller_lock:115-140','runtime.py:Unit.postclose:619-630'],
 'Independent postclose-real-caller-parent case uses a new actual fake parent999 after old shell800 is gone. BOOT_PARENT accepts the new descriptor, but BOOT_HOLDER rejects it because release.holder.shell is still800. Using800 instead would require the original held shell as parent, contradicting normal postclose absence. Direct Unit postclose fake flows bypass this full-entry mismatch.',
 'The actual sealed entry/caller cannot implement the intended outer postclose path under ordinary distinct caller identities. This is a code/DAG issue, not an unknown PID input or actual-platform qualification.',
 'Model and verify a distinct postclose observer/caller/root scope while retaining the original immutable wrapper/shell/lock tuple as the subject whose absence/free inode must be proved. Review the full same-buffer CLI path and actual separate outer completion; do not overwrite the original holder or use PID reuse as a workaround.'),
 item(9,'Carry persistent relevance and typed predecessor history across all entries',
 ['runtime.py:Inspector.restore:161-165','runtime.py:Unit.history:366-382','runtime.py:Unit.archive:558-578','runtime.py:Unit.final/gate/postclose:587-630'],
 'Independent persistent-prior-relevance case places known wasRelevant PID9292 in the held receipt, then returns that PID with an unrelated current argv. A new archive Unit has empty relevance, calls current before consuming held history and accepts FULL_W_E_ARCHIVE. Only capture history is restored for negative/held; later entries do not join predecessor relevance/client/utility history.',
 'Per-entry reconstruction silently forgets previously relevant/ambiguous actors. A changed argv or apparent reuse becomes an implicit exemption, contrary to persistent relevance and honest known-history requirements.',
 'Bind the complete typed predecessor history and actual completion facts before each current admitting sample, including archive/final/gate/postclose. Reconcile duplicates/conflicts, retain UNKNOWN/start gaps and all actual known IDs, and keep conservative numeric/relevance handling. Do not turn all prior PIDs into ownership/listener exemptions or invent interval/exhaustive guarantees.'),
 item(10,'Archive and bound the complete directory tree, not only regular-file rows',
 ['storage.py:Storage.inventory:147-164','storage.py:Storage.archive:165-177','runtime.py:Unit.archive_equal:579-586'],
 'Finite source proof: the directory branch recurses without appending a directory row or reserving an entry; Budget.reserve is reached only by file read. archive creates directories only as parents of recorded files, and archive_equal compares only those file rows. An empty directory, its owner/mode, or its later addition/change has no row and cannot affect equality. Directory entries do not consume the advertised8192 entry budget.',
 'The claimed complete bounded W/E archive can omit empty directories and directory metadata and cannot enforce its entry cap on directory-only trees. Postclose/source/archive equality therefore covers a narrower subject than the declared full tree.',
 'Represent and validate every selected file and directory with bounded acquisition/entry accounting, strict type/owner/mode/relative membership and honest metadata before/after. Copy empty directories and compare the complete typed tree with explicit archive-mode policy. Keep remaining shared byte budgets and no symlink/unknown-entry fallback; missing approved enumeration/custody support stays implementation HOLD.')
]
put('findings.json',dict(verdict='HOLD',subjectManifestSha256=SUBJECT,mandatoryFindingCount=len(F),mandatoryFindings=F,completeBatch=True,technicalOwnerRulingIssued=False,actualRuntimeAuthority=False))
root=json.loads((T/'resume2-c8-consumer-integration-design-qa-root-adoption.json').read_bytes());java=json.loads((T/'resume2-c8-java-qualification-source02-exact-source-root-adoption.json').read_bytes())
put('conditions.json',dict(adoptedCompleteFeasibilityRootConditions=root['adoptedCompleteConditions'],adoptedCompleteJava02QaConditions=java['adoptedCompleteQaLimits'],adoptedCompleteJava02ArchitectureConditions=java['adoptedCompleteArchitectureConditions'],currentLimits=['Exact inactive code review only; all ten findings must be corrected together or retain precise unresolved HOLD. No owner/policy or actual use grant.','New synthetic protocol/principal stays UNADOPTED; exact corrected code/caller/security review plus separately issued Aria/Quinn/root own technical/security rulings required.','Strict Java02/business06 remain HOLD/SELECTED_WORKER_BINDING_UNPROVED and reject the new profile. No Gateway Source09 policy/cap/root/oracle or old C8 waiver transfer.','Ten guaranteesfalse/sixnull-reasons/historytrue/legacyfalse/intervalfalse/identityCompletefalse/kernelIdentityCompletefalse/C8false/creditfalse remain mandatory.','Production0153/harness82a9/body/driver/wire/TLS/schema3 unchanged; no business cookie/soleUUID/oneGET/zeroHTTP weakening.','Current failed Gateway proper archiveQA/final/separate inspected60spermit/wrapper1/outerpostclose0actualQAroot precedes heavy. Each F0/C0/9mode has independent once controls and full per-unit actual closing/QA/root, never one aggregate close.','All actual JDK/java/javac/keytool/release/Jackson/classes/fixture/password/ABI/blockedwrite/role/holder/source/resource/timing facts remain UNKNOWN or UNEXECUTED_OWED. No probes/scans/download/provider research selected.','Default4000/Order17/T0root731/preF1/NONIR/Replayb8wholef9restore/atmostonecompile/C8beforecredit/mainIR/clocks/order/skips/cohorts/external21/privateC5C212/lifecycle/sourcewindow/lease/cleanup holds remain. USD500 aggregateUNKNOWN.']))
put('review-record.json',dict(reviewer='Aria',subjectManifestSha256=SUBJECT,protocol='C8_JAVA_SYNTHETIC_LOCAL_REPORT_V1',mandatoryFindings=[x['id'] for x in F],mandatoryFindingCount=len(F),sourceOnly=True,verdict='HOLD',wholeCallerSecurityOwnershipPhaseDagReviewed=True,technicalOwnerRulingIssued=False,profileAuthorized=False,operationalAuthority=False,actualTargetActions=0))
critical=json.loads((H/'critical-results.json').read_bytes());finite=json.loads((H/'finite-results.json').read_bytes())
put('reviewer-history.json',dict(skill='aiox-architect Aria',delegation=False,nodeGreetingSkippedByExactTask=True,preflight=dict(tool='c222ef',actualExit=0,rootInspection='d28777',safe=True,threats=[],providedBy='root'),finiteAttempts=[dict(actualTool='1f4ea2',actualExit=1,cause='Reviewer incorrectly required template==expanded caller bytes; corrected to exact literal placeholder expansion; no subject change',stderr='finite-attempt01.stderr'),dict(actualTool='9aec22',actualExit=0,checks=finite['checks'],pins=finite['pins'],stderr='finite-final.stderr')],criticalBatch=dict(tool='ef0a68',actualExit=0,cases=12,observations=12,fakeBookkeeping=10286,hostDeniedEvents=[],old24Or498Replayed=False,perCaseCountMetadata='Raw per-case assertions field was evaluated before call and is0; aggregate independentObservations12 is correct. Each case has exactly one observe invocation; use aggregate12 and case pass/detail records, not that unused per-case counter. No rerun/expansion or evidence replacement performed.'),authorEvidence=dict(attempt1='23pass/1fail actual1; omitted OSError catch; reconstructed script not contemporaneously hashed',attempt2='24pass actual0/26849 model+FD checks, not26849 independent tests; exact source pins checked',fullRootCallerActualExecution=False,allNineActualModes='UNEXECUTED_OWED'),allActions='Only approved public source/metadata reads and this review directory writes; all reached target effects fake; no actual runtime/private/baseline/native/tool/provider/network/signal/cleanup/source writes.'))
put('boundary-assessment.json',dict(wholeSurfaceReviewed=['all48 source payloads plus49 checksum rows','exact entry literal and first-read expansion','runtime/control/release/owner/review/rawSHA graph','retained FD/process/pipe/socket/selector/accepted-connection partial constructors','primary/cleanup/root sink/finalizer','serialized live poll76/4credentials same connection','frozen exact Java02 mode/projection/public/Java sources','roles memory vs physical metadata and operational dependency limits','current holder lock/inherited/relevance/history','F0/C0/9separate mode inputs and actual closing DAG','complete W/E archive/final/permit/outerpostclose'],positiveEvidence=['Shared immutable custody/mode/production/public algorithms remain exactsource reuse, not new actual qualification','Actual direct child handle retained before PID validation and same-thread poll/wait serialization enforced','Enrollment consumed before credentials; positive same-connection live polls independently passed; strict profile is distinct and does not call old relay_qualified','File reads reserve actual remaining budget before body acquisition; read primary/cleanup critical pair passed','All ten guaranteesfalse/six unsupportednull/historytrue and actual0 declarations remain; source provenance honestly preserves failed/reconstructed author attempt'],missingActualInputs=['exact future owner decisions','actual ABI/poll/startup/TLS/JDK/Jackson/classpath/fixture/password/role/tool/holder facts','actual scope/current Gateway closure/leases/per-unit phase/actual status/QA/root evidence'],implementationGaps=[x['id'] for x in F],finiteArchiveCounterexample='A newly added empty directory below W recurses and yields no rows, so originalMembers stays unchanged and archive_equal accepts the same file rows. No fake host or actual tree was created.',noStrongSecurityClaimGranted=True))
text='''# Independent C8 synthetic SOURCE01 architecture review

**HOLD — ten mandatory source implementation findings.** Exact subject
`bf6ff7d9cd627c40c6df37c9edc841cb7242170a287d3d15c9f1681899d764b7`,48 payloads.
The distinct synthetic consumer is a legitimate separate review subject; its direct
child/channel principal is not silently promoted into the strict Java02/business06
interfaces. This review does not adopt its policy or issue an owner ruling.

The source correctly limits ten stronger guarantees tofalse, six unsupported facts
tonull with reasons, history uncertainty totrue and both identity-completeness flags,
legacy gate, C8 and credit tofalse. Production0153/harness82a9/body/driver/public
schema/wire/TLS and reused selected projection/custody definitions remain literal.
The serialized direct Popen child is retained before PID validation, and enrollment
is consumed before the same retained connection's UID/PID checks between two live
polls. The independent positive pair passed; it proves no actual ABI, image/object,
generation, interval, adversarial race exclusion or selected Gradle worker binding.

The implementation is incomplete at concrete boundaries. communicate accepts its
whole internal allocation before the nominal16MiB check; independently known exit
facts are then dropped on failure. The enclosing per-entry private sink/first-error
caller is prose, and earlier bootstrap errors write unchecked FD2. Reusing an inherited
nonempty FD1 cannot satisfy the next empty-sink admission without implemented wrapper
rebinding. The requested shell BIN parameter also needs an exact concrete parent
attestation bound to the release role map. UNKNOWN ownership is safely retained in a
nonreturning loop, but its external disposition is expressly unimplemented. These
are source implementation gaps; later owner adequacy or missing actual input labels
cannot complete them. Do not replace retained ownership with teardown/signals/retry.

The full consolidated findings also include first-primary replacement by Storage.write
cleanup and analogous bare finally/partial paths; UTF8 bound after encoding; original
readiness not freshness-bound, clock reversal and expired outer allow publication;
lease expiry during setup followed by native launch; postclose entry's original-parent
contradiction; loss of predecessor relevance in later entries; and full archive omission
of empty directories/directory metadata and directory entry caps. findings.json gives
all exact locations, counterexamples and required category-wide corrections. They
must be handled together; this is not a conditional empty-finding approval.

One bounded independent batch passed12 critical counterexample/positive cases with
12 meaningful observations and zero denied host events, actual0/ef0a68. Its10,286
reused-fixture bookkeeping checks are distinct from those12 observations. It executes
actual target functions in SAME compiled namespaces with preloaded stdlib, all reached
effects fake and the unchanged persistent author deny audit installed through exit.
No author24/old498/313 suite was replayed. The raw per-case count field was evaluated
before each call and isunused0; aggregate12 and the12 case pass/detail records are
the evidence. That presentation error is disclosed, not silently rewritten or rerun.

Independent finite verification passed1,537 pin/source/AST checks over277 pin records,
actual0/9aec22. All48 payloads and49 checksum rows/whole membership matched; the seal
deliberately excludes SHA256SUMS from manifest and the checksum binds48+manifest.
All170 mapped definitions, exact first-read cap/hash/literal placeholder expansion,
nonremovable runtime checks, source02 literals, adopted design/QA/root complete limits
and selected approved input graph were inspected. The initial reviewer template-equality
assumption failed1f4ea2; only that checker was corrected, with its log retained. No
subject bytes or target test were changed. Large displays truncated redundant maps;
full exact bytes were read/verified and relevant concrete source bodies reviewed.

Author24 fake cases remain attributed source evidence: initial23/24 actual1 and later
24/24 actual0 with26,849 model/FD checks. The reconstructed first-run script lacks a
contemporaneous hash and remains explicitly unproved as first-run source equality.
Its static constructor/owner-path/first-error changes are distinct from the harness
OSError catch fix. Full root CLI/shell were not actually exercised by that evidence;
direct Unit flows cannot prove the postclose parent or enclosing sink implementation.

review-record.json truthfully carries nonempty mandatoryFindings and therefore fails
the current runtime's empty-finding review predicate. No accepted record or owner
decision was fabricated. Both independent exact corrected source/caller/security
reviews and three own Aria/Quinn/root technical/security rulings remain required.
Actual mechanisms/principal/roles and every fixture/compiler/mode remain unqualified.
All six current failed Gateway closing duties and each later unit's separate actual
archiveQA/final/separate status/readiness60spermit/guard/wrapper/outerpostclose/QAroot
remain. No aggregate nine-mode close, old Gateway/C8 grant or ordinary/business bridge.

Only this exact review directory was written. No current E/W/N/holder/lock/census/kernel,
unknown raw executable path, private/report/log/protected baseline body-stat-hash,
cache/home/tool/provider/API/network/native/compiler/namespace/source-window/lease,
signal/cleanup/credit/lifecycle action occurred. Business/default4000/Order17/root731/T0/
preF1/NONIR/Replayb8wholef9 restoration/atmostonecompile/C8-before-credit/mainIR/skips/
cohorts/clocks/order/external21/privateC5C212/lifecycle holds remain. USD500 shared;
aggregate spend UNKNOWN. Full inherited conditions are bound in conditions.json.
'''
(H/'review.md').write_text(text)
files=sorted(p for p in H.iterdir() if p.name not in ('manifest.json','SHA256SUMS'))
rows=[dict(path=p.name,sha256=sha(p.read_bytes()),bytes=p.stat().st_size,mode=stat.S_IMODE(p.stat().st_mode)) for p in files]
put('manifest.json',dict(kind='SEALED_INDEPENDENT_C8_SYNTHETIC_SOURCE01_ARCHITECTURE_REVIEW',reviewer='Aria',verdict='HOLD',subjectManifestSha256=SUBJECT,mandatoryFindingCount=len(F),sourceOnly=True,technicalOwnerRulingIssued=False,actualRuntimeAuthority=False,files=rows,memberCount=len(rows),manifestAndChecksumSelfExcluded=True,independentCriticalCases=12,independentObservations=12,modelBookkeepingNotIndependentCases=10286,finiteChecks=1537,publicPinRecords=277,actualTargetActions=0))
files.append(H/'manifest.json');(H/'SHA256SUMS').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n' for p in sorted(files)))
print(json.dumps(dict(status='SEALED_HOLD',manifestSha256=sha((H/'manifest.json').read_bytes()),payloads=len(rows),mandatoryFindings=len(F),independentCases=12,finiteChecks=1537,actualTargetActions=0)))
