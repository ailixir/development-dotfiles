# STUDIO-OBS-015 h8h6-window01: H8 + H6 applied, new22 B1/B2/B3 patches + QA rulings, lanes run

Dex-W (@dev). 2026-10-16. No commit. No lockfile change. Grants no QA credit. Hashes: `manifest.json`.
[V] = ran / read; [I] = inferred.

## 1. Applied
- **H8** `h8.patch` (bd3564d3…) and **H6** `h6.patch` (5d98e6a0…). Pre-images and post-images match both
  manifests byte for byte [V].
- **H8 WARN adjustment (coordinator).** The past-window WARN now fires at most once per row per process:
  - `abandonedTeardowns` returns ids, not a count;
  - the service keeps an instance `warnedTeardowns` set, bounded by `retainAll` to rows that are still abandoned;
  - it logs `{} session(s)` with the count of newly abandoned rows only. No id is logged, and nothing is persisted.
  - `[AUTO-DECISION]` In-process rather than a persisted marker. Reason: `studio_guided_sessions` has several
    BEFORE UPDATE guard triggers, and a sweep-time jsonb write to terminal rows risks them. This also writes no
    bytes.
  - The IT `teardownWithoutAck…` now expects exactly 1 WARN over 2 past-window sweeps.
  - Diff: `h8-warn-once-adjustment.diff`.
- **new22 B2** `fix.patch` (1d8a501c…), then **B1/B3** `fix.patch` (cc757676…), on bases ReplayIT 217950c7 and
  Gradle 2d43ae4d [V].
  - The hunks are disjoint, so there is no double wrap (B2B-01 is at :7796 and B1B-05 at :10387).
  - The Java and Gradle hunks for the B2 re-lane went in together.
- **Quinn's NACK on B1D-01, fixed:**
  - `B1_BOOTSTRAP_DELIVERIES` is now a list of (deliveryId, hash(identity), hash(context)).
  - It is cleared in `b1Parent` right before the mixed `publicCall(start)`, after `p3AwaitTeardown(original)`. The
    clear in `b1ResetInstruments` is kept.
  - Assertions: exactly 2 entries; 2 distinct ids; both hashes equal the ack's `identityHash` / `contextHash`;
    ack id == entries[1] and != entries[0]; `phase == READY`.
- **R1 B1C-03:**
  - The planted set is exactly the two names.
  - The comment is updated.
  - `assertPolicyPrefixPlantedRefusal` now uses the shared `guidedActionRefusalsSinceTallyStart()`, with
    unchanged semantics.
  - After the loop, B1C-03 asserts: 3 refusals; each `reasonCode` equals `DESTRUCTIVE_VERB`; the session ids are
    exactly the 3 hostile parents, one each; none is on the allowed parent. The per-parent ==1 check is kept.
- **R2 confirm-expire:** new `incrementalAwaitExpiredTeardownConfirmed`, called only in that branch, after the 409
  `clarify` and before the shared block.
  - Deadline 120 s. Plain SELECT every 30 ms. Credentials are refreshed every 10 s.
  - It does not re-drive, call `expire()` a second time, write SQL or touch the clock.
  - A timeout throws `H8: expired teardown not CONFIRMED within 120 s`.
  - At CONFIRMED it asserts `EXPIRED` and that `teardownRequest` is absent.
  - It writes value-free `h8-confirm-expire-teardown.json` (ordinal, outcome, `expiryToObservationMs`) to the
    cohort dir.
  - `p3AwaitTeardown` and `verifyPreviousWorkerGenerationClosed` are unchanged.
- **Fixture correction disclosure (B3B-2 / joined `drift-first`):** old and new branch text are in
  `manifest.json` → `fixtureCorrectionDisclosure`. The final ReplayIT sha is `03ec45ef…`.

## 2. Runner (studio-runner, pnpm) [V]
| Check | Result |
|---|---|
| type-check | 0 |
| `observationCollectorInvoke` | 24/24 (`--coverage.enabled=false`; with coverage it is still 24/24, but the single-file run fails the global thresholds) |
| fixtures-tier parity | 11/11 |
| full `test` | **2223 pass / 0 fail / 29 skip** (baseline 2214 + 9 new) |
| build | 0 |
| `check:pins` | 0 |
| eslint on the 3 files | 0 |

- dist digest `972ccf7b…` → **`2f688e62d3c1e9cd2cec105186c209d24cbaa50eb29fbb2d0ac5bccd112fcef0`** (`capture-post-build.json`).
- Lockfiles unchanged.

## 3. Backend runs
`compileTestJava` passed twice.

| Label | Result |
|---|---|
| `h8h6-w01-h8tests` | Hung ~30 min in `SourceStopOwner.drainUninterruptibly` (cleanup of `actualConsumedGuidedControllerJvmCrash…`). I SIGTERMed my own worker (PID 43051), so no XML was written. From the log: StopKeyTest 2/2, and H8 `legacyPending`, `concurrent…` and `immediateResend` PASS. |
| `h8h6-w01-h8tests02` | 14 total: 2 pass (`expiredTeardownConfirmsOnSweep…`, `teardownWithoutAck…` with the once-only WARN) and 12 fail. 11 of the failures are `INVALID_CONTRACT` from `GuidedSourceReferenceValidator.resolve` in `materialize` during fixture setup; the 12th is the class-cleanup `executionError`. |
| `h8h6-w01-bridge01` | 38 total: 7 pass, 31 fail, all `RUNTIME_INCOMPATIBLE` from `translationTransaction` (`translation.exists(id)` false). This includes the new H8 `stopRetryAfterClose…`. |
| `h8h6-w01-full01` | `test`: AuthorityIT 27/27; ReplayIT 45 pass, B2A-02 FAIL, `executionError`. `guidedIncrementalTest`: 7 pass, B2B-01 FAIL, 54 refused by the `cleanupUnconfirmed` guard, `executionError`. Partitions **46 / 62** [V]. `validationSucceeded false`. Elapsed 2721 s. |

- **TransportFaultIT and BridgeIntegrationTest failures [I]:** these are pre-existing fixture drift against the
  uncommitted observed-path tree. H8 touches neither the validator nor `translationTransaction`. I did **not** run
  them on the pre-H8 tree.
  - So 2 H8 cases cannot execute here: the 3-send `actualStopOwnership…` and the bridge `stopRetryAfterClose…`.
- **B2A-02 still fails.** The mixed session is `BUDGET_EXCEEDED` with `extraPolls 32`, the same as before the
  password-timing fix [V, retained failed state]. So the diagnosis root cause is not confirmed.
- **B2B-01** reaches `b2bOwnerLoss` (:8088) for the first time: "v2 ACK pending" false. Its cleanup
  `p3AwaitTeardown` (20 s) then failed, which set `cleanupUnconfirmed`. Every later low-lane method was refused.
  - So none of these executed: confirm-expire (no expiry→CONFIRMED measurement), B1C-03, B1D-01, drift-first, B3B-2.
- **`executionError` (both lanes), root cause [V]:**
  1. ReplayIT `@AfterAll detachAuditCapture` → `stop()` marks the context dirty and stops the Testcontainers `DB`.
  2. `SpringExtension.afterAll` then runs Zonky's auto-registered `EmbeddedDatabaseTestExecutionListener.afterTestClass`.
  3. In 2.5.1 that listener calls `getApplicationContext()` unconditionally, which reloads `ChecksApplication`
     against the stopped container: "Mapped port can only be obtained after the container is started".
  - It is deterministic. Docker is clean: no leftover TC containers and no stray processes.
  - Nothing under `backend/src/test` uses `io.zonky.test.db`.
  - Proposed fix, **not applied** (it is build-wide, so it needs a ruling): drop
    `testImplementation("io.zonky.test:embedded-database-spring-test:2.5.1")`, or REPLACE_DEFAULTS the listener
    list for ReplayIT.
  - The collector also flags `DUPLICATE_ORIGINAL_CASE_ACROSS_TASKS` for `executionError`.

## 4. Not run
- spotless, checkstyle and spotbugs.
- CodeRabbit (WSL-only; not available on this host).
- A pre-H8 baseline of TransportFaultIT and BridgeIntegrationTest.
