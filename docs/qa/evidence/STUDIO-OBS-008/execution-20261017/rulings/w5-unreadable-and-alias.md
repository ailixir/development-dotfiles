# STUDIO-OBS-008 U1: W5-1 (unreadable stored session) and W5-2 (secret alias)

Author: Aria (@architect), 2026-10-17. I only read source. I ran no Gradle, Vitest or Playwright, edited no source and made no git write.
Inputs: `w5-reviews/dex-technical-review.md` W5-1/W5-2 and `logs/`; `lanes/L5b/receipt.md` §F2; `lanes/tech-gate-L5b/review.md` F-L5b-3/4; story D-3, D-8 (`STUDIO-OBS-008.story.md:107`, `:123`).
Labels: **[V]** means I read the cited line or Dex's log. **[I]** means inferred and not executed.

## 1. W5-1: what `LEARNING` proves

| # | Fact | |
|---|---|---|
| 1 | `LEARNING_QUERY` checks whether a session with this `test_id` exists with `expires_at > now()` and a state outside the six terminal states. It covers any principal and any tab (`ExecutionReadinessService.java:88-91`). The terminal set matches `GuidedSessionService.java:22-24`. | [V] |
| 2 | **Not exactly "while a non-terminal session exists".** `READY` is decided first (`:122-124`), and `LEARNING` is only reached when the test is not ready (`:125-128`). A learn-again session on a `READY` test (D-3) therefore reads `READY`. An expired session that is not yet terminal is not counted. | [V] |
| 3 | `UNLEARNED` and `NEEDS_RELEARN` are returned only after `LEARNING_QUERY` answered false (`:129-136`). | [V] |
| 4 | "Not live" is permanent. `expires_at` is immutable (`V14__guided_sessions.sql:71-72`) and terminal states are absorbing (`:74-75`). Finalize needs `FINALIZING` and `expires_at > clock_timestamp()` (`GuidedPublicationRepository.java:407-408`). Actions need an unexpired session (`GuidedSessionService.java:2599-2612`). So a non-live session can never learn or publish again, and its pointer's `finalizeKey` is worthless. | [V] |
| 5 | A `sessionId` reaches the client only from a committed start. It is generated (`:683`) and inserted (`:732`) inside `repository.transaction` (`GuidedSessionRepository.java:34-35`, `TransactionTemplate.execute`; the controller has no `@Transactional`). The response leaves after commit. The hook writes `sessionId` only from that response (`useGuidedSession.ts:342-343`). `unreadable` needs a known `sessionId` (`:507-509`, `:643`). | [V] |
| 6 | Start does not check for other live sessions. It takes only a per-(principal, test) lock and an idempotency lookup (`:635-643`). Protection against a double learn is therefore client-side: the pointer, plus the gate's fresh read refusing `busy` (`useRunGate.ts:490-506`). | [V] |
| 7 | A persistent 409 is real. `read` runs `checkCurrent` on every read, terminal sessions included (`GuidedSessionService.java:753-759`), and `checkCurrent` answers 409 `SECRET_USE_REVOKED` (`GuidedProductionSessionAccess.java:118-135`). | [V] |

**Safety argument.** Take a `GET /tests/{id}` sent after the client holds session S's id. If it answers `UNLEARNED` or `NEEDS_RELEARN`, S was not live at that snapshot (facts 3 and 5), so S can never learn or publish again (fact 4). Dropping the pointer discards nothing live. A later start still passes the gate's fresh read (fact 6), the same path a tab with no pointer uses.

**Races.**
- (a) "Created but not yet visible" cannot happen for a known `sessionId` (fact 5). A pointer with `sessionId: null` is never `unreadable` and keeps today's rule: re-POST the same body and key, which the server deduplicates.
- (b) Ordering: the readiness request must be sent after the refused read's response was received. Never reuse an earlier body, such as the gate's mount read or the list projection.
- (c) Residuals, not created by this rule: two simultaneous starts from two tabs or users (fact 6), and app versus DB clock skew at S's expiry. S cannot publish in that window, because finalize uses the DB clock [I].

## 2. Ruling 1

**Yes.** The client may drop the stored pointer when the session is `unreadable` **and** a fresh `GET /tests/{id}`, sent after the refusal, answers `UNLEARNED` or `NEEDS_RELEARN`. Keep the pointer on `READY` (fact 2), on `LEARNING`, or when the readiness read fails. The rule does not depend on the refusal's status (400, 409 or 401), because the proof rests on readiness alone. It supersedes the F-L5b-3 "keep the pointer" ruling only where readiness proves the session is dead.

**READY replay is never blocked by `unreadable`** [V]. Replay is `POST /tests/{id}/execute` (`useRunGate.ts:519`). It neither reads nor starts a guided session, and the server's only gate is `requireReady` (`ExecutionReadinessService.java:285-291`).

| Fresh readiness | Pointer | Run | Visible text |
|---|---|---|---|
| (answer pending) | kept | replay: enabled; learn/relearn/busy: disabled | caption only when not in replay mode |
| `UNLEARNED` / `NEEDS_RELEARN` | **dropped** (`guided.clear()`) | the gate re-reads, then learn or relearn is enabled. **Nothing starts on its own.** | no caption |
| `READY` | kept | replay enabled. Learn-again stays blocked. | no caption under Run. The caption appears when a learn-again is requested or offered (W5-11), never silently. |
| `LEARNING` / read failed | kept | disabled (busy, or blocked) | caption |

**Re-check.** Send one `GET /tests/{id}` when `unreadable` turns true, and one more on each "Refresh test information" press while `unreadable`. There is no timer, no poll and no automatic retry, consistent with F-L5b-5.

## 3. Instructions: W5-1 (frontend implementer)

1. **`ChecksStudioPage.tsx`**: add an effect keyed on `guided.unreadable` and on a new `unreadableRecheck` counter. Bump that counter in the Refresh button handler (`:1384-1386`) only while `guided.unreadable` is true.
   - When the effect runs, capture `id = selectedScenario` and `sid = followedSessionId`, then call `studioApi.getTest(id)`.
   - On the answer, check that `latestSelectionRef.current === id`, that a ref of `followedSessionId` still equals `sid`, and that a ref of `guided.unreadable` is still true.
   - If all three hold and `readiness` is `UNLEARNED` or `NEEDS_RELEARN`, call `guided.clear()` and then `setGuidedRefresh(c => c + 1)`, so the gate re-reads (`:1034`).
   - Do **not** call `replaceScenario`, because it would overwrite a dirty draft.
   - Ignore errors: the state stays as it is.
2. **`RunControl.tsx`**:
   - Set `:136` to `runnable = gate.canRun && hasSteps && !(sessionUnreadable && gate.mode !== 'replay')`.
   - Show the caption (`:293-302`) when `sessionUnreadable && !isRunning && (gate.mode !== 'replay' || learnBlocked)`. `learnBlocked` is set when a `learnRequest` arrives while `sessionUnreadable` (`:183-188`) and is cleared on the next activation.
   - Add `|| sessionUnreadable` to `GuidedStartFeedback` `disabled` (`:232`), and update the prop doc (`:102-107`).
3. **Copy, row `sessionUnreadable`** (@ux-design-expert confirms, same basis and source):
   - The sentence must not claim that a reload clears the state, because a reload re-reads the same refusal.
   - It must state the state and its consequence for learning only.
   - Draft: "Studio could not read the learning Run already started for this test, so it starts no new learning Run here. Refresh test information to check again."
   - Keep the `facts` quote. Keep `useGuidedSession.ts:45` verbatim (W5-7), and update only the header bullet at `:57-61`.

## 4. Ruling 2 (W5-2)

**Backend rule [V].** `IncrementalAuthoringIdentity.resolve` refuses in four cases:
- a duplicate `name` (`:71-73`);
- a `secretRef` without a pattern-valid `secretId` (`:63-70`);
- two `secretRef`s with the same `secretId` but different declarations (`:77-80`);
- any `secretRef` whose `secretId` equals the **name** of another declaration that is not a `secretRef` with that same `secretId` (`:83-90`).

All four refusals are `422 INVALID_CONTRACT` / `AUTHORING_REFERENCE_AMBIGUOUS` (`:379-382`). The refusal happens at start: `GuidedSessionService.java:643` → `GuidedProductionSessionAccess.java:85` → `GuidedSourceClassifier.java:69-79`, and the HTTP status is `failure.status()` (`GuidedSessionController.java:103-105`). `VariableReferenceValidator.java:113-117` is narrower (plain name against `secretId` only). Dex's probe confirms the outcome: rules 1 and 3 accepted, rules 4a and 4b refused (`logs/probe-backend-ambiguity.log`).

**Client ruling.** Delete rule 4 (the alias). In `declareInsertedSecret`, before rules 1 to 3, refuse when **any row whose trimmed name equals ID is not a secret row whose `secretId` is ID or empty**. This also catches an already ambiguous set, such as a plain `USER_ID` plus `LOGIN→USER_ID`, which the backend refuses for the whole test anyway. Keep rules 1, 2 and 3: rule 2 yields rule 3's shape.

On a refusal, insert **nothing**: no token and no row. A token without a declaration would fail at start with `AUTHORING_REFERENCE_MISSING`.

**MSW: no change to `handlers.ts` in U1.**
- Its route already mirrors the backend validator's `conflicting` rule (`handlers.ts:192` against `VariableReferenceValidator.java:113-117`).
- The real refusal is at start with HTTP 422, which `startGuidedSession` does not declare. It lists 400/401/403/409/429 (`openapi.yaml:1345-1416`), and `grep "'422'"` finds 0. A mirror check would invent a status (Article IV).
- The page test asserts the client refusal directly.
- **Carry to root (backend or contract owner, not U1):** declare the start 422, or remap it. Then add to the *start* mirror (`guidedHandlers.ts:562`, not `handlers.ts`) exactly the four refusals listed above. The same carry covers the Variables dialog, which can still save an ambiguous set by hand.
- **D-8 residue [V]:** `handlers.ts:177` still has `variable.secretId ?? variable.name`, which the plan gave to L2a to remove (`prep-20261016/implementation-plan.md:41`; story `:123`). The page cannot reach it, because `toContractVariables` drops secret rows that have no `secretId` (`ChecksStudioPage.tsx:141-150`). Root decides: remove it (`:164`, `:177`) if `handlers.ts` is opened, otherwise record it in the Dev Agent Record.

## 5. Instructions: W5-2

1. **`secretDeclaration.ts`**: return `{ ok: true; rows } | { ok: false; reason: 'nameTaken' }`; remove the alias loop and `MAX_NAME_LENGTH`; rewrite the comment to cite `IncrementalAuthoringIdentity.java:83-90`. Optional: a `crypto.randomUUID()` row id (W5-12).
2. **`ChecksStudioPage.tsx` `insertReference` (`:881-911`)**:
   - For a secret, decide first against the current `variablesList` (add it to deps, or use a ref).
   - If refused, set `referenceRefusal`, render it as a caption (`data-testid="reference-insert-refused"`) under the picker (`:1362`), and return without placing the token.
   - Clear it on the next successful insert or when the test changes.
3. **Copy, new row** (@ux-design-expert, cited basis): name the ID, say that a variable with that name already exists, and say it must be renamed in Variables. Draft: "A variable named USER_ID already exists in this test. Rename it in Variables to use the secret USER_ID."

## 6. Tests (each red first on today's tree; record the red log)

| # | File | Case | Red today because |
|---|---|---|---|
| T1 | `pageGuidedRun.test.tsx` | Dex's probe: `readyDraft` + pointer + read 409. Run is enabled, the mode is `replay`, there is no caption, and one press sends 1 execute and 0 starts. The pointer is kept. | disabled (`probe-ready-unreadable.log`) |
| T2 | same, `it.each` over 400/409 × `UNLEARNED`/`NEEDS_RELEARN` | The pointer is removed, there is no caption, and Run is enabled in learn or relearn mode. Before the press there are 0 starts. One press sends 1 start whose `Idempotency-Key` differs from `start-key-probe`. In the request log, the deciding `GET /tests/{id}` comes after the refused read. | pointer kept, Run off |
| T3 | same (replaces the two F-L5b-3 tests) | Draft readiness `LEARNING`: the pointer is kept, Run is disabled, the new caption shows and there are 0 starts. Then the served readiness becomes `UNLEARNED`, and a Refresh press sends exactly 1 more `GET /tests/{id}`; the pointer is dropped and Run is enabled. | no re-check; old copy |
| T4 | same | The readiness read answers 503: exactly 1 GET from the check, no retry, the pointer is kept, and the caption shows. | the check does not exist |
| T5 | same | `READY` + unreadable + a "Learn again from step N" request: 0 starts and the caption is visible (W5-11). | silent, no caption |
| T6 | same | Stale answer: `GET /tests/{id}` is delayed and the author selects another test first. The original pointer is untouched. | the check does not exist (write it with T2) |
| T7 | `secretDeclaration.test.ts` | Refused for a plain `ID`, a secret `ID→OTHER`, and plain `USER_ID` + `LOGIN→USER_ID`. Rules 1, 2 and 3 still pass. A parity table with Dex's 4 probe cases (rule3 ok, rule1 ok, 4a refused, 4b refused). Delete the alias and 64-character cases. | the alias is returned |
| T8 | `pageReplayAndReferences.test.tsx` F-L5b-4 (rewrite) | Plain `USER_ID` + Vault `USER_ID`; insert `<secret USER_ID>`. The step text is unchanged, no row is added, `reference-insert-refused` shows, and the saved body has no new variable. | token inserted, `USER_ID_2` added |
| T9 | `guided.test.tsx` copy rows | New `sessionUnreadable` template and the new insert-refusal row. The quote tests stay green. | old template |

Mutations to run after green: clear on `LEARNING` (T3 must fail); clear on `READY` (T1 must fail); decide from the gate's mount read (T2's ordering assertion must fail); restore the alias (T7/T8 must fail). Also run W5-3's hook tests and Dex's F2 verify set (`dex-technical-review.md` §8.2).
