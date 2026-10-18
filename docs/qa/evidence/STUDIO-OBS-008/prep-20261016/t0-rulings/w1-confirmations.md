# STUDIO-OBS-008 W1 confirmations: F4 note, L1-A A1 readings, ledger R3 (2026-10-17)

- **Author:** Aria (@architect). **Date:** 2026-10-17. **Mode:** YOLO, autonomous.
- **Governing inputs:** `t0-rulings/ruling.md` (A1.2, A1.5, A1.7), `t0-rulings/w0-refold.md`, `lanes.json` → `w0Refold20261017`, story `STUDIO-OBS-008.story.md` ("Inherited documentation item — F4 exception note"), and the receipts in `execution-20261017/lanes/{L0,L1-A,DE}/`.
- **What I ran:** read-only commands only: `shasum -a 256`, `git diff`, `grep`, `sed`, a Python byte check on the contract doc, and Python/`node` parsers over the JUnit XML and the v3 schemas. I ran no build, test, install, database or git write. The only file I wrote is this one.
- **Labels:** [V] = verified by reading the file or running the command. [I] = inferred.

## Verdicts

| # | Item | Verdict |
|---|---|---|
| 1 | F4 note: placement and wording | **CONFIRMED** |
| 2a | An empty step-ID list gives `null` for login and drift, never 400 | **CONFIRMED** |
| 2b | A step-ID list that does not line up gives `null` | **CONFIRMED** (one optional log line) |
| 2c | The four `replay_failure_*` columns are `updatable = false` | **CONFIRMED, plus one CORRECTION:** also map them `insertable = false` |
| 3 | 48 reds → R3; ExecutionVideoContractTest → "new op = pinned copies" (L0) | **CONFIRMED.** R3 needs more than the projector to close (3.3) |

---

## 1. F4 note (lane L0): CONFIRMED

**Hashes [V].**

| | sha256 |
|---|---|
| Before (from root's prompt) | `68f67d605102aa34932b68f0bd0785fbc1dd4d98b85859e09e7725b936953629` |
| After (I measured it with `shasum -a 256`) | **`5ff06f4a0d48f73ab2000663643bd8eba79cb0e1e50c46d36076bb38510e7d03`** |
| After, with the note paragraph and its blank line removed (I reconstructed it) | `68f67d60…936953629`, identical to the before hash |

So L0 added exactly two lines: the note and one blank line. No other byte changed.

`git diff HEAD` also shows a "Superseded (2026-10-12)" banner at lines 3–4. That banner was already in the tree before L0, as the STUDIO-OBS-015 story's "Correction 2" records. It is not L0's edit.

**Placement [V].**
- F4 is line 124 and is byte-unchanged. Line 125 is blank. The note is line 126, as its own paragraph. Line 127 is blank, and the "Coordinate validator/language policy…" paragraph follows at line 128.
- The plan's "line 124" was the address of the F4 paragraph. The decision says to append the note to F4, and the story says to place it "under F4". A separate paragraph directly below F4 is the right reading. Putting the note inside line 124 would have changed F4's own bytes, which the story forbids.

**Wording [V].**
- The note matches the decision source byte for byte: `po-r4-whitespace-decision/decision.md` line 66 (sha256 `18808d267526…592ccc9`, the `18808d26…` the story cites) and the story's quote at `STUDIO-OBS-008.story.md:173`.
- The text is ASCII only, with LF line endings and a trailing newline.
- The meaning matches the shipped guard. `observationCollector.ts:753` returns `expected !== '' && …`, and the observed `containsText` predicate has no negation. "Never passes" is therefore exact.

**Change required:** none. The story's closure condition is met: the note is present with its date, and L0's receipt records the file with before and after sha256.

---

## 2. L1-A readings of A1

### 2a. An empty `revisionStepIds` gives `null` for login as well as drift, never 400: CONFIRMED

- This is the ruling's own text. A1.2 step 2 says: "Non-observed or legacy rows pass an empty list, which yields `null`." A1.5 case 8 says: "A non-observed (empty step list) row gives `null`."
- The 400 in A1.2 step 3 is a membership refusal. It names a runner coordinate the confirmed revision does not have. With no list, there is no revision to check against, so the backend has no divergence to name. "No cause named" is the honest answer.
- Code [V]: `RunnerReportProjection.java:343-349` returns `null` on an empty list (or a size mismatch) before the login branch, and the 400 at `:354-358` is reachable only with a non-empty list. Test `#noRevisionStepIdsMeansNoCauseAndNeverARefusal` is green in `obs008-be-a1-unit02`.
- Scope of "empty" [V]. `ProgressReportService.revisionStepIds` (`:682-713`) returns an empty list in each of these cases, and each one correctly gives `null`, not 400:
  - an observed pre-Ready report;
  - a row with no observed binding;
  - an outcome shape that cannot name a cause;
  - a missing revision or artifact;
  - an unreadable artifact;
  - a misaligned artifact (2b).

### 2b. A step-ID list that does not line up gives `null` (fail-closed): CONFIRMED

**Why this is unreachable for a well-formed revision [V].**
- Artifact `steps[]` are written one per `basis.sourceSteps`, with `stepIndex = ordinal` and `stepId` = the authoring step ID (`ObservedArtifactLowerer.java:46-55`).
- At publication, `GuidedSnapshotDeriver.java:25,34` enforces that the authoring step count equals the `sourceSteps` count and that `ordinal == index`.
- The execution's original steps are `parseSteps(revision.getSource())` (`StudioAcceptanceService.java:340,404`).

So the size check (`RunnerReportProjection.java:348`) and the position, gap and duplicate checks (`ProgressReportService.java:700-706`) only guard against an internal inconsistency.

**Why `null` is right and 400 would be wrong.** A misaligned list is a disagreement between two things the API stored, not a runner divergence. Refusing the runner's FINAL with 400 would block a truthful terminal status and leave the row to the reaper. `null` keeps the status and names no cause. This is the same posture as A1.2 step 4 ("if the redactor ever altered the reason, the result is `null`").

**Optional (not required).** The unreadable-artifact branch logs one WARN. The size-mismatch and misalignment branches return silently. A single WARN with `executionId` only would make the "impossible" state visible, at no contract cost. A1.5 case 12 (the I4 identity IT) still has to prove alignment in the normal path. It is NOT RUN, pending an IT window.

### 2c. The `replay_failure_*` JPA mapping: `updatable = false` CONFIRMED; CORRECTION: add `insertable = false`

**Why `updatable = false` is correct and needed [V].**
- The entity has no `@DynamicUpdate`, so Hibernate updates every column on a dirty flush.
- Without `updatable = false`, any later flush of a UITestExecution loaded before FINAL could write stale `null`s over the values `applyFinal` set.
- With it, the A1.1 rule "written once … never rewritten" holds at the JPA layer.

**Correction (lane L1-A, `entity/UITestExecution.java:66-76`).** Map all four columns `@Column(name = "…", insertable = false, updatable = false)`.
- **Reason.** A1.2 step 6 makes the FINAL statement `applyFinal` the only writer. Every other path writes nothing. The creation insert (`StudioAcceptanceService.java:405`, `executions.save`) is currently a second writer. Today it writes `NULL`s. But a public setter (`setReplayFailure`, `:356`) that sits in main code would let it persist a cause on a PENDING row. The V22 CHECK does not tie the cause to status, so it would not catch that.
- **Precedent in the same entity.** `observed_admission_receipt` (`UITestExecution.java:242-247`) is written only by a native statement and is mapped `insertable = false, updatable = false`.
- **Compatibility.** Keep `setReplayFailure`. Its only callers are in `ExecutionSnapshotMapperTest` (`:201-251`), a plain unit test that persists nothing [V], so nothing else changes. Reads still select the columns.
- **Re-verify with:** `compileJava`, plus `ExecutionSnapshotMapperTest` and `RunnerReportProjectionTest`. ITs 10–12 (ProgressCallbackIT, SseStreamingIT) cover the read path once they run.

---

## 3. Ledger classification (lane L0)

### 3.1 The 48 reds → R3: CONFIRMED

I parsed `moved-from-015-dir/obs008-c-r3-01-xml/` myself [V]:

| | Count |
|---|---|
| Tests | 57 |
| Pass | 9 (GuidedHttpSecurityIT 6, GuidedSessionIT 2, GuidedObservationPrunerIT 1) |
| Fail | 48 |

47 of the 48 failures are `GuidedSessionException: INVALID_CONTRACT` (or a 422 body that carries it). The backend raises it while validating its own outbound bodies against the changed v3 schemas:

| Site | Failures |
|---|---|
| `GuidedSessionService.view` (`:2849`) | 41 |
| `GuidedSessionService.result` (`:2905`) | 1 |
| `GuidedPublicationResultProjector` | 1 |
| ObservedProfileDriftTest, start → 422 `INVALID_CONTRACT` | 4 |

The 48th is `GuidedSessionIT.concurrentConflictingStartsHaveOneWinner` ("expected 1 but was 0"). It is a cascade of refused starts [I].

These schemas now require the new fields [V]:
- `PublicSession.required` includes `progress`.
- `result.required` includes `progress` and `explanation`.
- Both `$ref` the new `public-ui-projections.schema.json`, which is on the backend classpath (`build/resources/main/studio/observed-contracts/v3/`).

An unresolvable `$ref` would fail differently ("Missing observed schema"), so the cause is the missing required fields.

Run `obs008-c-r3-01` had `sourceStable: false`, so the classification stands but the run cannot serve as closing evidence. DE's runs `-04` and `-05` show the same mechanism in six more classes. I re-parsed them [V]:

| Class | Fails | Cause |
|---|---|---|
| GuidedServiceTransportFaultIT | 39 | 38 `INVALID_CONTRACT`, 1 class-level cascade |
| GuidedPublicationReplayIT | 47 | 8 `INVALID_CONTRACT`, 36 teardown cascades, 3 other |
| GuidedBridgeIntegrationTest | 9 | `INVALID_CONTRACT` |
| GuidedBridgePlannedIT | 16 | `INVALID_CONTRACT` |
| GuidedDefaultModelReservationIT | 4 | `INVALID_CONTRACT` |
| GuidedPlanningIntegrationTest | 57 | `INVALID_CONTRACT` |
| GuidedSessionIT | 42 | Same name set as L0's run |

### 3.2 ExecutionVideoContractTest → "new op = pinned copies", owned by L0: CONFIRMED

- The two sets are hand-kept copies of the operation inventory: `OPERATIONS_CARRYING_ATTRIBUTION` and the public-401 set with its count. They must move in the same unit that adds the operation. This is the ADR-002 §13/§28.4 precedent: "the two reds were both status-set copies".
- They are not a ledger row. They do not wait for the controller, and they are green at L0 exit.
- [V] Each set gains exactly one `getStudioTestCapabilities` entry, at `:90` and `:161`, and the count moves 35 → 36 (`:543`). The file sha256 is `1e867b1a…` (matches L0's receipt).
- [V] Run `obs008-c-pins02` (sourceStable, testInputStable and distStable all true): ExecutionVideoContractTest 20/20 green. The only reds are the two StudioContractTest R2 rows.
- The checker fix at `tools/check-studio-observed-contracts.cjs:963` (43 → 44, sha256 `758787d4…`) belongs to the same class of edit and is closed the same way.

### 3.3 Does R3 need anything besides L1-P's projector? Yes, three closure conditions. No contract change.

**What does not need to change [V].**
- Nothing in the schemas or fixtures. None of the four epoch schemas (`v3/session`, `ledger`, `replay-validation`, `observation`) references `session-view`, `result` or `public-ui-projections`, so `GuidedContracts` epochs are unaffected.
- L0 already added `progress` and `explanation` to the fixture result documents. Those documents feed `RecordedGuidedEvidenceProjectionTest`.

**The three conditions:**
1. **All four outbound sites emit the fields.** The projector must reach all four validation sites in both writers:
   - `GuidedSessionService.java:2849` (`PublicSession.progress`)
   - `GuidedSessionService.java:2905` (result `progress` and `explanation`)
   - `GuidedPublicationResultProjector.java:118` (`session-view`, both `session.progress` and the nested result)
   - `GuidedPublicationResultProjector.java:202` (result)

   Both files are already in L1-P's write list. This makes "all four sites" the explicit closure test.
2. **The ledger row lists exact names.** Widen R3 from "candidates" to:
   - L0's 48 names;
   - DE's `-04`/`-05` failing names (`lanes/DE/receipt.json` `runs[].perClass[].failing`).

   Cascade reds count as R3 only provisionally. That covers the GuidedPublicationReplayIT teardown and "other" failures (one is a bare `AssertionError` whose cause was not isolated), the GuidedServiceTransportFaultIT class-level error, and the GuidedSessionIT race count. Any of them still red after the projector lands is not R3 and needs its own owner.

   GuidedSessionVideoIT, ObservationPolicyIT and GuidedCsiBudgetIT were never run. They are "same mechanism expected" only, and they are not R3 until measured.
3. **A real closing run.** R3 lives in guided ITs, not in StudioContractTest. L1-P's verify set (GuidedPublicPresentationIT, ObservedProfileDriftTest, GuidedPublicationEvidenceTest) cannot close it, and neither can its exit text "StudioContractTest fully green (ledger rows R1-R3 closed)". [V] Most R3 classes appear in no lane selector: `GuidedSessionIT` occurs 0 times in `lanes.json`, and GuidedObservationPrunerIT appears only as a ledger candidate. So the F1 union gate (`obs008-f1-be01`, the union of the L0, DE, L1-A and L1-P selectors) would not cover them.

   R3 closes only on one `sourceStable: true` run, taken after L1-P lands (V22 is already in the tree), in which these are all green:
   - every R3-named class;
   - the three unmeasured classes;
   - the two callers DE Q2 flagged for `LegacyV20ConfirmedBaseFixture:802`, which must actually reach the fixture assertion.

   Root adds these selectors explicitly to `obs008-f1-be01`, or to L1-P's exit run.

---

## 4. `readGuidedResult` 202 body for a non-terminal session (L2b finding; appended 2026-10-17)

**Verdict.** The contract is right and the backend fallback is wrong. That is option (a) on the substance. **Placement is option (c):** it is out of 008's scope and is carried to STUDIO-OBS-011 with an owner. No 008 lane changes anything. `openapi.yaml`, its digest and every pin stay as they are.

### 4.1 Verification

**There are two code paths [V].** `GuidedSessionController.result` (`:59-75`):
1. **The publication projector path.** It runs when the projector bean is installed and the session has a publication base (`bases.find(id)`).
   - A base is captured at start only when `studio.guided.publication.enabled` is true (`GuidedPublicationConfiguration.java:133-138`). That setting defaults to `true` (`GuidedPublicationProperties.java:11`, `application.yml:239`), and the `local` profile does not override it.
   - On this path, a non-terminal session gets a full v3 `result`: `outcome` is the live state, which the `result.schema.json` `outcome` enum allows, `publication.status` is `PENDING` and `receipt` is null (`GuidedPublicationResultProjector.java:128-200`). The response is 202. **This conforms to the document.**
   - `GuidedPublicationReplayIT:11944-11947` pins it: `FINALIZING` before `/finalize` → 202 with a result body, `outcome = FINALIZING`, `publication.status = PENDING`.
2. **The fallback path.** It runs when the projector is absent or the session has no base, for example when publication was disabled at session start (`STUDIO_OBSERVED_PUBLICATION_ENABLED=false`).
   - `GuidedSessionService.read(…, "result")` (`:759-763`) returns `view(session)` for a non-terminal session. That body is the bare `session-view#/definitions/PublicSession`. It is not the `session-view` envelope and not a `result`.
   - The controller answers 202 because the body has no `outcome` (`:74`). **This is the divergence.** It exists only on this path.

**History [V].**
- The fallback branch and the controller rule are both at git HEAD `d954a21c5` (OBS-001..006): HEAD `GuidedSessionService.java:402-405` (`if (!terminal(session)) return view(session.document())`) and HEAD controller `:59-75`, when the route was `/api/v3/...`.
- `readGuidedResult` is not in HEAD's `openapi.yaml`. It entered the public document with 012A's move into it, in the pre-008 working tree.
- L0's receipt says its `openapi.yaml` edit was pure additions. So the 202 `result.schema.json` declaration predates 008 [I, from that receipt].
- L1-P's in-flight edit changed only the argument, from `view(session.document())` to `view(session)` for P2. The branch's behaviour is unchanged.
- **Conclusion:** this predates 008 and was not introduced by 008's in-flight edits.

**Tests [V by grep].**
- No test pins the fallback's non-terminal body.
- Every `service.read(…, "result")` call in GuidedSessionIT and GuidedObservationPrunerIT reads a terminal session.
- The HTTP `/result` calls in GuidedPublicationReplayIT, GuidedSessionVideoIT and GuidedPlanningIntegrationTest are either on the projector path or terminal.
- `GuidedPlanningIntegrationTest.publicRequest` accepts any status from 200 to 202.

### 4.2 Ruling

**Why the contract is right.**
- The document declares one schema per status.
- `result.schema.json` was designed to represent a non-terminal session: its `outcome` enum lists PREPARING through FINALIZING.
- The default path already conforms, and a test pins that.

**Why (b) is rejected.** Option (b) would put a `oneOf` (result or PublicSession) on the public 202. That legitimizes a second shape for one status, which a client would then have to tell apart by sniffing the body. It would also move the digest, the pins and §13 to accommodate a kill-switch fallback. The single-path rule (ADR-SC-005, "no compat layers") argues against it.

**Why it is not done in 008 (c).** No 008 deliverable or gate depends on it:
- The UI is unaffected. The hook reads a result only after a terminal state, and L2b's MSW mirror correctly follows the document.
- **R3 closure does not depend on it.** The fallback `view(session)` must carry `progress` for R3 anyway. That is condition 1 of §3.3, site `GuidedSessionService.java:2849`, and it is already in L1-P's work. With that done, the fallback's PublicSession body validates. Only its shape is wrong, which is this item, not R3.
- **The D5 real-backend smoke does not depend on it.** It runs `bootRun` with the `local` profile, where publication is enabled by default. Every session gets a base, so result reads take the conforming projector path. If a D5 run ever sets `STUDIO_OBSERVED_PUBLICATION_ENABLED=false`, this item becomes relevant and that run must not assert the non-terminal 202 body.
- Doing it in L1-P would need `GuidedSessionController.java`, which is outside L1-P's write set, while L1-P is mid-edit and may become the critical path at F1.

**L1-P must not change the semantics of the `read()` result branch in 008.** The P2 argument change is fine.

**Carried item C-OBS008-1. Owner: STUDIO-OBS-011 (@dev, Dex). @po appends the row to 011's "Carried forward" table (append-only).**
- **Required behaviour.** `GET /guided-sessions/{id}/result` answers in one way on every path, whether publication is enabled or not:
  - a non-terminal session gets 202 with a v3 `result`: `outcome` = the live state, `publication {PENDING, null}`, `currentReadiness` `NOT_PUBLISHED`, and P2 `progress` / P3 `explanation`;
  - a terminal session keeps today's status rules;
  - the body never has a PublicSession shape.
- **Preferred fix.** Fold the two result builders into one projection, `GuidedSessionService.result` and `GuidedPublicationResultProjector.result`. Use it whether a base exists or not, and delete the fallback's non-terminal `view` shortcut. This is the "duplicated families to fold" code-health target that 011 already owns.
- **Test.** One HTTP case with publication disabled: a non-terminal `/result` → 202, validated against `v3/result`.
- **Decide at 011 T0.** For a session started with publication disabled, which `publication.status` should a terminal SUCCEEDED report? Today it is `PENDING` indefinitely.

**Not ruled here.** L2b's second observation is "202 for a pending publication on a terminal session". Root did not ask about it, and it concerns the projector path's terminal states.

---

## 5. Secret value bound: contract 8192 vs backend 4096 (L4 open question 4; appended 2026-10-17)

**Verdict: option (a).** The contract goes to 4096. This is C-int **unit 3** in 008, applied by L0, together with the L4 UI and the MSW mirror. The backend is unchanged. Option (b) is rejected.

### 5.1 Verification [V unless marked]

| Place | Says |
|---|---|
| `openapi.yaml:4429`, `CreateStudioSecretRequest.value.maxLength` | 8192 |
| `StudioSecretsService.java:60`, `MAX_VALUE_LENGTH` | 4096 (HEAD: 8192) |
| `VaultStudioReferenceResolver.java:167` | refuses a stored value over 4096 with `SecretTooLongException`, which surfaces as `SECRET_TOO_LONG` |

**Origin.** The lowering is a **deliberate decision from STUDIO-OBS-007 AC-12**, not from 014. 014's patches only carry the file. AC-12 reads: "`MAX_VALUE_LENGTH` is lowered 8192 → 4096 at create (`INVALID_SECRET_VALUE` for 4097), bridge `secret.value` is 1..4096…; a longer already-stored Vault entry is refused at dispatch with `SECRET_TOO_LONG`". This implements security-review finding F-5, "one value bound", in `secret-login-security-review.md:37` and `secret-login-design.md:80`. OBS-007 missed the create schema's `maxLength`. It predates 008.

**The document contradicts itself today.** Its own `ExecutionErrorCode` table (`openapi.yaml:4045`) already says "`SECRET_TOO_LONG`: A stored declared secret exceeds the 4096-character dispatch bound (OBS-007 AC-12)". Every v3 secret-value bound is also already 4096:
- `bridge.schema.json:246,345`
- `replay-ipc.schema.json:546,599`
- `replay-job.schema.json:38,94`
- `authored-inputs.schema.json:48`

No v3 schema says 8192. Under the current create bound, a 4097–8192 character secret could be created but never used. It would only ever end as `SECRET_TOO_LONG`.

**Why (b) is rejected.** Raising the backend to 8192 would reverse a security-review condition (F-5, the single bound) and bring the unusable-secret case back. The backend is the producer that is right, so the document catches up with it, as in the ADR-002 §25 precedent.

**Classification.** This changes which requests get a 400 on a public route, so ADR-002 §34.1 makes it Class C. This section is the architect's ruling for it.

### 5.2 The 64 KiB reasoning, checked against the code

**The read path [V].**
- `studio.vault.max-response-bytes` defaults to 65,536 (`application.yml:279`, `StudioSecretsProperties.java:68`).
- `HashicorpStudioVaultProvider.java:288-292` refuses a larger body, which surfaces as `VAULT_UNAVAILABLE`.
- The stored entry is `data: {<valueKey>: value, allowedOrigins: join(",", origins)}`, written by `writeCreateBody` at `:242-256`.

**Worst-case read size:**

| Part | Worst case |
|---|---|
| Value, at 6 bytes per UTF-16 unit (a control character escaped as `\u00XX`) [I: Vault's Go encoder also gives 6-byte escapes for `<`, `>`, `&` and U+2028/9] | 4096 → 24,576 B; 8192 → 49,152 B |
| Origins: up to 16 × 512 plus 15 commas. They are normalized to ASCII `scheme://host[:port]`, because `SecretOrigins` takes the host from `java.net.URI.getHost()`, which yields no host for a non-ASCII authority [I]. | ≤ 8,207 B |
| KV v2 envelope and metadata [I] | under 1 KiB |

| Bound | Total |
|---|---|
| 4096 | about 33 KiB |
| 8192 | about 57 KiB |

**Conclusion.** Both fit under 64 KiB. The Javadoc's 64 KiB rationale (`StudioSecretsService.java:56-59`) is byte-identical at HEAD, where the constant was 8192. The runbook's "about 57 KiB" is that same 8192 calculation. So **the read cap does not force 4096.** The true reason is AC-12/F-5. The Javadoc is stale but harmless. Correcting it is optional and is carried as **C-OBS008-2** to STUDIO-OBS-011, through @po in the same append as C-OBS008-1. It is not 008 work.

### 5.3 Every place that must say 4096

| # | Place | Change | Lane |
|---|---|---|---|
| 1 | `docs/specs/studio/openapi.yaml:4429` | `maxLength: 8192` → `4096`. Nothing else in the document changes. The operation count stays at 44. | L0 unit 3 |
| 2 | `StudioContractTest.java:82-83` `BASE_SHA256` and `studio-runner/test/run/confinement.test.ts:287` | Re-anchor to the measured digest, quoting old and new: "STUDIO-OBS-008 C-int unit 3 (secret value bound 4096, OBS-007 AC-12)". If another `openapi.yaml` edit is pending in the same root slot, fold both into one re-anchor (ADR-002 §12). | L0 unit 3 |
| 3 | `docs/architecture/ADR-002-internal-contract-surface.md` §13 | One class C row: "ruled by @architect, 008 W1 §5; applied by @dev C-int unit 3", with old and new digests | L0 unit 3 |
| 4 | `docs/runbooks/studio-runner.md:595` ("Response size") | Replace with: "A value may be up to 4096 characters (OBS-007 AC-12); a longer entry already in Vault is refused at dispatch with `SECRET_TOO_LONG`, never truncated. Keep `STUDIO_VAULT_MAX_RESPONSE_BYTES` at its 64 KiB default: below about 34 KiB a maximum-length value can become unreadable, and an older entry of up to 8192 characters needs about 57 KiB to be read and reported as `SECRET_TOO_LONG` rather than `VAULT_UNAVAILABLE`." | L0 unit 3. Root adds this one line to L0's write list. |
| 5 | `frontend/src/components/studio/SecretInput.tsx:23` `MAX_VALUE_LENGTH` | `8192` → `4096` (feeds `inputProps.maxLength` at `:119`) | L4 |
| 6 | `frontend/src/services/mocks/studio/secretsHandlers.ts:21` `MAX_VALUE_LENGTH` | `8192` → `4096` (the `INVALID_SECRET_VALUE` branch at `:121`) | L4. The file is new and untracked, and L4 wrote it. |
| 7 | `frontend/src/components/studio/SecretInput.test.tsx:402` | The over-long case (`canary + 'x'.repeat(8192)`) still refuses after the change. Make it pin the bound: exactly 4097 characters refused, and add one 4096-character case accepted. | L4 |

**Not changed:**
- Any v3 schema. They are already 4096, so there is no generator, bundle or epoch movement.
- `ExecutionErrorCode` text (already 4096) and `executionErrorNarratives.ts:106-108` (already 4096).
- The backend constants.
- The historical records: `vault-secrets/spec.md`, `secrets-disclaimer/*`, `secret-login-security-review.md` F-5 and `secret-login-design.md:80`. They record the 8192 that was true when they were written.

**Optional, not required.** A `studioContract.test.ts` parity line would have caught this drift: the two frontend constants equal the document's `CreateStudioSecretRequest.value.maxLength`, read from the document. If adopted, it goes to L2a. No production frontend code imports from `docs/`.

**Verify:**
- L0: `check()` and `check-studio-observed-contracts.cjs` (44 operations, unchanged), plus the runner pin and the StudioContractTest pin runs, with reds only on open ledger rows.
- L4: `SecretInput.test.tsx` and the secrets mirror tests.

**Dependencies.**
- R3 does not depend on this.
- D5 does not depend on it, but should not create a secret longer than 4096 characters until units 5–6 land.
- 008's UI acceptance does depend on it. Until rows 5–6 land, a 4097–8192 character value passes the UI and is refused by the backend.

---

## 6. P3 placeholder explanation for out-of-contract sessions (L1-P open item 2; appended 2026-10-17)

**Verdict: option (b).** The placeholder is not acceptable in production code. The explanation must fail closed, and the fixtures move to realistic seeds. `progress` is unchanged.

### 6.1 What the code does [V, `GuidedPublicPresentationProjector.java`]

`explanation()` (`:160-186`) returns `steps: []` and `referenceFlows: []` in four cases:
- no facts are available (`jdbc == null`, the `withoutFacts` projector that `GuidedSessionService.presentation()` installs lazily when nothing is installed, `GuidedSessionService.java:613-617`);
- the frozen scope revisions are not decimal;
- a frozen step ID is not a UUID;
- the session has more than 100 steps.

When the revisions are not decimal, it writes `sourceRevision: "0"` and `configurationRevision: "0"` (`:174-175`).

**None of these cases is reachable in production [V]:**
- `GuidedSessionConfiguration.java:74` installs the full projector unconditionally.
- Production step IDs are the authoring step UUIDs (`GuidedProductionSessionAccess.java:111-112`, from the manifest).
- Revisions are `Long.toString(...)` (`GuidedSourceSnapshotRepository.java:56`), and start checks them for equality against the current row (`GuidedProductionSessionAccess.java:146-147`).
- `maxSourceSteps` is 100, and the session schema has `maxItems: 100`.

The v3 session schema itself allows any 1..256 string for step IDs and revisions. The narrowing comes from the real start path, not from the schema.

These branches therefore exist only for synthetic fixtures:
- GuidedSessionIT: `session-it-documents.json` uses `source-1`/`config-1` and `step-1`/`step-2`, and `newService` builds the service by hand with no projector.
- GuidedRecordingSeed (`SOURCE_REVISION = "source-1"`, `step-1`), used by GuidedSessionVideoIT.
- Hand-built compositions such as GuidedPlanningIntegrationTest (`:420`).

### 6.2 Answers

**1. Is it acceptable in production? No.** It fails on two counts:
- **Single path, no compat.** It is a production branch whose only job is to make unrealistic fixtures pass. That is a compatibility layer for the tests, not for any real session.
- **P3 contract.** `PublicExplanation` says "without proof the actions are empty and no claim is made". That means the session's steps are listed, each with `completed: false` and so on and `actions: []`. It does not license dropping the steps or inventing scope values.

There is also a precedent. An unwired evidence projection must fail the v3 result contract, not satisfy it (`RecordedGuidedEvidenceProjectionTest#anUnwiredNoneResultFailsTheV3ContractWhileTheInstalledProjectionSucceeds`). The same rule applies to the explanation.

**2. Could a client misread it as a real claim? Yes.**
- `sourceRevision: "0"` and `configurationRevision: "0"` match the schema's decimal pattern and state which scope the run explains. A client comparing them with the test's current revisions would conclude something false.
- `steps: []` next to `progress.stepCount: N` and a terminal `outcome` reads as "this run did nothing". That is an implied claim of absence, not an absence of claims.
- No positive `completed`, `learned` or `reused` claim is emitted.

### 6.3 Required behaviour

| Case | Behaviour |
|---|---|
| A frozen scope revision does not match `^(0\|[1-9][0-9]{0,18})$`, any frozen step ID is not a lowercase UUID, or the session has more than 100 steps | `explanation()` refuses with `GuidedSessionException("INVALID_CONTRACT", 422)`. This is an integrity refusal, the same family as `:127-130` and `:277`. It never substitutes `"0"` and never puts an empty list in place of the session's steps. The field cannot be omitted, because `result.required` includes `explanation`. |
| No facts are available (`withoutFacts`, `jdbc == null`) | `explanation()` refuses with `GuidedSessionException("RUNTIME_INCOMPATIBLE", 409)`. That is a composition fault, matching `GuidedPublicationResultProjector.installEvidence`'s `RUNTIME_INCOMPATIBLE`. |
| `progress()` | **Unchanged.** `stepCount` is the frozen fact. `activeStep: null` is the contract's own "unavailable" value: it claims nothing and invents nothing, so it stays for both `withoutFacts` and a step ID that is not a UUID. |
| A real session with no proven facts | Unchanged and correct: every step listed, `completed`, `learnedFromThisRun` and `relearnedAfterDrift` false, `reusedFrom: null`, `actions: []`. |

### 6.4 Files

**In L1-P's write set:**
- `guided/session/GuidedPublicPresentationProjector.java` (the two branches above).
- `GuidedPublicPresentationIT.java`, which gains two refusal cases on `/result`: a decimal-violating scope gives 422 `INVALID_CONTRACT`, and a non-UUID frozen step ID gives 422. A unit check, `withoutFacts().explanation(...)` → 409 `RUNTIME_INCOMPATIBLE`, may go in the same IT or in a projector unit test (a new file, so root must authorize it).
- `GuidedSessionService.java` needs no change.

**Additions root must authorize (test fixtures only; no production file):**

| # | File | Change |
|---|---|---|
| 1 | `backend/src/test/resources/studio/guided/session-it-documents.json` | Session `scope` revisions become decimal (for example `"1"`/`"1"`). `sourceSteps` IDs become lowercase UUIDs. Every coordinate in the `observation`, `clarification` and `action` documents that names those steps is updated to match. |
| 2 | `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java` | `newService` installs the real projector: `service.installPresentation(new GuidedPublicPresentationProjector(jdbc, contracts))`. `start()` at `:1544-1545`, `TestAccess.sources` at `:1784` and the assertions at `:619-620` use the decimal revisions. The literal `step-1`/`step-2` at `:495`, `:501` and `:517` use the fixture UUIDs. DE's `.target("22")` edit is kept. |
| 3 | `backend/src/test/java/com/citi/put/checks/studio/guided/evidence/GuidedRecordingSeed.java` | `SOURCE_REVISION`/`CONFIGURATION_REVISION` become decimal, and the seeded step ID becomes a UUID. |
| 4 | `backend/src/test/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionVideoIT.java` | The literal `"step-1"` at `:192`, `:194`, `:237` and `:239` becomes the seed's UUID constant. |
| 5 | `backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedPlanningIntegrationTest.java` | Its hand-built service (`:420`) installs the real projector next to `installEvidence` (`:432`), because it reads `/result` at `:1190`. Its seeds already contain no synthetic IDs [V, by grep]. |

**Not touched.** GuidedServiceTransportFaultIT and GuidedBridgeIntegrationTest use synthetic step IDs but never read a result [V, by grep]. They only reach `progress()`, which is unchanged.

**Re-verify in one `sourceStable: true` run:**
- GuidedPublicPresentationIT, GuidedSessionIT and GuidedSessionVideoIT;
- every other user of GuidedRecordingSeed: GuidedSessionEvidenceTest, GuidedRecordingTimingsTest and GuidedRecordingSeed's other callers;
- GuidedPlanningIntegrationTest and GuidedPublicationReplayIT.

That run replaces the corresponding rows of `obs008-be-close01` (which was `sourceStable: false`) as R3 closing evidence.

**Dependencies.**
- R3 closure now depends on this: its closing run must be taken after these edits.
- D5 does not depend on it. A real start gives decimal revisions and UUIDs, so D5 never reaches either branch.

---

## Not claimed

- I did not run any test. Every run cited is a lane's run, read from its XML or results JSON.
- L1-A's ITs (A1.5 cases 10–12) are NOT RUN, so the I4 identity claim in A1.5 case 12 is still an inference.
- For §4 I ran no request against a live backend. The code paths and the test coverage come from reading source and from grep.
- I did not edit `manifest.json`, `lanes.json`, the story, any receipt or any source.
