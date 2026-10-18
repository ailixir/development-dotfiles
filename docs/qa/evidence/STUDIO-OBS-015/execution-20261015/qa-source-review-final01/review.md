# STUDIO-OBS-015 qa-source-review-final01: independent source review of the CB-6 production changes

Quinn (@qa), 2026-10-16. This review was read-only on source.
- No Gradle, JUnit, javac, Chromium or vitest was run. No source byte was edited and nothing was committed.
- Every test result cited below comes from the collector `*-results.json` files. I did not re-run them.
- What I did run, all read-only:
  - sha256 checks;
  - reverse-application of the window diffs to scratch copies;
  - a reconstruction of the generator's pre-image in scratch;
  - `node tools/build-studio-observed-schemas.cjs --check`;
  - runner `tsc -p tsconfig.json --noEmit`;
  - google-java-format 1.22.0 (the jar from the Gradle cache) printed to scratch, with diffs taken against the live files.

Labels: [V] = I ran it or read it. [I] = inferred.

Overall gate decision for this review scope: **NEEDS_WORK**.
- There is no logic defect and no FAIL.
- The required changes are formatting, one architect acknowledgement and a few re-runs (section 9).

## 0. Live-tree binding [V]

**Whole tree.** The live tree equals the `execution/w5-w01-full-incr01-before.json` capture byte for byte: 1644 files, 0 differences.

**Hash chains.** Each one was proven by reverse-applying the window diffs to scratch copies of the live files.

| File | Live | Chain (reverse-applied, newest first) |
|---|---|---|
| GuidedTranslationService | `78b2fcd5` = W3 after | − W3 → `d8c494b2` (W3 before) |
| GuidedRunnerClient | `99d4f288` = W3 after | − W3 → `e4c48761` |
| GuidedDispatchService | `cb6f3703` = W3 after | − W3 → `89b6301a` (H8 final) → − H8 → `174d99ac` (pre-H8) |
| GuidedSessionService | `bda27005` | − L1 (w4-bridge01) → `d10ec5cb` (W3 after) → − W3 → `8d67a251` (H8 final) → − WARN-once → `351e393d` (H8 patch result) → − h8.patch → `055081ff` (pre-H8) |
| GuidedSessionRepository | `7fd81750` | − WARN-once → `043250e0` → − h8.patch → `a7eccb02` |
| GuidedSessionReaper | `3cbae036` | − h8.patch → `67c62def` |
| GuidedMaterializationService | `0247251e` | − L1 → `ad8742a8` |
| GuidedPublicationEvidenceRepository / Test | `8f5c0e0c` / `647c6556` | equal merge-new22-01 `final` |
| runner config.ts, values.yaml, the G tests, README, dist config.js | each = g-ceiling `sha256-after.txt` | — |
| observationCollector.ts, the Invoke test, the parity test | `e073909b` / `912767a1` / `46099d1c` | = h8h6 final (H6 applied; no later change) |
| generator, observedOperations.ts, guided/types.ts, guided-dataflow test | = lint-cleanup01 round2 after | schemas.json and observedSchemas.json are unchanged (`8d21a515` / `357f6c42`) |

- The only later touch to these files is L1 (`verifyLifecycle`). It was already ACKed in w4-qa-ack03 §4 and is not re-reviewed here.
- `GuidedServiceTransportFaultIT` changed again in w5 (test only; `25079c12`). That change is outside this scope.

## 1. P1 (sync before append): `GuidedTranslationService.finishSuffixMaterialization` and `syncContext`

The code matches ruling §P1 verbatim [V]:
- The guard is `contextDeliveryId == null`.
- A definite refusal leads to `failTranslation(RUNTIME_INCOMPATIBLE)` and the failure is rethrown.
- The `advancePrefix` refactor was optional and was not done.

Joined proof [V, results]:
- `append-input` passes in w3-w01-full-incr01 and in w4-full-incr02. It failed in 11 earlier runs.
- B2B-01 "v2 ACK pending" passed.

Advisory (pre-existing semantics, not a ruling deviation):
- A non-definite failure of the **unkeyed** sync is rethrown.
- The continuation re-posts it on every poll, bounded only by session or lease expiry. This matches `advancePrefix`.

**Verdict: PASS_WITH_REQUIRED_CHANGES** (format only, R1).

## 2. P2 (keyed append retry): GuidedRunnerClient, GuidedDispatchService, `pushMaterializedContext`

| Property | Finding |
|---|---|
| Correctness vs ruling §P2 | Verbatim [V]: the `CONTEXT_CLOSED_REFUSAL` marker; `closedContextRefusal` as specified; the counter `progress.suffixDelivery{deliveryId,sends}` is reset on an id change and incremented and saved before the send; the frozen-lease check uses `!clock.instant().isBefore(lease)`; the keyed send passes `Instant.parse(leaseExpiresAt)` as the caller deadline, and `transportDeadline` refuses locally at or after it |
| Bounded retries | At most 3 sends per delivery id, persisted before each send. A crash between commit and send consumes a count, which fails closed. Never at or after the frozen lease [V] |
| No fake ACK | `ACKNOWLEDGED` is set only through `acknowledge()`. That requires the `ContextAcknowledgement` schema, the client's `deliveryId == key` and `contextHash` checks, the `status='PENDING'` row update, and the V21 guard [V] |
| At-most-once | A refusal or exhaustion leaves the delivery PENDING, and `failTranslation` stops the session. Context is metadata [V]. That `requireAcknowledged` blocks consuming callbacks under v2 is the ruling's [I] and was not re-traced |
| Secret and value leakage | The WARN logs the session id, the context hash and `code`. `code` is validated against the closed `v3/bridge#/definitions/refusal` enum, which has `additionalProperties:false` [V]. The reply buffer is zeroed. The test still asserts no CANARY |
| Fail-closed | Any closed code is terminal on first receipt. Unparseable, non-conforming and non-409 replies stay plain UNKNOWN_OUTCOME and are counted [V]. CAPACITY and BUSY being terminal is ruled (auto-decision), not re-litigated |
| Single path | One path; only the internal `messageCode` was added [V] |
| Tests | Present [V]: the 8 ruling cases (via reflection on the private method; brittle but adequate), the deadline unit test (2 cases) and the RunnerContextRefusal extension. w3-w01-unit01 ran 17/17 [V, results]. No test for "ACK received but `acknowledgeContext` failed → counted resend". The ruling did not require one; advisory |

**Verdict: PASS_WITH_REQUIRED_CHANGES** (format only, R1).

## 3. P3 (append teardown target): `GuidedSessionService.stop` and `unacknowledgedAppend`

- Verbatim to ruling §P3 [V].
- The pending check runs inside the existing `materialization != null` block.
- The target persisted in `teardownRequest` is the value-free assignment intent.
- The W3 mutation check shows the IT case is discriminating (`p3-mutation-check.log`).
- Results [V]: `pendingAppendDeliveryTeardownTargetsTheAssignment` and `noPendingDeliveryKeepsIdentityTarget` pass in w5-w01-tfit-bridge01 (60/60).
- gjf over the P3 hunks: clean [V].

**Verdict: PASS.**

## 4. H8 durable teardown (`h8.patch`)

| Property | Finding |
|---|---|
| Ruling §H8.4 items 1-6 | Implemented [V]: the deterministic key `teardown-`+hash(body) (73 chars); `teardownRequest{target,reason}` committed with the terminal state; `afterCompletion` submits to the bounded executor only on COMMITTED; `teardownAttempt` makes ≤ 3 sends, confirms only after a normal return and only if the row is terminal and PENDING, and never re-enters `stop()`; the redrive SQL has no jsonb `?`. The disclosed deviations were reviewed and accepted: the value-free projection target (stricter than the ruling), re-sends on any UNKNOWN_OUTCOME (bounded), and confirmation requiring PENDING |
| No fake ACK | A normal return from `dispatch.stop` requires a validated 200: the `STOPPED` assignment receipt, or the identity echo on 9 fields (`GuidedRunnerClient` :230-241 and :264-277) [V] |
| Bounded executor and thread safety | 2 daemon threads, `ArrayBlockingQueue(64)`, `DiscardPolicy`, core time-out 30 s [V]. The in-flight guard is a static `ConcurrentHashMap.newKeySet()`, added inside the task and removed in `finally`. The sweep also skips in-flight ids. The afterCompletion target is a `deepCopy`, and sweep targets are freshly parsed, so no `ObjectNode` is shared across threads. `stopSender` is non-volatile, but the executor hand-off provides happens-before. A stale queued task can at worst send one extra idempotent stop after CONFIRMED; the confirm is a no-op because PENDING is required. Acceptable |
| Bounded retries | ≤ 3 sends per attempt, ≤ 1 attempt per 10 s tick, within `expires_at + PT15M` [V] |
| Secret leakage | The target has no `authoredInputs` (bridge test assertion). The WARN carries only an Integer [V] |
| Tests | `GuidedDispatchStopKeyTest` plus the 5 TransportFaultIT H8 cases and `actualStopOwnership…` (3 sends) all pass in w5-w01-tfit-bridge01. Bridge `stopRetryAfterCloseCompletesConfirmsWithSameKey` passes in w4-bridge01-run02 and w5-w01-tfit-bridge01 [V, results]. The runner `ownership.test.ts` pins from H8.5 were not added (disclosed; no runner source change); advisory |
| Format | The H8 main hunks in GuidedSessionService, GuidedSessionReaper, GuidedDispatchService.stop and the GuidedSessionRepository queries are gjf-clean [V] |

Advisories, not blocking:
- (a) `pendingTeardowns ORDER BY expires_at LIMIT 32` re-selects the same oldest rows every tick. With 32 or more rows failing persistently (runner lost), newer rows starve until the oldest leave the 15 min window. The outcome stays truthful (PENDING).
- (b) If `service.expire()` throws, that tick's redrive is skipped.

**Verdict: PASS.**

## 5. H8 WARN-once adjustment (`h8-warn-once-adjustment.diff`)

Logic is correct [V]:
- the instance `warnedTeardowns` set, `retainAll` bounding it to the rows still abandoned, the count-only WARN, nothing persisted;
- the IT now expects exactly 1 WARN over 2 sweeps (passes in w5 tfit-bridge01).

It deviates from ruling H8.4(5)/H8.5 ("one WARN per sweep").
- The coordinator made that call; Aria never ruled it.
- The pregate confirms that only the R3 re-send deviation was ruled.

Side effects:
- `abandonedTeardowns` now returns **every** past-window id with no LIMIT, on every 10 s tick, for up to the 30-day retention. This is bounded only by retention. Advisory: cap it, or count plus a keyset.
- A persistently abandoned row gives no further signal until the process restarts. Advisory: a gauge metric.

**Verdict: PASS_WITH_REQUIRED_CHANGES** (R2, plus format R1).

## 6. H3 follow-up helper (`evidence-repository-h3-followup.diff`)

- A pure extract-method of the inline prefix-request binding loop into `static prefixRequestObservations(...)` [V].
- The semantics are identical: the same hashed `observedDocument` execution, and `addAll` into `neededObservations`.
- The negative regression covers wrong session, wrong context, forged hash and null incremental.
- Gap: `GuidedPublicationEvidenceTest` last ran at the as-run hash `5d3cdcde` (PASS, backend-merge-h7h3-attempt01). The final `8f5c0e0c` is a whitespace re-join that was "recompiled, not re-run".

**Verdict: PASS_WITH_REQUIRED_CHANGES** (R1 format, R3 re-run).

## 7. Runner

### G ceiling (`g-ceiling-source01`)

Verbatim to aria-g-ruling01 §4.1-4.6 [V]:
- `fallback: 120_000, min: 120_000` (fail-closed floor) and the Helm value `"120000"`;
- `runCoordinator.ts` refusal and `deadline.ts` untouched;
- dist `config.js` `394e0f8c` carries it.

Results:
- Joined `incremental joined config` passes in w3-w01-full-incr01 and w4-full-incr02 [V, results].
- Red-before was discriminating.

Not run: the image-dependent chart cases and `check:pins -- --require-image`. These are already open as GB-3.

**Verdict: PASS** (code). GB-3 stays a gate condition.

### H6 `containsText` (`h6.patch`)

- One-line change: `normalizeName(innerText).includes(normalizeName(expected))` [V].
- `normalizeName` (:52) strips U+200B and U+00AD, collapses `\s+` (`u` flag) and trims, which matches Playwright `normalizeWhiteSpace`.
- The in-page result is a boolean only, with no value egress. Read values stay byte-exact.
- The dist `observationCollector.js:1106-1108` carries it [V].
- Joined `assert-fail` passes in w4-full-incr02 [V, results].
- Real-Chromium oracle parity is 11/11, from Dex's log.

Carry-forward: a whitespace-only `expected` always passes (ruled Playwright parity). The flag to Pax (refuse a blank `assert.expected`?) has no recorded disposition that I could find.

**Verdict: PASS.** The KL must be dispositioned in the gate record (R4).

### Lint cleanup and generator (`lint-cleanup01`)

Tests:
- Test-only typed views and the `void` → `await` change. The emitted-JS diff is runtime-neutral (Dex). The fixtures tier ran 31/31.
- Root cause: the uncommitted 22.7 MB `publication-fixtures.json` exceeds the tsserver 4 MiB limit. Repo hygiene; advisory to @architect/@po.

Generator:
- I reconstructed the pre-change generator in scratch by removing the new property-less branch and restoring the `!patternProperties` interface condition.
- It reproduces the pre-round2 outputs exactly: `f7213950` and `f0e06949`. So the delta is only that branch [V].

Effect of the delta [V]:
- **JSON outputs are byte-identical by construction.** They come from `closure` plus `JSON.stringify` and never call `type()`.
- The live `--check` passes: "four byte-identical outputs".
- TS delta:
  - `SnapshotMap` → `Readonly<Record<string,string>>`;
  - `ReuseMap` → `Readonly<Record<string,ReusedFrom>>`;
  - `StepInput.context` and `LearnedContent.{actions,producedBindings,consumedBindings}` items → `Readonly<Record<string,unknown>>`;
  - `ReusedFrom` moves up in emission order, with an identical body.
- Each mapping matches its schema's `additionalProperties`. The schema-level `maxProperties` and `propertyNames` (UUID) cannot be expressed in TS, and the AJV runtime validation keeps them.
- The `never` branch is unused today.
- These types are stricter and more correct than `{}`, which admitted any non-nullish value. Runner `tsc --noEmit` on the live tree exits 0 [V].

Backend impact: **none** [V].
- The backend consumes the source schemas through `processResources`.
- Its tests read `guided/schemas.json` and `validator/observedSchemas.json`, both unchanged. No backend code reads the generated `.ts`.

Single path; no compatibility layer.

**Verdict: PASS.**

## 8. Format evidence (gjf 1.22.0, read-only, live vs formatted, limited to the reviewed hunks) [V]

Hunks that deviate:

| Change | File | Lines |
|---|---|---|
| P1/P2 | `GuidedTranslationService` | 1026, 1045-1059, 1067-1075, 1084-1085 (W3 code) |
| P1/P2 | `GuidedRunnerClient` | 333 |
| P1/P2 | `GuidedDispatchService` | 100-102 |
| P1/P2 tests | `GuidedSuffixMaterializationTest` | 38-40, 64, 98 |
| P1/P2 tests | `GuidedDispatchContextDeadlineTest` | 64 |
| WARN-once | `GuidedSessionRepository` | 227-228 (javadoc reflow) |
| H3 | `GuidedPublicationEvidenceRepository` | 466-469 (javadoc) |
| H3 | `GuidedPublicationEvidenceTest` | 449, 452, 468-469, 482-492 |

Notes:
- W3 review §5 understated this. It reported "wrap-only differences in the two new test files and one line in GuidedRunnerClient", but the main `GuidedTranslationService` and `GuidedDispatchService` hunks also deviate.
- Every touched file is already non-gjf elsewhere (pre-existing; CB-5), so `spotlessCheck` is red at file level regardless.
- `GuidedTranslationService:1012` is 127 columns, above checkstyle `LineLength` 120. It is a pre-existing context line, not a W3 line.
- Clean: the H8 hunks (GuidedSessionService, GuidedSessionReaper, GuidedDispatchService.stop, the repository queries), the P3 hunk, `GuidedRunnerContextRefusalTest` and `GuidedDispatchStopKeyTest`.
- `GuidedServiceTransportFaultIT` hunks were not checked; the file is large and already non-gjf.

## 9. Required changes (exact)

- **R1. Format (owner: Dex-W5, Gradle owner).** Apply google-java-format 1.22.0 to the section 8 hunks. Then run `./gradlew --no-daemon spotlessCheck checkstyleMain checkstyleTest spotbugsMain` at the final digest. File-level `spotlessApply` is the practical route because those files are already non-gjf (CB-5).
  - If formatting changes bytes, the final run set must execute against the reformatted digest.
  - No logic change is allowed in this step.
- **R2. WARN-once acknowledgement (owner: @architect Aria).** Record a ruling or acknowledgement that WARN-once-per-row-per-process supersedes H8.4(5)/H8.5 "one WARN per sweep". Or else restore per-sweep. In the same note, decide on the unbounded `abandonedTeardowns` id list: accept it as bounded by retention, or add a cap.
- **R3. Re-run (owner: final run set).** Run `GuidedPublicationEvidenceTest` (the H3 regression) at `8f5c0e0c`/`647c6556` or at the post-R1 digest. Also re-run `GuidedSuffixMaterializationTest`, `GuidedDispatchContextDeadlineTest`, `GuidedRunnerContextRefusalTest`, `GuidedDispatchStopKeyTest`, TransportFaultIT and BridgeIntegrationTest after R1.
- **R4. KL disposition (owner: @po Pax).** Record whether a whitespace-only `assert.expected` is refused at planning or carried as a known limitation (H6).

Unchanged gate conditions (not new): GB-1, GB-2, GB-3 (image pins and deployment tier for the G change), CB-1..CB-5.

## 10. Not run

- Gradle of any kind, JUnit, the runner vitest tiers and Chromium.
- CodeRabbit: it is WSL-only and this host is darwin, so the documented fallback is this manual review.
- SYNAPSE diagnostics: outside this review mission.
