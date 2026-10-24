# v4 and off-tree draft design review

Aria (@architect), 2026-10-19T00:59:14.379596+00:00. **Design supported with the named conditions below. No application readiness or QA verdict is claimed.**

Reviewed current `lanes.v4.json` SHA **`9f0194705230c8b53ea1c790c5472c1fa3fd3195dfc5019561bb67ec55c03f96`** and `w-brief.v4.md` SHA `385cedf3079518c9fcdeaa307d7dc4a90f5ca02aceca3a6cfdfa8b49d01e7445`. Only this review’s T0 evidence is written. Real source, tests, plans and stories remain untouched by this reviewer.

## v4 verification

Normalized exact aliases match T0-DEV lists: **17 FOLD_PREP_MAIN**, **21 FOLD_TESTS**, with no path difference. The two absent main files are the explicitly new PublicationGrantAuthority and ObservedReplayBindingBuilder. All **47** exact FQCN filters resolve to **42** existing declared-package classes or the **5** approved new classes. N1/P3 writes+verification, deleted InferenceMigrationIT filter removal, broad historical grep/ports, three-worker schedule, conditional R-08-3, separate D5 records, protected Live surfaces and ADR-SC-006 limits are retained.

Root added the necessary application-order correction in `gstUnchangedMainOrder`: all backend/src/main bytes equal S_011 across the complete GS-T proof. GS-M(a), neutral seam staging and FOLD main units remain off-tree until it passes. Drafting may run in parallel. The prior 10.5-day arithmetic estimate is conditional; this proof barrier and lock contention may extend elapsed work.

Minor inherited prose still has the v3 heading, cap-5 lane phrases, and a contradictory sentence calling lanes.v4 “pre-start”. The root v4 preamble/schedule/barrier govern. These are clarity corrections, not authorization to weaken a proof.

## GS-T semantic rulings

### GST-S1 — APPROVED_BOUNDED_FIXTURE_SEAM

Real bootstrap must be initialBlank generation0 and leaves PROPOSING. Real navigate adds an action and changes the tested post-admission subject. Under original bridgeR5, PROPOSING→OBSERVING narrows admission permission; production observe then restores exact PROPOSING state and mints genuine app evidence.

The bounded sequence is:

1. real GuidedProductionSessionAccess resolve/initialize; classifier manifest created inside start transaction
2. real translation.plan; real initialBlank worker bootstrap and metadata ACK; READY/version2 proof; no planner-store writes
3. locked exact state PROPOSING; initialBlank executionEvidence generation0; no actions; action counter0
4. write document.state only toOBSERVING; no progress/evidence/hash/translation/plan/obligation/manifest/counter edits
5. invoke original owning-worker observe or original authenticated controlled-relay observations callback; real identity/fence/scope/source checks and generation/hash commit
6. assert post-callback PROPOSING and still no actions/counter0; planner reserve real obligation through prepareAndAdmit crash window; preserve original first click/secret action count and ordinal assertions

Scope: SessionIT service-only composition; LifecycleReasonIT service-only composition; TransportFaultIT four controlled-relay positive-admission paths using original authenticated observation callback.

Limits: No browser-navigation/startup proof is claimed by fixture seam; No production code change or generalized test-state forcing; No direct source/manifest/plan/translation/admission authority writes; R5 is original bridge test-state policy, not the 011 wait-libraryR5.

### GST-S2 — APPROVED_BY_NAME_SEMANTIC_PORT

Prepare two independently valid real start requests. Prefer changed applicationId with second governed policy while keeping saved environment valid; retain same method, same idempotency key, race and exactlyone IDEMPOTENCY_CONFLICT assertion. Disclose environment→applicationId fixture-field port. If classifier prevents that, report exact alternate ordinary-source fixture port before code.

Rejected: resolve spy opportunistically rewriting saved source/environment during authorization.

### GST-S3 — APPROVED_NARROW_OBSERVER_SPIES

Mockito spies around real final GuidedProductionSessionAccess may add old current/ownership/source-canary observers and false/denying controls after real checks. They must not replace resolve/initialize/sources/planner authority or turn a real refusal into allow. Keep actual complete verdict for positive planner cases; any old complete=true seam that upgrades realfalse needs a named separate ruling.

Genuine relay bootstrap callback and matching ACK precede original authenticated observations callback; keep native read/post/secretzeroization/process/cleanup assertions. Childcontroller composes real access and consumes existing authority, never reconstructs state.

### GST-S4 — REQUIRED_SUBJECT_PRESERVATION

Migrate real planner path for actual positiveadmission cases. Budget-only/noadmission cases retain real production-access start/initialize plus original assignment/materialization scaffold and no unrelated SOURCE_PLAN reservation. Never refund counters, inflate limits or loosen modelbudget assertions.

This retains the original exactly-one native action and ordinal-zero subject. A real navigate would add an action and cannot be disguised by changing counts. The narrowing seam removes admission permission, then delegates every evidence and generation decision to the original authenticated observation path; it does not install fake planner authority. Original bridge R-5 is the test-state narrowing rule, distinct from 011’s wait conversion R-5.

The producer/observer spy must call the real final production access methods before adding denial controls or value-free canary observations. Never replace real resolve, initialize or sources. A real refusal cannot become allowed through the spy. Positive completeness stays real; a forced true result needs a separate exact-case ruling and is not generally approved.

## GS-M(a) projection and teardown rulings

### GSM-P1 — APPROVED_DESIGN_CURRENT_DRAFT_CONFORMS

One projectResult(Session,publicationBase,installedEvidence,installedPresentation) builder is acceptable. publicationBase selects existing edge defaults only and grants no authority. Fallback keeps stepIndex.asInt0/has(errorCode); receipt path keeps asInt-1/isTextual. Actual evidence+presentation installers remain authoritative. Receipt authorization precedes any live-session/canExecute check and current-head readiness overlay stays in receipt projector.

No new contract/key/status/enum; validate final shape and preserve published learnedFromThisRun/receipt overlay.

### GSM-P2 — APPROVED_EXISTING_PROPERTY_INJECTION

Package-private optional Autowired GuidedPublicationProperties installer is acceptable; existing immutable bean only, no new key. Manual composition defaulttrue preserves prior fallback semantics. Lifecycle presence is not enablement because real lifecycle is installed evenwhenfalse. Only no-base fallback terminalSUCCEEDED with actual disabled property becomes REFUSED/nullreceipt/NOT_PUBLISHED; flag never authorizes publishing or bypasses receiptread access.

### GSM-P3 — CORRECTION_INCORPORATED_IN_DRAFT

Receipt-backed HTTP status retains old PENDING202 rule. Fallback status uses existing TERMINAL set via package-private terminalOutcome after deleting PublicSession shortcut: nonterminal202/v3result, terminal200. Manual default-enabled SUCCEEDED/PENDING therefore stays200. Disabled SUCCEEDED/REFUSED200 is explicit intended exception.

Current controller draft uses terminalOutcome; new HTTP IT contains manualenabled regression.

### GSM-T1 — APPROVED_STRUCTURALLY_NOT_RUNTIME_VERIFIED

Queued reservation covers submit through completion; atomic set guards queuednotstarted and in-flight duplicate windows. Rejection releases only volatile reservation and retains durable pending request for next tick. New value-free counterWARN rate-limited by injectedclock; bounded resend/validatedACK confirmation, pool2/queue64/30sidle and redrive15m unchanged.

Neutral installer-only patch retains old DiscardPolicy before newtest red. No seam lands beforeGST unchanged-main gate. After assertionred savehash/log, apply final behavior unit and green/mutants. Injected2-slot queue proves duplicatequeued behavior without silentdiscard hiding it.

New unit uses latches/ownedexecutor/uniqueids, durable-request snapshots, mutableclock and valuefree logger; no sleeps. Runtime execution pending.

### GSM-P4 — HTTP_DRAFT_INSPECTED_NOT_EXECUTED

RealSpring disabledproperty + realPOSTstart/no-base + MockMvcHTTP result routes validatePREPARING/FINALIZING202,v3P2/P3/evidence and SUCCEEDED200REFUSED; manualdefaultenabled200PENDING and authnegatives included. Directstate/progress writes are expressly projection fixtures and confer no successfulexecution/browser/model proof; do not reuse this widening as a GST plannerfixture.

Compile/run/red/mutant/style/QA remain unproven.

## Artifact and proof boundary

Inspected GS-T design and migration inventory; its three Java drafts/unified patch were not yet present at this snapshot. Inspected GS-M(a)’s three main Java drafts, neutral seam patch and both new test drafts. Input hashes are recorded in `draft-design-review.json`; edits made after this snapshot need re-review by diff.

No test, build, Gradle, Docker, provider call, git write, process signal, or new delegation was performed. Initial read-only process identity confirmed wrapper88167→daemon88182 live; root subsequently reported B1-DONE and B7 queued in session39422. Root alone accepts baseline results and announces tree open.

Actual compile, assertion-red, green, mutations, style/analysis, count reconciliation and current-digest evidence remain owed. GS-T first proves against exact S_011 main; GS-M then proves the explicit C-OBS009-1 and C-OBS008-1 changes. Independent QA owns final credit and Done. Teardown D5 and ReplayIT audit-control D5 remain distinct; neither is closed by this design review.

## GS-T Java drafts received after initial snapshot

SessionIT and LifecycleReasonIT drafts were subsequently inspected. Their 44 + 5 original `@Test` method names remain in exact order. The real snapshot adapter reads ordinary `ui_tests` rows with `FOR UPDATE`; production resolve/initialize/sources remain real, and no completeness-true spy is installed. The locked initial observation seam checks the exact S1 preconditions and unchanged progress. The S2 applicationId fixture-field port is present.

**DRAFT-1 remains open until corrected:** initial code called the zero-actions/counter-zero `firstObservationCommitted` assertion for every new reservation key. That would reject legitimate later step/action admissions. Restrict that assertion to the initial S1 seam; keep the later production ordinal/authority checks unchanged. Dex was notified. These drafts remain uncompiled and not ready to apply; TransportFaultIT and the unified patch were still pending at this update.

Spy-order clarification: an extra denial control may run before the real check when preserving the original fault/observer phase. Every accepted path must still execute the real checks, with no swallowed refusal or false-to-true upgrade. Value-free canary observers cannot create authority. This clarifies the earlier “real before narrowing” phrase without relaxing the authority rule.
