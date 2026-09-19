# Gateway client seam — what a gateway test may name, and what it must not

**Status:** Ruling. Standing rule, effective immediately.
**Scope:** `backend/src/{main,test}/java/com/citi/put/checks/studio/compile/gateway/` and every consumer of `LlmGatewayClient`.
**Author:** @architect (Aria), 2026-09-17.
**Relationship to other documents:** a note under `studio-execution.md` §4.1, not an ADR. §6 explains why.

> This document is a rule about test seams. It is deliberately **not** filed as an ADR and
> deliberately **not** written into `studio-execution.md`; §6 gives both reasons, the second of
> which is mechanical.

---

## 1. Why this was escalated, and what the escalation got wrong

The Epic 10 orchestrator recorded, in `docs/epics/EPIC-10-RUN-LOG.md` under *"Reconciliation — the
fold is now blocked much harder than before (2026-09-17)"*:

> `VertexLlmGatewayClient.java` and `VertexAiClientFactory.java` are **deleted** in their tree […]
> **Four of our test files reference the two deleted classes** […] When their work lands, those do
> not fail: **they do not compile.**

**That is not what their tree does.** Verified read-only on **2026-09-17T21:52:56Z**, in
`wt/epic` on branch `epic/EPIC-10` at commit `ff0513385eea833fcf6c2eabeb5b1e0a453a7adb` with **241**
dirty paths by `git status --porcelain` (the RUN-LOG says 263 — a different, earlier count of a tree
that moves; the discrepancy is expected and is not itself a finding). Their work is uncommitted and
may change; everything in §2 is a snapshot at that instant.

The two classes are **not deleted. They are demoted** — moved from `src/main/java` to
`src/test/java`, byte-for-byte unchanged, and their SDK dependency moved from `implementation` to
`testImplementation`. The four tests compile. The collision the escalation describes does not exist
in this snapshot.

The escalation was still correct to raise the question. It is just a different question than it
thought, and the answer is better than it feared.

---

## 2. Fact base

### 2.1 In `epic/EPIC-10-w7` at `d3700f23de0de0091926b9f0d6f219c13c4bf614` (verified)

`ff0513385` is an ancestor of w7's HEAD, and `git diff --stat ff0513385 HEAD` over
`.../compile/gateway/` (main and test) and `backend/build.gradle.kts` is **empty**. w7 has not
touched the gateway package at all. The four files in question are therefore identical to the
committed base both programs branched from.

**The interface does not leak vendor types.** `LlmGatewayClient.java:10-21` declares exactly
`CompileResponse propose(CompileRequest request)` and nothing else; its own javadoc at lines 7-8
states the intent — *"Deliberately free of Vertex AI SDK types: story 10.8 and every test depend on
this interface only, and `VertexLlmGatewayClient` is the single place that knows the SDK."*
`CompileRequest`, `CompileResponse`, `GatewayProvenance`, `GatewayOutcome` and `GatewayErrorCode`
carry no vendor type. **The interface is a sufficient seam.**

**Where a vendor type does leak is the configuration, not the interface.**
`StudioGatewayConfig.java:3` imports `com.google.cloud.vertexai.VertexAI` and line 45 publishes it
as a Spring bean. That is a real leak, and it is the one thing in the package that a client swap
genuinely had to change (it did — see §2.2).

**The concrete clients are already confined to their own package.** Searching all of
`backend/src/**/*.java` for `VertexLlmGatewayClient`, `VertexAiClientFactory` or
`DisabledLlmGatewayClient` outside `.../compile/gateway/` returns **zero** code references (one
javadoc mention in `DiagnosticsExposureEscalationTest.java:129`). Every consumer holds the
interface: `CompilePipeline.java:90` (`private final LlmGatewayClient gatewayClient;`), and six test
classes outside the package implement `LlmGatewayClient` as scripted fakes —
`CompileBudgetExpiryTest:66`, `CompilePipelineIT:88`, `CompilePipelineTest:103`,
`RepairBudgetExpiryTest:92`, `DeReadyCarryForwardTest:57`, `ScriptedRepairGateway:24`. (Inside the
package, `GatewayDisabledIT:89` does the same with a lambda.)

So the coupling is **four files deep, all of them inside the package that owns the client, all of
them that client's own test surface.** That is not a leak. It is the correct depth.

### 2.2 In `wt/epic`, uncommitted, snapshot 2026-09-17T21:52:56Z (verified read-only)

| Fact | Evidence |
|---|---|
| `VertexLlmGatewayClient.java` and `VertexAiClientFactory.java` are `git mv`-ed from `src/main` to `src/test`, **byte-identical** | `diff` against the w7 main copies returns no output for both |
| The Vertex SDK is now a test-only dependency | `backend/build.gradle.kts`: `testImplementation("com.google.cloud:google-cloud-vertexai:1.52.0")`, with the comment *"Legacy Vertex classes below are test-only historical regression fixtures."* |
| No production code names the Vertex SDK | `grep -rl "com.google.cloud.vertexai" backend/src/main/java` → **no matches** (only `application.yml` / `application-local.yml` endpoint strings) |
| `GenAiLlmGatewayClient` implements the same interface | `GenAiLlmGatewayClient.java:23` — `implements LlmGatewayClient, AutoCloseable`; production SDK is `com.google.genai:google-genai:1.71.0` |
| `StudioGatewayConfig` no longer publishes a `VertexAI` bean | the `VertexAI` import and the `studioGatewayVertexAi` bean are removed; `validateForEnabled()` moved into `GenAiLlmGatewayClient`'s constructor |
| Every widened record keeps a compatible legacy constructor | `StudioGatewayProperties` (14-arg), `CompileRequest` (11-arg), `GatewayProvenance` (6-arg) all delegate to the widened canonical constructor with defaults |
| `GatewayResponseParser.parse(String)` is unchanged; `parseProposal(...)` is added beside it | additive only |
| `GatewayAuditLogger.audit` only *adds* fields | the four tests assert with `.contains(...)`, so extra fields do not break them |
| Two of the four tests were adapted in place by them; two were not touched | `GatewayAuditTest` modified; `GatewayFailureClassifierTest` modified; `VertexLlmGatewayClientTest`, `GatewayTestSupport`, `StudioGatewayConfigTest` untouched |
| Their `GatewayAuditTest` still constructs `new VertexLlmGatewayClient(...)` | and *hardens* it: binds WireMock to `127.0.0.1`, asserts `vertexAi.getPredictionServiceClient().getSettings().getEndpoint()` equals the configured endpoint, and plants a `ROUTE_MARKER` in the stub's `modelVersion` so every success proves the response came from the local stub |

That last row is the important one. Faced with the swap, the other program did **not** delete the
Vertex tests and did **not** rewrite them against the interface. It kept them as a second
implementation's conformance evidence and made them stricter. That is the right instinct, and this
ruling generalises it.

### 2.3 Flagged, not ruled on — their tree, their call

Epic 10 does not re-do the other program's work, but two things in their snapshot bear directly on
the rule in §3 and are recorded so they are not discovered later.

Their `LlmGatewayClient` gains two **default** methods:

```java
default String compilationSettings() {
  return "{\"adapter\":\"disabled-or-test\",\"envelopeVersion\":1}";
}

default CompileResponse propose(CompileRequest request, CompileBudget budget) {
  budget.remaining();
  return propose(request);
}
```

- The budgeted overload checks the budget **at entry** and then delegates to the unbudgeted call. An
  implementation that forgets to override it compiles, passes any Tier 1 suite written against the
  interface, and runs a gateway call that the budget cannot cancel mid-flight. Their
  `GenAiLlmGatewayClient` does enforce cancellation through an OkHttp interceptor
  (`budget.onCancel(chain.call()::cancel)`), so the risk is latent, not live — but it is a
  cost/exhaustion exposure on an LLM egress path that a default method makes silent. **Under §3.1
  this is a Tier 1 obligation:** the conformance suite must assert that an expired budget starts no
  transport and that cancellation stops an in-flight one, for *every* implementation. They already
  have that assertion for their own client (`GenAiLlmGatewayClientTest`:
  `expiredBudgetNeverStartsTransport`, `cancellationStopsActualTransportAndRecoversSingleCapacity`);
  it is exactly the kind of assertion that should be parameterised rather than owned by one client.
- `compilationSettings()` defaults to a literal asserting `"adapter":"disabled-or-test"`. If that
  string binds revision compatibility, a client that forgets to override it misreports itself as a
  test adapter in a field that decides whether a stored revision is still valid. A method whose
  wrong answer is a correctness fault should not have a default; it should be abstract.

Neither is Epic 10's to change. Both are noted for the fold record and for whoever writes the Tier 1
suite.

### 2.4 Not determined

- **Whether their tree stays this way.** It is uncommitted. If they change course and delete the two
  classes before committing, the breakage the orchestrator described becomes real. §5 covers both
  branches.
- **Whether the four tests actually pass on their tree.** I did not compile: a Gradle run writes
  `wt/epic/backend/build/`, and that worktree is read-only to me. Symbol resolution is verified by
  inspection; *green* is inferred, not verified. Two behavioural risks I could not rule out:
  `StudioGatewayConfigTest.anEnabledGatewayWithoutConfigurationFailsStartup` now reaches
  `validateForEnabled()` through a different constructor, and their `validateForEnabled` added a
  `credentials.mode=none requires a loopback stub endpoint` rule that `GatewayTestSupport` satisfies
  only because it happens to use `localhost`.
- **Whether `studio-execution.md` §4.1 will be reconciled by them.** §4.1 still names the *Google
  Vertex AI SDK* as the integration; their tree has moved production off it. That paragraph is now
  wrong for their tree. The file is dirty in their worktree, so Epic 10 must not edit it (§6.2).

---

## 3. The standing rule

### 3.1 Ruling

> **The gateway's behavioural contract belongs to `LlmGatewayClient` and must be pinned by a
> client-agnostic conformance suite. A concrete client may be named in a test only when the property
> under assertion is false of the interface.**

Three tiers, and every gateway test belongs to exactly one:

**Tier 1 — Contract conformance. Written against `LlmGatewayClient`. Parameterised over
implementations.**
Anything that is a statement about what `propose` *means*: the `outcome`↔`errorCode` pairing; artifact
present on `OK` and absent on every failure; `provenance() == null` when the call was rejected
pre-flight; the `retries` / `inputBytes` / `outputBytes` accounting; the audit line's required field
set; the four canary properties (source text reaches the wire, and never the audit line, the
diagnostic stream, or a returned `failureReason`); and `propose` never throwing for an expected
gateway failure. Each implementation supplies a *factory* and a *stub-server driver*; the assertions
are written once.

**Tier 2 — Transport. Concrete, and correctly named after the client.**
Retry and backoff arithmetic counted in wire events; proof that SDK-level automatic retries are off;
endpoint/scheme/port construction; credential sourcing and its failure messages; serialisation to the
vendor's wire shape; parsing of the vendor's candidate structure; and vendor-specific exception
naming in a scrubbed reason.

**Tier 3 — Wiring. Concrete about the *selection*, not the client.**
`StudioGatewayConfigTest` asserts `isInstanceOf(DisabledLlmGatewayClient.class)`
(`StudioGatewayConfigTest.java:29-30, 40-41`) because the property under test is precisely *"which
implementation is active is decidable from configuration alone"* (`StudioGatewayConfig.java:15-16`).
Forbidding the concrete reference here would delete the test's subject.

### 3.2 The boundary, stated so it is checkable

- If the same assertion would be equally true of **any** conforming client → **Tier 1.** The concrete
  client appears only as a factory argument, never in an assertion.
- If the assertion would be **meaningless or false** for a different client → **Tier 2 or 3**, and the
  concrete name is correct and required.
- **No production class and no test outside `.../compile/gateway/` may name a concrete client.** This
  already holds (§2.1) and is now written down so it keeps holding.
- **Replacing a client does not delete its tests.** The outgoing client is *demoted* — moved to
  `src/test/java`, its SDK moved to `testImplementation` — and retained as a second implementation of
  the Tier 1 suite until a recorded deletion date. A conformance suite with one implementation is
  just that implementation's test with extra indirection; the second implementation is what makes it
  a contract.

### 3.3 Why not the stronger rule

A rule that all gateway tests target the interface would be wrong, and would have made this swap
*more* expensive, not less. `TIMEOUT`, `BUSY`, `TRANSPORT`-after-two-retries and
`TOO_LARGE`-on-output cannot be produced through a bare interface reference without some concrete
implementation to drive; an interface-only test degenerates into a test of a hand-written fake, which
asserts nothing about production. Worse, the canary tests derive their entire force from a *real*
transport materialising an echoed prompt into a *real* exception. A fake that hands back a canned
`CompileResponse` proves the scrubber and nothing about the path to it.

Equally, the current arrangement should not simply be blessed. The four tests' *assertions* are
overwhelmingly Tier 1; only their *arrangement* is Vertex-specific — they stub a Vertex REST body via
`GatewayTestSupport.generateContentBody(...)` in order to reach contract-level conclusions. **The
coupling is in the fixture, not in the assertion.** That is exactly why the swap was survivable, and
exactly why the assertions are portable and should be lifted.

---

## 4. What is genuinely lost by an interface rewrite, and where it must live

Had the four been defensively rewritten against `LlmGatewayClient` — the option the owner declined —
these properties would have had no home. Each is named with its current evidence and its correct
tier.

| # | Property | Current evidence | Where it must live |
|---|---|---|---|
| 1 | **SDK auto-retries are actually off.** `maxRetries=2` produces exactly three *wire* calls, not more | `VertexLlmGatewayClientTest.java:193, 206` — `wireMock.getAllServeEvents()).hasSize(3)`; the mechanism is `VertexAiClientFactory.java:82-95` | **Tier 2.** Must count wire events; the client-reported `retries()` counter cannot see gax adding its own |
| 2 | **Pre-flight rejection opens no socket** | `VertexLlmGatewayClientTest.java:136` — `getAllServeEvents()).isEmpty()` | **Tier 2** for the socket; the companion `TOO_LARGE`/`COMPILE_INPUT_TOO_LARGE`/`provenance()==null` assertions are **Tier 1** |
| 3 | **A custom scheme and port survive the SDK.** The SDK's `setApiEndpoint` appends `:443` and cannot express either; the whole factory exists to work around it | `VertexAiClientFactory.java:25-30`; their hardened `GatewayAuditTest` asserts `getSettings().getEndpoint()` and plants a `ROUTE_MARKER` | **Tier 2, and irreplaceable.** Without it, a client that silently reaches a real Google endpoint passes every other test in the file |
| 4 | **A missing service-account key is reported by path** | `StudioGatewayConfigTest.java:91-94` | **Tier 2** (credential sourcing) |
| 5 | **`sdkVersion` falls back to the pin when the jar manifest is absent** | `VertexLlmGatewayClient.java:40` (`PINNED_SDK_VERSION`) and `VertexLlmGatewayClientTest.java:257` | *Presence* of `sdkVersion` is **Tier 1**; the value and the fallback are **Tier 2** |
| 6 | **Redaction under a real vendor error body** | `GatewayAuditTest.java:133-155` builds a genuine `INVALID_ARGUMENT` body; line 213 asserts the reason starts with `InvalidArgumentException (status=INVALID_ARGUMENT)` | **Split.** *Canary never surfaces* is **Tier 1**; the gax-specific reason prefix is **Tier 2** |

Row 6 is the one a careless rewrite would silently weaken, and row 3 is the one whose loss would be
invisible until production.

---

## 5. Sequencing

**Nothing about this is Epic 10 w7 work, and nothing about it should be done during the fold.**

1. **Now, in `epic/EPIC-10-w7`: do not touch the gateway package.** It is not in w7's incoming set
   (verified: the gateway diff against `ff0513385` is empty), so it is not a fold blocker. The
   `--ff-only` fold is blocked by 13 other paths that are both incoming from w7 and dirty in
   `wt/epic`, none of them under `.../gateway/`. Rewriting the four tests here would author a
   conformance suite against a tree where the second implementation does not exist — which is the
   defect the rule exists to prevent.

2. **At the fold, Epic 10 verifies; it does not fix.** Two mechanical checks over their *landed*
   state:
   - `grep -rl "com.google.cloud.vertexai" backend/src/main/java` → must be empty.
   - `backend/build.gradle.kts` → `google-cloud-vertexai` must be `testImplementation`, not
     `implementation`.

   Both green ⇒ the coupling was resolved by them; Epic 10 records the fact and moves on. Either red
   ⇒ the two classes were deleted rather than demoted, the breakage is real, and it belongs to
   **them**: the story that removes a production class owns every test that names it. Epic 10 raises
   it; it does not repair it.

3. **The Tier 1 extraction is separate, later, and in the merged tree.** It cannot happen before the
   merge — it needs both implementations on one classpath to be worth anything — and it must not
   happen during it: a ~600-line test refactor in the middle of a 241-path reconciliation is the
   worst available moment. Order: fold → both clients present → extract the conformance suite →
   each client's remaining test keeps only its Tier 2 assertions → the demoted Vertex client gets a
   recorded deletion date. Owner: @dev, under a story cut by @sm after the fold, against whoever owns
   the gateway package at that point. Not Epic 10 w7.

4. **The rule binds new tests from today**, without waiting for the extraction. A new gateway test
   asserting a contract property is written against `LlmGatewayClient`.

---

## 6. Filing

### 6.1 Not an ADR

ADR-002's subject is the *runner's internal contract surface* — route shapes, log timestamps, the
conflict-code and error-code vocabularies, and the §12 amendment authority over a frozen
`openapi.yaml` that five stories code against. A test-seam policy is not that surface, and appending
it would dilute a document whose value is that it is narrow. ADR-001 is runner scaffolding; also not
it. And the genuine *architectural decision* in this episode — replacing the Vertex SDK with
`google-genai` — is the other program's to record, in their own ADR. Epic 10 does not re-decide it.
ADR-003/O-19 is already out of Epic 10 scope and stays out.

### 6.2 Not in `studio-execution.md` §4.1 — yet, and for a mechanical reason

§4.1 is the natural home. But `docs/architecture/studio-execution.md` is **dirty in `wt/epic`**
(verified 2026-09-17T21:52:56Z). Adding it to w7's incoming set would create a new `--ff-only`
blocker on a file Epic 10 has no other reason to touch, to land a rule that is not urgent. So it is
filed here, standalone, and the pointer is deferred: **whoever next legitimately edits
`studio-execution.md` §4.1 — most likely the other program, which must reconcile that paragraph's
"Google Vertex AI SDK" against its own move to `google-genai` — adds a one-line reference to this
note.** That is the cheapest correct sequencing, not an oversight.
