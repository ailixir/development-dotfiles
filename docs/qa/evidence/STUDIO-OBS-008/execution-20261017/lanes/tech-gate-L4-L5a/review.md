# STUDIO-OBS-008 @dev technical gate: lanes L4 and L5a

- **Reviewer:** Dex (@dev). **Date:** 2026-10-17. Review only: no source, test or story file was edited, no git command that writes, no install, no PID signalled. `studioWcagAudit.test.tsx` was not run.
- **Inputs read:** both receipts, `lanes.json` L4/L5a/L5b, `t0-rulings/ruling.md` A1.6/A2/A3, `w1-confirmations.md` section 5, story AC-3/AC-4/AC-5/AC-7 and D-3/D-4/D-5/D-8/D-10, every L4 and L5a source file, and the L4/L5a tests.

## Verdicts

| Lane | Verdict | Required fixes |
|---|---|---|
| L4 | **PASS** | None in code. Two root bookkeeping items (DV-1, DV-3). Two optional low items. |
| L5a | **PASS-WITH-FIXES** | F-L5a-1 (never-echo canaries for clarification, result and explanation: not covered by any lane). F-L5a-2 (the copy-table tests read four untracked files: commit-set condition). |
| L5a Q2 | **CONFIRMED** | No code change. See Q2 below. |

## What I ran (verified)

| Command (from `frontend/`) | Result |
|---|---|
| `pnpm exec vitest run src/components/studio/references src/components/studio/SecretInput.test.tsx src/components/studio/templates src/components/checks/wizard src/components/studio/guided src/components/studio/evidence --minWorkers=1 --maxWorkers=2` | exit 0. 15 files, **516 passed**, 0 failed, 0 skipped, no stderr warnings (40 s, started 16:31:32). |
| `pnpm run type-check` | exit 0. |
| `pnpm exec eslint` on all L4 and L5a source and test files | exit 0. **0 errors, 12 warnings**, all `react-refresh/only-export-components` in six L5a `.tsx` files. L4 has 0 warnings. `lint` has no `--max-warnings`, and `run/ExecutionProgressView.tsx:91` raises the same warning, so this is precedent and not a finding. |
| `grep -rn 8192 frontend/src` | no match. |
| `grep -rln "password box" frontend/src` | only test files (the negative assertions). No source file contains the A2 copy. |
| `grep` for `aria-live`, `role="status"`, `aria-current`, `prefers-reduced`, `onKeyDown`, `: any`, `as any`, `fetch(` over all L4 and L5a source | none new. `UiTestConfig.tsx:207` `onKeyDown` is the pre-existing Enter-to-add (also in `git show HEAD`). `VideoEvidencePanel` `aria-label`s are pre-existing; only the interpolated id changed. |

## Section 5 follow-up (secret bound 4096): LANDED

Final state verified at review time:
- `SecretInput.tsx:24` `MAX_VALUE_LENGTH = 4096` (sha256 `53a6c1aa4b1131e75c43c67a126bcc503f31f9fcd0aaded749c686ae49027c1d`).
- `secretsHandlers.ts:24` `MAX_VALUE_LENGTH = 4096` (sha256 `19b4b779327cf04d6b2d36663efae479eb3c00f7f7cdcc8e681a8fdfdd9b7eb8`).
- `SecretInput.test.tsx` pins the bound: 4096 accepted and 4097 refused on the mirror (`:397`), the field's `maxlength` is 4096 and a 4096-character secret is created (`:504`), and the 4097 case is in the refusal table (`:426`) (sha256 `f1e14bba9f0f1b6dfdbf46a754c7d1d2eb5dead4c564e7e99015e2763c242506`).
- `docs/specs/studio/openapi.yaml:4429` already says `maxLength: 4096`, so the mirror and the document agree.

These hashes differ from the receipt hashes because of this follow-up.

---

## L4: references, secrets, runtime capability. PASS

### Checked and correct (verified by reading code and running the tests)

- **Never-echo.**
  - The value lives in `CreateSecretDialog` state only. It is a `type=password`, `autoComplete="new-password"` field, cleared on success (`SecretInput.tsx:85`) and on failure (`:89`).
  - `projectCreated` (`:39`) drops any extra field of a create answer before a caller or render sees it.
  - `secretFailureText` (`referenceTokens.ts:109`) maps only the server's error code and never quotes the request.
  - The MSW mirror stores name, version and origins, never the value. Its create answer is exactly `{name, version, allowedOrigins}`, and no refusal body quotes the request.
  - The canaries do fail on a leak:
    - The failure test (`referencePicker.test.tsx:477`) asserts the Value input is `''` while the dialog is still open.
    - Both tests scan DOM, input values, accessible names, storage, every console method (debug log on, and the test proves the `API Request: POST` log ran), the insert payload and every mocked response body.
    - The projection test injects `value: CANARY` into a 201 answer and asserts `onInsert` and the DOM stay clean.
- **Capability off, on, unknown, error** (`studioCapabilities.ts`).
  - `unknown` (null id) asks nothing, `loading` appears at once for a new id, and a late answer for an old id is dropped (`:93-110`, `:113`).
  - Any rejection or any body that fails `isStudioCapabilities` is `unavailable`. `__doNotRetry` is set, and the tests assert exactly one request for 400, 401, 403, 500 and a network error.
  - Five malformed 200 bodies are unavailable. `guidedStart` cannot switch `vaultSecrets`.
  - Every consumer treats all non-ready states as unavailable, says why in visible text, and reads no secret list (`ReferencePicker`, `UiTestConfig`, `OnboardingCoach`, `availableQuickStartTemplates`). The capability payloads in the tests are the OpenAPI examples, read from the document.
- **D-8.**
  - The picker inserts `<secret ID>` where ID is a name from `listTestSecrets` (read fresh on each open) or the create answer's `name`, both filtered through `isReferenceName`, which is the `Variable.secretId` pattern.
  - `secretToken` and `varToken` throw on an invalid name.
  - `UiTestConfig.handleSecretChange` deletes the key and never writes null, empty or an alias (`:87-92`).
  - The page still writes `secretId: ... ?? null` at `ChecksStudioPage.tsx:124`. That is the known L5b baton, not an L4 defect.
- **A2.** The struck copy is absent from source (grep) and is asserted absent in five test files.
- **Standards.** No `any` (the old `any` props in `UiTestConfig` became a structural type). All HTTP goes through `studioApi` and `secretsApi` (apiClient). MUI with `sx`. No a11y additions.

### Findings

| ID | Sev | Where | What | Fix |
|---|---|---|---|---|
| F-L4-1 | low | `referencePicker.test.tsx:441-475` | In the success test, `expectNoCanaryOnScreen()` runs after the dialog has closed. MUI unmounts the dialog content, so the DOM, input and name checks pass even if `CreateSecretDialog` kept the value in state. The load-bearing checks for the success path are console, storage, payload and response. The DOM check has teeth only in the failure test. (Inference from reading: I did not mutate the code, as this is a review-only task.) | Optional. Before `expectNoCanaryOnScreen()` at line 474, click "New secret…" again and assert the dialog's Value, Name and Allowed origins are `''`. |
| F-L4-2 | low | `ReferencePicker.tsx:194-205` | `createOpen` is not reset when `secretsOn` turns false while the dialog is open. The dialog unmounts and `createOpen` stays true, so it reopens by itself when the capability returns. Edge case, found by reading. | Optional. In the effect at `:84`, or next to `secretsOn`, call `setCreateOpen(false)` when `!secretsOn`. |
| F-L4-3 | low (transitional shims) | `studioCapabilities.ts:13`, `quickStartTemplates.ts:116`, `templates/index.ts:3` | `STUDIO_CAPABILITIES` and `PRODUCTION_ALPHA_TEMPLATES` are kept so the page compiles. They are fail-closed (secrets off), have a named owner (L5b, W3), and a documented deletion. Tolerated under the single-path rule only while that holds. `STUDIO_CAPABILITIES` is in L5b's `grep ... expect 0` verify, but `PRODUCTION_ALPHA_TEMPLATES` is not, so it could survive. | Root: add `grep -rn "PRODUCTION_ALPHA_TEMPLATES" frontend/src   # expect 0` to the L5b verify, and add `availableQuickStartTemplates` to `templates/index.ts` or tell L5b to import it from `templates/quickStartTemplates` (DV-3). |

### Informational (not findings)
- **DV-1 (rewrite of `UiTestConfig.test.tsx`, outside the L4 write list): ACCEPT.** The old test mocked the whole capability module, so the L4 verify row could not pass without it. Root should record it in L4's write set.
- `useStudioCapabilities` has no refetch. The page's P6 "re-read after save" needs `studioApi.getCapabilities` directly, or a refetch added by L5b.
- `apiClient` returns the unwrapped body, so a non-200 2xx with a valid-shaped body would count as `ready`. The contract defines only 200 for this route. (Inference from the API shape, not a defect.)
- `quickStartTemplates` declares secret variables as `{name, type: 'secret'}` with no `secretId`. When L5b applies a template it must write `secretId = name` (the file says NAME is the Vault name). Carry this into L5b's D-8 test.
- `vi.spyOn` negative checks use a real `setTimeout(30)` (`referencePicker.test.tsx:340`, `UiTestConfig.test.tsx`). These can only under-detect a late request, never flake red.

---

## L5a: guided and evidence presentational components. PASS-WITH-FIXES

### Checked and correct

- **`loginNoticeFrom` vs A1.6.**
  - The adapter copies exactly `{stepId, loginStepsPresent}` (`LoginRequiredNotice.tsx:30`).
  - `replayLoginNotice` keys on `replayFailure` only. A null, undefined or `TARGET_DRIFT` value gives no notice (`:54-60`). The negative control puts `LOGIN_REQUIRED` into status, step messages and logs with `replayFailure` null and gets no notice.
  - N is the 1-based position by stable ID in the current draft (`stepNumberIn`). A missing step drops "Go to step N", keeps "Open Variables" and uses the step-less wording (tests cover both `loginStepsPresent` values).
  - The guided source reads the typed `failure` carrier first, then `errorCode` plus the top-level `detail`.
- **D-4 (adopted).**
  - `ReadinessChip` shows "Saved learning cannot be reused — next Run learns from step 1" for `NEEDS_RELEARN` with `BASE_IDENTITY_INCOMPLETE`. It does not say the author changed steps.
  - The 409 start feedback offers "Learn again from step 1" only as a callback. Nothing learns on its own.
- **A3.**
  - "None of these" and a declined confirmation call `onNoneOfThese(stepId)` and never `onAnswer`. The tests assert no `choiceId` is fabricated. The cancel-then-focus part is L5b's.
  - `CANCELLED` reuses `EXECUTION_ERROR_NARRATIVES.CANCELLED` unchanged.
- **PAGE labels.**
  - A PAGE `safeLabel`, `role` and `region` are React text children (no raw-HTML path) inside `<bdi>`, with a dashed box and a "Page-derived" chip. The hostile-markup test (`clarification.test.tsx:111`) asserts there is no `img`, `script` or `b` element and that `textContent` equals the raw string.
  - Non-PAGE labels are never decorated. A null region shows no region.
- **Expiry.** `expiryWarning(expiresAt, nowMs)` is derived from `expiresAt` through the existing `parseInstant` (which accepts 1 to 9 fractional digits). The tests use fake `Date` and `setInterval`, so there is no real-time flake. A question mounted 45 s before expiry warns at once.
- **Seek.** `guidedSeekTargets` returns nothing unless `video.status === 'AVAILABLE'`. It uses only `kind: step` and `kind: action` stamps (joined on `stepId`, `admissionId` and `ordinal`) and never `prefixReplay` or `clarificationWait`. No stamp means no button. A stamp past the known length is a disabled, labelled button. Labels are "Seek to step N" and "Seek to action: <safe label>".
- **Success is the learned receipt.** `SUCCEEDED` plus `PUBLISHED` is the only "Completed" path. `PENDING` says "Saving what this run learned…". `REFUSED` or `CONFLICT` says "not ready to repeat". No outcome renders a Run-again control. `POLICY_DENIED` is read from `errorCode`. That is correct, because `POLICY_DENIED` is not in `GUIDED_FAILURE_CODES`. `INVALID_CONTRACT` gets the generic narrative (A2 negative test).
- **Standards.** Props-driven, no HTTP (the panel only calls `studioGuidedApi.videoPath`, a URL builder), no `any`, MUI `sx`, mobile-first, no a11y additions beyond MUI defaults. `VideoEvidencePanel` keeps the replay call sites unchanged (prop-discriminated union; AUTO-DECISION 1 accepted).

### Findings

| ID | Sev | Where | What | Required fix |
|---|---|---|---|---|
| **F-L5a-1** | **medium** | `guided/*.test.tsx`, `evidence/guidedEvidence.test.tsx` (no canary test in any of them: `grep -i canary` is empty) | Story AC-5(c) and plan line 103 require canaries asserting "the value is absent from the DOM, accessible names, clarification, result, explanation, ... and that the ID is present". The L4 receipt (section 4, E1, "Not in L4 scope") hands the clarification, result and explanation halves to L5a or L5b. L5a's exit list does not name them, and L5b's exit is "AC-9 flow list one-to-one". As things stand, nobody owns them. The components read only whitelisted fields, so a leak is unlikely, but the AC asks for the test. | Add one `describe('never-echo (AC-5(c); I-B6/I-C11)')` in `guided.test.tsx` (it is in L5a's write list). Render `GuidedClarification` (labelled question with a `SAVED_INPUT` choice whose label is an ID), `GuidedCompletion` (landed `loginResult`, and a `failedWith('SECRET_UNAVAILABLE')` result), `LoginRequiredNotice` and `PlanExplanation` (a `referenceIds: ['LOGIN_PW']` action). Inject `CANARY` into fields the contract never carries (an extra `value`, `secretValue`, `detail.value` or `actions[].value` key; cast through `unknown`). Assert `document.body.textContent` and `innerHTML` do not contain `CANARY` and that `LOGIN_PW` is shown. The alternative is that root assigns these three canaries in writing to L5b's AC-9 list. One of the two is required. |
| **F-L5a-2** | **medium** (commit-set condition, no code edit) | `guidedNarratives.ts:45-56` (`COPY_SOURCE_FILES`), `guided.test.tsx` copy-table tests | The 69-row copy-table tests read four files that are **untracked** (`git ls-files --error-unmatch` fails): `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/t0-rulings/ruling.md`, `.../prep-20261016/implementation-plan.md`, `.../execution-20261015/ux-implementation-plan.json`, `.../execution-20261015/architect-rulings.json`. They also quote the story's uncommitted edits (`git diff HEAD --stat` shows +321/-26). A commit that leaves these out turns 200-plus tests red on a clean checkout. Deviation 9 verdict: **ACCEPT** the doc-reading design, with this condition. | Root: put those four evidence files and the story edits in the same commit as the L5a files. Do not archive or move them while the copy table cites them. |
| F-L5a-3 | low | `guidedNarratives.ts:87-588` | Each `GUIDED_COPY` entry carries `source`, `note` and `facts` (81 `quote:` entries, 31 KB module). `guidedCopy(key)` references the whole object, so the quotes and internal repository paths (`docs/qa/evidence/...`) ship in the production bundle. | Recommended. Keep only `template` at runtime. Move `basis`, `source`, `note` and `facts` to a test-only module (for example `guidedCopySources.ts`, imported by `guided.test.tsx` only). Not blocking. |
| F-L5a-4 | low | `GuidedClarification.tsx:154-156` | When `step` is null or its `stepId` differs from the question's coordinate, the component returns `null` with no signal. In `AWAITING_CLARIFICATION` the author then sees no question while the 60 s clock runs (AUTO-DECISION 5; the P2 guarantee makes this unlikely). | Recommended. Export a predicate such as `isClarificationRenderable(step, clarification)` so L5b can detect the empty case and show the session's generic state instead of nothing. Not blocking. |
| F-L5a-5 | low (copy) | `GuidedClarification.tsx:57-58`, `succeededLines` in `GuidedCompletion.tsx:84,88`, `GuidedRunStatus.tsx:49` | (a) The 60 s warning says "expires in 60 seconds" for the whole 21 to 60 s span, so at 25 s remaining it still says 60. It is spec-literal (warnings at 60 s and 20 s). (b) Single-step ranges read "steps 2–2 learned again", "Steps 2–2 were re-learned" and "Repeating saved steps 1–1…". The tests pin "2–2". It is verbatim from the AC templates. | None required. If PO wants it, ask @po whether k = n should read "step k". |
| F-L5a-6 | low | `GuidedCompletion.tsx:141-149` | A guided `FAILED` result with `errorCode: SECRET_TOO_LONG` gets the generic narrative plus the raw code, although `run/executionErrorNarratives.ts:103` already has a `SECRET_TOO_LONG` narrative. This is the same reuse pattern as `CANCELLED`. | Optional follow-up: for failure codes that `EXECUTION_ERROR_NARRATIVES` already words (at least `SECRET_TOO_LONG`), reuse it as was done for `CANCELLED`. Not an AC requirement. |

### Q1 (from the receipt): the 21 `delegated` rows
This is root's reading of "no invented copy", not a technical question. Technical fact: each delegated row cites the clause that names @ux-design-expert as the writer and quotes the recorded fact, and the test enforces both. The components do not depend on the wording, so a PO rewrite changes `guidedNarratives.ts` only. One caution: row 25 (`expired`) takes its consequence clause from the 2026-10-15 UX note about clarification expiry and applies it to the `EXPIRED` session state. Uma flagged this as an inference, and I could not find contract text that states it either.

### Q3 (from the receipt)
`index.ts` not re-exporting `useGuidedSession` is fine. L5b imports it directly.

---

## Q2: drift numbering. CONFIRMED

**Question:** the drift sentence takes the original k from the session's `firstLearnStepId`, because `relearnedFrom.stepId` equals j after a drift. Is that right?

Verified in four places:
1. `publication-fixtures.json` `incrementalContracts.resultCases[3]` (`source-plan-failure-after-drift-retains-j`): switch `initialFirstLearnStepId` is step 3 (k) and `effectiveFirstLearnStepId` is step 2 (j). The valid result is `relearnedFrom: {stepId: step2, driftSwitchStepId: step2}`. So `stepId === driftSwitchStepId === j`.
2. `resultCases[6]` (`drift-result-cannot-report-original-k`, expected `RESULT_SWITCH`, so a negative case): `relearnedFrom {stepId: step3, driftSwitchStepId: step2}` is refused. A result may not report the original k after a drift.
3. `V21__guided_session_replaying_prefix.sql:770`: for `reason='DRIFT'` the producer builds `{'stepId': effective_step_id, 'driftSwitchStepId': effective_step_id}`.
4. Original k is on the session. `GuidedSessionService.java:686-690` sets `firstLearnStepId` once, at creation, from the start selection, and `view()` (`:2864`) copies it unchanged. Nothing rewrites it on drift. It is the boundary the session was going to reuse up to, which is what "steps j…k-1" in OBS-015 AC-4 (2) means.

D-5's literal text ("k = `stepId`; j = `driftSwitchStepId` when present") still holds for BOUNDARY, and after a drift gives k = j. Uma's implementation does not contradict it:
- "Completed — steps k–n learned again" uses `relearnedFrom.stepId`, the effective boundary. After a drift this reads j–n, and j–n is what this run learned.
- The drift line fills "j…" as j–(k0-1) when k0 is known (`GuidedCompletion.tsx:85-89`). Otherwise it falls back to the AC's literal "j…". The test pins both branches against the landed fixture (`guided.test.tsx:293`).

Two notes, neither a code change:
- **L5b baton.** The page must pass `firstLearnStepId` from the session into `GuidedCompletion` (`input.firstLearnStepId`). If it forgets, the line degrades to "Steps 2… were re-learned", which is still AC-literal. L5b's drift test should pass it.
- **Suggested PO amendment (append-only).** D-5 should state that after a prefix drift `relearnedFrom.stepId` equals `driftSwitchStepId`, and that the original k is the session's `firstLearnStepId`, so the "k = stepId" line in D-5 is not read as the original k.

---

## Required fixes (summary)

1. **F-L5a-1.** Add the AC-5(c) never-echo canaries for clarification, result and explanation (or assign them in writing to L5b's AC-9 list).
2. **F-L5a-2.** Commit the four untracked `docs/qa/evidence/STUDIO-OBS-008/...` source files and the story edits together with the L5a files.
3. Root bookkeeping for L4: record DV-1 in L4's write set, and settle DV-3 (the `templates/index.ts` re-export, plus the `PRODUCTION_ALPHA_TEMPLATES` grep in L5b's verify).

Everything else above is optional or low.

## Not claimed
- I did not run `studioWcagAudit.test.tsx`, the full vitest suite, `pnpm run lint` over `src`, any backend command or any Playwright spec.
- I did not mutate any file, so the statements about canary strength are from reading the assertions, plus the receipt's two reported mutation checks, which I did not reproduce.
- The page-level flows (`ChecksStudioPage`, cancel-then-focus, `replayFailure` precedence, the drift "Learn again" conditions) are L5b's and were not reviewed here.
