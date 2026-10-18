# w3-qa-ack02: QA ACK/NACK for the w3-d5 and w3-d4 diagnosis patches

Quinn (@qa). 2026-10-16. Read-only review of the patch design. I did not run Gradle, JUnit, javac or Chromium. I did not commit and did not edit source. This grants no lifecycle credit: each fix still needs its own executed run.

[V] = I read the code or ran the check. [I] = inferred.

## 0. Inputs and live-tree state [V]

| Input | sha256 |
|---|---|
| `w3-d5-diagnosis01/fix.patch` | `1240de24…` |
| `w3-d5-diagnosis01/review.md` | `5af6b6ac…` |
| `w3-d4-diagnosis01/fix.patch` | `1f38da52…` |
| `w3-d4-diagnosis01/review.md` | `eb69acb4…` |
| Live ReplayIT at the start of review | `702d1be9…` (both patch bases) |
| Live ReplayIT at 07:59, after Dex-W4 applied the patches | `6315dee2…` |

- **Live file check.** On a scratch copy of the live `6315dee2…`, I reverse-applied D4 and then D5. The result is exactly `702d1be9…`. So the live file is base + D5 + D4 with no other bytes.
- **Production code read:**
  - `observationCollector.ts` `e073909b…`
  - `GuidedSessionService.java` `bda27005…`
  - `GuidedSourceClassifier.java` `b3769877…`
  - `GuidedPublicationEvidenceRepository.java` `8f5c0e0c…`
  - plus GuidedPlanBuilder, GuidedPublicationBaseRepository, GuidedTranslationStore, GuidedDispatchService, GuidedAssignmentStore, SecretAuditLifecycle, SecretRevocationSweep, GuidedPromptAssembler
  - the SQL migrations V14, V15, V16, V17 and V21, plus `docs/specs/studio/openapi.yaml`
  - `guided-data-flow.md:198-215`

## 1. Summary

| # | Item | Verdict |
|---|---|---|
| 1 | D5-1: B1C-01 + joined `assert-fail`, fixture mutation moved from `focus` to `change` | **ACK, conditional** |
| 2 | D5-2: `unused-declaration` `DISABLED` → `PAUSED` | **ACK** |
| 3 | D4 B2B-02: exclude `sourceManifest.{authoringSnapshot,authoringContext}` | **Not a leak (ACK).** Exclusion **NACK as patched**: one required tightening (§4.3) |
| 4 | D4 B3B-1: `b3AwaitCancelSettled` | **ACK** |
| 5 | Failed-test cleanup `ReplayIT:2878-2890`: same rule? | **Yes. Ruling with exact form in §6** (shared guard; needs a patch) |
| 6 | Owned-process metadata bound → ≥16,384 events / 8 MiB | **ACK, conditional.** Harness capacity only; no assertion depends on it |
| 7 | `executionError`: context close gets its own 90 s bound | **ACK** |
| — | Pax note: focus-guard product limitation | **Place it now.** Not a 015 blocker, but pilot-gating (§9) |

## 2. Item 1: D5-1 fixture `focus` → `change`

### Mechanism verified [V]

`observationCollector.ts` fill path:
- `:734` calls `element.focus()`.
- `:738` re-checks `matches(target, locator, true)`.
  - At `:601-603`, any MutationObserver record that is not a `class`/`style` attribute change bumps `revision`.
  - The observer watches all of `document`: subtree, childList and characterData (`:42-44`).
- Writing `textContent` on the Order-reference `<output>` is a childList record, so the guard throws `POST_FOCUS_CHANGED` before the write.
- `browser.ts:509` maps that error to `UNKNOWN_OUTCOME`.
- With `change`, the order is: guard passes → `element.value = …` → `input` → `change` (`:739`). The handler mutates **after** the write.
- Every fill's own `input`/`change` events already bump `revision` (`:45-47`). So a post-write mutation opens no new guard path: the next step re-observes after any fill anyway.
- The D5 Chromium probe drives the dist collector with a re-collect (generation 2) before the assert, as the runtime does.
  - `change` → fill `{}`, field written, `containsText` → `assertionPassed:false`.
  - `focus` → `POST_FOCUS_CHANGED`, field not written.

### Is the edit lawful? Yes.

- The same principle applies as in new22-qa-ack01 §3: **the frozen 35-label inventory freezes labels and oracles, not fixture bytes.**
  - Correcting a fixture so that it realizes its declared intent is lawful when the edit is confined to that variant's own branch.
  - The `assert-fail` branch is used only when `incrementalDomVariant == "assert-fail"` (`:1721`).
  - `b1c-assert2` is used only by B1C-01 (`:10600`, `:11532`).
- Neither label ever passed, so no green proof is invalidated (D5, results JSON).
- No assertion changed. Hunks 1 and 2 touch only the event name and comments.
- Coverage of the focus-mutation refusal is not lost:
  - `observationCollectorInvoke.test.ts:133-159` pins `POST_FOCUS_CHANGED` in four focus-handler cases.
  - The joined `unknown2` case pins the UNKNOWN_OUTCOME path.

### Does the variant still prove ledger 26? Yes.

Ledger 26 says: "Step2 assertion FAIL stops session, both gateways zero, no suffix and no revision published; original failing assertion retained". It names no trigger event.

After the patch, the failure is a **real** `containsText` on a **real** DOM change in the prefix. The oracles are unchanged:
- B1C-01 (`:10602-10656`):
  - session `FAILED`; `relearnedFrom` null; publication `REFUSED`;
  - model wire, legacy calls and model attempts all zero; `b1AssertNeverDrift`; zero suffix acceptances; still 1 revision;
  - exactly one non-SUCCEEDED action, at coordinate (1,1): `FAILED/ASSERTION_FAILED`, `assertionPassed=false`, `dispatchCount 1`, `attemptOrdinal 0`;
  - no actions for steps 2-9.
- Joined `assert-fail` (`:13317`, `:13544-13546`): exactly one `ASSERTION_FAILED` with `assertionPassed=false`, and `relearnedFrom` null.

### Conditions

- **(a) Execute** B1C-01 and `incremental joined assert-fail` in Chromium on `6315dee2…` or later. Each run must show:
  - fill `SUCCEEDED`;
  - the assert admitted and dispatched once, ending `FAILED/ASSERTION_FAILED`;
  - no relearn switch and no model attempt.

  If the assert instead goes to `TARGET_DRIFT`/relearn, or to any outcome other than ASSERTION_FAILED, **return to Dex**. Never change the oracle.
- **(b) Disclose the fixture byte change in that run manifest:** both branches, old and new text, and the ReplayIT hash.
- **(c) Unexecuted downstream assertions [I].** These have never run: B1C-01's `NATIVE_COMPLETED == 1` for the **assert** admission (`:10641-10646`), and the `publication REFUSED` assertion. D5 says `b1c-assert2` is not in the native inject list.
  - Whether an in-page collector assert records `NATIVE_COMPLETED` is unverified.
  - If that assertion goes red, raise it as a separate item. It is **not** grounds to revisit this fixture fix.

## 3. Item 2: D5-2 `DISABLED` → `PAUSED`. ACK.

Verified [V]:
- `V16__scheduling.sql:17-18`: state defaults to `PAUSED`, and `requested_enabled` defaults to false.
- `:35-40` `ck_studio_schedules_state` allows only `ENABLED`, `PAUSED` (with `NOT requested_enabled`) and `BLOCKED`. No later migration alters the constraint (grep).
- `docs/specs/studio/openapi.yaml:3004-3009` defines the enum `PAUSED|ENABLED|BLOCKED`.
- The fixture insert (`:13160-13161`, base numbering) sets no `state`, so the row is `PAUSED`/false.
- `"DISABLED"` cannot be stored, so the old literal could never pass.

Effect on the ledger:
- Ledger 36 ("preserves disabled schedule … never autoenabled") is still pinned at both sites, together with `requested_enabled == false` at the first site.
- Nothing is weakened. PAUSED + `NOT requested_enabled` is the only "not enabled" state the schema has.

Optional, not required: to prove "preserved" literally, also pin `version == 1` (or `updated_at` unchanged) at both sites.

## 4. Item 3: D4 B2B-02 canary in `sourceManifest`

### 4.1 Is it a real leak? No [V].

**Who writes the store.**
- `GuidedSourceClassifier:89` copies the authored snapshot into `authoringSnapshot`.
- `:98`, `:139` and `:182-194` project the `kind=text` context entries into `authoringContext`.
- `GuidedTranslationStore:71` inserts the row into `studio_guided_source_manifests`.
- The row is immutable: trigger `tr_guided_manifest_immutable` (V14:343).
- Its hash is re-checked on every read, and the publication base guard re-checks it in V15.

**Every reader of the store** (grep over `backend/src/main`):

| Reader | What it uses | Exposes context text? |
|---|---|---|
| `GuidedPublicationEvidenceRepository.read:498-515` | strips `configurationValues`; in-memory evidence for `GuidedPlanPublisher:204/356/444` and `GuidedPublicationRepository:239` | No. Downstream use is `learningProvenance` (only `schemaPins` hashes, GuidedPlanBuilder:31-56), `sourceManifestHash` equality (:102-106), and `sourceSteps` **step** text (:139-146), which is not context. The basis and artifact take hashes and step source only. |
| `snapshotEvidence` (:771-773) | `current.authoring` **is** `manifest.authoringSnapshot` (the same node) | No. It is the lawful internal authoring subtree the test already excluded. |
| `GuidedPublicationBaseRepository:111`, `:193-196` | hash check; `authoringSnapshot == c.authoring` equality guard | No |
| `GuidedTranslationStore.state/currentManifest:636-670` | coordinator, verifier, `GuidedTranslationService:204` input validation, `GuidedProductionSessionAccess:122,175` source resolution | No API return |
| `GuidedPromptAssembler:134` | sends `authoringContext` to the model | Model-only, and this is the approved INPUT-POLICY-01 branch A projection (`policy: "INPUT-POLICY-01-A"`, GuidedSourceClassifier:88). Pre-existing at HEAD. |
| `SecretAuditLifecycle:92`, `SecretRevocationSweep:170` | `configurationReferences` only | No |
| SQL: `studio_secret_guided_*` (V17:401-430, V21:836-848), `studio_publication_base_guard` (V15:87-100) | `configurationReferences`, `manifest_hash` only | No |

**No public, log, media or audit exposure.**
- No `@RestController` returns the manifest, translation state or publication evidence. The only controller that matched was `GuidedSessionVideoController`, and it uses the unrelated `GuidedSessionEvidenceRepository`.
- No logger call mentions the manifest.
- No SQL function copies authoring or context fields into another table.

**Spec.**
- `guided-data-flow.md:202-204` discloses the private `authoringSnapshot` retention ("exact normalized authored v2 contexts and text").
- `:211-215` says internal publication evidence exposes the "exact authored source needed to recompute snapshots", and model/provider/public projections exclude the snapshot.
- Plain values in the snapshot are hashes. `secretRef` entries carry no `value` (GuidedSourceClassifier:140-154).

**Severity: none. This is an oracle defect.** I agree with the A68-3 amendment D4 proposes. Route it to @architect (Aria, design owner) with Pax informed. It does not block the re-run.

### 4.2 Is the exclusion minimal? Canary-wise yes; structurally no.

- **Canaries still covered** [V, patched `:8280-8329`]:
  - `ctxLiteral` is explicitly asserted absent from `authoringContext`.
  - `plain`, `secret` and the ORDER tail are still checked over **`raw-evidence-whole`**, which includes both removed subtrees.
  - The outside check still covers everything else in `sourceManifest`.
  - So, among canaries, only `ctxText` stops being checked inside the removed subtrees, and that is the lawful one.
- **`authoringSnapshot`.** The equality check against `current.authoring` holds by construction, because the evidence repository assigns the same node (:773). It stays useful as a drift guard. The independent pin is `GuidedPublicationBaseRepository:194`.
- **Structural gap.** `authoringContext` is only **shape**-checked (`{stepId,text}`, size 2). Any text in that shape would be removed unseen, including non-canary private content or a future mis-projection.
  - Also, if `authoringContext` were missing or empty, the loop would pass vacuously.
  - So "exactly the context entries" is not proven.

### 4.3 Required change (B2B-02 hunk 2)

1. Replace the shape-only loop with **exact equality** against an expected array recomputed from `current.path("authoring")`. Mirror `GuidedSourceClassifier.safeContext` (`:182-194`) and its call order (`:99`, `:139`):
   - First, for `authoring.globalContext.entries` with `kind=="text"` and a non-empty `value`, in order: `{stepId:"global", text:value}`.
   - Then, for each `authoring.steps[i]` in order and each such entry of `steps[i].context.entries`: `{stepId: steps[i].id, text: value}`.
   - Assert `manifestCopy.path("authoringContext").equals(expected)`. Jackson deep equality covers field set, order and count.
2. Positive control: assert that `expected` is a non-empty array and that its serialized bytes contain `ctxText`. This proves the excluded subtree is the one that carried the canary.
3. Keep everything else in the patch as is: the `isObject` check, the `authoringSnapshot` equality, the `ctxLiteral` absence check, the removal of the two subtrees, the per-canary sink names, the `whole` checks for plain and secret, and the ORDER tail on `whole`.

Apply this to the live `6315dee2…` and record the new hash. The javac smoke D4 ran on the patched file stays relevant. Gradle and spotless remain the owner's job (Dex-W4).

## 5. Item 4: D4 B3B-1 `b3AwaitCancelSettled`. ACK.

Verified [V]:
- **The assignment intent commits before any runner sees it.**
  - `GuidedDispatchService.assign:86-91` runs `prepareAssignment` in its own transaction, then `runner.send("assign")`.
  - `GuidedAssignmentStore:65-73` does the `INSERT`.
  - So **0 assignment rows means no runner ever received the assignment.**
- **After CANCELLED, no assignment can appear.** `prepareAssignment:1701-1720` locks the session and calls `active()`.
- **Stop writes nothing when there is nothing to stop.** In `GuidedSessionService.stop:2503-2523`, with no materialization context and `assignments.find == null`, `notifyContext` is null. Then no `teardownStatus`, no `teardownRequest` and nothing is sent.
- `studio_guided_materializations.session_id` references `studio_guided_assignments` (V14:128), so `materialized == 0` is DB-implied once `assigned == 0`. The check is redundant but harmless.
- There is no `DELETE` of either table in `src/main`, so the count cannot be falsely zero after an assignment.
- The fallback with an assignment is unchanged `p3AwaitTeardown` (CONFIRMED within 20 s). H8 is not weakened.
- The single-shot read is safe: cancel is synchronous, and any mismatch fails red, not green.

Optional: in the zero-assignment branch, also assert `progress->'teardownRequest' IS NULL`.

Residual [I]: when an assignment exists and the stop races the `assign`, CONFIRMED relies on the 10 s reaper re-drive. That path is still unobserved. The first run that takes the fallback branch must show CONFIRMED.

## 6. Item 5: failed-test cleanup `ReplayIT:2878-2890` (shared guard). Ruling: yes, with the same rule, strictly.

**Why** [V]:
- The cleanup demands `CONFIRMED` for every owned session, including sessions already in a terminal state (`:2842-2849`).
- A session that ended before any assignment can never reach CONFIRMED. It then sets `cleanupUnconfirmed`, and `beginOwnedSessionTracking:2724` blocks **every later body**.
- That is a false cascade, not a safety signal: by §5, no runner ever held anything for that session.

**Exact required form:**
1. Extract one shared predicate used by **both** `b3AwaitCancelSettled` and the cleanup, so the two cannot drift. For example, `neverAssignedSettled(String id)` returns true only when a single read shows all of:
   - `state` is terminal (`SUCCEEDED|PUBLICATION_CONFLICT|FAILED|UNKNOWN_OUTCOME|CANCELLED|EXPIRED`);
   - `studio_guided_assignments` count = 0;
   - `studio_guided_materializations` count = 0;
   - `progress->>'teardownStatus'` is null or empty;
   - `progress->'teardownRequest'` is null.
2. In the cleanup, evaluate the predicate only **after** the existing cancel branch, so the state is terminal and no assignment can still be created.
   - If it is true: write `cleanup.teardownStatus = "NOT_ASSIGNED"`, `assigned = 0`, `materialized = 0`, and **do not** set `cleanupUnconfirmed`.
   - Otherwise: keep the existing 20 s CONFIRMED wait and failure handling byte-for-byte.
3. `allActualTeardownsConfirmed` keeps its meaning: every session that ever had a runtime is CONFIRMED.
4. Disclose the change as a shared-guard edit in the next run manifest.

This needs a patch from Dex and a QA delta-ack. I am not editing source.

## 7. Item 6: owned-process metadata bound 4096 / 2,096,000 B → ≥16,384 / 8 MiB. ACK, conditional.

**Harness capacity only** [V]:
- `ownedProcessEvents` and `ownedProcessEventBytes` appear only in the guard at `:528-529`, the counters at `:534`, and the summary fields at `:785-786`.
- `owned-worker-generations.jsonl` is written only at `:531`.
- There is no reader or assertion on it in `backend/src`, `tools/`, `studio-runner/src` or the build.
- No test exercises the bound's throw.
- When the bound is exceeded, the event becomes an `OWNED_FIXTURE_FAILURES` entry. That is fail-closed: it makes the class red, never green. Raising the bound changes no oracle.

**Conditions:**
- (a) Use 16,384 events and 8,388,608 bytes exactly.
- (b) Keep the following unchanged:
  - the fail-closed throw;
  - the UTF-8 exact-byte check (owned-worker-utf8-fix01);
  - 0600 creation;
  - the separate 1 MiB summary bound;
  - value-free row fields.
- (c) Disclose the change as superseding the QA-reviewed bounds in:
  - `checkpoint-owned-worker-generations01.json` (`privateMetadata.eventBound/eventByteBound`);
  - the `workerMetadataCapsUnchanged` claim in `prefix-sync-tests-source01/hook-privacy-bounds.json`.
- (d) The run evidence must report `metadataEvents` and `metadataBytes` under the new bound. The projection is about 4.1k events / 3.0 MB, giving roughly 4x / 2.8x headroom.

**Not ruled here:** D4's fix (c), which would treat an empty `commandLine()` on an exiting root as gone. The `ownedCommandHash:499` observer race keeps the class red. That change touches failure detection and needs its own patch and review.

## 8. Item 7: context close gets its own 90 s bound. ACK.

Verified [V] (`stopOwnedApplicationJobs`, base `:30247-30352`):
- The 90 s `deadline` still bounds every scheduler/executor drain (`awaitOwnedExecutorTermination(…, deadline)`, activeThreads loop), and `throwTeardownFailures` still runs before the process stops.
- The process-tree stops, `scanFinalOwnedSinks` and the drained check run **after** the drains and were never bounded by `deadline`. So the removed `isPositive` only asserted that unbounded scan work happened to finish inside the drain budget. It was not a settlement property.
- Settlement is still asserted by `throwTeardownFailures`, the `drained` flag (no root or descendant alive), and `finalScanFailures`.
- The close is still bounded: `closeFuture.get(90 s)` turns a timeout into `closePrimary`.
- I found no spec bound on total class-teardown wall time.

Optional, not required:
- Record `nanoTime − deadline` at the close in the cleanup evidence, so the about 385 s scan cost stays visible.
- Cache `budgetSessionOrdinal` before the sort.

## 9. For Pax (not blocking 015): focus-guard product limitation

**Verified scope [V].** `matches(…, focusStylesOnly=true)` (`:601-603`) tolerates only `class`/`style` **attribute** records. It does so document-wide, and only when the record count is ≤ `workLimits.elements`. Anything else anywhere in the page during `focus()` refuses the fill as `POST_FOCUS_CHANGED`, which maps to `UNKNOWN_OUTCOME` (browser.ts:509). The runtime then calls `stop('UNKNOWN_OUTCOME')`, so the **whole session** ends, not just the step. "Anything else" includes:
- text and childList changes: helper text, validation hints, autocomplete/listbox rendering;
- any other attribute change, for example `aria-expanded`, `aria-activedescendant`, `aria-describedby`, `data-*`.

**Real-app exposure [I, not verified against any Citi pilot app]:**
- Component libraries commonly set non-class attributes on focus. React Aria sets `data-focused`/`data-focus-visible`; Headless UI sets `data-focus`.
- Comboboxes and autocompletes often open on focus.
- Under the current guard, every fill into such a control fails closed. That is safe (at-most-once is preserved) but unusable.

**Recommendation: place it now, the same way as AUTHORED-ECHO-01.**
1. Record it as a named known limitation, for example `FOCUS-MUTATION-01`, in the 015 / GA known-limitations list. Classify it as **pilot-gating, conditional**.
2. Add a **pre-pilot compatibility gate**: for each pilot app, probe every authored fill target (D5's `probe.mjs` pattern) and confirm that `focus()` causes no non-class/style mutation. If any target fails, the pilot for that app is blocked until item 3 lands.
3. Open a backlog design item for @architect (runner OBS-004/012A): scope the post-focus check to the target's own identity, eligibility, visibility, value and type, plus structural changes to its ancestors. Add an explicit allowlist of inert attributes (`aria-expanded`, `aria-activedescendant`, `aria-describedby` and `data-focus*` family). At-most-once and the existing pre-write checks must stay unchanged.

   This is a design change, not a QA call. It must keep the four `observationCollectorInvoke.test.ts:133-159` refusals.
4. It does **not** block 015. 015 validates the committed runner behaviour, and D5-1 shows the guard is behaving as designed.

## 10. Not done

- No Gradle, JUnit, javac, Chromium, spotless, checkstyle, spotbugs or CodeRabbit (WSL-only) run.
- No source edits. No commit.
- The live file was patched concurrently by Dex-W4 during this review. I verified the result against the two patches (§0).
