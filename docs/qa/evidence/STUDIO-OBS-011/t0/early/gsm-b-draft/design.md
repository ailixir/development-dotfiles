# GSM part b — exact source preparation

Dex backend admission/transaction specialist. Off-tree only; no compiler, tests, formatter,
Gradle, Node, Docker or provider call was run. Root's preparation authorization is narrower
than W1 application. The running DIAG Replay candidate differs from S_011; this package does
not assert global source identity or permit staging while DIAG is live.

Inputs are current story AC-2 F-1 c–e / CLN-21, v7 adopting v4, final R-F1 v2 in
`t0-prep-20261018/t0-record-draft.md:95` and the actual T0 record's corrected insertAction
anchor. Superseded R-F1 v1's eight-call count is deliberately not used. R-F1.3 preserves two
production-access conditionals. R-21 allows only dead-command-specific drops; other oracles
must survive.

The three changed part-b paths are the corrected GSMa service, exact GS-T SessionIT baton,
and new negative IT. `repo/` also forwards the corrected GSMa controller, actual-base-aware
projector and both GSMa tests byte-for-byte. `part-b.patch` is exactly those three changed
paths. `S011-owned-seven-paths.patch` is the seven-path GSM composition.
`S011-composition.patch` additionally composes the unchanged full GS-T TransportFaultIT and
LifecycleReasonIT dependency drafts, giving the full nine-path preparation from original
S_011. Those last two are read-only dependencies, not part-b writes. Root owns their prior
GS-T application and full unchanged-main gate; the composition patch is not an application
shortcut. Every preimage, forward hash and final hash is in manifest.json.

One `requireTranslation(id)` helper retains the exact existing predicate/code/status.
Normalize three existing guards and add four first-operation-lambda calls. The helpers in
internal/publicCommand still perform existing contract/authentication/owner/idempotency
checks before invoking those operation lambdas; none of those boundaries is reordered or
removed. The admit call is before state validation, bindings.validateAction,
preparations.authorize, access.authorizeAction, reservation or insertAction. Unwrap exactly
five translation-present arms, retaining their complete body statements in the same order.
There is no replacement cache or new access SPI. Existing duplicate-command behavior remains;
this is the exact ruled lambda placement, not a newly broadened cache/authentication policy.

Both production-access conditionals remain byte-identical: start's incremental selection
and production.initialize. R-F1.3 excludes changing the access SPI. Production configuration
still installs translation without a feature condition. A production start initializes the
state in the same transaction. Non-production SPI compositions with no translation state
are refused on first gated command.

Corrected GSMa's queued/in-flight session tracking, owned teardown seam, rate-limited
value-free WARN, executor capacity and 15-minute window are untouched. Its atomic publication
policy, original receipt/manual defaults and real publication-base presence lookup are
untouched. Forwarding the exact controller/projector/tests prevents accidentally reverting
the already-reviewed actual-base correction. All pins, contracts, migrations, providers and
authorization policy remain outside this delta.

## Retiring recordEvidence without discarding independent coverage

A repository-wide source read found zero main callers, two calls in the one SessionIT case,
and three Replay diagnostic string labels. Only the service method and its own Javadoc are
removed. Replay is neither edited nor copied from a future IT-R draft. The three diagnostic
labels remain the named R-21 exception.

`evidenceReferencesAreScopedAndDoNotClaimReplay` is preserved by name. Its valid evidence
insert is ported to the surviving repository.evidence seam with actual current scope. Its
foreign-scope FK rejection, stored opaque reference equality, terminal public evidence ref
and replayVerified=false assertions remain. Only the old method's URL-format refusal
subassertion is retired, because that command and its validator no longer exist. No equivalent
assertion is invented against a repository that never promised that validation. The scoped
repository stores opaque test data and does not become an executable planner authority.
All 44 SessionIT names and every other method's bytes are preserved from GS-T. This is a
ported case, zero named method drops and five added negative IT methods.

## Negative compositions and authority

Each of the five new methods runs both missing-store and real-installed-empty-store
compositions, using a separate migrated PostgreSQL database each time. It performs real
service.start, prepareAssignment, worker claim, assignment ACK and initial materialize.
The production SPI's permitted non-production implementation supplies the established
session fixture's source snapshot, authentic BFF owner/CSI check and fixed revisions. No
plan, obligation, manifest, translation-state or admission row is seeded. No provider is
called and no positive planner success is claimed. Real session, context revision1, worker,
fence, live lease, actual transaction and lack of a pending V21 append delivery are asserted.

The admission probe uses only the existing authenticated runner-preparation seam; one valid
preparation exists before admission and must remain exactly unchanged. No proof row is
inserted directly. The deliberately hand-crafted proposal is solely a negative probe and
never used as positive planner evidence. Spies observe authorizeAction, bindings validation
and preparation authorization and must all remain uncalled.

For ordinary clarification the service itself creates the authenticated pending question.
For confirmation-answer coverage the same service creates the question and a disclosed
negative-only transaction supplies its bounded sideEffectConfirmation progress record
(question id/PENDING). This progress fixture cannot create a plan, admission, observation,
model attempt or execution authority. It is necessary because the existing guarded wrapper
already refuses creating that confirmation in a translation-absent composition. This seam
is explicitly exposed for architecture review, not disguised as a production flow.

Before/after snapshots compare every public-schema studio_guided_* relation having a
session_id column, plus idempotency commands by namespace, not just aggregate counts.
Thus action/obligation/admission/preparation, session counters/progress, context, translation,
materialization, binding and other affected rows cannot be created or modified. Each failure
must be GuidedSessionException with status409, code and messageCode RUNTIME_INCOMPATIBLE.
The accepted-red assertion prints only site/mode/accepted and closed returned-state labels.
Setup/schema/source/owner/preparation failure occurs outside that assertion and cannot earn
red credit. Running both modes gives ten operation probes under five JUnit identities.

## Unresolved exact-proof conflict: wrapper control versus new redundant guard

Call path: sideEffectConfirmation(4args) → sideEffectConfirmation(5args) → contract/reason/
prompt/choice checks → translationTransaction → backend-controller role → repository.transaction
→ repository.lock(session SELECT FOR UPDATE) → access.checkCurrent → owner(role/fence/lease)
→ active → access.checkSourceCurrent → existing translation guard → operation.apply → newly
required first-lambda guard → original state/scope checks → writes/continuation/save.

Existing GuidedTranslationStore.exists requires an actual transaction and performs SELECT
EXISTS on studio_guided_translation_state. Missing store short-circuits before any exists
query. Installed-empty-store performs one actual EXISTS read in the wrapper and refuses
before operation.apply. With valid existing state, the normalized wrapper and new lambda
would each read exists (two reads), within the same caller-held session lock/transaction.
All application store mutations require that transaction/session lock; no production method
removes translation state, and the installed store has no runtime uninstall operation.
Initialization uses the same session transaction and source-manifest/state inserts. Hence
no authorized application transition from present to absent can occur between wrapper and
lambda. Arbitrary out-of-band SQL deletion is not an application command or a lawful proof
fixture, and cannot justify a bypass. READ COMMITTED alone is not a claim against arbitrary
administrative SQL; the application lock and mutation inventory are the relevant boundary.

Consequences: the first new case is a preexisting409 baseline control. It cannot truthfully
be accepted-red on old main. Deleting only the added side-effect guard leaves the existing
wrapper guard and should survive this absent-state test. The package retains the mandated
source shape and includes that exact mutant with survival/conflict explicitly unresolved.
No state-flapping mock, wrapper bypass, doubled mutation or fake red is used. Root directed
preserving the case and submitting these facts for Aria/Quinn disposition. Four other cases
are intended old-behavior accepted-red; the remaining three deletion mutants plus moved-admit
guard must fail the genuine new assertions. All such behavior is UNEXECUTED, not evidence.
