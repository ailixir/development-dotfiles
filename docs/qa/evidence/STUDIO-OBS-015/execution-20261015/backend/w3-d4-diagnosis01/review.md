# STUDIO-OBS-015 w3-d4 diagnosis: B2B-02 canary sink, B3B-1 teardown, class `executionError`

Dex-D4 (@dev, diagnosis, security first). 2026-10-16. Run `w3-w01-full-incr01` (`guidedIncrementalTest`,
63/56/7, ReplayIT sha256 `702d1be9…`, the same bytes as the live file). I wrote nothing outside this
directory. I ran no Gradle, committed nothing and reverted nothing. [V] = I read it or ran it. [I] = inferred.

## 0. Verdict first: B2B-02 is NOT a product leak. It is a test-oracle error.

- **Which canary:** the **context text** canary (`ContextText`). [V]
  - The failing loop at `ReplayIT:8286-8288` checks `ctxText, ctxLiteral, plain, secret` in that order and
    stops at the first hit.
  - `ctxText` is always present in the sink (see "Where" below), so the run failed on it and
    never evaluated the other three canaries.
- **Which sink:** the in-memory raw publication evidence document
  (`GuidedPublicationEvidenceRepository.read(mixed).document()`), minus `snapshotEvidence.current.authoring` and
  `baseProof.authoringIdentity.authoring`. This is a test construct named `raw-evidence-outside-authoring`, not a
  table, file or log.
- **Where in that document:** `sourceManifest.authoringSnapshot.steps[TWO].context.entries[kind=text].value`
  and `sourceManifest.authoringContext[{stepId,text}]`.
- **Code path** [V]:
  1. `GuidedSourceClassifier.classify` builds the manifest:
     - `:89` copies the full authored v2 snapshot into `authoringSnapshot`;
     - `:98-99`, `:139` and `:182-194` project the `kind=text` context entries into `authoringContext`.
  2. `GuidedProductionSessionAccess:168` passes the manifest to `GuidedTranslationStore.initialize`, and
     `:71-76` inserts it into `studio_guided_source_manifests.manifest`.
  3. `GuidedPublicationEvidenceRepository.read:502-515` reads it back, checks its hash, removes **only**
     `configurationValues`, and sets the remainder as `sourceManifest`.
- **Why this is lawful:**
  - `GuidedPlanBuilder.derive:102-106` requires `hash(raw.sourceManifest) == base.sourceManifestHash`. The copy
    cannot be stripped in production without breaking basis validation.
  - `guided-data-flow.md:202-204` and `:211-213` say the manifest retains the private `authoringSnapshot`
    ("exact normalized authored v2 contexts and text"). They also say the internal publication evidence
    exposes the "exact authored source needed to recompute snapshots".
  - `authoringContext` is the approved INPUT-POLICY-01 branch A projection
    (`GuidedPromptAssembler:134`), and it already existed at HEAD `d954a21c5`.
  - The B2B-02 design §6.2 lists `studio_guided_source_manifests` as a lawful private store. Its claim in
    A68-3, "raw evidence carries `ctxText` only under `snapshotEvidence.current.authoring`", missed this
    pre-existing copy.
  - Downstream of `read`, the manifest only contributes `sourceSteps` text, hashes and the
    `learningProvenance` hashes (`GuidedPlanBuilder:31-56`, `:139-146`). It is not a public, model, log or
    artifact projection.
- **Secret check** [V]:
  - A `secretRef` configuration in the manifest has no `value` (`GuidedSourceClassifier:140-154`).
  - Plain values exist only in `configurationValues`, which `read:514` removes.
  - So no **secret** value is in the manifest copy. **Severity: none (oracle defect).**
- **Not yet observed** [I]: the run never evaluated whether `ctxLiteral`, `plain`, `secret` or ORDER are absent
  from the rest of the document, the gateway, the artifact, the public, log and media sinks, or the live
  argv/env. They become visible only after this fix. `ctxLiteral` is also inside the same manifest
  `authoringSnapshot`, which is lawful.

### Fix (test only, in `fix.patch` hunk 2)
1. Assert that `sourceManifest` is an object and that `sourceManifest.authoringSnapshot` **equals**
   `snapshotEvidence.current.authoring`, so the exclusion cannot hide anything else.
2. Assert that every `authoringContext` entry is exactly `{stepId,text}` and that `ctxLiteral` is absent from it.
3. Remove those two subtrees from the outside copy. Everything else stays forbidden, and the `whole`
   checks for plain and secret are unchanged.
4. Sink names now carry a value-free canary kind (`raw-evidence-outside-authoring/context-text`, …), so the
   next red names the canary.

**Spec follow-up for @po/@architect:** amend B2B-02 A68-3 to read "…only under `snapshotEvidence.current.authoring`
and the hash-bound `sourceManifest.{authoringSnapshot,authoringContext}`".

## 1. B3B-1 `incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution`: test-oracle race, not H8/P3

- **Facts** [V], from the retained fixture temp `obs007-joined-8307260946423140654` (failed-test-state files):
  - Session 162, `exact-alias`: `CANCELLED`, `materializationPresent=false`, continuation `SOURCE_PLAN`,
    `planRevision 0`, 0 actions, 0 model calls.
  - `teardownStatus` is absent ("").
  - `p3AwaitTeardown` failed at 07:32:44, 20 s after start+cancel (about 07:32:24).
  - The failed-test cleanup then waited another 20 s and also failed (`allActualTeardownsConfirmed=false`).
- **Root cause** [V code, I timing]:
  - The test cancels right after a 202 start. The coordinator polls every 100 ms (`ReplayIT:2012`); its first
    `plan` would call `dispatch.assign` → `prepareAssignment`.
  - The cancel won that race. `GuidedSessionService.stop` (live `:2502-2523`) then has no materialization
    context, and `assignments.find` is null, so `notifyContext == null`.
  - It therefore writes no `teardownStatus`, no `teardownRequest` and sends nothing. There is no runtime to
    stop, so CONFIRMED can never appear.
  - After the cancel, `prepareAssignment:1708-1710` locks the row and `active()` refuses, so no assignment can
    appear later.
  - The run log has no rollback trace from `acknowledgeAssignment` after 07:32:23.6, which is consistent.
- **H8/P3 relation:** none.
  - HEAD `stop()` already skipped `teardownStatus` when there was no target.
  - H8 only made the request durable **when a target exists**.
  - P3 only redirects to the assignment **when one exists**.
  - This branch never reached `p3AwaitTeardown` before: earlier runs stopped on 404 `SECRET_UNAVAILABLE`,
    which new22-b1b3 fixed.
- **Fix (test only, `fix.patch` hunks 1 and 3):** new `b3AwaitCancelSettled(id)`.
  - It requires `CANCELLED`.
  - With 0 assignment rows, it requires 0 materialization rows and a null `teardownStatus`.
  - With an assignment, it falls back to `p3AwaitTeardown` (H8 CONFIRMED).
- **Same assumption, not patched (spec):** the failed-test cleanup (`ReplayIT:2878-2890`) also demands CONFIRMED
  for every owned session.
  - A never-assigned failed session therefore sets `cleanupUnconfirmed`, and
    `beginOwnedSessionTracking:2724` blocks every later body.
  - Apply the same 0-assignment / 0-materialization / null-teardown exception there. **@qa ruling needed**,
    because it is a shared guard.
- **Residual risk** [I]: if the coordinator commits an assignment before the cancel, the stop may reach the
  runner before the `assign`. Confirmation would then rely on the 10 s reaper re-drive, which fits inside
  20 s but has not been observed.

## 2. `executionError` (class `@AfterAll`): no session or worker failed to settle

- **What failed:** `stopOwnedApplicationJobs:30348`, where `remaining = -295,220,012,584 ns`.
- **Timeline** [V]:
  - The 90 s `deadline` was armed at `:30284`, at about 11:33:04Z, just after the last test.
  - The ordinary worker drained at 11:33:04.5Z (`ordinary.log`).
  - The final per-invocation budget and response evidence files were written from 11:37:26.5 to 11:39:29.5
    (mtimes in `results.json`).
  - The `privacy-*.json` files were written at 11:39:29.5-.6.
  - The context closed at 07:39:29.6 local (stdout).
  - Arithmetic: 90 s + 295 s ≈ 385 s, spent **between** the drain deadline and the close.
- **What consumed it** [I, bounded by those mtimes]:
  - About 262 s went on process-tree stops, the audit stream scan, the whole-cohort privacy scan
    (194 values × encodings × about 65 MB of sinks) and the provider-facts checks.
  - About 123 s went on `persistActualBudgetEvidence` and `retainResponseFacts` for 62 invocations. Its sort
    comparator calls `budgetSessionOrdinal(jdbc,id)`, one SQL query per comparison.
  - None of these is bounded by `deadline`, but the close reuses it.
- **Settlement** [V] (`owned-worker-cleanup.json`, 07:39:29):
  - 207 registered roots: 0 alive and 0 recorded descendants alive.
  - The executor drains did not fail; otherwise `:30315` would have thrown first.
- **Second, independent cause** [V]: the owned-process metadata bound overflowed.
  - The bound is 4096 events / 2,096,000 B (`ReplayIT:528`). `owned-worker-generations.jsonl` hit
    2,913 events / 2,095,936 B at 07:26; of those, 2,347 rows are `DESCENDANT_RECORDED`.
  - 62 roots spawned after that, and every later event threw.
  - This produced 1,388 `OWNED_FIXTURE_FAILURES` ("metadata bound exceeded"), plus 1 observer race:
    `ownedCommandHash:499` hit `NoSuchElementException` while a root was exiting, the same as in
    `r2fix-join-attempt02`.
  - As a result `processesQuiescent=false`, and the run reported "Endpoints/PostgreSQL retained".
  - **The class stays red even with the deadline fix.**
- **Fix:**
  - (a) Patched in `fix.patch` hunk 4: the close gets its own 90 s bound instead of the leftover drain
    deadline.
  - (b) Spec, needs an @qa/@architect ruling because it is an evidence-retention bound: raise the bound to
    ≥ 16,384 events and 8 MiB. This lane projects to about 4.1k events / 3.0 MB.
  - (c) Spec: in `verifyOwnedRoot` and the observer, treat an empty `commandLine()` on a root that is
    exiting as "not yet / gone", not as a failure.
  - Optional: cache `budgetSessionOrdinal` before sorting.

## 3. Verification actually run
- `git apply --check -p0 fix.patch` on the live tree: OK. A scratch apply to `702d1be9…` gives `1690eaa7…`
  (round trip checked).
- `javac --release 21 -proc:none` (JDK 23.0.2; classpath: `build/classes`, resources and the Gradle-cache jars;
  scratch output): **exit 0, 0 errors** for both the base and the patched file. This is not Gradle. Spotless,
  Checkstyle and the tests were not run.
- The live `GuidedSessionService` (`bda27005…`) differs from the run (`d10ec5cb…`). It was modified at 07:52 by the
  aria-lifecycle-ruling01 L1 change at `lifecycle:2385`, and `stop()` is unchanged by it (ruling §2.2). The
  `stop` line numbers above are live numbers. [I] They are +1 relative to the run.
