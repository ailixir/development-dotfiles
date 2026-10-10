# Durable guided session boundary (OBS-003)

The feature defaults to disabled. V30 adds sessions, immutable admitted proposals/ledger entries,
durable route-scoped idempotency responses and scoped evidence references without modifying legacy
execute/schedule rows. The Java schema validator packages the frozen OBS-001 schemas directly from
`docs/specs/studio-observed-authoring/contracts`; it does not maintain another contract copy.

`GuidedSessionService` owns transactions. Its repository serializes transitions with a session row
lock. Start takes a transaction advisory lock over the canonical principal/test identity before
checking its durable request digest. Admission and budget consumption commit together. Advance
changes ADMITTED to DISPATCHING and sets dispatchCount=1 before browser invocation is possible.
A returned DISPATCHING ledger on a repeated request is already consumed and is never a new dispatch
permit. OBS-004 must keep at-most-once local consumption, treat lost advance acknowledgments as
uncertain, and call `lostAcknowledgment` through trusted lifecycle handling; it must not retry the
browser action. This story invokes no browser or model.

Claim binds a verified worker subject and monotonic fence to a 30-second lease capped at the original
session deadline. A live same-owner renewal extends only its lease, preserving its fence, workflow
state and outstanding admission/callback identity. Actual acquisition increments the fence and
preserves guarded clarification/auth/finalizing pauses; ownership maintenance never answers a
question, completes authentication or publishes a plan. A different owner can recover only an undispatched live context proven by the
trusted registry. Dispatched uncertainty or lost context after prior effects stops the session.
Cancellation/expiry revoke unconsumed actions and preserve consumed uncertainty. Reaper expiry has
no public endpoint. Repeated callbacks cannot change admission fields, infer assertion success from
a non-assertion operation, revive terminal sessions or publish a revision.

The trusted `GuidedSessionAccess` implementation must resolve immutable source/config snapshots,
normalize/approve configured origins, derive principal/CSI/environment/application/account scope,
check current grants and policy on every operation, and actually supply the isolated account
connection. `checkSourceCurrent` must lock the authoritative test/config row in the calling transaction
and compare its revisions. Entitlements and source freshness are separate: source changes block new
work and publication, while authorized historical evidence stays readable. Production currently uses
a fail-closed unavailable-account adapter: even enabling the flag cannot fabricate a connection.
OBS-007 supplies account handoff; OBS-004 supplies current DOM/policy action authorization; OBS-005
supplies semantic step completeness and gateway orchestration. Model reservation/settlement methods
retain conservative charges when usage is missing and durably stop on a reported overrun.

OBS-006 must extend the finalization transaction with exact executed-plan reconstruction, binding
verification, deterministic lowering, hash comparison and atomic ready-revision publication. The
current prerequisites check scope/grants, source/configuration, owner/fence/lease, deadline, completed
source steps and successful one-dispatch ledger evidence; the missing exact verifier returns
RUNTIME_INCOMPATIBLE. A successful callback never publishes. Source conflict after successful work
records PUBLICATION_CONFLICT. Guided result projection never claims replay verification or schedule
activation. Only opaque authorized evidence-store identifiers are persisted as references.

Accepted clarification answers are durably stored in private session progress, keyed by the original
question identity. They contain only the selected choice/node/binding IDs, coordinate, scope hash,
source/configuration revisions, document/generation and resolution time; displayed labels and runtime
values are excluded. Answer insertion, removal of the pending question, workflow transition and
idempotency response commit atomically. Reusing a resolved question identity is refused; retained
answers are bounded by the session's observation ceiling. `clarificationSelection` is the authenticated,
current-fence backend planning handoff for OBS-005. It retains the original document/generation after
re-observation so a planner can interpret the user's answer, but it is not a current target or execution
permit: OBS-004/005 must revalidate correspondence against the new observation before admission.
There is no new HTTP endpoint or frozen JSON schema field.

## Configuration and authentication

All limits bind under `studio.guided-authoring` using the approved flat kebab-case keys, for example
`max-session-seconds`, `max-actions`, `max-model-input-tokens-total` and
`max-sanitized-evidence-bytes-total`. Defaults/ceilings come from the frozen limits contract; lower
values are allowed. `enabled` defaults to false. Sessions freeze every configured ceiling on start.

Guided internal routes use a dedicated order-0 chain; legacy callbacks retain their existing order-1
static-token chain. Provision `service-public-key` as a pinned RSA >=2048-bit X.509 SPKI public key,
`service-issuer` as the exact trusted issuer, and `mtls-required=true` only on a connector configured
with clientAuth=need and its trusted CA store. The filter requires the container's verified client
certificate attribute; HTTPS/forwarded headers alone do not qualify. If these prerequisites are
missing, requests fail closed. The signing private key stays with the identity issuer, never runners.

Service JWTs use RS256, typ=JWT, exact issuer, audience `studio-guided-controller` for this backend
receiver, nonempty subject, role `owning-worker` or `backend-controller`, integer iat/exp and a maximum
300-second lifetime without clock-skew grace. Runner receivers must use their own distinct audience.
JWT-selected keys/algorithms, duplicate keys, malformed encodings, wrong audience, static legacy
tokens and user identities are rejected before controller work. Worker-only operations additionally
require the subject to match the persisted owner. Rotate keys by disabling starts, draining/cancelling
sessions, provisioning the new public key and matching issuer credentials, then restarting receivers.
No remote key fetch or shared worker signing secret is used.

Public routes preserve the existing platform BFF `put_session` cookie authentication. The coordinated
OBS-003 DOC-001 erratum corrects the OpenAPI `PlatformSession` cookie scheme and normative contract
README, superseding their earlier public bearer wording. No JSON body/schema shape, public JWT
behavior, existing platform security or internal service authentication changes. Public v3
requests bypass the existing UUID/Caffeine idempotency filter and are deduplicated transactionally by
this service, with nonempty opaque keys up to 256 characters. All mutations return 202; pending result
is 202 and absent clarification is 204. No new public/internal downstream planner/context endpoints
are invented by this persistence story.

## OBS-004 common observed-2 bridge

The additive v2 implementation uses the schemas in `contracts/v2/` and the separate
`openapi-v2.yaml`. Public start selects schemaVersion2 plus the exact observed-2 tuple. Internal
v2 callbacks use the same verified mTLS/issuer identity filter with owning-worker subject/fence
checks. The v1 files and one-shot runner remain independent. OBS-006 implements exact exercised-plan
lowering and scoped atomic publication through fresh BFF/Core authorization, with matching publication
and replay flags and trusted profile/schema/build catalogs. Later explicit Runs use the frozen plan
through the ordinary recorded pipeline without model calls. The production account-provider port
remains fail-closed until OBS-007; first guided-run recording remains OBS-008 work.

`GuidedSessionAccess.sources` supplies immutable classified nonsecret regions/configuration
references from an authoritative source boundary. `GuidedSourceReferenceValidator` checks exact
UTF-16 provenance, Unicode boundaries, revisions, slot/type/scope and approved destinations;
`GuidedMaterializationService` allocates IDs and freezes the persisted table/hash before actions.
This is a mechanism for controlled semantic candidates, not an English extractor or permission
to project sources to a model. All shared mutations use session-row serialization followed by
source/configuration locks and then bridge records; source adapters must use that same order
and must not acquire session locks after holding a source/configuration mutation lock.

`GuidedDispatchService` obtains runner context and preparation outside transactions, persists
authenticated proof, and admits the exact proposal. Duplicate admission keys return their stored
admission without preparing again. Concurrent equivalent preparations may coexist; admission
selects one unexpired exact-digest proof, and its association is single assignment. V31 keeps
allocations, successful producer receipts and concrete consumer edges separate. Producer outcome
and receipt commit atomically; changed duplicate receipts conflict. No runtime value, sample,
length or value digest appears in these records.

`consume` rejects ambient transactions. Only its committed ADMITTED→DISPATCHING winner returns
an ephemeral in-process `WonConsumption`; the command cache contains historical ledgers only.
Neither same-key nor new-key replay sends again. `GuidedRunnerClient` makes one HTTPS POST with
redirects disabled, rejects enabling JDK retries of non-idempotent methods, uses a deployment TLS
context, and reads the controller JWT from a mounted issuer-managed token file. Configure
`studio.guided-authoring.runner-origin` and `controller-token-file` with JVM key/trust stores
provisioned at startup. Missing account/transport identity remains fail-closed.

Cancellation, expiry and uncertainty commit first. After commit an asynchronous stop sender
uses the captured context identity; only an authenticated stop acknowledgement records teardown
CONFIRMED. A missing acknowledgement leaves PENDING. The local worker lease/deadline independently
closes the browser and destroys values. Already-consumed work remains uncertain unless a trusted
definite outcome was committed. A lost dispatch HTTP response cannot overwrite committed success.

The joined `GuidedBridgeIntegrationTest` starts real PostgreSQL, actual Spring HTTPS security and
the compiled guided worker with runtime-generated mutual TLS certificates and issuer JWTs. Its
controlled public-fixture account handshake is performed before session transactions. Independent
application receipts prove one blank-start navigation and exact source→read→consumer bytes; tests
also cover transaction races, deferred commit rollback, source locks, target replacement,
producer rollback, bounded large callbacks and cancel/stop uncertainty. This controlled fixture
does not certify production accounts, semantic model selection or publication.

### Ownership before context and acknowledged renewal

`GuidedAssignmentStore` persists a unique immutable session/worker intent before `/assign` is sent.
The actual worker uses its own issuer credential for backend `/claim`; the controller never
impersonates it. V2 claim requires that persisted assignment, and only a still-live same owner may
renew the acquired fence. An expired grant cannot reacquire; same-owner renewal does not increment
or overflow the fence. The backend records the initial authenticated OWNED receipt before allowing
materialization. That receipt is historical actor-join evidence, not future lease authority.

The worker independently renews around every ten seconds with one outstanding request and a timeout
inside its last acknowledged lease. Only validated claim replies extend local authority. Cumulative
context timestamps cannot extend or regress the acknowledged lease or reset action/binding history.
An immutable assignment-scoped stop/lifecycle works before a browser/context exists, without a fake
owner-fence header. Repeated live assignments report current acknowledged ownership; stopped or
expired assignments refuse `/assign` with 409. STOPPED receipts are exclusive to confirmed `/stop`.

Transport HTTP200 does not substitute for an owner-authenticated committed outcome. After dispatch,
the backend checks the exact consumed admission and marks only an unresolved one UNKNOWN_OUTCOME;
a lost old acknowledgement cannot poison a later admission. The joined suite includes real owning
worker claims and renewals beyond the initial thirty-second lease, paused captured-value retention,
renewal during a busy navigation, failed/stale grants, pre-context cancellation/capacity, restart
refusal and maximum-fence renewal. A trusted pause-state fixture tests renewal preservation only;
OBS-005 still owns semantic clarification and user-choice orchestration.

### Fresh evidence across authored steps

`GuidedDispatchService.observe` persists the frozen refresh identity, expected generation and
canonical `oref-` callback correlation before calling authenticated runner `/observe`. Only an
active OBSERVING or pre-admission PROPOSING session can begin; an unresolved pause or admitted
operation cannot. Refresh never consumes an action, advances its ordinal or clears captured values.
The worker collects real evidence and acknowledges its owning-worker callback before returning the
same envelope. The backend verifies that exact correlated observation is already committed and
still current. A lost final response can read that committed result without another network call;
changed requests conflict, and later evidence, actions or terminal states invalidate cached authority.
A legitimate unrelated observation supersedes an unfinished intent without rolling newer state back.

The controlled two-step verifier in the joined test only recognizes its fixed navigation/read
receipts. It does not interpret English or generate questions. Production semantic completeness, the observed-v2 question schema/producer and source-to-model
policy remain OBS-005 ports. A separate explicitly trusted transaction fixture installs a question;
the existing v2 answer DTO then performs the real answer transition before authenticated refresh.
Historical selection identities remain historical and require fresh target correspondence. Legacy
questions/answers cannot cross into a v2 session; supported v1 behavior remains unchanged.

### Raw guided wire boundary after SEC-002 / REL-002

`GuidedWireBodyAdvice` validates bounded original UTF-8 bytes before the MVC converter can discard
duplicate keys, trailing JSON or numeric spelling. It is scoped to the two guided controllers;
BFF identity and other application converters are unchanged. Runner response bytes and signed JWT
segments use the same strict parser. JWT headers/claims are closed and all numeric claims are
canonical safe nonnegative integers under the existing short lifetime. Error responses remain
fixed data-free codes. Persistence text parsing also rejects duplicates/trailing content.

All v2 timestamp schemas enforce the explicit uppercase UTC Gregorian profile with optional1–9
fractional digits and absolute string end. V1 schema bytes/format semantics are preserved. Shared
vectors cover Java, Node and Ajv, including malformed raw HTTPS bodies/replies and invalid authority
timestamps. Undefined schema pointers fail closed instead of compiling a permissive missing schema.


## OBS-005 production translation integration

`GuidedProductionSessionAccess` now implements current source/revision checks and `StepVerifier` on the same access object. It locks current `ui_tests` through `StudioRepository.findByIdForUpdate`; immutable source/configuration manifests, planning revisions, one-send attempts, obligation associations and question meanings live in additive V32. OBS-006 joins successful original evidence into a deterministic replay artifact and immutable publication receipt under the original scoped Run and fresh Core authority; subsequent explicit Runs obtain fresh grants and recapture runtime values without either model gateway. `GuidedProductionSessionAccess.AccountAccess` remains the fail-closed OBS-007 account-provider handoff, so the implemented publication/replay mechanism does not imply production account connectivity or first guided-run recording.

Enable the production composition with `studio.guided-authoring.translation.enabled=true`, approved `allow-authored-nonsecret=true`, explicit `applications`/`environments`, existing runner origin/controller-token configuration and HTTPS `translation.controller-origin`. The actual compile provider settings select the concrete guided gateway; there is no recorded-fixture production fallback. `translation.verify-steps` defaults false; enabling it adds a budgeted semantic opinion without bypassing deterministic completion. Default input/output ceilings remain unchanged. Missing enabled dependencies fail configuration rather than installing an unavailable translation implementation.

Planning routes under `/internal/v2/studio/guided-sessions/{id}` require the existing controller JWT/mTLS, fence and idempotency headers, strict raw JSON parsing and immutable expected revisions. `/plans` prepares source/materialization, `/proposals` advances remaining obligations, `/dependency-admissions` refines cumulative needs without replay, and `/planning-context` exposes only the safe model projection. The coordinator polls durable continuation and uses its mounted controller identity; workers still acquire/renew with their own credentials. Source and observed questions share the existing public v2 answer DTO and persist semantic choice atomically; resume uses real bootstrap or `/observe` as appropriate.

The model proposes only a remaining obligation plus typed target/operation. Original attempt identities are checked before the backend builds full OBS-004 authority; late/stale answers cannot be restamped. Failures retain reservations, and current-authority late-usage reconciliation can stop an over-budget run without reviving terminal state. Deliberately authored nonsecret checklist literals may reach the model under INPUT-POLICY-01 A; resolved saved values, credentials and page captures remain excluded from prompts, repairs and diagnostics. No arbitrary-English correctness or universal secret-detection guarantee is implied.

Guided usage settlement includes reported tool-use prompt tokens in input and reported thought tokens in output. Cached prompt tokens are not counted twice. Missing primary usage remains unknown and retains the reservation; malformed/overflowing metadata fails closed. Thought content is never inspected or logged. Late known usage is audited without reviving terminal authority.

OBS-005 remediation R1 binds each source choice to the immutable disputed step, occurrence, operation and argument slot; listing the chosen reference unused cannot satisfy it. Bootstrap progress now records PLAN_ACCEPTED → MATERIALIZED → ALLOCATED → CONTEXT_PENDING → READY. The scanner resumes these stages before inference, and READY is one-time even after actions. A prior initial callback does not certify later allocations: same-context metadata acknowledgement is required. Strict model, source-selection, planning-context, provider-projection and output-contract identities are pinned before bootstrap-only continuation as well as provider calls. Late accounting and every reserve/send claim share the session lock; refusal commits counters and stop, including a new reservation that no longer fits after a still-under-limit late delta.

R2 tightens bootstrap proof: callback timing never proves metadata delivery. Every CONTEXT_PENDING → READY transition requires an acknowledged delivery of the exact frozen final context and the authentic initial evidence. A private versioned acknowledgement binds delivery ID and context/identity hashes; old READY records without that proof fail closed. Lost replies retry the same metadata within three committed attempts, without another browser, bootstrap callback, source-plan request or application action.
