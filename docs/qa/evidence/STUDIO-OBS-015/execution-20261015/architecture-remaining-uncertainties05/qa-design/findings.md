# Quinn bounded design review: remaining rows 57, 65 and 85

**57: READY. 65: READY with the concrete constant-profile/shape refinements below. 85: NOT_READY and OPEN.** These are source-plan dispositions only. No story gate, lifecycle transition, source release, application test or completion credit is granted. The earlier 49/29/86/24 review and Aria's seven files remain immutable.

I independently checked the seven-file manifest and all 36 negative-case source pointer inventories, read the actual constructor/verification/recording/fence/admission implementations, and incorporated Aria's closing-source notes. The former direct-negative-loop description is historical: the current independent candidate comparison and runner routing repairs must not be requested again. Moving B0/R0 sources have no whole-tree stability claim here.

## 57 and 65: bounded implementation is ready

The [19-clause acceptance map](per-clause-acceptance-map.json) names proposed method selectors, case labels, exact subjects, controls and future commands for these three new files:

- `backend/src/test/java/com/citi/put/checks/studio/guided/publication/SnapshotBasisParityTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/publication/SnapshotBasisValidationTest.java`
- `studio-runner/test/observedSnapshotPreimages.test.ts`

These files are not implemented by this review. Root can release their bounded scope after the active source windows; no new production diagnostic API, schema, hash domain, oracle, migration or generator write is justified merely to expose intermediates.

For57, serialized canonical vectors and expected whole-map goldens remain evidence for their own subject. The new tests must invoke actual production chains/learned/snapshot builders against exact independently assembled or frozen intermediate expectations. Existing `snapshotComputation` objects supply the intended TestConfig, StepInput, StepChain, LearnedContent and StepSnapshot facts. The LearnedContent preimage has no new domain/version wrapper. Java exposes `learnedStepHash`; TypeScript exposes only `stepSnapshots`, so TS can prove exact composition through a snapshot built from the independently expected learned hash and already proven input chain, without claiming a private intermediate return or adding an export.

The map retains scoped global versus step declarations, deduplication/unsigned UTF8 order, lawful opaque context reference IDs, exact empty-value hash, text/context/evidence order, nullable TargetHint fields and actual Java normalized fractional ISO metadata. Java ingress may normalize omitted contexts; the closed pure TS basis must refuse missing required fields rather than invent defaults. Changing the unused-step2 context remains its separate obligation58; using a global-only change is not that test.

For65, every named hash is recomputed from the supplied immediate old base facts, never today's draft. Tests distinguish closed-shape omission from an inner semantic preimage mismatch. A wrong inner claim must retain coherent unrelated outer links: reseal only the necessary identity/revision/pin/program/plan commitments, leaving the target mismatch intact. A generic rejection caused by an earlier stale identity digest does not prove the intended artifact/profile/equivalence check. The existing resealed equivalence and map attacks count for those exact negatives; retain all 36 original names and pointers.

Two finite schema refinements prevent invented test worlds:

1. The supported profile is the closed constant `{contract:3}`. There is no schema-valid alternate supported field value. Use the hash of a wrong wrapper as the semantic wrong-claim case with outer resealing; omitted `contract`, unknown keys or `contract:2` are separate shape/profile refusals. Do not create or enable another profile.
2. The supported configuration browser is `chromium`. Its inclusion in TestConfig can be proved by the exact expected envelope and omission/wrapper counterexample. Do not call a different browser a valid application configuration solely to test hashing.

The exact existing RevisionIdentity has16 required fields, version1 and decimal revision strings. Test its omissions/unknown field through the actual closed schema and its digest versus whole-revision/wrapper preimages through production verification. The historical receipt's publicationEvidenceHash remains the actual stored commitment. `ObservedRevisionVerifier` reads and joins the immutable revision/receipt; `GuidedPublicationEvidenceRepository.snapshotEvidence` binds the original frozen pin, source and private declaration preimages. Pure TS can verify supplied equalities but cannot establish an unseen historical row's authenticity. No current basis hash, fabricated old basis, recursive proof or caller authority sidecar may replace that backend authority.

## 85: the proposed characterization is insufficient to close the original row

The [recording85 disposition](recording85-open-disposition.json) records the exact open clause, source anchors and requirement decision. I confirmed:

- Runtime dispatch consumes the admission and prevents parallel/repeated delivery. The durable INVOKING journal fence precedes `recording.begin` (`runtime.ts:363–367`). Successful coordinate ordinals advance; a started/unknown outcome stops and grants no retry.
- The sole admitted same-coordinate drift replacement requires `!nativeFence.started` (`runtime.ts:440–451`). Thus the first legitimate native-zero attempt has **no timing stamp**. Its immutable failed ledger/receipt is retained, and the replacement can have one genuine measured stamp. The first stamp cannot be fabricated to create a tie.
- The actual recorder samples one run origin from `systemOriginSource`; later readings are fractional monotonic offsets and `wireTimings` rounds once. A host schedule cannot guarantee equal rounded buckets. A different step/ordinal sharing `startMs`, or a derived step/action tie, is not the full old-key pair that exercises the admissionId tie-break.

Frozen ARCH03 explicitly makes tie preservation conditional on legal measured rows and says its synthetic legal wire pair does not assert that the current runtime emitted both. That condition rules out manufacturing duplicate effects or a stamp for a native-zero action. It does **not** grant a passing actual-tier result when no such pair was observed, nor authorize silently substituting recorder-only samples for the separately planned real joined recording/callback/backend/result/per-admission seek subject.

There are three distinct evidence subjects:

| Subject | What it can prove | Completion limit |
|---|---|---|
| Actual joined admitted-drift/native-zero invariant | Real ledger/fence/receipt, absence of first stamp, one actual replacement stamp, original same browser/clock/video/privacy | Required and independently executable; does not exhibit two measured old-key-tied admissions. |
| Synthetic comparator vectors | Exact ordering, retained rows/end selection/nulls, duplicate/unknown/dispatch0 refusal | Required pure semantics; no actual measurement or admission history. |
| Optional actual-recorder/real-clock/synthetic-ledger characterization | Real samples and media transported through explicitly bounded test authority | Authentic callback does not make fixture-owned same-coordinate rows production-authorized native attempts. It cannot independently close85. |

The optional one-shot characterization can be useful only with truthful scope. It must keep all samples, use the unchanged system clock/origin/rounding, stay within original caps, fail its tie predicate if no tie occurs, and never repeat-until-tie, discard runs, patch timings, bypass native guards or present test ledger rows as real action authority. No characterization implementation is released here.

The unfulfilled clause remains: **a legal actually measured distinct-admission pair tied in all old comparator keys, retained as two measured rows through the required real joined manifest/callback/backend/result and per-admission seek subject.** Current native retry semantics do not provide two stamps at that coordinate. The current joined helper also lacks the distinct identity-preserving media seek assertion. Two seek identities may share an offset; pixels need not distinguish two events within one millisecond/frame.

The requirement owner, with Aria and Quinn, must resolve the intended actual acceptance subject under that invariant: whether explicitly scoped real recording/callback/media characterization plus actual production no-fabricated-stamp proof is acceptable, or whether two production-authorized native stamps are mandatory and a lawful existing emission path must be identified. That is a recorded requirement interpretation/decision, not a permission to weaken at-most-once or an inferred QA waiver. Until resolved and backed by corresponding actual passing evidence,85 stays OPEN. The other36 source gaps and all57/65 tests remain independently executable; this issue does not halt the goal.

## Required verification after implementation

The acceptance map contains future focused commands. Capture actual source/dist identities, invocation, exit status, selected method/case labels, expected counts/skips and evidence. Focused tests do not replace full configured checks/coverage, all86 obligations, all24 ARCH05 facets, all55 migration methods, native/actual joined validation, independent015 QA/admin closure, then full008 work and closure. No test/build/Gradle/DB/native/browser/generation/format/install/source/spec/story/lifecycle mutation was performed by this review.
