# STUDIO-OBS-008 @dev technical gate: lane L5b (page integrator) with its L5b-F1 unit

- **Reviewer:** Dex (@dev). **Date:** 2026-10-17. **Authority used:** PASS-WITH-FIXES inside the L5b write set; Q9 implementation as relayed by root.
- **Not touched:** `frontend/e2e/**`, `playwright.config.ts`, the frozen interface files, `copy`, `GuidedCompletion`. No git write, no install, no Playwright, no Gradle, no a11y audit (`docs/qa/accessibility/axe-results.json` mtime is still 16:16). No PID signalled. The temporary probe directory was deleted.
- **Inputs read:** story AC-1..AC-9, D-1..D-12, the 2026-10-17 scope decision and the KL-015-Q4 block; rulings A1.6, A3 and `w1-confirmations.md` section 4; the L5b receipt and F1 addendum; the earlier gate review; `batons.json` interfaces; the Q9 ruling; every L5b source file named in the receipt and the tests that cover them; backend `GuidedSessionService.cancel/stop`, `ExecutionReadinessService.LEARNING_QUERY`, `openapi.yaml` `cancelGuidedSession` and `readGuidedSession`.

## Verdict: PASS-WITH-FIXES (applied)

Two real defects fixed in the L2b hook (401 finalize resend, blocked storage). Q9 implemented. No defect found in the Run modes, D-3 body, A1.6 precedence, A3, capability gating or D-8. Findings left open are low or are for root.

## What I ran (verified)

| Command (from `frontend/`) | Result |
|---|---|
| baseline, before any edit: `pnpm exec vitest run src/pages/ChecksStudioPage src/components/studio/run src/components/studio/runs src/components/studio/guided src/components/studio/evidence src/components/studio/templates --minWorkers=1 --maxWorkers=3` | exit 0, 28 files, **593 passed** (`logs/t0-baseline-vitest.log`). Equals the F1 receipt. |
| same set, final tree | exit 0, 28 files, **612 passed** (`logs/v-vitest-l5b.log`) |
| `pnpm run type-check` | exit 0 (`logs/v-type-check.log`). A first run after my hook edit failed with TS2322 (nullable promise); fixed, re-run green. |
| `pnpm run lint` | exit 0, **0 errors, 308 warnings** (= baseline) (`logs/v-lint.log`) |
| `pnpm exec vitest run --minWorkers=1 --maxWorkers=4 --exclude 'src/test/a11y/**'` | exit 0, **68 files, 1300 passed** (`logs/v-vitest-full.log`). F1 was 1281; the +19 are this gate's tests. |
| `grep` for `fetch(`, `: any`, `as any`, `@ts-ignore`, `eslint-disable`, `aria-live`, `aria-current` over the L5b source | no new hit. The `any`, `eslint-disable` and `onKeyDown` in `ChecksStudioPage.tsx` are the same 3+ as at HEAD (git diff adds none). All HTTP goes through `studioApi`, `studioGuidedApi` (apiClient). |

Not run: `studioWcagAudit.test.tsx`, Playwright, any backend command.

## Findings

| ID | Sev | file:line | Finding | Disposition |
|---|---|---|---|---|
| F-L5b-1 | **medium** | `useGuidedSession.ts` `ensureFinalized` / poll (was `:361-409`, `:436-439`) | Persistent `401` on finalize: the latch stayed open and the poll resent finalize (same key) on every tick. **Reproduced**: 11 finalize requests in 80 ms at a 5 ms poll (red test before the fix). In production that is about 1/s, and each 401 makes `apiClient` dispatch `put:auth:unauthorized` and call `__PUT_AUTH__.login()` (`apiClient.ts:81-90`), so it is a request and sign-in storm. The header comment also said a 401 stops polling. | **FIXED.** See Fixes. |
| F-L5b-2 | **medium** (low frequency) | `useGuidedSession.ts` `writeGuidedPointer` / `ensureFinalized` | When `sessionStorage` cannot be written (full, blocked), finalize needs the persisted key and exact body and reads the pointer back, finds none, and returns. **Reproduced by probe**: state `FINALIZING`, finalize 0, `pending` null, so nothing ever publishes and nothing says so. AC-2's automatic finalize fails silently. The code comment ("only reload-resume is lost") was false for finalize. | **FIXED.** In-memory fallback pointer (same five fields). |
| F-L5b-3 | low | `useGuidedSession.ts` `startLearn` (`:~502`) | A pointer whose session read is refused definitively (400/409, not 401/403/503) leaves a known `sessionId` with no loaded view. `startLearn` then returns silently. **Reproduced by probe**: Run click, 0 starts, no guided area, no message. The refusal codes are not declared for a purged session (a 403 forgets the pointer, so the likely real case is handled). | Open, **for root/L2b follow-up**. Not fixed: forgetting a session on a read refusal risks a double learn, which needs a decision. Inference for how often it occurs. |
| F-L5b-4 | low | `ChecksStudioPage.tsx:914` (`insertReference`) | `rows.some((row) => row.name.trim() === reference.name \|\| row.secretId === reference.name)`. A row that merely has the same NAME (plain, or a secret row with no or another `secretId`) suppresses the `secretRef` declaration for the inserted `<secret ID>`, which then resolves by `secretId` and is undeclared at run. D-8's invariant (never a null or empty `secretId`) still holds. Not tested. | Open, low. Fix needs a duplicate-name policy. Read, not run. |
| F-L5b-5 | low | `RunControl.tsx` learning sentence | "…Run is off until that Run ends." is true on the server (`LEARNING_QUERY`: unexpired and non-terminal), but the page does not poll another client's session; Run stays off until the author refreshes (the "Refresh test information" button does re-read it). | Open, copy note for @ux. No copy changed. |
| F-L5b-6 | low | `GuidedClarification.tsx:154` (F-L5a-4) | See item 3. | Re-rated, stays low. |
| F-L5b-7 | low (test gap) | `runGate.test.tsx` | Two mutations survived the receipt's tests: dropping `test.readiness === 'READY'` from `learnFromHints` (M4), and dropping the `testId` term of `contextMatches` (M6). | M4 **closed** by new test (j2). M6 left: the term is defensive, because `startLearn` already refuses a body for another test. |
| F-L5b-8 | info | `RunControl.tsx` | Dev warning "Invalid prop `children` supplied to Box" (portal as a child, `createPortal` is in HEAD). 9 occurrences in the baseline log. | Pre-existing, none added. |

## The four explicit items

### 1. Cancel answered by a non-terminal session: does focus wait forever?

**Answer: it waits, and then happens. Acceptable under A3.**
- Mechanism (read): the focus request is held in `focusRequest` and applied by an effect that runs only when `editorLocked` is false (`ChecksStudioPage.tsx:410`); the step rows are `disabled` while locked, so a focus call before then would do nothing. The poll keeps running until the session is terminal, so the lock ends with the session. The sessions expire server side, so there is no unbounded wait while polling continues.
- Real backend (read, not run): `GuidedSessionService.cancel` calls `stop(session, "CANCELLED")` inside the call, which sets `state=CANCELLED` before `view(session)`. The 202 body is already terminal, so the non-terminal answer is a contract-allowed branch, not the observed one.
- Proof by test (new, `pageGuidedRun.test.tsx`, two cases): (a) cancel answers `202` with the session `ACTING`; (b) cancel is refused `409` while the session carries on. In both: one cancel with `userRequested`, step 2's row is `disabled` and not focused for 150 ms, then when the session ends the existing `CANCELLED` narrative shows and focus lands on "Step 2"; zero clarify, one start.
- Mutation M7 (remove the `editorLocked` guard) fails both cases.
- Residual (inference): if the poll stops with a non-terminal view (401, or a 400/409 read refusal) the editor stays locked until reload. That is the general lock, not specific to A3, and is the same state as F-L5b-3.

### 2. Persistent 401 on finalize

**Confirmed, then fixed (F-L5b-1).** Red test first (11 finalizes vs the expected 1), then the fix, then green.
- `ensureFinalized` now returns `'continue' | 'reauthenticate'`. A 401 sets `pending = REAUTHENTICATION_REQUIRED` and the poll **stops**, as the hook's header always said a 401 does. The latch stays open and the pointer is kept, so a reload (new module state, same persisted finalize key) sends finalize once more. Bounded: one request per poll start. A shared in-flight promise gives both racing instances the same outcome.
- Visible text: the page already renders `guided-pending` with the existing cited `notReadyNow` copy ("Steps not ready to repeat.") for `REAUTHENTICATION_REQUIRED`. No new string. Page test: finalize 401 row added to the existing table, asserting that text, `data-pending="REAUTHENTICATION_REQUIRED"`, one finalize, one key, no "Completed".
- Hook tests added: 401 sends once, polling stops, pointer kept, never published; after a 401 a reload resumes by GET and sends finalize with the same key once more, then publishes.
- Mutation M9 (return `'continue'` on 401) fails both hook tests.

### 3. F-L5a-4 (clarification whose step does not match renders nothing), re-rated with the page

**Stays low.** Probe (scratch, deleted): clarification served for step 4 while the active step is 2. The page shows no question and no explanation (the guided area shows only the video placeholder "No run is on screen yet, so there is no recording to show."), but **Stop is present and works**: one cancel, then the `CANCELLED` narrative. So the author is never trapped, and the 60 s expiry also ends it with the `EXPIRED` narrative. The precondition contradicts P2 ("activeStep is the step the session is on"), so it needs a server contract violation; the only benign window is one round trip between the session read and the question read. Recommended, not blocking: a predicate so the page can say something in that case. Not fixed (copy would need a source).

### 4. Uma's "LEARNING elsewhere" sentence and the AC-7 seek label

- **Sentence: accepted.** Verified claims: `LEARNING_QUERY` is `unexpired AND state NOT IN (terminal states)` (`ExecutionReadinessService.java:88-91`), so "learning" and "until that Run ends" are accurate. Cited basis `delegated`, source ADR-SC-006 and the copy-table quote tests are green. The page shows it only when mode is `busy`, nothing is running and `followedSessionId` is null, so a page that resumed its own session does not show it. The brief flash after its own session ends is not reachable (the gate's last read was before the start). Note F-L5b-5 (refresh).
- **Seek label: accepted.** "Seek to step N" comes from the cited AC-7 row (`seekToStep`); the accessible name is the same and `: not attempted` is appended for a step with no reading. Uniqueness holds: the failing step shows the VAL-025 control instead of the per-step one, and guided and replay views are exclusive. The test asserts the retired label is gone.

## Review results by focus item

| Focus | Result | Evidence |
|---|---|---|
| Three Run modes, D-3 body, client never lowers k | Correct. `relearnHints` sends the served `confirmedRevisionId` and `firstChangedStepId`, or the first step only for `BASE_IDENTITY_INCOMPLETE` (D-4). | runGate (c)(d), page NEEDS_RELEARN test; M1 |
| Refusals as feedback, no retry | Correct. `getCapabilities` is `__doNotRetry`; start refusals are inline, nothing polls or retries. | page tests for budget, policy, D-4; runGate (g)(h) |
| D-1 key reuse | Hook: pointer written before POST, same body and key on a lost response, new key after a refusal or a new body, memoized clarify/cancel keys, finalize key persisted. Execute: a fresh UUID per activation (VAL-039, pre-existing). | hook tests; M10 |
| Auto-finalize | Once per session through a shared latch; now also with blocked storage. | page and hook tests; M8 |
| replayFailure precedence (A1.6) | Reads exactly one field, selects the narrative before `status` and `errorCode`; text is never parsed; seven cases covered. | `replayFailure.test.tsx`; page RR tests |
| Learn again only under A1 | UI offer and the gate's fresh-read re-check both enforce READY + matching revision + step in draft. | M3 (UI), M4b (gate) |
| A3 | One cancel (`userRequested`, one stable key), no clarify, then focus; races and non-terminal answers covered. | page A3 tests; M2, M7 |
| "Go to step N" | Request by stable ID, dropped if the step is gone, applied on unlock. | login tests, RR tests |
| Capability gating, P6 re-read | Capability read directly after save + fresh read; start only on exact context match; unavailable shows the existing refusal. | runGate (b)(g)(h) |
| D-8 | Only write path (`toContractVariables`) drops a secret row without a `secretId`; picker and template write the Vault name. See F-L5b-4 for the declaration edge. | page D-8 test; M5 |
| Effects, StrictMode, races | Hook has StrictMode and two-instance tests. Page effects are guarded by tokens and refs. No leak found. | hook tests |

## Mutation spot-checks (in place, each restored and the sha256 re-checked)

| # | Mutation | Tests run | Result |
|---|---|---|---|
| M1 | `relearnHints`: always send the first step (lowers k) | `runGate.test.tsx` | **killed**: (c) fails |
| M2 | page `noneOfThese`: skip the cancel | `pageGuidedRun -t A3` | **killed**: 5 fail |
| M3 | `learnAgainOffered`: drop the revision condition | `replayFailure.test.tsx` | **killed**: case 4 "superseded" fails |
| M4 | `learnFromHints`: drop `readiness === 'READY'` | `runGate.test.tsx` | **survived** (gap F-L5b-7) |
| M4b | same, after new test (j2) | `runGate -t j2` | **killed** |
| M5 | page `toContractVariables`: drop the secret filter (D-8) | `pageReplayAndReferences -t D-8` | **killed** |
| M6 | `contextMatches`: drop the `testId` term | `runGate.test.tsx` | **survived** (defensive, left) |
| M7 | focus effect: drop the `editorLocked` guard | new A3 deferred-focus cases | **killed**: 2 fail |
| M8 | hook: drop the memory fallback | new storage tests | **killed**: 2 fail |
| M9 | hook: 401 on finalize returns `'continue'` | new 401 tests | **killed**: 2 fail |
| M10 | hook: finalize sends a fresh key per attempt | `useGuidedSession -t 503` | **killed** |
| M11 | Q9: remove `BUDGET_EXCEEDED` from the code list | Q9 unit and page G1 | **killed**: G1 and 3 unit tests fail |

Original and mutated hashes are in `logs/orig-sha256.txt`; the restore check printed `True` for every run, and the five untouched sources were compared byte for byte at the end.

## Q9 implementation (as relayed by root, ruling `rulings/q9-authored-literal-trigger.md`, option ii)

- **Rule** in `authoredLiteralHint.ts`: show only when the outcome is `FAILED`, `(failure?.code ?? errorCode)` is `TARGET_MISMATCH` or `BUDGET_EXCEEDED`, `failedStepIdOf` (unchanged) finds a step still in the draft, and that step carries a literal. The predicate splits on `/[.,;:!?]|\b(?:and|then)\b/iu` and a clause qualifies when its first word is one of the existing verbs with at least one word after it. The module comment now cites the ruling, says why `BUDGET_EXCEEDED` is the real path, why `TARGET_MISMATCH` is kept, why `RUNTIME_INCOMPATIBLE` is excluded, and lists R1-R4.
- **Unit tests** (`authoredLiteralHint.test.ts`, 26 cases, built from `fixtures.json` `loginResult` with `detail` deleted; `failure` set only for `TARGET_MISMATCH`, `LOGIN_REQUIRED` keeps its own): positives (`BUDGET_EXCEEDED` with "Check the heading says Order confirmed"; the 015 D3 sentence; the 5 phrasings under both codes); cause controls (RUNTIME_INCOMPATIBLE, UNSUPPORTED_SURFACE, ASSERTION_FAILED, POLICY_DENIED, INVALID_CONTRACT, MISSING_SOURCE, AMBIGUOUS_TARGET, LOGIN_REQUIRED); step controls (the 5, "Click the Check out button", "Click Terms and Conditions", `Go to "https://select.example.test"`); outcome controls (EXPIRED, UNKNOWN_OUTCOME, SUCCEEDED, step not in draft).
- **Page tests** (`pageGuidedRun.test.tsx`, `resultFor` override, `errorCode` alone, `failure: null`, `detail: null`, `failedIndex: null`, not `endsIn`): G1 (literal step: `data-kind="failed"`, budget sentence and hint), G2 (`Click "Sign On"`: budget sentence, no hint), G3 (literal step with `RUNTIME_INCOMPATIBLE`: `failedUnnamed`, code shown, no hint).
- **Existing KL-015-Q4 page tests**: all 4 kept unchanged. They use `endsIn` with `TARGET_MISMATCH` (still in the list) and control codes `AMBIGUOUS_TARGET` and `ASSERTION_FAILED` (still false), so the new rule did not require an adjustment.
- **Mutation:** M11 above. G1 fails with `BUDGET_EXCEEDED` removed; restored (`cc4a101e8608...`).
- **Carried residuals** for @po to place in 009 AUTHORED-ECHO-01: R1 cross-step literal (no hint), R2 shared budget code (true but possibly irrelevant), R3 secondary paths (no hint), R4 AE-01 b/c should pin `FAILED BUDGET_EXCEEDED` as the "before" state. Observation F-1: the L2b mirror sends `failure` for every code; the backend only for `LOGIN_REQUIRED`; behaviour is identical.

## Fixes applied (sha256 before to after)

| File | Before | After | Change |
|---|---|---|---|
| `frontend/src/components/studio/guided/useGuidedSession.ts` | `c1377a481fae9fe6d356e9b228c6b7b89dcc926e1cfa6d695e31e49353e24806` | `175e5741fd73b8f3ee990ce29df01e80379a0c8e9b8c3c4493379460d631d2f4` | F-L5b-1 (401 on finalize stops the poll), F-L5b-2 (memory pointer fallback), header comment |
| `frontend/src/components/studio/guided/useGuidedSession.test.ts` | `d47dd62da3a886d4aa9d8b6e3086aee9a0cbf278aed85d65fbde8b3cb831d844` | `ff0b314544f8ae3e272e1c7914e3507e424dcaa4327eff9e9427560608914b45` | 4 tests (+2 401, +2 storage) |
| `frontend/src/pages/ChecksStudioPage/pageGuidedRun.test.tsx` | `29b46ee4cde01021c50ea81f2d3ac951fbc6cd87ef7f833c931e96cc42b431e5` | `2b41024aed3a2023a47a1b60617705d10dda528cf25184d2cf82c084891ee275` | finalize 401 row, 2 deferred-focus A3 cases, G1-G3 |
| `frontend/src/components/studio/run/runGate.test.tsx` | `fe62b79137b29e6cd244fdc488818caf22c5dfc3e0a45cdcb21ea1866b39dfd1` | `611fb0f53bd8fd7a6cfd0118c31ed9876b452c613c22a89687036cb45e332eb5` | test (j2) |
| `frontend/src/pages/ChecksStudioPage/authoredLiteralHint.ts` | `8a0f6f4f357ff7fb96cb91831a8f3d0f02e209ec3992e5cd5f0ee38187db4343` | `cc4a101e8608bf3293a9cf4b793e35b7c443880cd75ba6a2e0cf9f4781725f4d` | Q9 rule and comment |
| `frontend/src/pages/ChecksStudioPage/authoredLiteralHint.test.ts` | `47e95e9eecf446b074461b0210bdaee9b7a4c356f17a0a60606880376534824f` | `9ab34deb05807bcaacaf4edaf953fc9b38aacf77d0cfde168a163619ad0d2620` | Q9 tests |

Test count: 593 to 612 (+19 = 4 hook, 6 page [1 finalize-401 row, 2 deferred-focus cases, G1-G3], 1 runGate (j2), 8 in the Q9 unit file, 18 to 26). All other L5b files are byte-identical to the F1 receipt.

## Items for root

1. **Commit set (F-L5a-2 still applies).** The copy-table tests read untracked evidence files, `ADR-SC-006` and the uncommitted `ExecutionReadinessService.java`. They must travel with `guidedNarratives.ts`.
2. **F-L5b-3** (stuck Run after a refused read of a stored session) is for L2b/root; it needs a decision on forgetting a session.
3. **F-L5b-4** (`insertReference` same-name row) and **F-L5b-5** (refresh wording) are low; assign or accept.
4. No interface-level issue found in the frozen files.
5. The a11y audit still has to be run by L6 after the source freeze: my changes add no rendered surface (the Q9 hint component already existed).
