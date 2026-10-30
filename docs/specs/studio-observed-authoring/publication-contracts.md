# OBS-006 closed publication and replay contracts — revision 2

Normative proposed contract appendix; implementation and independent re-review remain pending. Together with [data contract](publication-data-contract.md) and [publication design](publication-design.md), this freezes the chosen interfaces. Existing v1 compile/replay and v2 guided wire contracts remain unchanged unless an explicitly named new family is selected. No model is used in these interfaces.

> **STUDIO-GOV-001.4 (2026-10-24).** `applicationId`, `policyId`, `policyVersion`, `entryPolicyId`, `currentPolicyHash` and `TrustedPolicy` below are retired: allowed origins come from the test's own URLs and the runner's constant read profile (see the "Observation read profile" paragraph near the end). The shapes are kept as the historical record of R1-003.
>
> **STUDIO-FLEX-001 (2026-10-25).** `allowedOrigins` (in `Scope` and `ReplayRequirements`) and `approvedOrigins` (in the learning scope) are retired too: the deployment's allowed-domains list is the only navigation control, checked by the backend and the runner against their current configuration, and replay keeps its per-step origin pin (see the contracts README and `docs/specs/studio/allowed-domains-vectors.json`). The shapes below are kept as the historical record.

## C1. Notation, canonicalization and complete bounds

`C{...}` means a closed object: exactly the listed required keys; `?` explicitly marks the only optional keys; `T|null` requires the key even when null. A tagged union admits exactly one branch. `A<T>[m..n]` is an ordered array with bounds; IDs must be unique wherever they identify objects. References below to existing v2 schema pointers incorporate that **entire closed type including its conditionals**, not a loose JSON object. Schema generation resolves private external references locally; no network schema fetching.

Primitives: H=64 lowercase hex; UUID=canonical lowercase hyphenated UUID; ID=1..256 Unicode scalars and <=1024 UTF-8 bytes; Text=0..4000 UTF-16 code units and <=16000 UTF-8 bytes; Origin=existing v2 canonical http(s) origin, <=256 characters; Time=UTC RFC3339 with milliseconds; Rev=canonical decimal string `0|[1-9][0-9]{0,18}`, <=9223372036854775807; N=integer 0..2147483647. Canonical persisted/hash numbers are finite safe integers, no -0, fractions or exponent lexemes. Boolean means actual JSON boolean. Optional fields are not silently converted into null.

Canonical-v1 remains unchanged: sorted ASCII object keys, preserved array order and Unicode scalar bytes, JSON escaping exactly as ECMAScript `JSON.stringify` / RFC 8785 §3.2.2.2 (quote, backslash, the short escapes `\b \t \n \f \r`, other U+0000–U+001F as `\u00xx` with lowercase hex; no escape of slash, U+007F, U+2028/U+2029 or non-ASCII; see contracts/README.md), no normalization, UTF-8 SHA256. New objects use fixed camelCase ASCII keys; opaque IDs are array values, never object keys. Strict readers reject duplicate keys, invalid UTF-8, BOM, unpaired surrogates and depth>32 before semantic traversal. Existing embedded observation2 retains its stricter limits. JSONB reordering/whitespace must not change hashes; numeric domains are validated before canonicalizing. IPC measured elapsed times use finite nonnegative numbers <=2147483647 milliseconds, may be fractional, and are **not** included in canonical identity hashes.

New-family byte maxima are measured on the **whole composed UTF-8 serialization before parse/transport/spawn**, and again at receiving boundaries; no truncation or automatic retries with fewer facts:

| Document/frame | Maximum bytes |
|---|---:|
| artifact2 / policy3 | 1,048,576 / 524,288 |
| validationBasis / complete validation request | 6,291,456 / 8,388,608 |
| validator verdict | 65,536 |
| observed job including all inputs and account handle | 4,194,304 |
| launch2 / execute2 / ready2 / step2 / result2 frames | 131,072 / 2,097,152 / 4,096 / 8,192 / 65,536 |
| public finalize request / public receipt or result | 4,096 / 32,768 |
| account handle / trusted policy snapshot | 8,192 / 65,536 |

Legacy artifact's **65,536-byte** limit and all existing v1 body/frame/parser limits remain unchanged. Individual maxima do not guarantee composed fit. Additional maxima: 100 source steps, 200 actions total/8 per step, 200 inputs, 200 guards, 32 bindings, 200 consumer edges total, 32 origins, 32 application read grants, 128 optional field overrides, 400 original observations/preparations (D2 aggregate caps), 800 accepted translation obligations (existing V32; executed actions still<=200). Source text aggregate<=1MiB; resolved input aggregate<=262,144 UTF-8 bytes, each value<=4096 Unicode scalars and<=16,384 bytes (destination additionally canonical URL<=4096 bytes); empty plain string is legal for eligible slots. Captures retain existing stricter read bounds. Schema integers/strings must satisfy both inherited and new limits; tightening the observed family never relaxes v1/v2 guided limits.

## C2. Exact observed profile, source and trusted scope

```text
Profile = C{catalog:"observed-replay-1",playwright:"1.63.0",browserEngine:"chromium",contract:2,learnedPlan:2,observation:2,guidedPolicy:2,
 referencePolicy:3,lowering:1,artifact:2,language:"observed-2",executor:"observed-2",
 publicationEvidence:1,validationBasis:1,validator:"observed-1",protocol:2,
 replayAuthorization:1,accountAbi:1}
LearningProvenance = C{guidedModelContractHash:H,guidedProviderSchemaHash:H,
 guidedPromptHash:H|null,outputContractHash:H,publicationResultVersion:3,configuredModel:ID|null,providerReturnedModelVersion:ID|null}
BuildIdentity = C{profileHash:H,schemaBundleHash:H,referenceBundleHash:H,
 executableImageDigest:H,chromiumBuild:ID}
InitialContext = v2/learned-plan.schema.json#/properties/initialContext
Coordinate = v2/action.schema.json#/properties/coordinate
Locator = v2/action.schema.json#/properties/target/oneOf/0/properties/locator
Operation = v2/action.schema.json#/properties/operation
Configuration = C{browser:"chromium",
 viewport:C{width:N,height:N},timeoutSeconds:integer[1..120],waitStrategy:"load"|"domcontentloaded"|"networkidle",environment:ID}
SourceStep = C{stepId:UUID,ordinal:N,source:Text}
Scope = C{principalId:ID,csiId:ID,environment:ID,applicationId:ID,accountRef:ID,
 allowedOrigins:A<Origin>[1..32],capabilities:A<"navigate"|"click"|"fill"|"press"|"check"|"uncheck"|"hover"|"selectOption"|"read"|"assert">[1..10],
 policyId:ID,policyVersion:ID,entryPolicyId:ID,initialContext:InitialContext}
```

Configuration serializes precisely the pure `CompileInputs.from` configuration fields and enum spellings; viewport and timeout must also satisfy existing Studio DTO bounds, not merely N. An unsupported browser/strategy is refused by the actual runtime support matrix, not normalized to another value. No variables/secrets in configurationHash. SourceHash preserves existing H(ordered source string array); ordered step UUID/source pairs have separate authoringHash/sourceManifestHash. Full source comes only from immutable source manifest; compiler requests are never constructed. LearningProvenance stores original source/translation attempt pin hashes and publication-time API representation separately from execution Profile. Its bytes are bound by basis/publicationEvidenceHash and never rewritten. New publication must have a supported proof decoder for those historical source/translation records, but later replay does not compare their model/prompt/public-result pins against current defaults. A benign model/prompt/result-format change cannot invalidate a compatible saved replay. Readiness compares only execution Profile; revocation of an unsafe proof/execution algorithm requires an explicit profile/catalog policy change. Legacy prompt pins stay unchanged; no silent re-pin.

`LearningScope2` is exactly `v2/session.schema.json#/properties/scope`; original scopeHash remains H(LearningScope2), with its original environmentId/approvedOrigins/source/config/policy IDs. It is not recalculated using the new replay scope. `ReplayRequirements=C{csiId:ID,environment:ID,allowedOrigins:A<Origin>[1..10],capabilities:A<OperationKind>[1..10],initialContext:InitialContext}` (STUDIO-GOV-001.4: no application, policy or entry-policy identity; the allowed origins are the test's own URLs frozen at learning start). OperationKind is the ten operation kinds in Operation. It excludes original principal as later Runs obtain their own current principal. Environment/origins/capabilities are exact projections of LearningScope2 (drop observe, no broadened origins), captured with the **pre-effect base**, not invented at finalization. D1 base therefore additionally contains immutable `replay_requirements JSONB` of this closed type. It records new publication requirements, not an unrecorded historical read-policy digest. The authorized catalog must attest compatibility with original recorded policyRuleId/transfer policy; absent mapping refuses before assignment. Each replay's Scope adds current principal to these requirements, and scopeHash there is H(Scope).

Scope is noncredential metadata. It is derived from the learning session's frozen scope, never supplied by the artifact to grant new rights.

## C3. Artifact2, guards, input provenance and policy3

```text
InputRecipe = C{inputId:ID,stepId:UUID,kind:"destination"|"nonsecretText",
 intendedSlot:"navigate.destination"|"fill.value"|"selectOption.value"|"assert.expected",
 provenance: C{kind:"sourceSpan",start:N,end:N,sourceHash:H}
           | C{kind:"configuration",referenceId:ID,referenceName:ID}}
Guard = C{guardId:ID,origin:Origin|null,target:
 C{kind:"initialBlank"} | C{kind:"page"} |
 C{kind:"element",locator:Locator,role:ID,elementType:"button"|"input"|"textarea"|"select"|"text"|"link"|"other",
 controlType:"none"|"text"|"search"|"email"|"tel"|"url"|"textarea"|"password"|"hidden"|"other",
 classification:"structuralOnly"|"permittedBusinessData"|"nonsecretApproved"|"withheld",
 visible:boolean,actionable:boolean,readRuleId:ID|null}}
ReplayAction = C{coordinate:Coordinate,guardId:ID,operation:Operation}
Transfer = C{bindingId:ID,producer:Coordinate,consumer:Coordinate,
 slot:"fill.value"|"selectOption.value"|"assert.expected",origin:Origin}
Policy3 = C{schemaVersion:3,learnedPlanHash:H,admissionProvenanceHash:H,
 publicationEvidenceHash:H,runAuthorizationHash:H,scope:ReplayRequirements,
 inputs:A<InputRecipe>[0..200],bindings:A<Binding>[0..32],transfers:A<Transfer>[0..200]}
Artifact2 = C{version:2,kind:"observed",profile:Profile,sourceHash:H,
 configurationHash:H,authoringHash:H,learnedPlan:LearnedPlan,
 learnedPlanHash:H,inputRecipes:A<InputRecipe>[0..200],guards:A<Guard>[1..200],
 replayPolicy:Policy3,steps:A<C{stepIndex:N,stepId:UUID,operations:A<ReplayAction>[1..8]}>[1..100]}
LearnedPlan = complete frozen v2/learned-plan.schema.json
Binding = complete frozen v2/binding.schema.json
```

Every source step appears once in source order, with contiguous stepIndex and action ordinals; any source step with no admitted effect/assertion is not silently invented or omitted. GuardId is `g` plus global action ordinal; deterministic one guard/action. Input ordering is the total tuple specified in C12; binding/transfer order is producer/consumer source coordinate then binding ID. Artifact includes audit LearnedPlan with historic admission IDs; executable operations/child do not. `Operation` reuses exact authoredLiteral input references, binding references, allowed keys and assertions from guided action2; there is no new literal-value branch. SourceSpan uses exact immutable UTF-16 bounds; configuration recipe referenceId must map to authoritative referenceName+step+slot and inputId in basis. A secret declaration never becomes a plain recipe. Filled bindings cannot become locators, destinations, keys, defaults or exported values.

Guard facts are derived from original target observation, not model choice or lowerer assertion. `readRuleId` is the original node.policyRuleId for a read operation and null for every non-read operation; the independent audit basis retains the original node's full policy facts in either case. Role/elementType/controlType are required by observation2 and must equal their recorded values; a missing fact refuses publication. No exact checkbox/radio/number subtype may be invented from `other`. Live runtime checks additionally require the fixed primitive's compatible actual element type; this is a capability check, not a claim that a missing historic subtype was recorded. Page guards contain no URL/title sample. Action-specific required state is independently derived: e.g. visible/read requires visibility, and each operation requires its actual primitive-specific live compatibility; recorded actionable is compared as a fact and is not a universal true prerequisite; irrelevant historical flags cannot grant permissions. Classified withheld/structuralOnly facts never satisfy a positive read recipe. Native ephemeral node/doc/generation/fence rights and captured samples are excluded from Guard/ReplayAction.

## C4. Independent ValidationBasis1 and complete hash definitions

C4 uses embedded **original immutable** v2 structures for raw audit facts; closed projection types below contain no resolved values. All arrays must join bidirectionally: no extra/missing actions, obligations, inputs, producers or consumers; every accepted obligation must have its unique successful associated action, as required by the production StepVerifier; a model completion cannot substitute it.

```text
InputIndex = C{inputId:ID,stepId:UUID,kind:"destination"|"nonsecretText",
 intendedSlot:InputRecipe.intendedSlot,provenance:SourceReference2}
ConfigReference = C{referenceId:ID,referenceName:ID,stepId:UUID,
 kind:"destination"|"nonsecretText",intendedSlot:InputRecipe.intendedSlot,inputId:ID}
OriginalObservation = C{observationHash:H,observation:Observation2}
PreparationFact = C{preparationId:ID,proposal:Action2,proof:PreparationProof2,
 executionEvidence:ExecutionEvidence2,observationHash:H|null}
ActionEvidence = C{obligationId:ID,preparationId:ID,ledger:Ledger2}
BootstrapProof = C{contextId:ID,contextRevision:N,ownerFence:N,materializationRevision:N,
 inputsHash:H,allocationHash:H,metadataAcknowledged:true,initialEvidence:ExecutionEvidence2}
ValidationBasis = C{schemaVersion:1,sessionId:ID,testId:UUID,csiId:ID,
 sourceRevision:Rev,configurationRevision:Rev,sourceHash:H,configurationHash:H,
 authoringHash:H,sourceManifestHash:H,authoredInputsHash:H,configuration:Configuration,learningProvenance:LearningProvenance,
 sourceSteps:A<SourceStep>[1..100],scope:LearningScope2,runAuthorization:RunAuthorization2,
 replayRequirements:ReplayRequirements,
 bootstrap:BootstrapProof,translationRevision:Rev,translationHash:H,
 translationPlan:AcceptedTranslationPlan,sourceSelections:A<SourceSelection2>[0..200],obligationAssociations:A<ObligationAssociation>[1..800],
 inputs:A<InputIndex>[0..200],configurationReferences:A<ConfigReference>[0..200],
 observations:A<OriginalObservation>[0..400],preparations:A<PreparationFact>[1..200],
 actions:A<ActionEvidence>[1..200],allocations:A<Allocation2>[0..32],
 producers:A<Producer2>[0..32],consumerEdges:A<ConsumerEdge2>[0..200],
 bindings:A<Binding>[0..32],transfers:A<Transfer>[0..200]}
```

Exact imported types: SourceReference2=`v2/source-reference.schema.json`; Allocation2=`v2/allocation.schema.json`; Producer2=`v2/producer.schema.json`; ConsumerEdge2=`v2/consumer-edge.schema.json`; Observation2=`v2/observation.schema.json`; Action2=`v2/action.schema.json`; Ledger2=`v2/ledger.schema.json`; ExecutionEvidence2=`v2/execution-evidence.schema.json`; PreparationProof2=`v2/bridge.schema.json#/definitions/preparation`; RunAuthorization2=`v2/session.schema.json#/properties/runAuthorization`; SourceSelection2=`v2/source-selection.schema.json#/definitions/sourceQuestionMeaning`.

`AcceptedTranslationPlan` is the closed final allocated extension of `v2/source-selection.schema.json`: each obligation additionally requires `obligationId:ID` (canonical UUID text), and each need additionally requires the server-issued `bindingId:ID`. Precisely, `AllocatedNeed=C{needId:ID,producerStepId:ID,consumers:A<C{stepId:ID,argumentSlot:"fill.value"|"selectOption.value"|"assert.expected"}>[1..200],bindingId:ID}`. All eight original obligation fields remain exact and required, including targetIntent, scopeIntent (a string 1..256 or null: the containing region named by the author), referenceIndex, needId and predicate. This is the actual enriched persisted V32 plan after GuidedDependencyPlanner.allocate and acceptPlan, not the earlier model/proposal schema and not a rewritten Operation. Raw SOURCE_PLAN/source-selection remain unchanged and cannot issue bindingId/obligationId. Final publication requires every needed allocation present; a no-needs plan retains an empty needs array. Preserve every stored field when computing H(translationPlan)=translationHash; never strip IDs to fit a model schema. Each needId→bindingId must equal the authoritative allocation exactly once, with matching producerStepId and complete consumers, and must join its original producer admission/read and every consumer admission/slot bidirectionally. Duplicate, absent, swapped or forged allocation IDs refuse even when hashes are recomputed. `ObligationAssociation=C{obligationId:ID,coordinate:Coordinate,admissionId:ID,proposalHash:H}`. Node verifies H(translationPlan)=translationHash, checks sourceSelections at each exact(stepId,occurrence,operationKind,argumentSlot), resolves referenceIndex through sourceReferences→authoritative input mappings, and needId through original needs→binding producer/consumers. Java independently checks the same original V32 joins. TargetIntent is historical nonsecret authored interpretation, not executable code or a universal English proof. No model output is authoritative by itself.

Node resolves the proposal's `target.ref` in the `facts` of **the original** referenced observation, verifies document/generation/origin, observationHash, evidenceHash, requestDigest, proof identities and operationHash; independently derives guard/recipe/plan/policy/ordered equivalence from original facts. It validates every read policy/classification and derives bindings/transfers from the original immutable allocation/producer/consumer-edge rows, comparing their admission/coordinate/scope joins to ledger actions and the artifact graph. Derived bindings/transfers are not evidence for themselves. It cannot recompute private authoredInputsHash without saved values; Java separately attests that value-free mapping matches the private materialization and retained source before snapshot/commit. No lowerer-generated guard doubles as evidence for itself.

H means canonical-v1 SHA256. Existing identities are preserved:

- `sourceHash=H(sourceSteps.map(source))`; `configurationHash=H(Configuration)`; `authoringHash=H(ordered source step UUID/source objects)`.
- `operationHash=H({coordinate,origin,locator,operation})` exactly as existing bridge. `learnedPlanHash=H(LearnedPlan)`.
- **admissionProvenanceHash remains** H(ordered `{coordinate,admission,operationHash,scopeHash}` tuples) using the existing frozen admission value/type, not broader proof metadata.
- `basisHash=H(ValidationBasis)`; `publicationEvidenceHash=H({version:1,basisHash,runAuthorizationHash,translationHash,bootstrapHash,sourceManifestHash})`; no cyclic dependency on artifact/snapshot.
- `referencePolicyHash=H(Policy3)`; `operationEquivalenceHash=H({operations:ordered ReplayAction array,guards,inputRecipes,bindings,transfers})`; `artifactHash=H(Artifact2)`.
- `snapshotHash=H({base:captured base fields,ownerWorkerId,ownerFence,validationDeadline,translationHash,basisHash,learnedPlanHash,artifactHash,referencePolicyHash,operationEquivalenceHash,publicationEvidenceHash,profileHash,validationBuildHash})`.
- `revisionDigest=H({version:1,testId,csiId,sourceRevision,configurationRevision,sourceHash,configurationHash,authoringHash,learnedPlanHash,artifactHash,referencePolicyHash,operationEquivalenceHash,admissionProvenanceHash,publicationEvidenceHash,runAuthorizationHash,profileHash})`. UUID revision ID is allocated separately and never confused with digest.

## C5. Pure validator HTTP contract

`POST /v2/validate-observed` uses the existing trusted backend→runner authentication and strict JSON pre-parser, with separate observed byte cap; never a public hash-echo endpoint. No browser/account/model/capacity acquisition.

```text
ValidationRequest = C{schemaVersion:2,attemptId:UUID,claimId:UUID,snapshotHash:H,
 basisHash:H,requiredProfile:Profile,requiredBuild:BuildIdentity,artifact:Artifact2,validationBasis:ValidationBasis}
ValidationVerdict = C{schemaVersion:2,attemptId:UUID,claimId:UUID,snapshotHash:H,
 basisHash:H,profile:Profile,build:BuildIdentity,ok:boolean,artifactHash:H,learnedPlanHash:H,
 referencePolicyHash:H,operationEquivalenceHash:H,admissionProvenanceHash:H,
 publicationEvidenceHash:H,errorCode:null|"INVALID_CONTRACT"|"EVIDENCE_MISMATCH"|"OPERATION_MISMATCH"|"REFERENCE_MISMATCH"|"PROFILE_MISMATCH"|"LIMIT_EXCEEDED"}
```

Passing verdict requires errorCode=null and all independently recomputed hashes equal expected. Failure carries only closed codes and expected identities, not page/source snippets. Invalid envelope returns standard data-free 4xx, never a partly authoritative success receipt. ValidationBudget deadline<=min(15 seconds, remaining session/worker lease); three claims **per session** per D4. The authenticated client verifies every echoed identity; echoes alone do not replace actual independent derivation.

## C6. Fresh observed replay authorization and neutral account ABI

Existing public Studio execution controller/service gets an observed-only path selected by immutable revision family, using the current BFF cookie and actual uncached Core client. Concrete new `ObservedReplayAuthorization` mints a grant **outside locks**, after readiness snapshot and before acceptance CAS. It preallocates executionId/attemptId; same authenticated/current Core principal and current CSI canExecute required. Grant expires min(Core response time+30 seconds, account authorization expiry). No cookie/credential persisted, sent to runner, logged or used by a background refresh.

```text
ReplayGrant = C{version:1,grantId:UUID,executionId:UUID,attemptId:UUID,
 revisionId:UUID,revisionDigest:H,principalId:ID,csiId:ID,scopeHash:H,
 profileHash:H,buildHash:H,currentPolicyHash:H,accountGrantId:UUID,issuedAt:Time,expiresAt:Time}
AccountAuthorization = C{version:1,grantId:UUID,providerId:ID,executionId:UUID,
 attemptId:UUID,revisionDigest:H,scope:Scope,scopeHash:H,issuedAt:Time,expiresAt:Time}
AccountHandle = C{version:1,authorization:AccountAuthorization,opaqueHandle:ID}
```

AccountHandle's opaque string may be 1..4096 ASCII base64url characters (override ID bound only here); composed handle<=8192 bytes. It is a sensitive ephemeral capability, absent from artifact/revision/DB/log/manifest/model/hash inputs. AccountAuthorization is noncredential immutable metadata and may be stored with execution binding. `scopeHash=H(Scope)` binds current execution principal/scope, not historic learning consent. `ReplayGrant` is minted by trusted backend, not accepted from the public body. issuedAt/expiresAt are minted and judged on the database clock (clock_timestamp()); no application or runner clock can extend a grant. Dispatch/admission compare exact persisted grant/tuple/expiry/local cancellation/current supported profile+policy; no ProvisionalDispatchAuthorization or ConfiguredBackgroundAuthorization fallback. Grant is bounded-fresh, **not instantaneous distributed Core revocation**: a CSI revocation after mint may take up to30 seconds to block admission unless local cancellation/policy/account revocation arrives sooner. Concrete local revocation mechanisms are existing execution cancellation (control/ledger), trusted policy catalog version/hash replacement checked at dispatch/admission, and account-provider isCurrent/consume rejection; there is no asserted Core push subscription. A queue delay/transport retry cannot extend it; expired grant fails before browser, requiring a new explicit Run. Once admitted, existing bounded execution/cancel semantics apply; no new admission after expiry. Observed schedules currently return OBSERVED_SCHEDULE_AUTH_REQUIRED because no live BFF/Core execution grant is available; legacy schedules retain their existing path. No unavailable generic CSI authority is invented.

Java neutral interface in `guided/account/ReplayAccountAccess.java`:

```java
AccountAuthorization authorize(ReplayAccountRequest request); // current scope and entitlement; no setup
AccountHandle issueHandle(AccountAuthorization authorization, ReplayGrant grant); // current, same attempt
boolean isCurrent(AccountAuthorization authorization, Instant now); // no credential output
```

`ReplayAccountRequest` is closed `{executionId,attemptId,revisionDigest,scope,issuedAt,latestExpiry}` with the types above. Account authorization and handle issuance are outside DB locks; acceptance/dispatch recheck bound identities after return. Handle issuance is idempotent only for the same unconsumed attempt, never a new setup. Trusted worker SPI in `run/observedAccount.ts`:

```text
consume(handle:AccountHandle,admission:AdmissionReceipt,signal:AbortSignal): Promise<ConsumedAccount>
prepare(consumed:ConsumedAccount,signal:AbortSignal): Promise<PreparedAccount>
apply(prepared:PreparedAccount,context:RecordedContextCapability,signal:AbortSignal): Promise<AppliedAccount>
dispose(account:ConsumedAccount|PreparedAccount|AppliedAccount): Promise<void>
```

These three account result types are opaque **in-process capabilities**, not arbitrary wire records. Exact lifecycle: CONSUMED→PREPARED→APPLIED→DISPOSED; no backwards transition, second consume/apply, or transfer to another execution/context. Provider owns consume-at-most-once using execution/attempt/grant and rejects replay/expiry/revocation. Failed/unknown consume or apply closes the attempt; lost ACK does not retry setup or create another browser. `RecordedContextCapability` is the fixed trusted wrapper around the single browserFactory-created recorded context/page; provider may install scoped account state through that capability before first operation, never launch another browser or accept a supplied script/module/path/URL. InitialBlank must remain genuinely blank; observedDocument names its authorized origin, with no origin→URL inference. Child launch order is validate frames/profile/admission → consume → prepare (no browser) → create the one normal recorded context and establish recording/run-clock origin → apply → Ready2 (echo the original origin, never reset it) → Execute2. Unconfigured/refused/ambiguous consume/prepare therefore creates no browser. Dispose runs on every success/failure/cancel and clears private state; no private detail in errors.

Production startup explicitly injects the provider registry into `server/application.ts`→runCoordinator→launcher and into **run/child.ts**→childRuntime/browserFactory; selection is by allowlisted providerId from trusted startup configuration, never job-selected module/URL. Child receives only the narrow sensitive handle and validated trusted policy, not broad Vault/Core/LLM credentials or local user cookies. Default unconfigured implementation refuses before admission/browser. OBS-006 implements this real ABI, wiring, validation and controlled provider integration; OBS-007 supplies account connectivity. No other publication/replay dependency is left unavailable.

## C7. Observed job, binding and actual admission

```text
ExecutionBinding = C{version:1,executionId:UUID,startedAt:Time,attemptId:UUID,
 revisionId:UUID,revisionDigest:H,testId:UUID,csiId:ID,principalId:ID,environment:ID,
 artifactHash:H,configurationHash:H,learnedPlanHash:H,referencePolicyHash:H,publicationEvidenceHash:H,
 requiredProfile:Profile,requiredBuild:BuildIdentity,scope:Scope,scopeHash:H,currentPolicyHash:H,
 replayGrant:ReplayGrant,accountAuthorization:AccountAuthorization}
ObservedJob = C{schemaVersion:2,kind:"observed",binding:ExecutionBinding,
 artifact:Artifact2,configuration:Configuration,inputs:A<C{inputId:ID,value:string}>[0..200],
 accountHandle:AccountHandle,runtime:C{stepTimeoutMs:N,totalRuntimeMs:N},
 recording:RecordingConfiguration1}
AdmissionRequest = C{schemaVersion:2,kind:"observed",executionId:UUID,startedAt:Time,
 attemptId:UUID,runnerInstanceId:ID,admissionId:UUID,revisionId:UUID,revisionDigest:H,artifactHash:H,configurationHash:H,learnedPlanHash:H,
 referencePolicyHash:H,publicationEvidenceHash:H,scopeHash:H,currentPolicyHash:H,
 grantId:UUID,accountGrantId:UUID,profile:Profile,build:BuildIdentity}
AdmissionReceipt = C{schemaVersion:2,kind:"observed",admissionId:UUID,
 request:AdmissionRequest,admittedAt:Time,startDeadlineAt:Time,runDeadlineAt:Time}
```

ObservedJob.configuration is the full immutable accepted configuration. Require H(configuration)=artifact.configurationHash=binding.configurationHash and equality with the accepted revision configuration before admission and launch. Environment also equals binding/scope environment. Launch2.browser/viewport are exact configuration.browser/viewport; recording is separately trusted recording geometry and must never substitute for viewport. Step timeout is configuration.timeoutSeconds×1000 capped by existing ordinary per-step maximum (refuse an incompatible requested value rather than silently change it); totalRuntimeMs remains the existing ordinary run ceiling. Execute2.waitStrategy equals configuration.waitStrategy and is validated with configurationHash against launch. No hash reversal, missing configuration or default/legacy substitution.

RecordingConfiguration1 is closed C{width:integer[1..8192],height:integer[1..8192]}, matching the existing recording geometry and additionally subject to existing deployment bounds; it is backend/trusted-runner generated, not public or artifact-selected storage path. ObservedJob has no saved source/code/model prompt, secret map or captured-value map. Authored source literals and currently resolved approved plain config inputs are scoped to inputId using immutable recipes; input metadata cannot allocate arbitrary new slots. At acceptance, source-span literals are materialized against the unchanged locked current authoring/source hash and config references against current approved saved plain values, checked against the immutable recipe mapping. Publication validation alone uses the full independent basis. Ordinary replay validates the exact receipt-bound immutable artifact/IR/graph/profile and current input/policy mapping; it does not demand the private historical basis on the job or falsely claim to reconstruct historic guard facts without it. The trusted backend binding and authenticated transport link this exact artifact to the previously independently validated immutable receipt. Validate whole payload before enqueue and again before execution; all exact profile/hash/tuple fields join accepted immutable revision/binding. Externally supplied AdmissionRequest contains no entitlement grant: backend reads its real stored grant and current cancellation. Atomic claim writes D7 receipt then returns it. Runner verifies response request equality and binds admissionId through child execution. Missing/mixed family discriminator refuses, never fallback.

`POST /v2/runs` feeds the **existing** runCoordinator/capacity/recording/reporting pipeline. `POST /internal/studio/executions/{id}/observed-admission` uses the actual ordinary restricted static service-token authentication described in C12 and AdmissionCasService with strict observed request/response branch; backend ordinary v1 admission contract remains untouched. `DELETE /v1/runs/{id}` remains the existing control route for cancellation of either family by execution ID and current runner authority; there is no unauthenticated alternate cancel route. The actual runner admission client retains exactly one HTTP admission send: timeout/redirect/5xx/lost ACK is AMBIGUOUS and stops before browser, with no retry or replacement admissionId. Backend same-identity idempotency requires the exact existing runnerInstanceId/admissionId/attempt tuple and may only acknowledge its already committed receipt; it never gives another process permission to start from history. Its original start/run deadlines are carried unchanged in the receipt. New AdmissionRequest includes the runner-generated one-time admissionId and authenticated/configured runnerInstanceId required by the existing CAS. Execution timeout/per-step limits remain ordinary configured limits, not guided session duration.

## C8. Protocol2 closed source-free child frames and trusted execution

```text
ReadGrant = C{policyRuleId:ID,origin:Origin,
 region:C{kind:"application"}|C{kind:"role",role:"main"|"region"|"form",name:ID,exact:true},
 visibleText?:C{classification:"permittedBusinessData"},
 controlValue?:C{classification:"nonsecretApproved",types:A<"text"|"search"|"email"|"tel"|"url"|"textarea">[1..6]}}
FieldOverride = C{testId:ID,name:ID,policyRuleId:ID,
 classification:"structuralOnly"|"permittedBusinessData"|"nonsecretApproved",accessibleName?:ID}
TrustedPolicy = C{version:1,policyId:ID,policyVersion:ID,applicationId:ID,
 environment:ID,accountRef:ID,allowedOrigins:A<Origin>[1..32],entryPolicyId:ID,
 applicationPolicy:null|C{policyRuleId:ID,allowStructuralDiscovery:true,readGrants:A<ReadGrant>[0..32]},
 rules:A<FieldOverride>[0..128]}
ReadRecipe = the read operation's recipe union in v2/action.schema.json
Launch2 = C{kind:"launch",protocolVersion:2,mode:"observed",runId:UUID,
 attemptId:UUID,admission:AdmissionReceipt,profile:Profile,build:BuildIdentity,scopeHash:H,configurationHash:H,
 browser:"chromium",viewport:C{width:N,height:N},
 recording:RecordingConfiguration1,seekOriginCalibrationMs:Elapsed,scratchPath:string,
 totalRuntimeMs:N,accountHandle:AccountHandle,policy:TrustedPolicy}
Execute2 = C{kind:"execute",protocolVersion:2,mode:"observed",runId:UUID,
 attemptId:UUID,profileHash:H,configurationHash:H,waitStrategy:Configuration.waitStrategy,stepTimeoutMs:N,
 steps:A<C{stepIndex:N,stepId:UUID,operations:A<ReplayAction>[1..8]}>[1..100],
 guards:A<Guard>[1..200],bindings:A<RuntimeBinding>[0..32],transfers:A<Transfer>[0..200],
 inputs:A<C{inputId:ID,stepId:UUID,kind:"destination"|"nonsecretText",intendedSlot:InputRecipe.intendedSlot,value:string}>[0..200]}
Ready2 = C{kind:"ready",protocolVersion:2,mode:"observed",runId:UUID,attemptId:UUID,
 profileHash:H,build:BuildIdentity,admissionId:UUID,browserStartedAt:Time,startedAtMs:Elapsed,calibrationOffsetMs:Elapsed|null}
StepStarted2 = C{kind:"step-started",protocolVersion:2,mode:"observed",runId:UUID,
 attemptId:UUID,stepIndex:N,stepId:UUID,startedAtMs:Elapsed}
StepFinished2 = C{kind:"step-finished",protocolVersion:2,mode:"observed",runId:UUID,
 attemptId:UUID,stepIndex:N,stepId:UUID,status:"PASS"|"FAIL"|"SKIPPED",
 startedAtMs:Elapsed|null,finishedAtMs:Elapsed|null,durationMs:Elapsed|null,errorCode:ReplayError|null}
Result2 = C{kind:"result",protocolVersion:2,mode:"observed",runId:UUID,attemptId:UUID,
 admissionId:UUID,profileHash:H,build:BuildIdentity,ok:boolean,errorCode:ReplayError|null,
 recording:C{path:string|null,bytes:N|null,errorCode:"RECORDING_FAILED"|null,
 state:"PENDING"|"FAILED"|"UNAVAILABLE",partial:boolean}}
Stop = C{kind:"stop"} // common closed per-run IPC control for protocol1 and protocol2
ReplayError = "INVALID_CONTRACT"|"PROFILE_MISMATCH"|"AUTHORIZATION_EXPIRED"|
 "ACCOUNT_UNAVAILABLE"|"ACCOUNT_UNKNOWN"|"POLICY_REFUSED"|"TARGET_DRIFT"|
 "READ_REFUSED"|"REFERENCE_REFUSED"|"ASSERTION_FAILED"|"CANCELLED"|"TIMEOUT"|"OUTCOME_UNKNOWN"|"INTERNAL_ERROR"
```

Imported Binding is audit-bearing v2 type, so the **child projection** is the closed `RuntimeBinding=C{bindingId:ID,producer:Coordinate,recipe:ReadRecipe,origin:Origin}`; Execute2.bindings uses this RuntimeBinding, never full Binding. This explicit projection strips session/scope/admission/runtime-history fields. All parent and child frames use complete parsers before traversal; ready/result family/profile/run/attempt/admission echoes checked by parent. Child accepts no artifact, LearnedPlan, source/originalText, code/function, original doc/node/generation/fence or original account state. `scratchPath` and recording paths must be launcher-owned beneath the same confined scratch root and limited to1024 bytes; output path checked before upload. Policy is resolved from trusted mounted catalog by backend-authorized IDs and hash-checked against binding, never accepted from artifact as permission. InitialContext is taken from authorized account scope; execute cannot replace it.

Normal browserFactory/browser creates exactly one recorded page/context. ObservedReplayAdapter uses its private observation collector and retained handles. Exact locator match must be unique across the guarded collection; no legacy visible-only narrowing or role fallback. New per-execution/attempt value store begins empty and each binding binds once after successful authorized private read; clear at terminal/dispose. Values never enter parent step diagnostics, reports, hosts, page URL/title, failure message, manifest, stdout/stderr or models. Data-free observed output shaping starts before spawn, including account/policy/launch errors; authorized video/object storage remains separately governed ordinary evidence.

Native `click/check/uncheck/hover/press` use existing nativeInput pointer/key primitives with retained-target/current-origin/type/state checks. **fill/selectOption use the existing fixed isolated trusted DOM primitive**, not Playwright/native typing: fill focuses, checks same retained element/origin/visibility/focus/disabled/readonly/compatible type, sets value and dispatches input/change; selectOption selects the uniquely eligible permitted option then sets value and dispatches input/change. No new arbitrary evaluation. A focus/scroll or possibly applied mutation is not reported as safely unexecuted; uncertain outcomes stop and never retry the operation. Browser events can race after the last check; retained-node immediate checks reduce this residual race but do not prove universal atomic page behavior. Assertions use exact original predicate/argument; missing/failed producer or binding refuses before consumer.

Bounded passive acquisition of a temporarily unavailable exact target, its private classification, original replay source-step deadline, cancellation/late-result fence and separately charged cumulative guided passive-readiness windows are specified in [delayed-state-design.md](delayed-state-design.md) §§1–4. Acquisition never repeats an invocation/assertion/read capture, never changes a locator and never extends a replay source-step deadline. Guided model/human budgets remain independent; only claimed passive-readiness windows consume the cumulative guided allowance, with retained unknown reservations. Public observation/model/protocol2 payloads remain unchanged.

Existing child isolation/sandbox/env/execArgv/deadline/scratch/cleanup rules remain; new provider injection is a fixed trusted registry, not a general import capability. Actual `test/isolation.test.ts` and existing confinement tests must remain mutation-enforced; do not broaden their allowlists to make a second browser runtime pass.

## C9. Canonical cross-language vectors and profile rollout

New fixture `contracts/v2/publication-canonical-vectors.json` contains input JSON, exact canonical UTF-8 hex and SHA256 for these independently implemented Java/Node/PostgreSQL-roundtrip cases: source order vs lexical UUID order; composed `é` vs decomposed `e`+combining accent (different hashes); astral scalar UTF-16 span; escaped quote/backslash/newline; null vs absent rejection; integer0 and2147483647; decimal Rev `9223372036854775807`; reordered JSONB keys; opaque cfg UUID/name/slot array order; full admission tuple and separate publication evidence bundle. Negative vectors: duplicate keys, BOM, invalid UTF-8, lone surrogate, -0,1.0,1e0, overflow, extra keys, depth33. The fixed samples below establish bytes/digests now; complete plan/basis/IPC fixtures are independently calculated during implementation and cross-checked, never copied from the lowerer as an oracle. Existing canonical algorithms are not renamed to hide changed semantics.

Profile constants and schema bundle hashes ship atomically in Java pins, Node versions/runtime image record/schema checker, job/admission/IPC parsers and fixtures. `LearningProvenance` binds original model/provider/prompt hashes and publication result format without calling either gateway. The required execution Profile excludes them. New publication needs a supported historical evidence decoder; saved replay remains compatible across benign model/prompt/API-format updates. Explicit proof/algorithm revocation uses the execution profile catalog, not an accidental default-pin mismatch. Compatible existing artifact1 remains ready by its legacy rules. Four flags:

| publication | replay | Behavior |
|---|---|---|
| off | off | Existing005 starts without base; no guided publication, no artifact2 replay. Legacy unaffected; authorized historical receipt read available. |
| off | on | No new publication bases; existing supported artifact2 can replay with fresh grants. No later adoption of old sessions. |
| on | off | Capture base/evidence and result3; learning works; finalize returns REPLAY_DISABLED/pending without revision. Can finalize only if replay reenabled before valid lifecycle expiry. |
| on | on | Full concrete publication/replay path. |

Flags never delete captured evidence or rewrite pins. Disabling publication prevents new claim/commit; an in-flight validator result cannot bypass final flag check. Disabling replay prevents new acceptance/dispatch/admission; drain or cancel existing admissions under ordinary policy, never reinterpret them. Rollback image lacking observed profile rejects queued/new artifact2 before browser and leaves receipts/revisions immutable; retain DB forward schema. Reenable compatible image/pins or deliberately relearn, never LLM repair/recompile disguised as equivalent replay. Legacy compatible revisions/schedules remain unchanged. Entire dependency bean graph is tested for all four combinations, not copied fixture beans.

Fixed independent canonical examples (UTF-8, calculated for this design; the future Java/Node/JSONB tests must independently reproduce these bytes and digests):

| Case | Canonical UTF-8 hex | SHA256 |
|---|---|---|
| ordered source | `5b227365636f6e6420555549442073746570222c22666972737420555549442073746570225d` | `5dc02b985668da07f303a3ecca74a3d764bc930c46619d7a2793c94a6c140c63` |
| Unicode composed | `7b2276616c7565223a22c3a9227d` | `69e46f3f0688000ab7eeb9e40e6a516a254268cd644a24f4f69cf7ad063cf479` |
| Unicode decomposed | `7b2276616c7565223a2265cc81227d` | `1b986c631da83257beca64c93ff3e5174908d558af7bb9dfb36b25a6198f7c38` |
| key/escape/integer ordering | `7b2261223a22785c6e5c225c5c222c226d223a302c227a223a323134373438333634377d` | `511b82a697f9a93d077546718bc48bece8c37482f0771589d392909edc2aad6f` |
| bigint string | `7b227265766973696f6e223a2239323233333732303336383534373735383037227d` | `c7e2dd198f6f7b31c3da4a67a6c10eebc1c4d2509101b9897752228508afa918` |

## C10. Public publication, session view and historical versus current truth

Finalize request remains compatible closed `{schemaVersion:2,expectedSourceRevision:Rev,expectedConfigurationRevision:Rev}`, mandatory Idempotency-Key ID. Endpoint is the real BFF `POST /api/v3/studio/guided-sessions/{id}/finalize`. No supplied artifact/hash/ready flag. Core-authenticated historical retry D6 returns the same receipt identity after body/key checks.

Existing result2 has SHA-shaped readyRevisionId; it is **not** repurposed as a UUID. Existing non-publication sessions/result2/schema/examples remain unchanged. Publication-base-enabled sessions use new public **result3 and session-view3**; internal session/action/worker contracts remain2. Base.result_contract_version=3 is the durable selector, never feature-flag guessing after restart. `GuidedPublicationResultProjector` joins private session state, immutable receipt and current readiness; `GuidedSessionController` GET/result obtains current request cookie for fresh receipt authorization when a receipt is returned. Receipt-read routing occurs before active-session/account/canExecute checks; an expired original owner retaining only fresh Core canRead can retrieve the immutable receipt without those active guards vetoing it. Start/GET responses for base-enabled sessions are projected as SessionView3 with result=null until a result is available; answer/cancel request DTOs and internal session2 remain unchanged. Result3 producer is concrete006; OBS-008 consumes/polls it and invokes automatic finalize, including reconnect. No extra Run or user confirmation.

```text
PublicationReceipt = C{schemaVersion:3,sessionId:ID,revisionId:UUID,revisionDigest:H,
 learnedPlanHash:H,artifactHash:H,publicationEvidenceHash:H,publishedAt:Time,
 learnedFromThisRun:true,replayVerified:false}
Result3 = C{schemaVersion:3,sessionId:ID,executionId:ID,scopeHash:H,
 mode:"guided",outcome:GuidedState2,assertionsPassed:boolean,
 learnedFromThisRun:boolean,replayVerified:false,scheduleActivated:false,
 publication: C{status:"PUBLISHED",receipt:PublicationReceipt}
            | C{status:"PENDING"|"CONFLICT"|"REFUSED",receipt:null},
 currentReadiness:C{revisionId:UUID|null,ready:boolean,
 code:"READY"|"NOT_PUBLISHED"|"HEAD_CHANGED"|"SOURCE_CHANGED"|"CONFIG_CHANGED"|"RUNTIME_INCOMPATIBLE"|"REPLAY_DISABLED"},
 evidence:C{kind:"guidedLedger",ref:ID|null,video:VideoEvidence|null},actionTimings:ActionTiming[0..400],
 proof:C{executionId:UUID}|null,
 errorCode:ID|null}
-- video is null and actionTimings is [] exactly when publication.status="PUBLISHED"; proof is null unless PUBLISHED
SessionView3 = C{schemaVersion:3,session:PublicSession2,result:Result3|null}
```

PublicSession2 is exactly existing `v2/session-view.schema.json`, never the internal session/authorization document; GuidedState2 is its state enum (including FINALIZING), not the terminal-only result2 outcome enum. An unpublished completed browser run stays FINALIZING/pending (or explicit conflict/refusal) with learnedFromThisRun=false; never emit published success before receipt. Receipt commits make SUCCEEDED and learnedFromThisRun=true. Historical receipt after edits still describes its immutable published revision; currentReadiness.revisionId refers to **that receipt revision**, with ready=false and reason when it is no longer current. `replayVerified=false` describes this guided execution, even if unrelated later runs pass; actual ordinary execution endpoints report each genuine revision-bound replay result and recording. No fake first-run video/timings or synthetic ordinary PASSED row: the proof of a published learn is `proof.executionId`, a genuine ordinary replay of the published revision (trigger source `AFTER_LEARN`), and a learning recording is only ever the learning attempt of a learn that did not publish (`guided-data-flow.md` §3.4). First guided recording/UI integration remains008.

New schemas/examples: v3/result.schema.json, v3/session-view.schema.json and v3/publication-fixtures.json; v2/publication.schema.json defines request and receipt response reference; v2/revision.schema.json explicitly separates storage UUID `id` from cryptographic `revisionDigest` while retaining the existing learned-plan identity meaning. Add schema build/checker/OpenAPI/resource-loading support for v3, and explicit compatibility tests leaving v2 readyRevisionId64hex unchanged. Strict raw-byte/security handling applies to publication controller. Historical receipt API never claims current access-free readiness; every returned receipt uses fresh Core read authorization D6.

## C11. Required contract/security/runtime oracles

Pure Node tests mutate one target/operation/read/type/origin/slot/cfg mapping/binding/plan/basis/hash/profile at a time while keeping typed schema valid; independently retained original facts must reject them. Include multipage observations overwritten in current progress, two preparations with equal operation but different target facts, and missing original observation after restart. No test may construct its expected guards by calling the lowerer it tests.

Actual production wiring tests include GuidedPublicationConfiguration/SessionConfiguration, CoreServiceClient via controlled HTTP, concrete EvidenceRepository/Builder/Lowerer/Publisher/Readiness, actual `/v2/validate-observed`, ordinary acceptance/dispatcher/admission and child entrypoint. Only account connectivity is controlled, through C6 SPI. Unauthorized/missing cookie, changed principal, revoked entitlement before mint, unavailable Core, grant expiry in queue/blocked DB lock, local cancellation/revoked policy/account, cross-attempt/revision/profile handle swaps, lost consume ACK and duplicate admission all refuse before unauthorized browser work. Explicitly test the bounded Core revocation policy rather than claiming instantaneous invalidation.

Real Chromium/PostgreSQL/application receipts prove one original submit, zero finalization effects, then two explicit runs with unpredictable distinct read values, identical artifact/policy/plan and zero calls to both gateways. Retain initialBlank navigation, current origin redirection, selected target, allowed isolated fill/select semantics, fresh binding store, type drift, post-check replacement, assertions, source-free IPC, stdout/stderr/URL/title/host canaries, video/seek/cancel/deadline/cleanup and real scheduler mismatch. Four flags and profile rollback are tested through actual beans/routes. These tests are required evidence, not performed results.

## C12. R2 source-backed joins and mandatory runtime clarifications

**Actual admission identity boundary (R1-006).** The new `/internal/studio/executions/{id}/observed-admission` uses unchanged `StudioInternalSecurityConfig` `/internal/**` chain and `ServiceIdentityAuthenticationFilter`: configured `studio.execution.callback.service-token`, constant-time Authorization Bearer check, ROLE_STUDIO_RUNNER_CALLBACK, then existing body limit and strict closed observed parser. It is not the guided-only verified certificate/JWT chain and does not attest a per-instance client certificate. The smallest adequate boundary is the existing trusted ordinary runner service plus exact execution/attempt/admission/grant CAS, not a new identity system. Production transport must use authenticated server TLS on the internal backend endpoint (or the existing protected service-mesh TLS termination and trusted internal hop) and restricted internal routing; plain HTTP is confined to controlled local fixtures. The filter itself does not establish or verify TLS and forwarded certificate headers grant nothing. All configured runners sharing this restricted token form one trusted service boundary; compromise of the token is not mitigated by calling it mTLS. RunnerInstanceId remains an exact one-time CAS identity supplied by that trusted service, not a certificate assertion. Guided-only credentials without the ordinary token fail; a valid token never bypasses the stored user replay grant/expiry/scope/owner CAS. Existing v1 callbacks/filter behavior remains unchanged. Actual HTTP security integration includes missing/blank/wrong token, forged certificate headers, guided-only token, correct token with wrong actor/attempt/revision/grant, and valid admitted tuple. Test the real filter chain, not a mocked controller principal. No product security filter/config edits are needed; the owned guided runbook records the deployment TLS/trust requirement.

**Total recipe order (COND-R1-2).** Sort InputRecipe by `(source-step-position, provenance-kind-rank, start, end, referenceId, intendedSlot, kind, inputId)`, lexicographically with integer positions/ranks/offsets and Unicode scalar lexicographic strings. Rank sourceSpan=0, configuration=1. SourceSpan uses actual start/end and empty referenceId; configuration uses start=end=0 and actual referenceId. Slot rank is not implicit locale order: string comparison uses scalar values, never locale collation. Thus mixed recipes, same-start spans, distinct slots/kinds and aliases have a total deterministic order; duplicate full inputId or identical recipe assigned two IDs refuses before sorting. Fixed ordering vector (same source step0; unspecified referenceId empty): input b sourceSpan(2,5)/fill.value/nonsecretText; a sourceSpan(2,4)/fill.value/nonsecretText; c sourceSpan(2,5)/assert.expected/nonsecretText; d configuration(cfg-b)/fill.value/nonsecretText; e configuration(cfg-a)/fill.value/nonsecretText; f source-step1 sourceSpan(0,1)/fill.value/nonsecretText → **[a,c,b,e,d,f]**. Kind and final ID comparisons are explicitly defined for total ordering, but do not legalize a destination in fill.value or duplicate semantic provenance. Such otherwise sortable invalid inputs still refuse. Equal full tuple/duplicate inputId refuses. Java/Node vectors must test both ordering and duplicate rejection; fixed canonical byte vectors C9 stay unchanged.

**Operation compatibility (COND-R1-3; replaced by ADR-SC-007 WI-4).** The Guard no longer records visible/actionable/elementType/controlType: it records `{locator, tier, identity, readRuleId}`. Compatibility of an operation with the target is the recorded identity role as a coarse structural check (fill: textbox, searchbox, spinbutton, combobox; selectOption: combobox, listbox, option, radio, menuitemradio; check/uncheck: checkbox, radio, switch, menuitemcheckbox, menuitemradio) and, at run time, Playwright's own actionability checks in the one executor (visibility, enabled, editable, a single match, the identity check for the tiers that need it, the focus verification for fill and press). A password read or hasValue is refused live; a read needs the current positive read grant. Tests: the executor unit tests (`test/run/targetAction.test.ts`) and the cut-over perception tier.

**Observation read profile (STUDIO-GOV-001.4; supersedes the R1-003 trusted policy, which no longer exists).** There is no `TrustedPolicy`, no `applicationPolicy` and no `currentPolicyHash`. Learning and replay both run under the runner's one constant profile: structural discovery on, visible text readable in the application region of each allowed origin (one grant per origin, whose id is a pure function of the origin), no field value readable, no field rules. Structural discovery alone never permits reading. A learned read recipe names the grant that let it read and replay accepts it only under the same grant, which is why the id derivation is shared by learning and replay.

**IPC status/control/clock (R1-005).** StepStarted2 emits only for an actually started step. StepFinished2 PASS has nonnull ordered start/finish/duration and null error; FAIL has actual nonnull timings and a closed error; SKIPPED has all three timings null and null error, since no step/assertion executed. After a stop/failure, remaining steps report SKIPPED exactly once, not fabricated failures. Overall Result2.ok is true iff every requested step PASS; unknown/cancelled outcomes have their actual closed error. `recording.bytes=null` means unavailable/unmeasured, never fabricated zero; path/size/evidence state and partial are independent of assertion success, following existing recording inspection. Common Stop has exactly kind=stop on the already execution-scoped IPC channel, accepted in launch/account preparation/application/execution/drain phases. It stops further operations, boundedly cancels pending provider work, disposes account and closes recording; the parent retains existing graceful-stop timeout then process kill, with no extra application work during flush. Recording context/run origin and total-runtime budget start before account apply; delayed apply consumes that budget and video offsets. Ready2 echoes that established origin/calibration; it does not reset time. Test first-step failure/cancel with skipped remainder, delayed apply and aligned video seek, unknown bytes, parent stop/drain/deadline during apply and execution, and legacy Stop unchanged.

**Source-free runtime and packaged support (COND-R1-4–8).** Execute2 input metadata is the nonsecret inputId/step/kind/slot projection needed to validate each typed argument locally; it contains neither sourceSpan text nor config value provenance beyond that placement. Parent checks exact immutable recipes; child checks every declared placement and forbids extra/duplicate inputs. RuntimeBinding contains only producer coordinate/recipe/origin; the new runtime value/availability state is empty, never imported from historic admissions/context/fence/value. The fixed compiled account provider registry is wired in actual child.ts; no function/object/module/source registry travels through IPC. Each supported execution Profile catalog entry is a trusted deployment record `C{profile:Profile,build:BuildIdentity}`. ValidationRequest pins requiredBuild; ValidationVerdict reports actual build; each new ordinary ExecutionBinding pins the currently selected compatible build, and AdmissionRequest/Launch2/Ready2/Result2 carry/check it. Bind H(requiredBuild) into the publication snapshot/attempt identity and current execution grant buildHash=H(requiredBuild), so a job cannot swap a supported but ungranted build. The immutable artifact requires its execution Profile, not one forever-fixed container image: the trusted catalog may explicitly associate another compatible build with the same Profile; saved replay selects and pins that build for the new execution without rewriting the artifact or learning provenance. Build scripts hash the actually packaged generated observed schemas (including referenced learned-plan conditionals) and frozen observed-reference bundle, and the deployment release catalog associates those hashes with the built immutable image digest and actual Chromium build. A container cannot include its own image digest circularly: the trusted deployment catalog supplies that association, and startup compares the injected expected immutable image digest with the release record plus locally recomputed bundles and runtime Chromium identity; a missing/untrusted catalog refuses observed service. A copied catalog string or stale dist bundle is insufficient. Backend compares reported catalog identity/hashes against its trusted supported catalog at validation/admission; runner/child verifies the same packaged support before browser. These build/runtime facts are distinct from historical learning model/provider/API provenance. No new mutable claim in the artifact selects an executable image.

All C1 caps remain hard caps after Configuration and full policy additions. Validate composed UTF-8 bytes at all sends/receives before parse/traversal/spawn, and test limit-1/limit/limit+1 with Unicode/config/grants/inputs/handle combined. Actual packaged observed validator enforces every imported closed schema and conditional; build-only checks do not satisfy it. LearningProvenance must report only stored pin/model facts: outputContractHash is required from immutable manifest.schemaPins.outputContractHash; guidedPromptHash is null unless an exact complete historical prompt digest was durably recorded, and the output contract must never be relabeled as that prompt digest. Missing required output/schema provenance refuses. Its configuredModel/providerReturnedModelVersion fields remain nullable; populate configuredModel only from immutable attempt provenance if recorded, never current configuration. Existing records without either carry null. A provider-returned model version cannot be fabricated from configuredModel or current provider API. These audit fields stay outside execution Profile and never force replay relearning on benign model changes.

Required focused R2 evidence: use the actual005 allocated implicit-reference flow and exact persisted plan hash, plus genuine blank-page then observed-page preparation across restart. Exercise configured viewport deliberately different from recording geometry and reject changed viewport/browser/environment/waitStrategy against the unchanged configuration hash. Hold real validator HTTP across an actual same-owner renewal (one send, unchanged snapshot), then falsify owner/fence/original-deadline/cancel/source changes. Use actual application/region policy without testId mappings; move source outside region and mutate structural/type/override permissions. Exercise genuine child delayed account apply, video clock alignment, skipped remainder/null timings, unknown recording bytes, and Stop during prepare/apply/execute/drain. Actual service-token security chain tests cover both valid and invalid authority without claiming certificate verification. Both gateways remain zero during publication/replays and prior legacy/regression oracles remain mandatory.

Delayed-state correction: C12 operation-specific guard compatibility also governs private acquisition; sanitized absence cannot prove safe absence. The normative bounded design in [delayed-state-design.md](delayed-state-design.md) resolves DELAY-001–004, with required asynchronous/late-return/compound-step/privacy oracles in its §5. Existing fixed isolated fill/select and native pointer/key boundaries remain unchanged.
