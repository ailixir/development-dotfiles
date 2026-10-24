"""Own review metadata writer/sealer only; no target definition execution."""
from pathlib import Path
import json,hashlib,stat
OUT=Path(__file__).parent;T0=OUT.parents[1]
SRC=T0/'early/c8-synthetic-local-report-prep/resume1'
PEER=T0/'resume-architecture/resume2/c8-synthetic-local-report-source01-exact-review'
SUBJECT='bf6ff7d9cd627c40c6df37c9edc841cb7242170a287d3d15c9f1681899d764b7'
PROTOCOL='C8_JAVA_SYNTHETIC_LOCAL_REPORT_V1'
def get(path):return json.loads(path.read_bytes())
def put(name,value):(OUT/name).write_text(json.dumps(value,sort_keys=True,indent=2)+'\n')
def sha(raw):return hashlib.sha256(raw).hexdigest()
finite=get(OUT/'finite-results.json');critical=get(OUT/'critical-results-attempt02.json')
if finite['failures'] or critical['failures'] or critical['deniedHostEvents']:raise RuntimeError('REVIEW_EVIDENCE_FAILED')
peer=get(PEER/'findings.json');findings=[]
qa_evidence={
1:'Own QA nonzero utility case: communicate returns status7 and both byte buffers, waitReturned true, but actualExit remains null and completion UNKNOWN. Finite source also confirms unbounded communicate before either16MiB check. Aria oversized-buffer counterexample is separately pinned/reused evidence, not replayed.',
2:'Independent source trace: first-read helper has no enclosing per-entry sink creator; root-caller inherits FD1/FD2; launch verifies stdout only after read/compile/release/decision; main writes unchecked FD2 on earlier failure. C8_S0_BIN is not bound into the release declared BIN by concrete parent attestation. Aria bootstrap-private-channel case is reused, not replayed.',
3:'Both Unit.retain_foreground and foreground_boot_hold are literal infinite loops. The packet explicitly calls the external disposition UNIMPLEMENTED. Retaining actual references is preserved, but no complete ordinary failure closure is implemented. Test-only StopForeground is not actual termination.',
4:'Own QA write/close counterexample propagates close OSError while original write ValueError survives only as __context__; Storage.primary remains unset. Same bare-finally category exists in info/mkdir/inventory and selected custody paths. Read/create first-primary fixes are retained and must not regress.',
5:'Own QA injected hash failure records only one field call and no self_report; the other field is never collected. Finite source proves encode precedes byte bound. The4096char memory limit is not the adopted4096UTF8-byte-before-encoding requirement.',
6:'Own QA gate accepts readiness createdAtNs1 at roughly1e12ns, and PRE1000000009000 then POST1000000003000. Another own exact execute/gate fake returns0 after sink delivery advances time beyond permit expiry1060000000000. POST precedes finish/serialization/write/shell delivery.',
7:'Independent source: owners checks lease once before current/source/setup. Native performs preadmit, phase, mkdir and attempt publication before starting its monotonic budget, and does not recheck lease before child.launch. Aria actual-function fake late-launch counterexample is reused/pinned, not rerun.',
8:'Independent entry/caller trace: BOOT_PARENT binds getppid to descriptor.expectedShellPid, then BOOT_HOLDER binds that same value to release.holder.shell.pid. Postclose must run after this original shell is absent; no distinct outer observer caller is modeled. Direct Unit fake flows bypass launch.',
9:'Independent complete call map: only negative/preadmit call history, history restores only capture and only after an admitting sample. Archive calls current before reading held; final/gate/postclose never restore the full typed predecessors. Fresh Inspector starts relevance empty. Aria prior-relevance fake is reused/pinned.',
10:'Own QA inventory of /inventory/empty yields zero rows and succeeds with entry budget0. Directory rows/reserve are absent, archive builds directories only for files, equality compares file rows only. Additionally Custody.members uses unbounded listdir before any entry count, so checking file count later cannot bound directory-name acquisition.'}
for number,p in enumerate(peer['mandatoryFindings'],1):
    row=dict(p);row['id']='C8S01-QA-'+str(number).zfill(2);row['correspondingArchitectureFinding']=p['id']
    row['peerEvidence']=p['evidence'];row['evidence']=qa_evidence[number];row['independentlyReviewedSource']=True
    if number==10:row['requiredCorrection']+=' Bound directory-name acquisition before materializing an unbounded list; a later len/list/file-only budget is insufficient. No new enumeration API is implicitly authorized.'
    findings.append(row)
findings.extend([
dict(id='C8S01-QA-11',mandatory=True,severity='HIGH',title='Match the unchanged Java control environment wire instead of supplying a path',
 locations=['runtime.py:Unit.phase:445-450','observer-fragment.java.txt:p3ObserverControl:104-114','fake_check.py:World.make_release/World.popen'],
 evidence='Frozen Java reads CHECKS_PUBLIC_OBSERVER_CONTROL as Base64url-encoded raw control JSON, decodes it, caps decoded bytes4096 and hashes those bytes. Python phase(relay) requires the variable equal launchControlPin.path. These are distinct subjects; the actual literal absolute path contains characters outside the URL decoder alphabet and is not the serialized control. Author fake World manufactures DATA/COMMIT directly and never calls this Java parser. Finite review binds both exact literals; no Java or new fake case was run.',
 impact='The sealed full Python/Java relay cannot admit its own launch environment, regardless of correct Java/path/ABI inputs. The all-nine fake flows do not cover this consumer boundary. Native producer return/hash/printed ROOT_RECEIPT_REQUIRED cannot replace DATA/COMMIT.',
 requiredCorrection='Preserve frozen production0153/harness82a9/body/driver/wire. Construct and validate the exact existing Base64url environment representation from the same already pinned raw launch-control bytes, with original byte/character/hash limits, no reopening or operationalizing raw self text. Bind the requested launch environment hash/control raw SHA/nonce consistently in caller, release, source/phase maps and receiver. Add one bounded pure cross-language-literal/encoding contract check; no Java/native/platform action is authorized by this finding.',status='OPEN_SOURCE_IMPLEMENTATION_HOLD',independentlyReviewedSource=True),
dict(id='C8S01-QA-12',mandatory=True,severity='HIGH',title='Acquire the complete externally pinned control graph before target module interpretation',
 locations=['entry.py:launch:124-146','entry.py:modules:78-85','runtime.py:Unit.owners:315-345','runtime.py:Unit.phase:397-451','finite-method-dependency-map.json:loaderOrder'],
 evidence='Entry reads and hashes manifest, six code buffers, release and decision, then executes all module top levels via modules(buffers). Release/decision structural validation comes after that execution; exact rootScope/codeReview/owner/input/environment/launch-control graph is read later through Unit.owners/phase. The author loaderOrder explicitly reflects that ordering. This satisfies code-buffer hashes but not the saved task requirement to bind the complete independently pinned root/current-input/review/owner control graph before parsing/compiling the consumed target code.',
 impact='The requested pre-interpretation control/custody boundary is incomplete. Later owner Booleans and pin reads cannot retroactively establish acquisition/metadata/hash binding before earlier target interpretation. This is a source ordering/coverage gap, distinct from unknown future pin values.',
 requiredCorrection='Implement a reviewed bootstrap graph reader/closed schema that consumes the exact externally supplied release/decision/review/owner/root/current-input maps under aggregate/per-item caps and retained FD/private failure ownership before target compile/exec. Verify external raw SHA/metadata first, parse only the consumed bounded buffers, and pass those same buffers/facts forward without reopening. Preserve no self/future cycles, no guessed future pins, all once caps and no runtime or new API research authority.',status='OPEN_SOURCE_IMPLEMENTATION_HOLD',independentlyReviewedSource=True)
])
put('findings.json',dict(reviewer='Quinn',verdict='HOLD',subjectManifestSha256=SUBJECT,mandatoryFindingCount=len(findings),mandatoryFindings=findings,
 completeBatch=True,peerManifestSha256=sha((PEER/'manifest.json').read_bytes()),technicalOwnerRulingIssued=False,actualRuntimeAuthority=False))
conditions=get(PEER/'conditions.json')
conditions['currentQaLimits']=[
 'Exact inactive source/code/caller review only. All12 mandatory categories need correction together or precise unresolved source HOLD; no owner Boolean can implement a known missing boundary.',
 'New synthetic profile/principal remains UNADOPTED. Exact corrected source/caller/control/security/role reviews and separately issued named Aria/Quinn/root consumer technical/security rulings precede any use. This is not such a ruling.',
 'The complete source/caller/bootstrap/graph/archive/final/postclose surface is reviewed; frozen Java/harness/mode/custody reuse is literal pin reuse only. No author/Aria huge dynamic suites replayed. Own7 focused fake cases only, actual Java/mode/platform/native/peer/resource execution0.',
 'Ten stronger guaranteesfalse/sixnull-with-reasons/historytrue/legacyfalse/intervalfalse/identityCompletefalse/kernelIdentityCompletefalse/C8false/creditfalse remain mandatory. Strict Java02/business06 reject this different profile; selected worker binding remains UNPROVED.',
 'Raw reported executable text remains UNKNOWN and memory-only. No path guessing, alias resolution, candidate hashes, file/process-image inference, launch or authorization key may derive from its digest. Current metadata05 is ancestry only and no role ruling for C8.',
 'Producer0153/harness82a9/body/driver/Java control Base64url wire/TLS/schema3/cookie/soleUUID/oneGET/zeroHTTP remain literal. Fix Python consumer/caller contract without weakening application security or changing frozen sources.',
 'Bound acquisition before utility output and directory-name materialization; retain partial ownership and independently known wait/status/output facts, first primary and separate cleanup. UNKNOWN foreground retention is not a completed disposition or postexit proof.',
 'All actual nine qualifications remain UNEXECUTED_OWED; parser24 declared/Java0,7TLS/relay, real write-stall requestCompletedfalse/STALL_WRITE_FIXTURE,12/14/15/20/5 budgets, DATA16384/provisional-fsync-close-reread/ACK256/COMMIT512/EOF/full conservative15s remain.',
 'Current failed Gateway proper archiveQA/final/separate60spermit/wrapper1/outerpostclose0/actualQAroot precedes heavy. EveryF0/C0/mode needs its own once scope/lease/deadline/holder/negative/separate status/SAME-holder admission/archiveQA/root/final/separate actual inspection/readiness-bound60sPREafterallowPOST/guard/expectedwrapper/outercompletion/postclose0/QAroot, not one aggregate closing gate.',
 'JDK/java/javac/keytool/release/Jackson/classes/fixture/password/tool/holder/ABI/peer/poll/startup/blockedwrite/source/resource/timing facts remain UNKNOWN or UNQUALIFIED. No scans/home/cache/vendor/API/provider/entitlement research/probes/download/network/pull/retag/trust fallback selected.',
 'Business/default4000/Order17/T0root731/preF1/NONIR/Replayb8wholef9restore/atmostonecompile/C8beforecredit/mainIR/clocks/order/skips/cohorts/external21/privateC5C212/lifecycle/sourcewindow/lease/cleanup holds remain. Shared USD500 aggregate UNKNOWN.' ]
put('conditions.json',conditions)
put('review-record.json',dict(reviewer='Quinn',subjectManifestSha256=SUBJECT,protocol=PROTOCOL,sourceOnly=True,verdict='HOLD',
 mandatoryFindings=[f['id'] for f in findings],mandatoryFindingCount=len(findings),wholeCallerSecurityOwnershipPhaseDagReviewed=True,
 technicalOwnerRulingIssued=False,profileAuthorized=False,operationalAuthority=False,actualTargetActions=0))
put('boundary-assessment.json',dict(
 completeSourceMethods=finite['completeSourceMethods'],subjectPayloads=48,checksumRows=49,sourceMetadataPins=200,
 principal=dict(retainedDirectHandle=True,soleSerializedPollWaitOwner=True,consumedEnrollmentBeforeValidation=True,beforeAfterLiveNoneChecks=True,
  sameRetainedConnectionUidPid76And4=True,actualAbiPollStartupSecurityQualified=False,noBusinessBridge=True),
 firstRead=dict(shellBoundBeforeHelper=True,sameReadOnlyBufferLiteral=True,codeHashesBeforeCompile=True,completeControlGraphBeforeCompile=False,privateEnclosingCallerImplemented=False),
 ownership=dict(actualReferencesRetained=True,partialConstructorAttempts=True,nonretryUnknownClosers=True,unreturnedDispositionComplete=False,independentUtilityFactsComplete=False,firstPrimaryComplete=False),
 roles=dict(operational=['BIN','APP','PS','LSOF'],metadataOnly=['GIT','NODE','HELM'],freshCurrentQualification=False,rawReportedText='UNKNOWN_NOT_A_PATH',selfMemoryBoundsComplete=False,requestedLaunchParentAttestationComplete=False),
 modes=dict(actualExecuted=0,status='ALL_NINE_UNEXECUTED_OWED',productionAndHarnessLiteral=True,newSyntheticPredicateSeparate=True,relayEnvironmentContractCorrect=False),
 closure=dict(archiveCompleteTypedTree=False,directoryAcquisitionBounded=False,persistentCrossEntryHistory=False,finalOriginalReadinessFreshness=False,wholeAcceptedSuffixPermitFreshness=False,postcloseDistinctCaller=False),
 missingFutureActualInputs=['named separate owner records','exact root unit/lease/holder/current input controls','qualified JDK/tools/classes/fixtures/password/ABI/poll/startup','actual per-unit status/archiveQA/final/permit/wrapper/postclose/QAroot'],
 knownImplementationGaps=[f['id'] for f in findings],knownGapCannotBecomeOwnerBoolean=True,actualRuntimeAuthority=False))
put('reviewer-history.json',dict(
 savedTask='.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/c8-synthetic-local-report-source01-qa-review-task.txt',
 savedContext='.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/c8-synthetic-local-report-source01-qa-review-context.json',
 actualSafe=dict(exit=0,id='447e58',rootInspection='d28777',safe=True,threats=[]),
 skill='aiox-qa Quinn; explicit exact scope skips Node greeting/delegation/remote CodeRabbit/target main/actual boundaries',
 metadataReadCorrection=finite['reviewerReadFailure'],
 criticalAttempts=[dict(number=1,tool='92ec93',actualExit=1,executedCases=7,checks=53,passed=5,failed=2,
  cause='Reviewer gate fixture supplied incomplete readiness pin; controls.pin correctly rejected it before gate. No target defect/source change; exact pre-correction script and result retained.',script='critical-attempt01.py.txt',result='critical-results.json'),
 dict(number=2,tool='1cf420',actualExit=0,executedCases=7,checks=56,passed=7,failed=0,
  correction='Only complete fake readiness pin plus matching fake status hash and distinct result output name; same7 cases and unchanged target source.',result='critical-results-attempt02.json',noCaseExpansion=True)],
 finiteAttempts=[dict(number=1,tool='3f9f70',actualExit=1,cause='Reviewer substring lease test also matched self.release; finite checker false positive, no target change.',script='finite-attempt01.py.txt'),
 dict(number=2,tool='e89c78',actualExit=0,checks=1355,correction='Exact AST lease name/key and clock-call predicates; no target execution.')],
 sourceAuthorHistory=get(SRC/'attempt-history.json'),authorFinalFakeChecksReplayed=0,peerCriticalCasesReplayed=0,actualJava=0,actualNative=0,actualRuntime=0,
 boundedModelEvidenceOnly=True,suiteExpansion=False,USD500SharedAggregate='UNKNOWN'))
put('pins.json',dict(subjectManifestSha256=SUBJECT,peerManifestSha256=sha((PEER/'manifest.json').read_bytes()),pins=finite['pins'],
 criticalScriptSha256=sha((OUT/'critical_checks.py').read_bytes()),finiteScriptSha256=sha((OUT/'verify_source.py').read_bytes()),
 sourceHashes=critical['sourceHashes']))
lines=['# C8 synthetic SOURCE01 — QA HOLD','',
 'Quinn independently reviewed the exact48-payload source/caller packet and its49-row external checksum set. All12 mandatory categories are open. Ten align with the separately pinned architecture findings; QA additionally found the incompatible Java control environment and incomplete pre-interpretation control graph.', '',
 'The source has implemented useful retained-reference, serial child-owner, once-enrollment and explicit limited-claim safeguards. These do not complete the utility acquisition, private enclosing caller, UNKNOWN disposition, first-primary cleanup, self-text bounds, readiness/permit suffix, lease/deadline, distinct postclose caller, persistent history or complete directory archive boundaries. Missing implementation cannot be accepted as an unknown future platform input or delegated to an owner Boolean.','',
 'The unchanged producer expects Base64url raw control bytes in CHECKS_PUBLIC_OBSERVER_CONTROL; Python requires a path. The author fake world generates relay frames directly, so its nine fake flows do not validate that actual consumer contract. Preserve the frozen Java/wire and correct the Python caller/consumer. Entry also interprets pinned modules before acquiring/validating the complete owner/root/current-input graph required by the selected task.','',
 'Evidence:1,355 finite integrity/AST/schema checks cover all48 payloads,49 checksums,200 preparation pins,17 architecture payloads and170 method/call rows. Seven focused fake cases completed with56 checks and zero denied host events. These are model/bookkeeping checks, not56 independent tests or actual Java/native/platform qualifications. The first QA attempt had5/7 cases due to incomplete reviewer fixture pins; the corrected same7 pass. Both scripts/results/statuses are retained. One finite checker substring false positive was corrected to an exact AST predicate; both attempts remain. No target source changed.','',
 'Author evidence is reused truthfully: attempt1 actual1/23pass1fail with reconstructed noncontemporaneous script; attempt2 actual0/24pass/26,849 checks. Those counts were inspected and pinned, not replayed or added to QA execution counts. Aria’s exact critical evidence is independently source-adjudicated and pinned without replay.','',
 'No technical/security owner ruling, profile adoption, ordinary/business bridge, actual unit/source window/lease/runtime/cleanup/credit/lifecycle grant is issued. All nine actual mode qualifications remain owed. Current failed Gateway proper closure/QA/root remains a prerequisite before heavy work. Complete inherited conditions are embedded in conditions.json.','',
 '| Finding | Mandatory correction |','|---|---|']
for f in findings:lines.append('| '+f['id']+' | '+f['title']+' |')
lines+=['','Full source locations, independent versus reused evidence, impact and required corrections are in findings.json. Runtime owners validation will correctly reject this HOLD review-record because mandatoryFindings is nonempty.','']
(OUT/'review.md').write_text('\n'.join(lines))
members=[]
for path in sorted(OUT.iterdir()):
    if path.name in ('manifest.json','SHA256SUMS') or not path.is_file():continue
    raw=path.read_bytes();members.append(dict(path=path.name,sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(path.stat().st_mode)))
put('manifest.json',dict(kind='SEALED_INDEPENDENT_C8_SYNTHETIC_SOURCE01_QA_REVIEW',reviewer='Quinn',verdict='HOLD',
 subjectManifestSha256=SUBJECT,mandatoryFindingCount=12,sourceOnly=True,technicalOwnerRulingIssued=False,actualRuntimeAuthority=False,files=members))
(OUT/'SHA256SUMS').write_text(''.join(x['sha256']+'  '+x['path']+'\n' for x in members)+sha((OUT/'manifest.json').read_bytes())+'  manifest.json\n')
print(json.dumps(dict(manifestSha256=sha((OUT/'manifest.json').read_bytes()),members=len(members),findings=12,
 reviewRecordSha256=sha((OUT/'review-record.json').read_bytes()),findingsSha256=sha((OUT/'findings.json').read_bytes()),verdict='HOLD')))
