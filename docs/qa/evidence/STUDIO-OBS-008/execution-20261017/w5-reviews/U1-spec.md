# STUDIO-OBS-008 unfreeze unit U1: specification

- **Author:** Uma (@ux-design-expert), YOLO. **Date:** 2026-10-17. **Story:** `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` (sha256 `04091be7…`).
- **Binding ruling:** Aria, `rulings/w5-unreadable-and-alias.md` (sha256 `3fbf9dcb…`), relayed as binding by root. W5-1 and W5-2 follow it, including its tests T1–T9 and its mutation list. Where this spec adds detail or deviates, the item is marked **[AUTO-DECISION]** (§8).
- **Inputs (sha256):**
  - `w5-reviews/uma-ux-copy-review.md` `afcee10d…`
  - `w5-reviews/dex-technical-review.md` `06b2c52d…`
  - `rulings/q9-authored-literal-trigger.md` `d2d14aec…`
  - `lanes/L5b/receipt.md` `5cf7be19…`
  - `final-gates/freeze-manifest.json` `067ef2a7…`. Its digest is `eea9c8de…` and its head is `734ad704f`.
- **What I did:** I read source and ran read-only commands only:
  - `shasum`;
  - a Python hash compare against the freeze manifest: all **24** write-set files **MATCH**;
  - `grep -F` for every new copy-table quote: all **16** exist verbatim.
- **What I did not do:** I edited no source file and made no git write. I ran no Vitest, Playwright or Gradle. I did not touch `dispatch-governance.js`.
- **Not run:** the SYNAPSE diagnostics and `checklist-runner` skills that were appended to the spawn prompt. No checklist was named, and the mission defines the work.
- **ADR-SC-006:** nothing here is accessibility work. No ARIA, live region, keyboard or focus change is added. UX-02 changes the selected tab and moves no focus.

## 1. Disposition

| Class | IN U1 | Carried / out |
|---|---|---|
| Medium (UX-01…05) | **5**: UX-01, UX-02, UX-03, UX-04, UX-05 | 0. The optional UX-02 cue is not taken (§7.1) |
| Low (UX-06…21), false or empty visible text | **7**: UX-06, UX-07, UX-09 (completion forms), UX-12, UX-13 (silent no-op), UX-15 (via W5-1), UX-16 | **9** whole Lows, plus the UX-09 prefix part and the UX-13 "that step" part (§7.1) |
| Dex | **W5-1, W5-2, W5-3, W5-4, W5-5**, and W5-11 (falls out of W5-1) | W5-6 → **C-OBS008-3** (§7.2). W5-7…W5-10, W5-12 and W5-13 are not taken (§7.5) |
| Test-only | `StudioScheduleDialog.test.tsx:73` race | — |
| User decision | — | OBS-1 "Someone pressed Stop" (R5), unchanged (§7.3) |
| Root carries (Aria §4) | — | start 422 contract divergence; `handlers.ts:177` fallback (§7.4) |

## 2. Copy delta

All keys are in `frontend/src/components/studio/guided/guidedNarratives.ts` `GUIDED_COPY` (`S.*` are `COPY_SOURCE_FILES` entries).

Row names follow `guided.test.tsx`'s copy table:
- `K: its quote is in the cited file`, for every key;
- `K: verbatim, so…`, for verbatim keys;
- `K: adapted or delegated, so…`, for adapted and delegated keys;
- `K: delegated, so the fact…`, for delegated keys.

The copy table grows from **71 entries / 168 rows to 78 entries / 185 rows** (+17 rows).

**Add to `COPY_SOURCE_FILES`:**
- `executionProgressView: 'frontend/src/components/studio/run/ExecutionProgressView.tsx'`
- `w5Ruling: 'docs/qa/evidence/STUDIO-OBS-008/execution-20261017/rulings/w5-unreadable-and-alias.md'`. This file is untracked, so the W5-7 commit-set note grows by one file.

| # | Key | Current text | New text (final) | Basis / citation | Copy-table rows |
|---|---|---|---|---|---|
| UX-01a | `guidedStartUnavailable` (**new**) | Reused replay narrative: title "This saved test needs to be refreshed" / "The saved test is not compatible with the service running it now. Nothing was started." / "Save the test again, then run it." | No title. "Studio could not start learning for this test, so nothing was started." | delegated. source `AC3_COPY_BY_UMA`; facts `S.story` "A \`RUNTIME_INCOMPATIBLE\` start refusal names no cause." (D-11). note: "W5 UX-01: guided start refused, or capability unavailable, with RUNTIME_INCOMPATIBLE. Names no cause and no remedy; the code follows. Architect P4 'unavailable/notready copy'. The replay execute narrative is unchanged." | +3 (`guidedStartUnavailable: …` ×3) |
| UX-01b | `reasonShownBelow` (**new**) | — | "The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket." Then the code in `guided-start-feedback-code`: `RUNTIME_INCOMPATIBLE`, or `RUNTIME_INCOMPATIBLE <messageCode>` when a different messageCode arrived | verbatim, `S.executeRefusals`, same quote | +2 |
| UX-03 | `authoredLiteralTargetNotFound` (changed; key name kept for OBS-009 AE-01 f) | "Studio cannot see page text that matches a value written in this step. Try rewording the step, for example by checking for a longer or different piece of visible text." | "This may be because of step {N}: Studio cannot see page text that matches a value written in a step. If so, try rewording step {N}, for example by checking for a longer or different piece of visible text." | delegated; source and facts unchanged (story item b). Append to note: "W5 UX-03: hedged so it stays true on Q9 §5 R2 (a model, CSI, cap or window BUDGET_EXCEEDED: 'true there but may be irrelevant'); 'a step' covers R1 (cross-step). N = draft position of failedStepIdOf (Q9 §3 condition 3)." | 3 rows, content only |
| UX-04 | `learningElsewhere` (changed) | "Another Run is learning this test, so Run is off until that Run ends." | "Another Run is learning this test, so Run is off. It stays off until that Run ends and this page reads the test again: press Refresh test information, or reload the page." | delegated; source and facts unchanged (`LEARNING_QUERY`). Append to note: "W5 UX-04: Run does not come back by itself. The gate re-reads only when refreshToken changes (ChecksStudioPage.tsx:1034); Refresh test information re-reads the list readiness (:512-523), and nothing polls another client's session (F-L5b-5)." | 3 rows, content only |
| UX-05 | `unknownOutcomeConsequence` (**new**; second line under `unknownOutcome`) | (only "Stopped — submission outcome unknown.") | "Studio could not confirm whether its last action on the page took effect, and it will not repeat that action on its own. Check the application before you Run again." | delegated. source `AC3_COPY_BY_UMA`; facts `S.consensusPlan` "Do not automatically repeat a click, submit, create, delete or fill after uncertain dispatch." note: "W5 UX-05: UNKNOWN_OUTCOME consequence; AC-3 no Run-again control is kept." | +3 |
| UX-06 | `expiresIn60` (changed; verbatim → adapted) | "This question expires in 60 seconds. If it expires, …" (shown from 60 s to 21 s) | "This question expires within a minute. If it expires, this run will stop and you will need to Run again." | adapted; source unchanged (`S.uxPlan` 60 s row). note: "'in 60 seconds' → 'within a minute': shown while 20 s < remaining ≤ 60 s (GuidedClarification.tsx:57-58), so a fixed figure overstated the time (W5 UX-06; F-L5a-5(a)). Consequence clause unchanged." | `verbatim` row → `adapted or delegated` row |
| UX-06 | `expiresIn20` (changed; verbatim → adapted) | "This question expires in 20 seconds. If it expires, …" | "This question expires within 20 seconds. If it expires, this run will stop and you will need to Run again." | adapted; source unchanged. note: "'in' → 'within': shown while 0 < remaining ≤ 20 s." | same as above |
| UX-07 | `loginStepGone` (reused; no template change) | Drift on a step gone from the draft: "Step {stepIndex+1} no longer matches the page…" only. The editor's step N is a different step | Same sentence, then a second line: "The step where this happened is no longer in your steps." | Reuse; append to note: "Also under a replay drift whose step is gone from the draft (W5 UX-07)." | content only |
| UX-09 | `completedPartialOne` (**new**) | "Completed — steps 5–5 learned again." | "Completed — step {k} learned again." (when k = n) | adapted, `S.story` "Completed — steps k–n learned again." note: "Singular form when the range is one step (W5 UX-09; F-L5a-5(b))." | +2 |
| UX-09 | `relearnedAfterPrefixDriftOne` (**new**) | "Steps 2–2 were re-learned because the page changed." | "Step {j} was re-learned because the page changed." (when j = k-1) | adapted, `S.story` "steps j… were re-learned because the page changed". note: "Singular form of relearnedAfterPrefixDrift when the window is one step." | +2 |
| UX-12 | `failedNoReason` (**new**) | `FAILED` with no failure code and `errorCode: null`: "This run stopped. The reason the server gave is shown below…", with nothing below | "This run stopped, and the server gave no reason for it, so there is nothing here to explain it." | adapted, `S.executionProgressView` "so there is nothing here to explain it." note: "UNNAMED_ERROR_STATEMENT's clause for a guided FAILED result whose failure and errorCode are both null; its browser clause is dropped (a guided result makes no browser claim). W5 UX-12: failedUnnamed pointed 'below' at nothing." | +2 |
| UX-13 | `revisionNotReady` (reused; no change) | Explicit "Learn again from step N" or "…from step 1" whose conditions fail on the fresh read: **nothing shown** | The existing sentence in `guided-start-mismatch`: "This test is not ready to start learning from that step, so nothing was started. Press Run again to start from the latest saved steps." | Reuse; "that step" has its referent in the pressed button. Append to note: "Also when an explicit learn's conditions fail on the fresh read (W5 UX-13)." | content only |
| W5-1 / UX-15 | `sessionUnreadable` (changed) | "Studio could not read the Run already started for this test, so Run is off until a page reload reads it." | "Studio could not read the learning Run already started for this test, so it starts no new learning Run here. Press Refresh test information to check again." | delegated; source `S.adrSc006` and facts (`useGuidedSession.ts:45` quote) unchanged. Note → "W5-1 ruling w5-unreadable-and-alias §2-3 (Aria's draft, 'Press' added). States the state and its consequence for learning only; never claims a reload clears it (a reload re-reads the same refusal). Shown when Run is off in learn/relearn/busy mode, or when a learn-again was requested on a READY replay." | 3 rows, content only |
| W5-2 | `secretNameTaken` (**new**; rendered under the reference picker) | (the insert was made under the alias `ID_2`) | "The secret {ID} was not inserted, because this test already has a variable named {ID}. Rename that variable in Variables, then insert the secret again." | delegated. source `S.w5Ruling` "(@ux-design-expert, cited basis): name the ID, say that a variable with that name already exists, and say it must be renamed in Variables"; facts `S.w5Ruling` "any \`secretRef\` whose \`secretId\` equals the **name** of another declaration that is not a \`secretRef\` with that same \`secretId\`". note: "W5-2: Aria's draft plus the state (not inserted). 'Variable' is the Variables dialog's word for every row." | +3 |

**Header comment of `guidedNarratives.ts` (lines 28-32).** Replace it with: "Three narratives are reused, not copied: the replay `CANCELLED` narrative (…unchanged text…), the `403` refusal and the undeclared-refusal wording (`executeRefusals.ts`; architect P4: 'Existing refusal'), and the `READY` chip (`runEnablement.ts`). The guided `RUNTIME_INCOMPATIBLE` start refusal has its own rows (`guidedStartUnavailable`, `reasonShownBelow`): the replay narrative's 'Save the test again' is no remedy for guided learning, and D-11 says it names no cause (W5 UX-01)."

Also delete the `RUNTIME_INCOMPATIBLE_REFUSAL` export (`:671-672`) and the now-unused `EXECUTE_CONFLICT_NARRATIVES` import (`:4`).

**UX-22 (record only, no source change), recorded here.** The two page variants are recorded as **adapted** from L4 §5 "Use in Studio steps as <var NAME>". The secret clause is dropped or added with the `vaultSecrets` capability (GA C-7):
- "A name in <var NAME> has to match a row in Variables." (`ChecksStudioPage.tsx:1184-1185`, secrets off);
- "Use in steps as: <var NAME> or <secret SECRET_ID>" (`:1698`, secrets on).

## 3. Code changes (each behaviour change is red first: write or change the test, run it on the frozen bytes, save the failing log, then change the source)

Paths are under `frontend/src/`. "RED" names the assertion that fails on today's tree.

### UX-01: RUNTIME_INCOMPATIBLE start feedback (`components/studio/guided/GuidedCompletion.tsx`)

**Source changes:**
- Imports: drop `RUNTIME_INCOMPATIBLE_REFUSAL`.
- Add:
  ```ts
  function runtimeIncompatibleView(code: string): GuidedStartFeedbackView {
    return { title: null, lines: [guidedCopy('guidedStartUnavailable'), guidedCopy('reasonShownBelow')], code, action: null };
  }
  ```
- `guidedStartFeedbackView`, the `unavailable` branch: `input.code === 'FORBIDDEN_SCOPE' ? narrativeView(FORBIDDEN_REFUSAL) : runtimeIncompatibleView(input.code)`.
- The `case 'RUNTIME_INCOMPATIBLE':` branch: `return runtimeIncompatibleView(error.messageCode && error.messageCode !== error.code ? \`${error.code} ${error.messageCode}\` : error.code);`.
- Module comment, last bullet: add "RUNTIME_INCOMPATIBLE names no cause and shows the code (W5 UX-01)".
- `components/studio/guided/index.ts`: remove the `RUNTIME_INCOMPATIBLE_REFUSAL` re-export (`:48`).

**Tests:**
- `guided.test.tsx`: replace `RUNTIME_INCOMPATIBLE and FORBIDDEN reuse the existing refusals…` (`:514-527`) with two tests.
  - **RED** `RUNTIME_INCOMPATIBLE, refused or unavailable, says learning could not start and shows the code; no cause, no "save again" (D-11, W5 UX-01)`.
    - Both inputs equal `{title: null, lines: [guidedStartUnavailable, reasonShownBelow], code: 'RUNTIME_INCOMPATIBLE', action: null}`. The refusal input is `refusal(409, {code:'RUNTIME_INCOMPATIBLE', messageCode:'RUNTIME_INCOMPATIBLE'})`; the other is `{kind:'unavailable', code:'RUNTIME_INCOMPATIBLE'}`.
    - `JSON.stringify(view)` contains none of `EXECUTE_CONFLICT_NARRATIVES.RUNTIME_INCOMPATIBLE`'s title, explanation or remedy.
  - `FORBIDDEN reuses the existing refusal` keeps today's two FORBIDDEN assertions.
- `runGate.test.tsx` `(g)`: **RED**.
  - The feedback contains `guidedCopy('guidedStartUnavailable')`.
  - `guided-start-feedback-code` reads `RUNTIME_INCOMPATIBLE`.
  - The feedback does not contain "Save the test again".

### UX-02: Proof tab on start and on a question (`pages/ChecksStudioPage/ChecksStudioPage.tsx`)

**Source changes.** After `openVariables` (`:346`), add:
```ts
// W5 UX-02: a guided Run's status, question and result are on the Proof tab. No focus moves.
useEffect(() => { if (guidedSessionId !== null) setRightTab('proof'); }, [guidedSessionId]);
const questionKey = guided.clarification === null ? null
  : `${guided.clarification.clarificationId}:${guided.clarification.generation}`;
useEffect(() => { if (questionKey !== null) setRightTab('proof'); }, [questionKey]);
```
The effects are keyed on identities, so an author who opens Logs is not pulled back on every poll, only by a new session or a new question.

**Tests** (`pageGuidedRun.test.tsx`, new describe `W5 UX-02: a guided Run is shown on the Proof tab`):
- **RED** `a guided start selects the Proof tab when Logs was open`:
  - click tab "Logs", then press Run;
  - await `guided-run`;
  - tab "Proof" has `aria-selected="true"`, and `#studio-panel-proof` is not `hidden`.
- **RED** `a question that arrives while Logs is open selects the Proof tab`:
  - setup: `setGuidedLatency('clarification', 1500)` (import it from `guidedHandlers`) and `setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 2), unlearnedDraft.id)`;
  - press Run, await `guided-run`, click "Logs", and assert Logs is selected;
  - await `guided-clarification`; then Proof is selected.

### UX-03: hedged hint naming step N

**Source changes:**
- `pages/ChecksStudioPage/authoredLiteralHint.ts`:
  - Rename `authoredLiteralHintApplies` to **`authoredLiteralHintStep(result, draftSteps): number | null`**. It keeps the same four checks and returns the 1-based draft index + 1 of the failing step, or `null`.
  - Module comment R1: "(no hint: the copy says 'this step')" → "(no hint unless that step also carries a literal; the copy names step N and is hedged)".
- `GuidedCompletion.tsx`:
  - The prop `authoredLiteralHint?: boolean` becomes **`authoredLiteralHintStep?: number | null`**, with its doc updated.
  - `const hint = authoredLiteralHintStep != null && (view.kind === 'failed' || view.kind === 'failedUnnamed') ? guidedCopy('authoredLiteralTargetNotFound', { N: authoredLiteralHintStep }) : null;`
- Page `:1499`: `authoredLiteralHintStep={authoredLiteralHintStep(guided.result, testSteps)}`, with the import renamed.

**Tests:**
- `authoredLiteralHint.test.ts` (**RED**: import of the renamed function):
  - every `authoredLiteralHintApplies(…)` → `authoredLiteralHintStep(…)`;
  - `.toBe(true)` → `.toBe(2)`;
  - `.toBe(false)` → `.toBeNull()`.
- `guided.test.tsx`:
  - `renderCompletion` extra `hint: boolean` → `hintStep?: number`, passed as `authoredLiteralHintStep`.
  - The KL-015-Q4 test **RED**: with `hintStep: 2`, the hint has the text `guidedCopy('authoredLiteralTargetNotFound', { N: 2 })` and contains "step 2". With no step, there is no hint.
- `pageGuidedRun.test.tsx`: both `const HINT = guidedCopy('authoredLiteralTargetNotFound')` (`:676`, `:728`) → `guidedCopy('authoredLiteralTargetNotFound', { N: 2 })`. The literal step is draft step 2 in both describes.

### UX-04: `learningElsewhere` wording

Copy only.

**Tests:**
- `runGate.test.tsx` `(f2)` `:311-313`: **RED** with `guidedCopy('learningElsewhere')`, and the text contains "Refresh test information".
- `pageGuidedRun.test.tsx` `:811-813`: the literal → `guidedCopy('learningElsewhere')`.

### UX-05: unknown-outcome consequence (`GuidedCompletion.tsx`)

`case 'UNKNOWN_OUTCOME': return { kind: 'unknownOutcome', lines: [guidedCopy('unknownOutcome'), guidedCopy('unknownOutcomeConsequence')] };`

**Tests:**
- `guided.test.tsx` `:339` **RED**: `guidedCompletionView(result).lines` equals both lines; there is still no button.
- `pageGuidedRun.test.tsx` `:553` **RED**: `completion` also has the text `guidedCopy('unknownOutcomeConsequence')`.

### UX-06: expiry wording

Copy only. `GuidedClarification.tsx` is unchanged.

**Tests** (`clarification.test.tsx`):
- `:208-209`, `:225-226`: the literals → the new sentences.
- `:221`: `'expires in 60 seconds'` → `'expires within a minute'`.
- **RED** new `it('at 25 s left the warning does not claim 60 seconds (W5 UX-06)')`: `expiryWarning(EXPIRES, at(25))` does not contain "60 seconds" and equals `GUIDED_COPY.expiresIn60.template`.

### UX-07: drift on a step gone from the draft (`components/studio/run/ExecutionProgressView.tsx`)

**Source change.** In `ReplayFailureNotice`'s drift branch, after the `replay-drift` Typography (`:291-293`):
```tsx
{context !== undefined && draftNumber === null && (
  <Typography variant="body2" data-testid="replay-drift-step-gone" sx={{ overflowWrap: 'anywhere' }}>
    {guidedCopy('loginStepGone')}
  </Typography>
)}
```

**Tests** (`replayFailure.test.tsx`): **RED** new `it` in "A1.6 case 4": `the drifted step is no longer in the draft: the run's numbering is kept and the sentence says the step is gone (W5 UX-07)`.
- With draft `[fixtureStepId(0), fixtureStepId(2)]`, `replay-drift-step-gone` has the text `GUIDED_COPY.loginStepGone.template`.
- With the full draft, and with no context, it is absent.

### UX-09: singular completion forms (`GuidedCompletion.tsx` `succeededLines`)

**Source changes:**
- `const lines = [k === n ? guidedCopy('completedPartialOne', { k }) : guidedCopy('completedPartial', { k, n })];`
- Drift window: when `initialK !== null && initialK > j`:
  - if `initialK - 1 === j`, push `guidedCopy('relearnedAfterPrefixDriftOne', { j })`;
  - otherwise push `guidedCopy('relearnedAfterPrefixDrift', { 'j…': stepRange(j, initialK - 1) })`.
- The `${j}…` fallback is unchanged.
- The `REPLAYING_PREFIX` "1–1" form is **not** changed (§7.1).

**Tests** (`guided.test.tsx`, **RED**):
- `:295` → `'Completed — step 2 learned again.'`.
- `:310` → `lines: [\`Completed — steps 2–${n} learned again.\`, 'Step 2 was re-learned because the page changed.']`.

### UX-12: no reason given (`GuidedCompletion.tsx`)

**Source change.** In the `FAILED` case, before the final return: `if (code === null || code === undefined) return { kind: 'failedUnnamed', code: null, lines: [guidedCopy('failedNoReason')] };`

**Tests** (`guided.test.tsx`): **RED** new `it('FAILED with no failure and no errorCode says the server gave no reason, with no code line (W5 UX-12)')`.
- Setup: `loginResult()`, delete `detail`, `errorCode = null`, `failure = null`.
- The lines equal `[failedNoReason]`.
- There is no `guided-completion-code`, and the text does not contain "shown below".

### UX-13: the silent learn-again (`components/studio/run/useRunGate.ts`)

**Source change.** At `:494-498`: `if (hints === null) { if (mounted.current) setLearnBlock({ kind: 'mismatch' }); settle(); return; }`. In the `LearnStartBlock` doc, add "or an explicit learn whose conditions no longer hold on the fresh read".

**Tests** (`runGate.test.tsx`, **RED**):
- `(j)` second half (superseded revision): also `expect(await screen.findByTestId('guided-start-mismatch')).toHaveTextContent(guidedCopy('revisionNotReady'))`.
- `(j2)`: the same assertion; its title gains "…, and says so".

### UX-16: no "Saving…" beside "Steps not ready to repeat." (`ChecksStudioPage.tsx`)

**Source change.** Add `const finalizeHeld = guidedState === 'FINALIZING' && (guided.pending === 'NOT_READY' || guided.pending === 'REAUTHENTICATION_REQUIRED');` and wrap `:1478`: `{!finalizeHeld && <GuidedRunStatus … />}`.

**Tests** (`pageGuidedRun.test.tsx` `finalize refused by %s` `:888-907`): **RED**. After `settle(150)`: `expect(screen.queryByText(guidedCopy('finalizing'))).toBeNull()` in all three cases.

### W5-1: unreadable stored session, per Aria §2–3 (her table; variants (a)/(b) dropped)

**`ChecksStudioPage.tsx`:**
- State and refs:
  - `const [unreadableRecheck, setUnreadableRecheck] = useState(0);`
  - `followedSessionRef` and `unreadableRef`, assigned `= followedSessionId` / `= guided.unreadable` on every render.
- Place the effect after the `guidedRefresh` effect (`:786-803`):
  ```ts
  const { clear: clearGuided } = guided;
  useEffect(() => {
    if (!guided.unreadable) return;
    const id = selectedScenario; const sid = followedSessionId;
    if (!id || !sid) return;
    studioApi.getTest(id).then((fresh) => {
      if (latestSelectionRef.current !== id || followedSessionRef.current !== sid || !unreadableRef.current) return;
      if (fresh.readiness === 'UNLEARNED' || fresh.readiness === 'NEEDS_RELEARN') {
        clearGuided();
        setGuidedRefresh((count) => count + 1);
      }
    }, () => undefined);
    // One read per unreadable transition or Refresh press (ruling §2 "Re-check"); no timer, no poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guided.unreadable, unreadableRecheck]);
  ```
  - It never calls `replaceScenario` and never reuses an earlier body.
  - `clearGuided` is the closure bound to `(id, sid)` at send time, which the three guards re-validate.
- Refresh button `:1386`: `onClick={() => { if (guided.unreadable) setUnreadableRecheck((c) => c + 1); void reloadScenarios(); }}`.

**`components/studio/run/RunControl.tsx`:**
- `:136`: `const runnable = gate.canRun && hasSteps && !(sessionUnreadable && gate.mode !== 'replay');`
- Add `const [learnBlocked, setLearnBlocked] = useState(false);`.
- Change the learnRequest effect (`:183-188`) as follows. **[AUTO-DECISION]** The token is consumed, so a blocked request never fires later:
  ```ts
  if (learnRequest === null || learnRequest.token <= servedLearnRequest.current || isRunning) return;
  servedLearnRequest.current = learnRequest.token;
  if (sessionUnreadable) { setLearnBlocked(true); return; }
  setLearnBlocked(false);
  gate.learnFrom(learnRequest.request);
  ```
- Clear `learnBlocked` on the next activation:
  - the Button `onClick`: `() => { if (isRunning) { onStop?.(); return; } setLearnBlocked(false); gate.run(); }`;
  - the `runRequest` effect: before `gate.run()`.
- Caption `:293`: `sessionUnreadable && !isRunning && (gate.mode !== 'replay' || learnBlocked)`.
- `GuidedStartFeedback` `disabled` `:232`: `isRunning || gate.phase !== 'idle' || sessionUnreadable`.
- Prop doc `:102-107`: "True when the page follows a stored session whose read was refused before any view of it loaded. Learning never starts from here while it holds. Learn, relearn and busy modes keep Run off with the caption. A READY replay stays enabled, and a learn-again request is dropped with the caption shown (ruling w5-unreadable-and-alias §2-3)."

**`components/studio/guided/useGuidedSession.ts`** (comments only; **`:45` stays byte-identical**):
- Header bullet `:58-61` →
  > "`400`/`409` on a read: `pending = NOT_READY`, polling stops. If no view of the session had loaded yet (a stored session read after a reload), `unreadable` is true: this hook keeps the pointer and `startLearn` starts nothing (tech gate L5b F-L5b-3; L5b-F2). The page then reads readiness once, and calls `clear()` only when that read answers `UNLEARNED` or `NEEDS_RELEARN` (ruling `w5-unreadable-and-alias.md` §2). A `401` before the first view is the same case;"
- `unreadable` doc `:82-83` →
  > "…before any view of it loaded. The hook keeps the pointer and starts nothing; the page decides from a fresh readiness read whether to `clear()` it (W5-1)."

**Tests, red first (Aria T1–T6, placed as below).**

Shared harness:
- Generalise `storePointer(sessionId)` in `pageGuidedRun.test.tsx` to `storePointer(draft, sessionId)`. The body is unchanged; it uses `draft` instead of `unlearnedDraft`.
- Add the same helper to `pageReplayAndReferences.test.tsx`. Import there `failGuidedRequests` (`guidedHandlers`), `guidedError` (`guidedFixtures`), `guidedSessionStorageKey` and `guidedCopy`.
- **Readiness flip** (it makes "decided after the refusal" observable): a local `let refusedAnswered = false`.
  - The refused read is an override `http.get(\`${STUDIO_BASE}/guided-sessions/:id\`, async () => { await new Promise(r => setTimeout(r, 300)); refusedAnswered = true; return HttpResponse.json(guidedError(CODE), { status: STATUS }); })`.
  - `GET /tests/:id` answers `LEARNING` until `refusedAnswered`, and the draft's own readiness after.
  - The list (`GET /tests`) stays as `serveDraft` serves it.

| # | File › title | Asserts | RED today because |
|---|---|---|---|
| T1 | `pageReplayAndReferences.test.tsx` › `W5-1 T1: a READY test with an unreadable stored session replays: Run is enabled, no caption, one execute, no start, pointer kept` | `readyDraft`, pointer, `failGuidedRequests('read', {status:409, body: guidedError('REVISION_CONFLICT')}, {times:50})`, `serveReplay(DEV_TRANSPORT_SCENARIO)`. Then: `data-run-mode="replay"`, enabled, no `run-session-unreadable`; one press gives 1 `EXECUTES` and 0 `STARTS`; the pointer's `sessionId`/`startKey` are unchanged | Run disabled (`probe-ready-unreadable.log`) |
| T2 | `pageGuidedRun.test.tsx` › `it.each` [400 `INVALID_CONTRACT`, 409 `REVISION_CONFLICT`] × [`unlearnedDraft`, `needsRelearnDraft`]: `W5-1 T2: read refused with %s on %s: readiness read after the refusal drops the pointer; Run learns on press with a new key` | The flip harness. The pointer is removed; there is no caption; mode is `learn`/`relearn` and enabled; 0 `STARTS` before the press; one press gives 1 start whose key ≠ `start-key-probe`; at least one `GET /tests/{id}` is in `observed` after the refused read's entry | pointer kept, Run off |
| T3 | same › `W5-1 T3: LEARNING keeps the pointer, Run off and the caption; Refresh re-checks once and drops it when readiness has moved` (replaces both F-L5b-3 tests `:848-877`) | `learningDraft`; the pointer for it; read 409. Then: the pointer is kept, `busy` disabled, the caption = `guidedCopy('sessionUnreadable')`, 0 starts. Then `GET /tests/:id` serves `UNLEARNED` (the list stays `LEARNING`) and "Refresh test information" is pressed: **exactly 1** readiness-check `GET /tests/{id}` before the pointer drops, then the gate's one re-read (2 in total), none more within 300 ms. The pointer is gone, mode `learn`, enabled, no caption | no re-check; old copy |
| T4 | same › `W5-1 T4: a readiness read that fails (503) keeps the pointer, Run off and the caption; one check, no retry of its own` | `unlearnedDraft` with the flip harness, except `GET /tests/:id` answers 503 once `refusedAnswered`. Exactly **3** `GET /tests/{id}` after the refused read: one `getTest` call, which `apiClient` retries twice for a 5xx GET (`apiClient.ts:97-108`). None more within 1500 ms. The pointer is kept, mode `learn`, disabled, caption shown | the check does not exist |
| T5 | `pageReplayAndReferences.test.tsx` › `W5-1 T5 / W5-11: READY + unreadable: "Learn again from step 2" starts nothing and says why` | T1's setup with `serveReplay(REPLAY_FAILURE_SCENARIOS.targetDrift)`; Run, then drift. No caption before the click. After clicking "Learn again from step 2": the caption = `guidedCopy('sessionUnreadable')`, 0 `STARTS`, and no `GET /tests/{id}/capabilities` after the click | silent, no caption |
| T6 | `pageGuidedRun.test.tsx` › `W5-1 T6: a readiness answer that arrives after the author switched tests changes nothing` | Local `renderAt(path)` with `Routes` (`/studio/tests/:id`) and a `NavHandle`, the `studioRunTransport.node.test.tsx:140-180` pattern in JSX. The list is `[unlearnedDraft, needsRelearnDraft]`; the pointer is for `unlearnedDraft`; read 409; that draft's readiness check is delayed 500 ms. `nav.go(\`/studio/tests/${needsRelearnDraft.id}\`)` before it answers. After 800 ms, `unlearnedDraft`'s stored pointer is byte-identical | the check does not exist (write it with T2) |

Further changes:
- **`runGate.test.tsx`, component-level, all RED:**
  - `(p) W5-1: unreadable never blocks a READY replay; learn and relearn are off with the caption`: three serves (`readyDraft`, `unlearnedDraft`, `needsRelearnDraft`) with `sessionUnreadable`.
  - `(q) W5-11: a learn request while unreadable starts nothing, shows the caption, and is not replayed when the session reads`: the `readyDraft` rerender with `learnRequest` token 1, then `sessionUnreadable={false}` with the same token. `startLearn` is never called, and `capabilityReads()` stays 0.
  - `(r) W5-1: "Learn again from step 1" is disabled while unreadable`: `guidedStartRefusal` 409 `REVISION_CONFLICT`/`BASE_IDENTITY_INCOMPLETE` plus `sessionUnreadable`.
- **`afterEach` of `pageGuidedRun.test.tsx`:** add `readyDraft` to the `clearGuidedSession` loop if a test uses it. With the placement above it does not, so this is optional.

### W5-2: refuse the insert, no alias, per Aria §4–5

**`pages/ChecksStudioPage/secretDeclaration.ts`:**
- Export `type SecretDeclaration = { readonly ok: true; readonly rows: EditableVariable[] } | { readonly ok: false; readonly reason: 'nameTaken' }`.
- `declareInsertedSecret(rows, secretId): SecretDeclaration`:
  1. **refuse** if `rows.some(row => row.name.trim() === secretId && !(row.type === 'secret' && ((row.secretId ?? '').trim() === '' || row.secretId === secretId)))`;
  2. rule 1: a secret row with `secretId === secretId` gives `{ok:true, rows:[...rows]}`;
  3. rule 2: the incomplete secret row named ID is completed;
  4. rule 3: add `{ id: \`ref_${secretId}\`, name: secretId, type: 'secret', secretId }`.
- Delete the alias loop and `MAX_NAME_LENGTH`.
- Rewrite the doc to cite `IncrementalAuthoringIdentity.java:83-90` and the ruling, and to state D-8.

**`ChecksStudioPage.tsx`:**
- `const [referenceRefusal, setReferenceRefusal] = useState<string | null>(null);`
- `insertReference` (`:881-911`):
  - For `kind === 'secret'`, first call `declareInsertedSecret(variablesList, reference.name)`.
  - If `!ok`, call `setReferenceRefusal(reference.name)` and **return** (no token, no row).
  - Otherwise call `setReferenceRefusal(null)`, place the token as today, then `setVariablesList(outcome.rows)`.
  - Add `variablesList` to the deps.
- `handleScenarioSelect`: `setReferenceRefusal(null)`.
- Under `<ReferencePicker>` (`:1362-1368`):
  ```tsx
  {referenceRefusal !== null && (
    <Typography variant="caption" color="error" data-testid="reference-insert-refused"
      sx={{ display: 'block', mt: 1, overflowWrap: 'anywhere' }}>
      {guidedCopy('secretNameTaken', { ID: referenceRefusal })}
    </Typography>
  )}
  ```
- **No `handlers.ts` change** (Aria §4; root).

**Tests:**
- **T7** `secretDeclaration.test.ts` (**RED**: the alias is returned). Rewrite it as follows.
  - Refused: plain `ID`; secret `ID→OTHER`; plain `USER_ID` + `LOGIN→USER_ID`.
  - Rules 1, 2 and 3 return `ok` with today's expectations.
  - **Parity table** with Dex's probe (`logs/probe-backend-ambiguity.log`):
    - `[]`+`USER_ID` → ok (rule3 ACCEPTED);
    - `[plain PW, LOGIN→USER_ID]`+`USER_ID` → ok, unchanged (rule1 ACCEPTED);
    - `[plain USER_ID]`+`USER_ID` → refused (4a REFUSED);
    - `[API_TOKEN→OTHER]`+`API_TOKEN` → refused (4b REFUSED).
  - D-8: every `ok` result has exactly one secret row with that non-empty `secretId`.
  - Delete the alias (4a/4b) and 64-character cases.
- **T8** `pageReplayAndReferences.test.tsx` F-L5b-4 (`:348-384`), rewritten (**RED**: token inserted, `USER_ID_2` added).
  - Title: `W5-2: inserting <secret USER_ID> when a variable named USER_ID exists is refused: no token, no row, and the sentence says why`.
  - After the click: `addField` value stays `'Type '`, and `reference-insert-refused` has the text `guidedCopy('secretNameTaken', { ID: 'USER_ID' })`.
  - Save; the PUT body's `variables` equals the draft's own variables (no secretRef with `secretId: 'USER_ID'`, plain row intact).
- **T9** `guided.test.tsx`: the copy-table rows of §2 (`sessionUnreadable` content, `secretNameTaken` +3). They are RED only in the sense that the old template fails the new expectation; the quote tests stay green.

### W5-3: hook-level `unreadable` tests (`components/studio/guided/useGuidedSession.test.ts`, test only)

Add a describe `unreadable (F-L5b-3; W5-3)` with two helpers:
- `startedSession()`: mount, `startLearn`, return `sessionId`, unmount, `resetGuidedSessionRuntime()`.
- `mountRecording(testId)`: `renderHook(({ id }) => { const r = useGuidedSession(id, FAST); seen.push(r.unreadable); return r; }, { wrapper, initialProps: { id: testId } })` with a new store. `seen` is the `unreadable` value of every render.

The cases, H1–H6:
- **H1:** a 409 read of a stored session that never loaded gives `unreadable` true, keeps the pointer, and sends 1 read in 40 ms (anchor).
- **H2:** 503 ×3 (`GUIDED_START_REFUSALS.UNAVAILABLE()`) gives `pending` `NOT_READY`; `seen` never contains `true`; the view loads later. This kills **MF2a**.
- **H3:** `'network'` ×3 gives `seen` never `true`, and the view loads later. This kills "no-response marks unreadable".
- **H4:** 403 ×100 forgets the pointer, and `seen` never contains `true`. It pins the behaviour. MF2b alone is likely equivalent through the derived `sessionId` check [I].
- **H5:** 409 ×1 gives `unreadable` true; then `rerender({id: OTHER})` and `rerender({id: TEST.id})`, where OTHER = `draftsByReadiness.READY.id`; then the view loads and `unreadable` is false. This kills **MF3∧MF4** only: each alone is masked by the other guard [I].
- **H6:** `clear()` on an unreadable session gives `unreadable` false, pointer `null`, and no request. This pins W5-1's drop path.

Test-only, so not red first. Evidence is the mutation run below.

### W5-4: delete the dead Run-action table

- **`components/studio/run/runEnablement.ts`:**
  - Delete `RunAction`, `RUN_ACTION` and `runActionFor`.
  - Module comment: "{@link runModeFor} throws on anything else…"; "`studioContract.test.ts` … asserts {@link RUN_MODE} covers them exactly, in both directions, with `READY` the one state that replays".
- **`run/useRunGate.ts`:** drop the `runActionFor` and `RunAction` imports, `RunGateState.action` (`:135-136`), `:367` and `action,` (`:549`).
- **`run/index.ts`:** drop `RUN_ACTION`, `runActionFor` and `RunAction`.
- **`run/executionErrorNarratives.ts:37`:** comment `runActionFor` → `runModeFor`.
- **`run/runGate.test.tsx:175`:** comment `runActionFor` → `runModeFor`.
- **`services/mocks/studio/studioContract.test.ts:784-807`:** imports `RUN_MODE` and `runModeFor` (drop `RUN_ACTION` and `runActionFor`). The three tests become:
  - `every readiness maps to a Run mode, and exactly one of them replays`: `assertSameSet(declared, Object.keys(RUN_MODE), 'run mode over readiness')`; the replaying states equal `[EXECUTABLE_READINESS]`;
  - `every other declared state learns, relearns or keeps Run off`: non-replay = declared minus `READY`;
  - `a readiness outside the document is an error…`: `runModeFor('SOMETHING_ELSE')` throws.

This is a refactor, not red first. The negative control is a scratch-only mutation: remove `LEARNING` from `RUN_MODE` with a type cast, and test 1 goes red.

### W5-5: AC-1 "every guided route has a client method" (`studioContract.test.ts`, test only)

Import `studioGuidedApi`. Add a closed literal:

`GUIDED_CLIENT_METHOD: Readonly<Record<string, keyof typeof studioGuidedApi>> = { startGuidedSession:'startSession', readGuidedSession:'readSession', readGuidedResult:'readResult', readGuidedClarification:'readClarification', clarifyGuidedSession:'clarify', cancelGuidedSession:'cancel', finalizeObservedPublication:'finalize', getGuidedSessionVideo:'videoPath' }`

Add `it('STUDIO-OBS-008 AC-1: every public operation under /guided-sessions maps to a studioGuidedApi member, and the map has no stale entry (W5-5)')`:
- Derive the operationIds from `openapi.paths` (routes starting with `/guided-sessions`, `HTTP_METHODS`, not `x-internal`).
- They have length 8 (D-2).
- `assertSameSet(derived, Object.keys(GUIDED_CLIENT_METHOD), 'guided operation → client method')`.
- Every mapped member is a `function`.
- Negative control, scratch only: delete one map entry, and the test goes red.

### Test-only race

`components/studio/scheduling/StudioScheduleDialog.test.tsx:73`: `expect(screen.getAllByRole('listitem')).toHaveLength(5);` → `expect(await screen.findAllByRole('listitem')).toHaveLength(5);`

### Mutation checks (after green; on an rsync scratch copy, never in place; procedure as in Dex's `logs/mutate.py.txt`, with restore and sha equality)

| Mutation | Must fail |
|---|---|
| clear on `LEARNING` too | T3 |
| clear on `READY` too | T1 |
| decide from the gate's mount read or the list (no new GET) | T2 (the flip harness) |
| restore the alias rule | T7, T8 |
| MF2a: 503 marks unreadable | H2 |
| MF3∧MF4 | H5 |
| no-response marks unreadable | H3 |
| learnRequest effect ignores `sessionUnreadable` | runGate (q), T5 |
| drop `finalizeHeld` | UX-16 `finalize refused by %s` |
| Dex MD1, MD2 (finalize 401 continues; no memory pointer) | stay killed by the existing hook tests |

## 4. Final write set (24 frontend files + 1 receipt directory). Before = the freeze-manifest bytes (all 24 verified MATCH)

| File | Before sha256 |
|---|---|
| `frontend/src/components/studio/guided/guidedNarratives.ts` | `166a2bbbdd8863883d6b5974405c2f4cc9910812762f6aeae57a32f29ec61b26` |
| `frontend/src/components/studio/guided/GuidedCompletion.tsx` | `8c59d25d1352e6765afdc8c41095dcc6640d5101f713f05187b8e46c23afb6e9` |
| `frontend/src/components/studio/guided/index.ts` | `708afe1c57f671d7d37071a2775846d40991bdd48626e65e5b4e191802ab1999` |
| `frontend/src/components/studio/guided/useGuidedSession.ts` (comments; `:45` verbatim) | `21bee4dbf4ef28cb74c4a119f2c1cb25c9d3a50da9f869b498e1912b6c9320f2` |
| `frontend/src/components/studio/run/RunControl.tsx` | `2385d817168b0fb9effb1100ed824fc4b82ace4acc924fa99a2b56c9a7b2498a` |
| `frontend/src/components/studio/run/useRunGate.ts` | `697d034b1764fc8cbd17258a2940dbcd04519d85d5ce81ac971d7f90e08b01d9` |
| `frontend/src/components/studio/run/runEnablement.ts` | `6c67598587aa10f0b63e42a38d7113ee2c590fef4ad0d4c4592ede67e6b10476` |
| `frontend/src/components/studio/run/index.ts` | `867e313297fc15a49d3f02514f6ae80da77765eb5a89777a76bf78a5fc53775d` |
| `frontend/src/components/studio/run/ExecutionProgressView.tsx` | `2c8166953db8f949cde7e0bf0d9ef592b2a8bbc273d12a189e8cbfb10fe92d46` |
| `frontend/src/components/studio/run/executionErrorNarratives.ts` (comment) | `60fa7fbcf81003b665076029249bc174b491e6e41db1e52cda76be1faa2414c2` |
| `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` | `3ebc644f069a82502ae6659a44e484873d380b710a7d825c9f5f718aa32fdf9c` |
| `frontend/src/pages/ChecksStudioPage/authoredLiteralHint.ts` | `cc4a101e8608bf3293a9cf4b793e35b7c443880cd75ba6a2e0cf9f4781725f4d` |
| `frontend/src/pages/ChecksStudioPage/secretDeclaration.ts` | `28d24d00e42a993f2866c8dc2cf7b5e4e6383b0ac74f095c1dad2c50e3fd8f25` |
| `frontend/src/components/studio/guided/guided.test.tsx` | `95554acc5fdda9cb36bc24217edc111e3da5bbe0f50dedcb3c2cfbb8e705d9d9` |
| `frontend/src/components/studio/guided/clarification.test.tsx` | `deb61efcb758be32d19b73d0a3a626c358faaeff11c0b32c9d6c6f442577275e` |
| `frontend/src/components/studio/guided/useGuidedSession.test.ts` | `ff0b314544f8ae3e272e1c7914e3507e424dcaa4327eff9e9427560608914b45` |
| `frontend/src/components/studio/run/runGate.test.tsx` | `611fb0f53bd8fd7a6cfd0118c31ed9876b452c613c22a89687036cb45e332eb5` |
| `frontend/src/components/studio/run/replayFailure.test.tsx` | `1121dd2f1006410964ac8171ff3daf91bdd209317302584303e04b8b4e3399d0` |
| `frontend/src/pages/ChecksStudioPage/pageGuidedRun.test.tsx` | `4db2f6a55a186ecce083bc33dbb01afa722638a5dae8c0c326d522be9560bf88` |
| `frontend/src/pages/ChecksStudioPage/pageReplayAndReferences.test.tsx` | `5c393bb62303d5e5568a9107c5b040b7e860c3d31b70dcd6b2de21f4ef7ace16` |
| `frontend/src/pages/ChecksStudioPage/authoredLiteralHint.test.ts` | `9ab34deb05807bcaacaf4edaf953fc9b38aacf77d0cfde168a163619ad0d2620` |
| `frontend/src/pages/ChecksStudioPage/secretDeclaration.test.ts` | `7160c6213b75dff360c1f319a37adb4dede1785f16c9aa4c7adb8c9ed8ea23b8` |
| `frontend/src/services/mocks/studio/studioContract.test.ts` | `ae4c8bddfceed27a6dd3708b28f217aba55cd9b9cc2bdcdbbc9238b52dab4aa0` |
| `frontend/src/components/studio/scheduling/StudioScheduleDialog.test.tsx` | `e871cf3f3cecd5e2c698a03960a7d703e5a78f5ed3df9c3a3cf54e3212a63e79` |
| `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/lanes/U1/` (receipt, before/after hashes, red logs, mutation logs) | new |

**Not in the write set:**
- `handlers.ts` and `guidedHandlers.ts` (Aria §4).
- `GuidedClarification.tsx` and `GuidedRunStatus.tsx`: only their copy keys change.
- `e2e/**` and `playwright.config.ts`.
- `src/test/a11y/**`.
- `studioAuthoringTransport.ts` (D-9 signature kept).
- Everything under `backend/`, `studio-runner/`, `tools/` and `docs/specs/`.

## 5. Verify list (from `frontend/`; record each command, its exit code and its counts in the U1 receipt)

| # | Command | Pass condition |
|---|---|---|
| V0 | Red-first runs: each RED test in §3, run against the frozen bytes before its source change. Files: `-t` on `guided.test.tsx`, `clarification.test.tsx`, `runGate.test.tsx`, `replayFailure.test.tsx`, `pageGuidedRun.test.tsx`, `pageReplayAndReferences.test.tsx`, `authoredLiteralHint.test.ts`, `secretDeclaration.test.ts` | each fails for the stated reason; logs saved `lanes/U1/logs/red-*.log` |
| V1 | L5b set: `pnpm exec vitest run src/pages/ChecksStudioPage src/components/studio/run src/components/studio/runs src/components/studio/guided src/components/studio/evidence src/components/studio/templates --minWorkers=1 --maxWorkers=3` | exit 0, 0 failed (F2 was 625 passed; record the new count) |
| V2 | Guided copy table: `pnpm exec vitest run src/components/studio/guided/guided.test.tsx -t "copy table" --minWorkers=1 --maxWorkers=2` | exit 0, **185 passed** (168 + 17) |
| V3 | `pnpm exec vitest run src/services/mocks/studio/studioContract.test.ts --minWorkers=1 --maxWorkers=2`; then `src/components/studio/scheduling/StudioScheduleDialog.test.tsx` run 3 times | exit 0 each |
| V4 | `pnpm run type-check` | exit 0 |
| V5 | `pnpm run lint` | 0 errors, warnings ≤ **308** |
| V6 | Full suite excluding a11y: `pnpm exec vitest run --minWorkers=1 --maxWorkers=4 --exclude 'src/test/a11y/**'` | exit 0, 0 failed (F2 was 1313 passed); `axe-results.json` mtime unchanged |
| V7 | Greps (repo root): `grep -rnE "RUNTIME_INCOMPATIBLE_REFUSAL\|RUN_ACTION\|runActionFor\|\bRunAction\b" frontend/src`; `grep -nE "MAX_NAME_LENGTH\|_\$\{suffix\}" frontend/src/pages/ChecksStudioPage/secretDeclaration.ts`; `grep -cF 'once a \`sessionId\` is known nothing ever re-POSTs start: reload and reconnect only GET' frontend/src/components/studio/guided/useGuidedSession.ts` | 0 hits; 0 hits; 1 |
| V8 | The §3 mutation table | each mutant killed by the named test |
| V9 | Freeze check (root): sha256 of every manifest path outside §4 equals `freeze-manifest.json` | 0 changed outside the write set |

**Not in U1's list** (root decides):
- **Playwright.** By grep, no changed string is asserted under `e2e/`, and the "1–1" prefix form that `e2e/studio-guided.spec.ts:63/:201/:459` pins is deliberately unchanged [I: not run].
- **The a11y audit** (AC-8 b regression guard only; U1 adds no a11y surface).

## 6. Not changed on purpose

- The replay execute `RUNTIME_INCOMPATIBLE` narrative (`executeRefusals.ts:62-70`).
- The `CANCELLED` narrative (R5).
- The Q9 trigger rule (only the hint's wording and its step number change).
- The `useGuidedSession.ts:45` sentence.

## 7. Carried tables

### 7.1 Carried to the post-GA copy pass (owner **@ux-design-expert**)

| ID | Current text | Ready wording | Reason not in U1 |
|---|---|---|---|
| UX-02 (optional cue) | — | "Studio has a question about step {N}. Answer it under Run & proof before it expires." | Root scoped UX-02 to the tab switch; the cue was optional |
| UX-08 | "Step {N} no longer matches the page…" (alone, terminal) | "Step {N} no longer matches the page, so this run stopped." | Not false: AC-3 verbatim text, missing a consequence clause |
| UX-09 (prefix part) | "Repeating saved steps 1–1…" | "Repeating saved step 1…" | `e2e/studio-guided.spec.ts:63`, `:201` (regex `steps`) and `:459` pin the plural; changing it needs a Playwright re-run outside U1's verify list. Degenerate, not false |
| UX-10 | "None of these — I'll edit step {N}" on a one-choice confirmation | "No — I'll edit step {N}" | Not false: the consequence (cancel, then edit step N) is accurate; "these" with one referent is a grammar mismatch only |
| UX-11 | "This step needs…" / "A step that checks the page did not pass…" | "Step {N} needs a part of the page that Studio cannot work with, so this run stopped." / "Step {N} checks the page and did not pass, so this run stopped." | True but unspecific |
| UX-13 ("that step" part) | `revisionNotReady` on a full-learn P6 context mismatch | — (needs one fact covering every mismatch cause) | Not false; "This test changed while Run was starting" would be false when readiness moved to LEARNING |
| UX-14 | "…a saved input or secret…" | "A step uses a variable or secret that this test does not declare, so nothing was started." | Terminology only |
| UX-17 | AC-4 login sentences without a final period | the same with "." | Punctuation only (AC-4 verbatim) |
| UX-18 | "Vault is not connected for this environment." | "…, so secrets are off for this test." | Missing a consequence, not false |
| UX-19 | `UNLEARNED` with steps: no readiness text | Add the AC-3 sentences "The first Run works through them on the live page and saves what it learned. Later Runs repeat it in seconds." | Missing information, not false or empty |
| UX-20 | "Steps changed" | "Steps changed — next Run learns from the first changed step" | Missing a consequence, not false |
| UX-21 | role/region as plain captions | Code only: untrusted styling for the values | Low hardening, not false copy (@dev implements) |
| UX-22 | two unrecorded page variants | — | Record only; recorded in §2 |

### 7.2 Proposed carried item for @po

| ID | Item | Target | Owner |
|---|---|---|---|
| **C-OBS008-3** | W5-6 (F-L5a-3): `guidedNarratives.ts` ships `basis/source/note/facts` (source paths and quotes) in the production bundle. Proposed fix: keep `template` at runtime and move the rest to a test-only module | STUDIO-OBS-011 | @dev (proposed; @po places) |

### 7.3 Needs a user decision (not changed)

| Item | State |
|---|---|
| OBS-1: "Someone pressed Stop. …" shown after "None of these" or a declined confirmation, where nobody pressed Stop | Descoped by the user's R5 (2026-10-17). Unchanged. Changing it needs a new user decision |

### 7.4 Root carries (outside U1, per Aria §4)

| Item | Detail |
|---|---|
| startGuidedSession 422 divergence | The backend refuses an ambiguous declaration set at start with `422 INVALID_CONTRACT`/`AUTHORING_REFERENCE_AMBIGUOUS`. `openapi.yaml:1345-1416` declares no 422. Declare it or remap it, then mirror the four refusals in the start mirror (`guidedHandlers.ts:562`). The Variables dialog can still save an ambiguous set by hand. Backend or contract owner |
| `handlers.ts:177` `variable.secretId ?? variable.name` | D-8 residue (plan `:41`, story `:123`); unreachable from the page. Remove it (`:164`, `:177`) when `handlers.ts` is next opened, or record it in the Dev Agent Record |

### 7.5 Dex items not taken in U1

W5-7 (commit-set note: it now also covers `rulings/w5-unreadable-and-alias.md`, via `COPY_SOURCE_FILES.w5Ruling`), W5-8, W5-9, W5-10, W5-12 (optional `crypto.randomUUID()` row id) and W5-13 (root DAR) stay as Dex recorded them.

## 8. [AUTO-DECISION] log

1. UX-10 is judged **not false**: "None of these" over a set of one is still a true decline, and its consequence text is accurate. It is carried.
2. UX-09 is split. The completion forms ("steps 5–5", "Steps 2–2") are IN. The prefix "1–1…" is carried, because the E2E spec pins it and Playwright is outside U1's verify list.
3. UX-13 is split. The silent no-op is IN, using the existing `revisionNotReady` sentence (its "that step" refers to the pressed button). The full-learn "that step" wording is carried.
4. UX-04 names "Refresh test information" as well as reload. The refresh button also re-reads readiness through `refreshToken` (`ChecksStudioPage.tsx:1034`, `:512-523`), so "until a reload" alone would be incomplete.
5. `sessionUnreadable`: Aria's draft is confirmed, with "Press" added before "Refresh test information".
6. `secretNameTaken`: Aria's draft is expanded to state the state ("was not inserted") before the remedy.
7. T1 and T5 sit in `pageReplayAndReferences.test.tsx`, not `pageGuidedRun.test.tsx`. Only that file has the replay harness (`serveReplay`, drift scenario) and already cleans `readyDraft`. The assertions are Aria's.
8. T3's "exactly 1 more GET" is read as one readiness check. The drop then bumps `guidedRefresh`, which makes the gate re-read once (Aria §3.1), so 2 GETs in total.
9. T4's "exactly 1 GET" is read as one `getTest` call. `apiClient` retries a 5xx GET twice (`apiClient.ts:97-108`), and D-9 fixes `getTest(id)` with no options, so the test expects 3 HTTP attempts and nothing after them.
10. The learnRequest token is consumed while unreadable, so a blocked request never fires after the session becomes readable ("Nothing starts on its own", Aria §2 table).
11. UX-01's guided RUNTIME_INCOMPATIBLE feedback no longer reuses the replay narrative. The replay narrative itself is unchanged.
12. W5-12 is not taken (Aria marks it optional; root did not scope it).
