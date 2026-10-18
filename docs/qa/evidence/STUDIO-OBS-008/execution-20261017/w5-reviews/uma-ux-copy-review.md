# STUDIO-OBS-008 — W5 UX and copy review (Uma, @ux-design-expert)

- **Date:** 2026-10-17. **Mode:** YOLO, autonomous. **Story:** `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` (0.3.16).
- **Scope:** UX and copy only. Under ADR-SC-006 (`.claude/rules/accessibility-scope.md`) this is **not** an accessibility review. Nothing below concerns screen readers, ARIA, keyboard, contrast, reduced motion or axe.
- **Source:** the frozen tree (`final-gates/freeze-manifest.json`, head `734ad704f…`, captured 2026-10-18T01:33:21Z, 1705 files). I hash-checked the 25 files this review reads against the manifest. **All 25 match** (the guided, run and evidence components, `useGuidedSession.ts`, `useRunGate.ts`, `referenceTokens.ts`, `ChecksStudioPage.tsx`, `authoredLiteralHint.ts`, the two page test files, and the three backend files cited below).
- **What I ran:**
  - The manifest hash check above (a read-only Python script).
  - `cd frontend && pnpm exec vitest run src/components/studio/guided/guided.test.tsx -t "copy table" --minWorkers=1 --maxWorkers=2`. Exit 0: **168 passed**, 50 skipped by the `-t` filter. This run does not count as evidence.
- **Not run:** Playwright, Gradle or bootRun (L6 owns them), `src/test/a11y`, the full Vitest suite, and any install. I edited no source file and made no git write. This file is the only file I wrote.
- **Labels:** **[V]** means I read and cited it. **[I]** means I inferred it and did not execute it.

## Verdict: **PASS-WITH-FINDINGS**

| Severity | Count | IDs |
|---|---|---|
| High | 0 | — |
| Medium | 5 | UX-01 to UX-05 |
| Low | 17 | UX-06 to UX-22 |
| Info (no change proposed) | 9 | OBS-1 to OBS-9 |

What holds:
- Every guided string is cited or recorded with a basis.
- Run, Learn and "step N" are used consistently.
- The three Run modes, the login-required notice, "Go to step N", "None of these" and the "Learn again" conditions behave as the rulings say.
- Page-derived labels get the security styling.
- The narrow layout stacks correctly.

What I found:
- Five Medium items. Each is a visible claim that is untrue or incomplete on a path a user can reach, or a guided Run whose output can be off screen. Each one needs an unfreeze, or root's explicit acceptance or deferral.
- No finding blocks the story's acceptance criteria as written, and none needs a contract change.

---

## Check 1: citations, invented claims, tone and terminology

**Registry totals [V].** `guidedNarratives.ts` `GUIDED_COPY` has **71 entries**:
- 31 verbatim, 17 adapted and 23 delegated;
- that is L5a's 69 entries (21 of them delegated), plus `learningElsewhere` (L5b-F1) and `sessionUnreadable` (L5b-F2), both delegated.

Every entry names a file and an exact quote. The copy-table test enforces this (168 green, see above). Five narratives are reused, not copied, from `executionErrorNarratives.ts`, `executeRefusals.ts` and `runEnablement.ts`.

Other visible strings:
- **References and capability:** L4's receipt §5 records the reference and capability strings.
- **Proof placeholder:** "Run saves your steps and records proof." is 012B COPY-001 (`STUDIO-OBS-012B/ux-gate.json`).
- **Two unrecorded variants:** two new page variants are in no copy record (UX-22, record-only).

**Delegated rows (Uma-authored).** I re-read all 23 against their quoted facts.
- 19 state only what their fact says.
- 4 state more than their facts support: UX-01, UX-03, UX-04 and UX-12. One reused narrative does too (OBS-1).

**One inference is now verified [V].** The expiry consequence "If it expires, this run will stop and you will need to Run again." (rows `expiresIn60`, `expiresIn20` and `expired`) was flagged as an inference by L5a and by tech gate Q1. The backend sets every question's `expiresAt` to the session's `expiresAt` (`GuidedTranslationService.java:1917` and `:2209`). `GuidedSessionService.expire()` (`:1612-1623`) then stops that session as `EXPIRED`. So the clause is true.

**Terminology.**
- "Run" is used both as the control and as the noun ("the first Run", "next Run", "Run again").
- "Learn" and "learned" are used for guided learning, "repeat" and "replayed" for replay, and "step N" for the 1-based position in the current draft.
- Exceptions:
  - UX-14: "saved input" next to "Open Variables".
  - OBS-1: "Someone pressed Stop" and "Start the test again" in the reused `CANCELLED` narrative.
  - OBS-2: the button reads "Run Test", while the copy says "Run". Acceptable.

## Check 2: states and consequences

"Consequence" here means visible text that says what happened, or what happens next, as a result of the state. The pass rule: a reachable state shows its state, and where it applies, its consequence.

| # | State | Visible text (as rendered) | Consequence shown? |
|---|---|---|---|
| 1 | Zero steps (disabled Run) | "Add your first step" + AC-3 never-learned sentence; beside Run: "Add a step to run this test." | **Yes** |
| 2 | `UNLEARNED` with steps | No chip; Proof placeholder "Run your test / Run saves your steps and records proof." | **No**: nothing says the next Run learns (UX-19) |
| 3 | `READY` | Chip "Learned · ready to repeat" | **Yes** |
| 4 | `NEEDS_RELEARN` | Chip "Steps changed — next Run learns from step k" | **Yes** |
| 5 | `NEEDS_RELEARN`, k not in the draft | Chip "Steps changed" | **No** (UX-20) |
| 6 | `NEEDS_RELEARN` + `BASE_IDENTITY_INCOMPLETE` (D-4) | Chip "Saved learning cannot be reused — next Run learns from step 1" | **Yes** |
| 7 | Unsaved edits | "Unsaved changes / Run will save them first, then run the saved checklist." (the chip is hidden) | **Yes** |
| 8 | Learning elsewhere (disabled Run) | "Another Run is learning this test, so Run is off until that Run ends." | **Yes, but inaccurate**: Run stays off after that Run ends until a reload or refresh (UX-04) |
| 9 | Session unreadable (disabled Run) | "Studio could not read the Run already started for this test, so Run is off until a page reload reads it." | **Yes** (wording UX-15; dead end OBS-7) |
| 10 | Execute permission denied (disabled Run) | "You do not have permission to run tests for this CSI. Only its owners and authorized administrators can run them." | **Yes** |
| 11 | Capability `guidedStart` off: `FORBIDDEN_SCOPE` | Run stays enabled (P6 reads the capability on press), then inline "You do not have permission to run tests for this CSI" + "Nothing was started…" | **Yes** |
| 12 | Capability `guidedStart` off: `RUNTIME_INCOMPATIBLE` | Inline "This saved test needs to be refreshed / The saved test is not compatible with the service running it now. Nothing was started. / Save the test again, then run it." | **Yes, but the cause and remedy are false** (UX-01) |
| 13 | Capability `vaultSecrets` off | "Vault is not connected for this environment." Secret affordances are removed | **Partial** (UX-18) |
| 14 | Capability loading / error | "Checking whether secrets are available for this test…" / "Studio could not confirm that secrets are available for this test, so they are off." | **Yes** |
| 15 | Starting | Run "Starting…", "Starting the browser…" | **Yes** (in progress) |
| 16 | `PREPARING` | "Preparing your steps." | In progress |
| 17 | `REPLAYING_PREFIX` | "Repeating saved steps 1–(k-1)…" | Yes; "1–1" when k = 2 (UX-09) |
| 18 | `OBSERVING` / `PROPOSING` | "Understanding this page — step N of M." + "Learning from step k" (mixed mode) | **Yes** |
| 19 | `ACTING` | "Running step N of M." | **Yes** |
| 20 | `AWAITING_CLARIFICATION` | "Step N says: '…'. Which one did you mean?", the choices, "None of these — I'll edit step N", "Continue"; at 60 s and 20 s, the expiry sentence with its consequence | **Yes**, but the 60 s figure is wrong between 59 and 21 s (UX-06), and it can be off screen (UX-02) |
| 21 | Side-effect confirmation | "Confirm this action before it runs. / Step N says: '…'. Continue with this action?", "Continue", "None of these — I'll edit step N" | Yes (decline label UX-10) |
| 22 | "None of these" or decline, then cancel | Focus moves to step N's editor row; Proof shows the `CANCELLED` narrative | Yes, but "Someone pressed Stop" is untrue here (OBS-1, user-decided R5) |
| 23 | `FINALIZING` | "Saving what this run learned…" | **Yes** |
| 24 | Finalize refused (400/409, not resent) | "Steps not ready to repeat." **and** "Saving what this run learned…" with a progress bar | **Contradictory** (UX-16) |
| 25 | Pending `NOT_READY` / `REAUTHENTICATION_REQUIRED` | "Steps not ready to repeat." | State yes; what happens next no (OBS-9; meets AC-2) |
| 26 | `SUCCEEDED` + `PUBLISHED` (learned) | "Completed — learned from this run." + "Steps as learned" | **Yes** |
| 27 | `SUCCEEDED` partial / after drift | "Completed — steps k–n learned again." + "Steps j–(k-1) were re-learned because the page changed." | Yes ("5–5" UX-09) |
| 28 | `SUCCEEDED` publication `PENDING` | "Saving what this run learned…" | **Yes** |
| 29 | `PUBLICATION_CONFLICT`, or publication refused | "Run completed; steps not ready to repeat." | **Yes** |
| 30 | `FAILED` `LOGIN_REQUIRED` false / true | The AC-4 sentences + "Go to step N" + "Open Variables" | **Yes** |
| 31 | Login, step no longer in the draft | The step-less sentence + "The step where this happened is no longer in your steps." + "Open Variables" | **Yes** |
| 32 | `FAILED` governed `POLICY_DENIED` | "This action could not be run." + body + remedy | **Yes** |
| 33 | `FAILED` `ASSERTION_FAILED` | "A step that checks the page did not pass, so this run stopped." | Yes; names no step (UX-11) |
| 34 | `FAILED` `UNSUPPORTED_SURFACE` | "This step needs a part of the page that Studio cannot work with, so this run stopped." | Yes; "This step" has no referent (UX-11) |
| 35 | `FAILED` `BUDGET_EXCEEDED` (+ KL-015-Q4 hint) | "This run reached its learning budget, so Studio stopped it. / Nothing starts again on its own." (+ the hint) | Yes; the hint over-claims on R2 (UX-03) |
| 36 | `FAILED` with another code (`INVALID_CONTRACT`, secret codes…) | "This run stopped. The reason the server gave is shown below exactly as it arrived…" + the code | **Yes** (OBS-3) |
| 37 | `FAILED` with `errorCode: null` | The same sentence, with **nothing** shown below | **False claim** (UX-12) [I] reachable |
| 38 | `UNKNOWN_OUTCOME` | "Stopped — submission outcome unknown." (no Run-again) | **Partial**: does not say Studio will not repeat the action, or to check the application first (UX-05) |
| 39 | `EXPIRED` | "This run expired before it finished, so it stopped. You will need to Run again." | **Yes** ([V] see Check 1) |
| 40 | Start refused `POLICY_NOT_APPROVED` (×3 message codes) | The policy sentence + the message-code sentence | Yes (OBS-8) |
| 41 | Start refused D-3 / P6 context mismatch | "This test is not ready to start learning from that step, so nothing was started. Press Run again…" | Yes; "that step" has no referent on a full learn (UX-13) |
| 42 | "Learn again" (drift, or first step) whose conditions fail on the fresh read | Nothing is shown; the button stays | **No** (silent no-op, UX-13) |
| 43 | Start refused `MISSING_SOURCE` | "A step uses a saved input or secret that this test does not declare, so nothing was started." + "Open Variables" | Yes (term UX-14) |
| 44 | Start refused `ORIGIN_NOT_ALLOWED` / budget per CSI / budget per session | Their sentences (+ "You can Run again in …", + "Nothing starts again on its own.") | **Yes** |
| 45 | Replay `PASSED` | "Completed — saved steps replayed." | **Yes** |
| 46 | Replay `LOGIN_REQUIRED` | The same notice as guided (one adapter) | **Yes** |
| 47 | Replay drift, "Learn again" offered | "Step N no longer matches the page…" + "Learn again from step N" + "Seek to step N" | **Yes** |
| 48 | Replay drift, no action (`NEEDS_RELEARN`, superseded revision, step gone) | "Step N no longer matches the page…" on its own | **No** (UX-08); wrong N when the step is gone (UX-07) |
| 49 | Replay `ERROR` with no named cause | "The run ended in an error the server could not name…" | **Yes** |

## Check 3: security styling of untrusted page-derived labels — **PASS** (one Low hardening note)

[V] `GuidedClarification.tsx:78-124` (`ChoiceLabel`):
- A `labelSource: PAGE` label is a React text node inside `<bdi>`, so its characters cannot reorder the surrounding text.
- The label sits in a dashed `warning.main` box with a tinted background, in monospace with `pre-wrap` and `overflow-wrap: anywhere`.
- It carries a "Page-derived" warning chip, with its role and region shown as captions.
- `AUTHORED` and `SAVED_INPUT` labels are never decorated.
- Tests: `clarification.test.tsx` › markup in a label, role or region renders as text; a null region; no decoration on authored labels.

Labels that look similar but are not page-derived:
- The action labels in "Steps as learned" and in "Seek to action: <safe label>" come from the P3 controlled vocabulary. Architect P3 says: "never concatenate … arbitrary node.name, locator.value, URL, model safeLabel or authored literal into labels".
- The confirmation choice is `AUTHORED`: the backend sets it from the step text (`GuidedTranslationService.java:1886-1890`).

Hardening note **UX-21** (Low, code only): `role` and `region` are free page strings (`clarification.schema.json`: role up to 256 characters, region unbounded). They render as plain caption text outside the untrusted box. The "role:" and "region:" prefixes and the grouping make spoofing unlikely, but the values get no untrusted styling.

## Check 4: narrow layout (375×812) — **usable, with one Medium caveat**

**Read:**
- the layout code: `ChecksStudioPage.tsx:956-1056` (the header), `:1069-1377` (the panels), and the `sx` breakpoints in the guided components;
- the page test `pageReplayAndReferences.test.tsx:467-509`, which evaluates the CSS cascade at 375 px and checks each value against a 1440 px control;
- the real-browser case `e2e/studio-guided.spec.ts:469-486`, which L6 runs. I did not run it.

**Works:**
- The header changes from a row to a column below `lg`. Both panels are `xs=12`, so they stack.
- Every new action group (login actions, start feedback, the question actions, the replay-cause actions, the seek buttons) stacks and fills the width below `sm`.
- Long sentences, chip labels and codes wrap (`overflow-wrap: anywhere`) instead of widening the page.
- "Go to step N" and "None of these" call `scrollIntoView({block:'center'})` on the step row (`:403-413`), which matters at this width.
- Run stays at the top of the page.
- The real-browser case confirms that the login actions sit inside the 375 px width.

**Caveats:**
- **Run output can be off screen (UX-02, Medium).** At `xs` the Proof panel comes **after** the whole step editor. A guided Run's status, its question (with the 60 s and 20 s expiry) and its result render far below the Run button. Nothing near Run says that a question is waiting. On any width, a guided Run does not select the Proof tab: only a replay's `onAccepted` does (`:1041-1044`). With Logs open, the question renders in a hidden tab panel.
- Neither the jsdom test nor the E2E checks that the output is **in view** after Run. `toBeVisible` does not require the element to be inside the viewport.
- Minor, existing before 008: the `h1` uses `noWrap`, so a long test name is truncated. In each step row, the 32 px avatar and three 36 px buttons leave about 160 px for the step text. It is usable because the field wraps.

## Check 5: findings

The "Needs unfreeze" column says whether the fix touches frozen source. Every "yes" item can instead be accepted or deferred by root.

| ID | Sev | File:line | Current text | Proposed text | Basis | Needs unfreeze |
|---|---|---|---|---|---|---|
| UX-01 | **Medium** | `guidedNarratives.ts:671-672`; `GuidedCompletion.tsx:325`, `:352-353` (reuses `executeRefusals.ts:62-70`) | For a guided start refused or unavailable with `RUNTIME_INCOMPATIBLE`: "This saved test needs to be refreshed" / "The saved test is not compatible with the service running it now. Nothing was started." / "Save the test again, then run it." | Title: none. Line 1 (new delegated key `guidedStartUnavailable`): "Studio cannot start learning for this test, so nothing was started." Line 2 (adapted, as `failedUnnamed` is): "The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket." Then the code `RUNTIME_INCOMPATIBLE`. The replay execute path keeps its narrative. | D-11: "A `RUNTIME_INCOMPATIBLE` start refusal names no cause". Architect P4 for `RUNTIME_INCOMPATIBLE`: "Existing refusal, unavailable/notready copy". [V] `StudioCapabilitiesService.java:96-108`: the capability is `RUNTIME_INCOMPATIBLE` when guided learning is disabled, the environment is malformed, or there are zero or several governed applications. Saving again cannot clear any of these, and Run already saves, so the author loops. | yes (copy + `GuidedCompletion.tsx`) |
| UX-02 | **Medium** | `ChecksStudioPage.tsx:336`, `:1041-1044`, `:1435`, `:1465-1521`, `:1071`/`:1377` | (No copy.) A guided start never selects the Proof tab. At 375 px the Proof panel is below the step editor. | Code only: select the Proof tab when a guided session starts, and when a question arrives, as `onAccepted` does for a replay. Optional cue beside Run while a question waits (new delegated key `questionWaiting`): "Studio has a question about step {N}. Answer it under Run & proof before it expires." | AC-3 (`AWAITING_CLARIFICATION`, expiry warnings stating the consequence); AC-8 a (narrow layout); ADR-SC-006 "State and consequence stated in visible text". This is not focus-on-entry (X3 stays removed): no focus moves. | yes (code; the cue is optional) |
| UX-03 | **Medium** | `guidedNarratives.ts:315-326`; `GuidedCompletion.tsx:238-241`, `:269-273`; `authoredLiteralHint.ts:75-86` | "Studio cannot see page text that matches a value written in this step. Try rewording the step, for example by checking for a longer or different piece of visible text." | "This may be because of step {N}: Studio cannot see page text that matches a value written in a step. If so, try rewording step {N}, for example by checking for a longer or different piece of visible text." N is the failing step's draft position, which condition 3 always provides. | KL-015-Q4 item b (delegated). Ruling Q9 §5 R2: on a model, CSI, cap or window `BUDGET_EXCEEDED` the hint is "true there but may be irrelevant". Under the budget sentence, the current wording reads as the cause, and "rewording" cannot clear a CSI budget. The clause predicate also matches steps that may carry no authored value [I]. "This step" has no referent in the completion alert. The hedge keeps the hint true on R2, and naming N keeps R1's per-step scope. | yes (copy; the page passes N) |
| UX-04 | **Medium** | `guidedNarratives.ts:589-599`; `RunControl.tsx:149`, `:304-313` | "Another Run is learning this test, so Run is off until that Run ends." | "Another Run is learning this test, so Run is off. When that Run ends, reload this page to turn Run back on." Alternative with no copy change: re-read `GET /tests/{id}` on an interval while this caption is shown. | Same `LEARNING_QUERY` fact. [V] the gate re-reads only when `refreshToken` changes (`ChecksStudioPage.tsx:1034`); nothing polls another client's session (tech gate F-L5b-5). "Until that Run ends" implies Run comes back on by itself, which it does not. | yes |
| UX-05 | **Medium** | `guidedNarratives.ts:237-242`; `GuidedCompletion.tsx:123-124` | "Stopped — submission outcome unknown." | Keep the line, and add a second line (new delegated key `unknownOutcomeConsequence`): "Studio could not confirm whether its last action on the page took effect, and it will not repeat it on its own. Check the application before you Run again." | `consensus-plan.md:136`: "If a dispatched action times out or acknowledgment is lost, mark `UNKNOWN_OUTCOME` and stop. Do not automatically repeat a click, submit, create, delete or fill after uncertain dispatch." `:211` and AC-3: no Run-again control. Without this line, an author can repeat a submit or order by pressing Run. | yes |
| UX-06 | Low | `guidedNarratives.ts:175-195`; `GuidedClarification.tsx:52-60` | "This question expires in 60 seconds. …" is shown from 60 s down to 21 s. | "This question expires in less than a minute. If it expires, this run will stop and you will need to Run again." / "This question expires in less than 20 seconds. If it expires, this run will stop and you will need to Run again." | Adapted from the UX plan rows. AC-3 thresholds unchanged. Tech gate F-L5a-5(a). At 25 s left, the current text overstates the time. | yes |
| UX-07 | Low | `ExecutionProgressView.tsx:228-231`, `:290-293` | When the drifted step is gone from the draft: "Step {stepIndex+1} no longer matches the page…". Editor step N is now a different step. | Keep the snapshot number (it matches the step list below), and add the existing row `loginStepGone`: "The step where this happened is no longer in your steps." The login notice already does this. | Reuses delegated row 44 (same fact). A1.6 (N is the position in the current draft). | yes (code only) |
| UX-08 | Low | `guidedNarratives.ts:331-335`; `ExecutionProgressView.tsx:283-311` | "Step {N} no longer matches the page…" (on its own when no action is offered; it ends in "…") | "Step {N} no longer matches the page, so this run stopped." | Adapted from AC-3. The trailing "…" reads as "in progress" on a terminal state [I: the ellipsis stands for the panel's elided remainder]. A1.2: drift is derived only from a FINAL report. This follows the state-then-consequence pattern of rows 26–28. | yes |
| UX-09 | Low | `guidedNarratives.ts:115-119`, `:221-231`; `GuidedRunStatus.tsx:46-50`; `GuidedCompletion.tsx:84-89` | "Repeating saved steps 1–1…", "Completed — steps 5–5 learned again.", "Steps 2–2 were re-learned…" | When a range has one step: "Repeating saved step 1…", "Completed — step {k} learned again.", "Step {j} was re-learned because the page changed." | Adapted from the AC-3 templates (singular form). Tech gate F-L5a-5(b). Adding one step at the end of a test, likely the most common edit, gives "steps 5–5". | yes |
| UX-10 | Low | `GuidedClarification.tsx:159`, `:190-198` | The decline button on a single-action confirmation: "None of these — I'll edit step {N}" | "No — I'll edit step {N}" (confirmation only; the disambiguation question keeps the AC-3 label) | Adapted from AC-3. T0 A3: declining a `SIDE_EFFECT_CONFIRMATION` "does the same". Inherited 014 b: the confirmation has exactly one choice, so "None of these" has nothing to refer to. | yes |
| UX-11 | Low | `guidedNarratives.ts:253-266`; `GuidedCompletion.tsx:94-98`, `:141-147` | "This step needs a part of the page that Studio cannot work with, so this run stopped." / "A step that checks the page did not pass, so this run stopped." | "Step {N} needs a part of the page that Studio cannot work with, so this run stopped." / "Step {N} checks the page and did not pass, so this run stopped." Without N, fall back to "A step needs …" / the current text. N comes from `failedStepIdOf` in the draft. | Delegated rows 26–27 (same facts); the AC-3 "step N" convention. "This step" has no referent in the alert. | yes |
| UX-12 | Low | `GuidedCompletion.tsx:149`, `:259-268`; `guidedNarratives.ts:284-293` | On `FAILED` with `errorCode: null`: "This run stopped. The reason the server gave is shown below exactly as it arrived…", with nothing below | When the code is null: "This run stopped, and the server named no reason, so there is nothing here to explain it." | Adapted from `UNNAMED_ERROR_STATEMENT` (`ExecutionProgressView.tsx:75-76`). [V] `result.schema.json` allows `errorCode: null` on any outcome. [I] reachable: an assignment-lifecycle stop sets `FAILED` with no `errorCode` (`GuidedSessionService.java:1832-1840`, `:2653`). | yes |
| UX-13 | Low | `guidedNarratives.ts:547-553`; `RunControl.tsx:236-240`; `useRunGate.ts:493-498` | "This test is not ready to start learning from that step, so nothing was started. Press Run again to start from the latest saved steps." ("that step" has no referent on a full learn). An explicit learn whose conditions fail on the fresh read shows nothing. | "This test changed while Run was starting, so nothing was started. Press Run again to start from the latest saved steps." Also show it when `learnFromHints` returns null, which is a silent no-op today. | Same facts: D-3 (`FIRST_LEARN_STEP_NARROWED` / `_UNKNOWN`, `BASE_REVISION_MISMATCH`) and the P6 context mismatch all mean the test moved. L5b auto-decision: "slightly loose for a full learn". | yes |
| UX-14 | Low | `guidedNarratives.ts:554-560` | "A step uses a saved input or secret that this test does not declare, so nothing was started." | "A step uses a variable or secret that this test does not declare, so nothing was started." | The action beside it is "Open Variables" (AC-4 verbatim), and the dialog is titled "Variables". | yes |
| UX-15 | Low | `guidedNarratives.ts:600-610`; `RunControl.tsx:293-302` | "Studio could not read the Run already started for this test, so Run is off until a page reload reads it." | "Studio could not read the Run already started for this test, so Run is off. Reload the page to try again." | Same fact (`useGuidedSession.ts:45`: "reload and reconnect only GET"). Plainer next step. | yes |
| UX-16 | Low | `ChecksStudioPage.tsx:1473-1478`; `GuidedRunStatus.tsx:63-64` | After finalize is refused with 400/409 (and not resent): "Steps not ready to repeat." **and** "Saving what this run learned…" with a progress bar | Code only: hide the `FINALIZING` line while `guided.pending` is `NOT_READY` or `REAUTHENTICATION_REQUIRED`. | AC-2 (not ready, never published). The `useGuidedSession.ts` header: "`400`/`409` on finalize: … finalize is not sent again". [V] the mirror holds `FINALIZING` until a finalize succeeds (`guidedHandlers.ts:51`). | yes (code only) |
| UX-17 | Low | `guidedNarratives.ts:372-409` | The four login sentences end with no period ("…, then Run again") | Add a final "." to each. | Adapted (punctuation only). Every neighbouring sentence ends with one. AC-4 transcribes them without. | yes |
| UX-18 | Low | `references/referenceTokens.ts:100` | "Vault is not connected for this environment." | "Vault is not connected for this environment, so secrets are off for this test." | L4 §5 row (existing text), matched to its error-state sibling "…, so they are off." This states the consequence. | yes |
| UX-19 | Low | `ReadinessChip.tsx:28-30`; `ChecksStudioPage.tsx:1441-1449` | `UNLEARNED` with steps: no readiness text; "Run saves your steps and records proof." | When readiness is `UNLEARNED`, add under the placeholder the AC-3 verbatim sentences: "The first Run works through them on the live page and saves what it learned. Later Runs repeat it in seconds." | AC-3 never-learned copy (verbatim). The `ReadinessChip` comment says the empty state speaks for `UNLEARNED`, but the empty state is shown only when there are zero steps. | yes |
| UX-20 | Low | `guidedNarratives.ts:351-356` | "Steps changed" | "Steps changed — next Run learns from the first changed step" | Adapted from the AC-3 chip; D-3 (`firstLearnStepId = firstChangedStepId` as served). This keeps the consequence when k cannot be numbered. | yes |
| UX-21 | Low | `GuidedClarification.tsx:113-121` | role and region (page strings) render as plain caption text | Code only: render the role and region values in the same untrusted style as the label (monospace, tinted). Keep the "role:" and "region:" prefixes. | AC-3 / AC-8 c "Page-derived labels get untrusted styling plus their role and region" (a security rule). `clarification.schema.json`: free strings. | yes (code only) |
| UX-22 | Low (record) | `ChecksStudioPage.tsx:1184-1185`, `:1698` | New unrecorded variants: "A name in <var NAME> has to match a row in Variables." (secrets off) and "Use in steps as: <var NAME> or <secret SECRET_ID>" (secrets on) | No text change. Record both as adapted ("secret clause dropped or added with the capability", GA C-7, the same basis as L4 §5 row "Use in Studio steps as <var NAME>"). | Check 1 ("every visible string is cited or recorded") | **no** (record only) |

## Observations (Info; no change proposed)

- **OBS-1 (user-decided, not re-proposed).** "None of these" and a declined confirmation end in the existing `CANCELLED` narrative. That narrative says "Someone pressed Stop. …" and "Start the test again whenever you want a complete run." [V] `GuidedCompletion.tsx:250-254`, `executionErrorNarratives.ts:117-124`.
  - On this path nobody pressed Stop, so the first sentence is untrue there.
  - The user descoped the user-initiated variant on 2026-10-17 (scope decision R5), so I do not propose one.
  - Raised so the user can decide whether to accept the mismatch. Changing it needs a new user decision.
- **OBS-2.** The button reads "Run Test", while the copy says "Run" ("press Run", "Run again"). The meaning is clear, and E2E selectors depend on "Run Test". No change.
- **OBS-3.** Secret-related `FAILED` codes get the generic narrative plus the raw code. These are `SECRET_UNAVAILABLE`, `SECRET_USE_NOT_AUTHORIZED`, `SECRET_USE_REVOKED`, `VAULT_UNAVAILABLE` and `SECRET_TOO_LONG` (tech gate F-L5a-6). It is honest, but a nontechnical author cannot act on it. A post-GA copy candidate; not an AC requirement.
- **OBS-4.** Per-action seek buttons can repeat the same label across steps ("Seek to action: Fill field"), and they are tied to a step only by layout. A step whose actions have stamps but whose step has none shows action buttons with no step label. The labels are verbatim AC-7.
- **OBS-5.** After a learned Run, "Completed — learned from this run." appears twice in a row: in the completion alert, and as the history fact in "Steps as learned". AC-6 requires the facts apart, so this is acceptable.
- **OBS-6.** Secret token placeholders differ by surface: `<secret NAME>` (AC-4, the empty state), `<secret SECRET_ID>` (Variables dialog), `<secret ID>` (picker). The dialog's form is deliberate: the row name is an alias, and the token uses the Vault name (F-L5b-4). Unify after GA if wanted.
- **OBS-7.** A session-unreadable read that keeps failing with 400 or 409 leaves Run off in that tab on every reload, because the pointer lives in that tab's `sessionStorage`. This is root's ruling (keep the pointer, start nothing, say so). Flagged as a possible dead end only.
- **OBS-8.** For `GUIDED_POLICY_ABSENT`, the lines read "…until the policy … is approved. Ask the CSI owner to approve it." and "There is no policy for this application and environment yet." Asking to approve a policy that does not exist is slightly off, but both lines are true.
- **OBS-9.** The pending line "Steps not ready to repeat." states the state but not what happens next (re-authentication, or Studio still trying). AC-2 asks for exactly "pending / not ready", so it is met.

## Q9 "authored-literal" hint: judgement asked for

- **Wiring [V].** `authoredLiteralHint.ts` implements Q9 §3 exactly: `FAILED`; `failure?.code ?? errorCode` in {`TARGET_MISMATCH`, `BUDGET_EXCEEDED`}; `failedStepIdOf` names a step in the draft; and the clause predicate. `GuidedCompletion` adds the hint below the budget sentence and replaces nothing.
- **Is the wording true on an unrelated budget stop (R2)?**
  - Its first sentence is a capability statement. The runner withholds every non-secret authored value: [V] `studio-runner/src/guided/runtime.ts:239` and `:281`, and the authored-input kinds are `destination`, `nonsecretText` and `secretRef`. So the sentence is true *if* the step carries such a value.
  - Placed under "This run reached its learning budget…", it reads as the cause. The advice "Try rewording the step" cannot clear a CSI, model or window budget.
  - The lexical predicate also fires on steps such as "Check the cart is empty", which may carry no authored value [I].
  - So on R2 the hint can mislead by implication, not only be irrelevant. UX-03 hedges it ("This may be because of step N … If so, …"). The hedge keeps the hint true on both the acquisition path and R2, and names the step.

## Unfreeze summary

- **Recommended before GA (Medium):** UX-01, UX-02, UX-03, UX-04, UX-05. Each one either needs an unfreeze, or root's explicit acceptance or deferral with a recorded reason. None needs a contract or AC change.
  - Copy changes add or alter `GUIDED_COPY` rows. They keep the basis rules the copy-table test enforces: new delegated keys quote their facts from the files named above.
- **Low:** UX-06 to UX-21 can ship deferred to a post-GA copy pass if root accepts them. UX-22 is record-only and needs no unfreeze.
- **If one unfreeze unit is opened**, its write set is:
  - `guided/guidedNarratives.ts` (+ `guided.test.tsx` copy table), `guided/GuidedCompletion.tsx`, `guided/GuidedClarification.tsx`;
  - `run/RunControl.tsx`, `run/useRunGate.ts`, `run/ExecutionProgressView.tsx`;
  - `pages/ChecksStudioPage/ChecksStudioPage.tsx`, `references/referenceTokens.ts`;
  - plus the page tests that pin the changed strings.
