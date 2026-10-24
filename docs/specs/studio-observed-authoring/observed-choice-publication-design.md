# OBS-006 accepted observed-choice publication

Status: bounded design for independent data/runtime/QA review; no implementation approval or lifecycle verdict. This retains existing005 accepted human target resolution during006 publication. Earlier designs/reviews and synchronous/source-choice evidence stay unchanged.

## 1. Source truth and selected correction

`GuidedTranslationService.effectiveObligation` uses an accepted observed meaning's **locator** to replace targetIntent and constrain the next proposal. This permits a user to choose Backup destination instead of the original Destination; it is existing human target resolution, not lexical equality with the original interpretation. Operation/predicate/authored input/binding/read/scope constraints still apply.

Publication currently loses that decision: EvidenceRepository retains only source `need/reference` selections, Java Builder passes the raw obligation to proposals.action, and Node validates its raw targetIntent. A legitimate alternate observed locator therefore cannot satisfy publication. A source-phase choice does not prove this case.

Actual persistence constraints matter:

- V32 clarification identity/meanings are immutable; accepted_choice is one-time and member-checked. Identity currently holds session/scope/source/config/question, with **no original attempt/plan/fence association**. question() generates fresh server choice/question IDs; APPLIED attempt.safe_result retains provider IDs. Do not guess a questionId→attemptId link or use latest matching response.
- Model attempt identity retains requestId/attempt/kind/projectionHash/planRevision, original owner/scope/document/generation/executionEvidence; APPLIED safe_result is the actual validated provider response and becomes immutable. Full original prompt/request bytes are not stored. Do not fabricate or claim to re-hash those bytes.
- progress.resolvedClarifications contains the accepted answer's source/config/question/choice/coordinate/node/document/generation and server resolvedAt. It is mutable progress, **not an immutable acceptance timestamp/actor table**.
- V33 original observations are captured at preparation. A question occurs earlier, and answer REFRESH replaces its observation. Never substitute the later preparation observation for missing question-generation evidence.

Choose prospective original question capture plus an immutable **preparation-time acceptance witness**. Reuse the existing immutable question context and observation table; add one bounded optional column to the existing immutable publication-preparation row. No new action ledger, no backfill, no provider call, and no replay to validate publication.

## 2. Prospective question association and original observation

Pass the actual current model attempt identity into the private question() helper from ModelApplication.apply. For observed questions only, build closed `QuestionCapture1` from the actual request identity/current locked plan and original current observation. Extend the internal context identity with optional `questionCapture` through a new create overload; preserve existing two-argument semantics for source/legacy callers. Public/model question/answer DTOs are unchanged.

```text
QuestionCapture1 = C{version:1,attemptId:ID,requestId:ID,attempt:integer[1..3],
 planRevision:Rev,planHash:H,obligationId:UUID,workerId:ID,ownerFence:N,
 contextId:ID,contextRevision:N,authoredInputsHash:H,
 executionEvidence:ExecutionEvidence2,evidenceHash:H,observationHash:H,
 modelQuestionHash:H}
```

Source mappings: attemptId/requestId/attempt/owner/document/generation/executionEvidence come from the original persisted reserved attempt; expected contextRevision/authoredInputsHash come from the **actual reserved model request projection** already supplied to ModelApplication, checked against current materialization before capture. Reject a changed context; never restamp it. planRevision/hash identify the actual immutable accepted plan used by that request. All provider alternatives must name the same current unfulfilled obligationId and question coordinate, as existing question() enforces. modelQuestionHash is H(actual validated response.question), including its provider IDs/labels as audit bytes; neither is authority.

`GuidedSessionService.translationQuestion` gains an internal overload carrying this capture to `GuidedClarificationContextStore.create`. A publication lifecycle question hook atomically validates/captures the question's current sanitized Observation2 into existing `studio_guided_publication_observations` using the same identity/hash/privacy/cap checks as preparation capture. This happens before changing to AWAITING_CLARIFICATION, in the existing model apply transaction; completion to APPLIED safe_result is in that same transaction. If any part fails, question/context/capture/model application roll back together. Original observation must equal the current observed executionEvidence hash/document/generation/origin and capture identity; no extra collection.

Only base-enabled sessions retain publication observation evidence. Disabled/old sessions never gain a late base. Captured identity remains within existing64KiB identity limit; meanings within64KiB/10 choices; observation within32768 bytes,500 nodes/depth8 and existing400 captured observations plus actual session400/1MiB admission limits. Deduplicate only identical session/hash/body. Question capture is storage of an already acknowledged observation, not another observation budget charge.

V32 already allows bounded additional identity fields and guards identity immutability; no historical V32 edit. The new association has no automatic SQL FK inside JSON: production create and independent publication reader **must** join same-session attempt and immutable plan, refusing missing/wrong rows. This is not represented as a pre-existing DB-enforced FK. At creation the attempt is CALLING; at publication it must be terminal APPLIED, kind NEXT_ACTION, safe_result.status CLARIFICATION, correlated requestId/kind/attempt and matching capture. No post-hoc search or association backfill.

## 3. Freeze acceptance at the actual preparation boundary

Existing public clarify authenticates the original user, validates question/source/generation/expiry, single-assigns accepted_choice and writes resolvedClarifications with resolvedAt in one session transaction. Keep this path and public body unchanged. Do not add a fictional acceptedAt or claim the mutable progress timestamp was previously immutable.

Add nullable `observed_choice_receipt jsonb` to new V33 `studio_guided_publication_preparations`. It is internal publication evidence, not the public PreparationProof2. The existing deny-update/delete preparation guard covers this new column. Its SQL CHECK accepts NULL or the exact closed bounded receipt below, with every required predicate `IS TRUE`; sessionId and preparationId equal the row. This is a reviewed extension of unshipped V33, not an edit to closed V30–32.

```text
ObservedAnswerSnapshot = C{sessionId:ID,scopeHash:H,clarificationId:ID,
 coordinate:Coordinate,documentId:ID,generation:N,choiceId:ID,
 nodeId:ID,bindingId:ID|null,sourceRevision:Rev,configurationRevision:Rev,
 resolvedAt:original ISO instant}
ObservedChoiceReceipt1 = C{version:1,sessionId:ID,preparationId:ID,
 clarificationId:ID,obligationId:UUID,contextIdentityHash:H,meaningsHash:H,
 questionCaptureHash:H,acceptedChoiceId:ID,answer:ObservedAnswerSnapshot}
```

Receipt≤16384 canonical UTF-8 bytes; original v2 answer timestamp bytes stay unchanged. It is an immutable **snapshot as of preparation**, not newly invented historical acceptance metadata. Current publication snapshot/basis/claim hashes bind it. Before writing it, preparation capture must verify under the existing session/source lock:

1. Exactly one accepted observed question for this obligation (all accepted rows searched, not only an iteration winner), valid prospective questionCapture and original observation, correct source/config/scope/context/worker/fence and original model/plan joins.
2. Immutable accepted_choice names one exact immutable meanings entry and the corresponding server public choice. The current progress answer equals its original question identity, coordinate, document/generation, source/config and chosen choice/node/binding. resolvedAt is a valid server-recorded original instant within question/session expiry; it is audit consistency, **not sole permission or ordering proof**.
3. The original question coordinate is this obligation/occurrence. The accepted meaning's locator exactly equals the proposal locator. Acceptance is already present when the preparation row is inserted, before admission/effect. The later immutable admission/preparation association ties that witness to the actual successful action; no later answer can be retroactively attached to an existing preparation.
4. Answer refresh legitimately produces a newer generation and new node/document identity. Require actual later generation and fresh preparation node membership/guard; do not equate old and new node IDs/documents. Scope/context/worker/fence and permitted origin remain joined. The historical selected node must independently exist in the original question observation with that exact locator; the current proposal node independently exists in the preparation observation with that same durable locator.

No receipt is emitted when no accepted observed choice applies. An accepted observed row without capture/answer/witness refuses even if its locator coincidentally matches the raw plan intent. Existing preparations with NULL witness cannot be backfilled; old missing proof requires deliberate new learning. Same-question idempotent answer remains one acceptance. Multiple accepted observed questions for one obligation are refused, including equal-locator duplicates; there is no explicit supersession provenance, so neither timestamp nor JSON iteration implements last-wins. Apply that same deterministic rejection in learning effectiveObligation before another action, rather than continuing an ambiguous interpretation.

## 4. Closed pure validation evidence and deterministic derivation

Extend only internal `ValidationBasis.PreparationFact` with optional `observedChoice: ObservedChoiceWitness1`. Omit the field completely for zero/source-only choices; do not emit an empty/null default that changes old basis bytes. SourceSelections stays unchanged. Other original joins/hashes remain mandatory.

```text
ObservedQuestionMeaning = C{obligationId:UUID,nodeId:ID,bindingId:ID|null,locator:Locator2}
ModelObservedQuestion = C{reason:existing question reason enum,
 choices:A<C{choiceId:ID,safeLabel:string[1..256],meaning:ObservedQuestionMeaning}>[2..10]}
ObservedQuestionContext = C{sessionId:ID,scopeHash:H,sourceRevision:Rev,
 configurationRevision:Rev,clarificationId:ID,question:Clarification2,
 questionCapture:QuestionCapture1}
QuestionAttemptEvidence = C{attemptId:ID,requestId:ID,attempt:integer[1..3],
 kind:NEXT_ACTION,status:APPLIED,projectionHash:H,planRevision:Rev,
 scopeHash:H,scope:LearningScope2,owner:{workerId:ID,fence:N,leaseExpiresAt:original ISO instant},
 documentId:ID,generation:N,executionEvidence:ExecutionEvidence2,
 responseSchemaVersion:2,responseRequestId:ID,responseKind:NEXT_ACTION,
 responseStatus:CLARIFICATION,modelQuestion:ModelObservedQuestion}
QuestionPlanEvidence = C{revision:Rev,planHash:H,plan:AcceptedTranslationPlan}
ObservedChoiceWitness1 = C{version:1,receipt:ObservedChoiceReceipt1,
 context:ObservedQuestionContext,meanings:A<C{choiceId:ID,meaning:ObservedQuestionMeaning}>[2..10],
 acceptedChoiceId:ID,attempt:QuestionAttemptEvidence,questionPlan:QuestionPlanEvidence}
```

These are value-free source/choice/audit projections; no full model prompt, resolved configuration, credential, runtime business value or account handle. Project only those explicit attempt fields from actual immutable identity/safe_result. Full request/projectionHash cannot be independently re-derived from absent historical prompt bytes; retain it as opaque original audit identity, not proof of user authorization. Node validates this local closed question-data type without importing the entire model/provider schema family. Provider choice IDs/labels stay untrusted audit data and never become action arguments, output diagnostics or replay selectors.

Each witness≤262144 canonical UTF-8 bytes; max200 witnesses, at most one per admitted obligation/preparation. The unchanged ValidationBasis ceiling is6,291,456 canonical UTF-8 bytes; the unchanged complete validation request ceiling is8,388,608 bytes. All existing lowerer/validator aggregate and per-field caps continue to apply independently, so not every combination of individual maxima is promised and the request ceiling never raises the basis ceiling. Original question observations join the existing observations pool, deduplicated by exact hash/body; Java emits exactly the union needed by successful preparations and validated question captures. Node's used-observations equality must count both independently verified uses and still reject unrelated extras. No duplicate placement bypasses existing400 observation/count/byte accounting.

Independent Java and Node validators must each:

- Preserve the original observed CLARIFICATION cardinality of2..10 in the model question and its equal ordered server choices/meanings. Starting with a valid two-choice witness, coherently remove the unselected alternative and recompute every local and outer hash: both validators must still refuse the singleton. Exercise exact/over basis and request ceilings independently, including multibyte UTF-8 and many individually valid witnesses; a basis over6,291,456 bytes refuses even within a request below8,388,608 bytes.

- Verify every witness hash/reference against its question context, immutable mapping, prep receipt and original question observation. Require observed phase, nonnull original question document/node IDs, exact source/config/scope/coordinate and capture/attempt owner/context/evidence correlation. Require H(modelQuestion)=capture.modelQuestionHash and exact ordered meanings equality between provider response alternatives and server mappings, ignoring provider IDs only for the server-ID mapping comparison. Check server choices and meaning IDs are complete/unique and selected choice/node/binding metadata agree with the receipt answer.
- Verify H(questionPlan.plan)=questionPlan.planHash=capture.planHash; capture/attempt/questionPlan revision agree. Resolve the original obligation in that actual immutable historical plan and require it byte-equal to the same server-issued obligation in the final accepted plan and action association. This supports unrelated later refinements **only** when the admitted meaning is unchanged; no current-plan substitution for the old plan. All original source-reference/need/binding constraints remain enforced against the final plan and executed graph.
- Independently resolve the chosen old node in its original question observation, exact locator membership and scope/origin. Independently resolve the fresh proposed node in its preparation observation under the existing operation-specific live-evidence/guard/read checks. Require locator equality across the accepted meaning and actual proposal; old node identity is not executable authority.
- Derive a local effective obligation by copying the immutable raw obligation, replacing only targetIntent with the accepted locator name/value and attaching that exact selectedLocator. The replacement is explicit human resolution: no equality with the raw targetIntent is required. Validate the actual operation/predicate/argument/source-reference/binding/read recipe against the unchanged original constraints. Observed meaning.bindingId is retained mapping metadata; it cannot replace the plan's allocation/binding/input or authorize a read.
- A qualified selection is a second source of the effective obligation. When an obligation has a non-null scopeIntent and no accepted observed choice, the proposed node must be the only candidate (name and region), and its proposed locator must be one of its hints and unique in the observation. The effective obligation then replaces targetIntent with that locator's name/value and attaches it as selectedLocator. Java and Node validators implement this identically (shared vectors: contracts/v3/qualified-label-vectors.json); an accepted observed choice always takes precedence. Decision: user, round 057.
- Lower exactly the actually executed proposal as before. Do not mutate the stored plan, source, obligation meaning, admissionProvenanceHash or executed operation/locator hash. The added basis witness changes basisHash/publicationEvidenceHash for choice-bearing publication, and consequent artifact/revision hashes through their existing formulas; no separate inferred authority hash.

The Java exporter checks **completeness against all actual accepted observed rows**: every such decision must have its immutable preparation witness and successful action association. Node cannot independently discover an omitted DB row that was never sent; do not claim otherwise. It validates every supplied witness, requires proof for every alternate-intent action and rejects truly unused extras. Dropping a same-target choice must be refused by the actual Java/DB completeness join even though that omission is not inferable from a standalone no-choice basis.

## 5. Compatibility, pins and refusal

Keep executable Profile, artifact2, policy3, validationBasis1/validator observed-1 identity and existing operation language unchanged. This is an optional closed internal proof extension with explicit witness version1, not a new executable operation. Zero/source-only projections and canonical fixture bytes remain unchanged. Old alternate-choice histories without prospective evidence refuse; no default proof or backfill.

The changed replay-validation schema and packaged schema bundle/build catalog **must** be regenerated/coordinated. Old pure-validator transport cannot accept a new closed shape and must fail the exact required build/schema handshake; never send a witness to an old validator and accept an ignored-field result. Backend/runner/catalog deploy as one supported validation combination. Saved previously published compatible artifacts retain their execution profile; no LLM relearning merely for a model/prompt default or zero-choice schema-compatible upgrade. Rollback lacks new proof support and refuses new choice publication while preserving historical receipts and existing supported saved replay. Retain/re-enable compatible build or deliberately relearn; never strip witness fields to force acceptance. Model/public/IPC schemas and privacy policy remain unchanged.

## 6. Implementation ownership and independent oracles

Already reserved affected paths: GuidedTranslationService, GuidedSessionService, GuidedPublicationEvidenceRepository, GuidedPlanBuilder, V33 migration, GuidedPublicationEvidenceTest, GuidedPublicationMigrationTest, GuidedPlanBuilderTest, ObservedArtifactLowererTest, GuidedPublicationReplayIT; runner observedReplay validator, replay-validation schema, schema build/check tools, packaged observedSchemas/runtime records, independent publication fixtures/canonical vectors and observed tests. Exact repository paths remain in the story. Add the one missing product path:

- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedClarificationContextStore.java

New documents/record:

- docs/specs/studio-observed-authoring/observed-choice-publication-design.md
- .ai/STUDIO-OBS-006-observed-choice-publication-design.json

Required paired independent Java/Node valid baseline then mutations: genuine captured accepted alternate choice succeeds; raw target differs legitimately; no-choice/source-choice bytes unchanged. Wrong/unaccepted question/choice, absent original observation, missing prospective capture/prep witness, wrong attempt/status/kind/plan/hash/obligation/source/config/scope/fence/context, altered old/fresh locator or node, forged request/model question, premature/fake progress answer, wrong binding override, extra/duplicate witnesses and multiple accepted decisions refuse. Later unchanged-obligation plan refinement has its real historical plan proof; changed meaning refuses. Source/owner/plan drift while capture is pending rolls back atomically. Direct SQL column update/delete/extra/missing/null-key/cap tests preserve old rows and immutability. No model/network inside locks.

The real controlled joined case must ask an observed-phase question, accept the alternate legitimate locator through the public answer API after model/human delay greater than browser timeout, preserve exact selection through refresh, publish through the actual pure validator, and perform two fresh same-artifact model-free recorded replays. Assert chosen and unchosen destination values independently, exactly one submit per explicit run, no finalization actions or binding-read retry. Keep the separate source-phase timing case and asynchronous receipt-barrier case; neither replaces this proof. No fabricated provider result or live-quality benchmark.
