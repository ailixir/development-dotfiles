# STUDIO-OBS-008 — lane L5a receipt (guided and evidence presentational components + LoginRequiredNotice adapter)

- **Executor:** Uma (@ux-design-expert), YOLO. **Wave:** W2. **Date:** 2026-10-17. **Gate:** @dev technical gate at F1.
- **Governing definition:** `prep-20261016/lanes.json` → `w0Refold20261017.lanes[id=L5a]` (writes, verify, exit); plan §1 AC-3/AC-4/AC-6/AC-7 and R.2; T0 rulings A1.6, A2, A3; story `STUDIO-OBS-008.story.md` (read only, not edited).
- **Status:** **EXIT MET** on the three verify rows (all green, see §4). Open items for root are in §8; the copy-basis question there is the one that can change the verdict.
- **Not done by this lane:** no git commit/push/stash; no `pnpm install`/`add`; `.aiox-core/core/permissions/dispatch-governance.js` not touched; no PID signalled; story not edited; `studioWcagAudit.test.tsx` not run (it rewrites `docs/qa/accessibility/axe-results.json`, whose single writer is L6).

## 1. Files

Written or modified by L5a (sha256 after the last edit, measured with `shasum -a 256`):

| File | State | sha256 |
|---|---|---|
| `frontend/src/components/studio/guided/GuidedRunStatus.tsx` | new | `f3aeeb43b552ee9a0002a12356ac4d77ee65f6204d4c27aa693d0d61c0919574` |
| `frontend/src/components/studio/guided/GuidedClarification.tsx` | new | `e6d6576c22be69926bed8f1afd1b537e03f9dff2b7ae7b06dd4f1caf2c17b501` |
| `frontend/src/components/studio/guided/LoginRequiredNotice.tsx` | new (`loginNoticeFrom` adapter + step-less variant) | `aa826d0c06b89d8d29bd307c05470ac3662d851492c8fa2f49b17e36bac1da1c` |
| `frontend/src/components/studio/guided/GuidedCompletion.tsx` | new (`GuidedCompletion` + `GuidedStartFeedback`) | `2e2b685331e9c91ab08207c8224b16823fc7a86c9b35743757a2ec6f704c7d60` |
| `frontend/src/components/studio/guided/ReadinessChip.tsx` | new | `436f18272556ae253e851058af1371ab6612f34ac44477367639ace650fdbee2` |
| `frontend/src/components/studio/guided/PlanExplanation.tsx` | new | `23c0aa4479f75bc324a1b2f672e7436fc5848cace4b818767cb906ec2b04bd9d` |
| `frontend/src/components/studio/guided/guidedNarratives.ts` | new | `b1b767b3ee8c0396b7ea386f5eb9c9071ed6036f3a5fe874b0535098eaa75ebc` |
| `frontend/src/components/studio/guided/index.ts` | new | `708afe1c57f671d7d37071a2775846d40991bdd48626e65e5b4e191802ab1999` |
| `frontend/src/components/studio/guided/guided.test.tsx` | new | `ea10b51addd9adb5b019cfbf226510ba5818b1f996e971c8aa65aa3a9f3d53a9` |
| `frontend/src/components/studio/guided/clarification.test.tsx` | new | `deb61efcb758be32d19b73d0a3a626c358faaeff11c0b32c9d6c6f442577275e` |
| `frontend/src/components/studio/guided/loginRequired.test.tsx` | new | `6fb0cc6783fba5306ac0c5d9d75184ad65141562086c44a519abd1c0e2ae3911` |
| `frontend/src/components/studio/guided/planExplanation.test.tsx` | new | `5e4e30925da55b7eeea5e2364fd1dfe536f7f545056125260ca9cc3d1248d150` |
| `frontend/src/components/studio/evidence/VideoEvidencePanel.tsx` | modified (before `d591d740b88cbbddbacf9e10489a8199f0e750c214a1798f00325cb01882bbe3`) | `2ccd0fd4e3ffa032a028ad87feefde163001e5091c3a33eb2ba88915e25a1a86` |
| `frontend/src/components/studio/evidence/index.ts` | modified (before `86b0926f9a41a2f6e2e55b265f19af7f28fd8d1f7987aecae21fce8f38356f1b`) | `6b77b840800042fe9a1b15a9cd12855b3fd40ebc8bb31474ece87f6acfd73533` |
| `frontend/src/components/studio/evidence/GuidedSeekControls.tsx` | new | `4916e6a9c053fee9c1c9e551953a2ec9a3b1754c6c72f025663e71502619730e` |
| `frontend/src/components/studio/evidence/guidedSeekTargets.ts` | new | `d90f082f0bfd7281f3c97598ac86201f34faca7d78ed078043ac697422c3ce12` |
| `frontend/src/components/studio/evidence/guidedEvidence.test.tsx` | new | `6af3a839b90d762b592826d46bb08fe0d48d1781093a4af978ef2b8d782ff0c6` |
| `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/lanes/L5a/receipt.md`, `receipt.json`, `logs/*` | new | (this receipt) |

Unchanged on purpose (hash identical before and after): `evidence/studioVideoUrl.ts` `09ac40f0…5c199` (export path and signature kept for L2b's `videoPath`), `evidence/seekEligibility.ts` `d9e57d1a…a21e` (`ExecutionProgressView` imports it), `evidence/useVideoSeek.ts` `d43f4d3d…284f`, `evidence/videoEvidenceNarratives.ts` `62eca736…1b11` (PLAYBACK-COPY descoped), and the four existing evidence test files.

Inputs built against (read only; sha256 at the final verify run):

| Input | sha256 | Note |
|---|---|---|
| `frontend/src/types/studio/studioGuidedTypes.ts` | `d364496975b92943bb93bc3da3bd848c32f559e96dc81b88f2dddd01a7046ed6` | The W2.0 freeze was `bda1be53…`; I verified that hash at lane start. L2b changed it during its body step (I saw only `GuidedStartRefusal`/`GuidedPendingReason` doc comments change; the exports I use are the same). Type-check is green against the current bytes. |
| `frontend/src/services/api/studioGuidedApi.ts` | `e3d06009558ee9b912aed6df715c6f4faa9c456cfbfdb3485e1a5607fdc7d849` | Freeze was `a048a28e…`; L2b body step. `videoPath(sessionId)` is what the panel calls. |
| `frontend/src/types/studio/studioTypes.ts` (L2a) | `8f877ce4ad097566042211faada30e1c726319745edb45c30b33c7c31cf327d2` | `ReplayFailure` and `ExecutionSnapshot.replayFailure` were already exported by L2a, so the adapter uses L2a's type directly. **No local structural type was made, so nothing has to switch at F1.** |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | `d3840220bfda8eb436821eb31519573b0110d14756c092d8a46d0d717d8a6bfc` | The story moved past the `73c09cb2…` that lanes.json cites; the copy-table test quotes the bytes on disk. |
| `prep-20261016/t0-rulings/ruling.md` | `1127e9950d8228343599ac8b66253b62bd70c681c8a0c269b128873163842497` | Matches lanes.json. |
| `prep-20261016/lanes.json` | `42f85ee0e7725c08c6f2bf56b72eac6fc07d424f0ab394b46e4940834575c99e` | |
| `prep-20261016/implementation-plan.md` | `756ba6ed5fb176848db10bcc34e405c36df38bafece8a8822c453437610ffee5` | |
| `execution-20261015/ux-implementation-plan.json` (Uma's owned copy record) | `a2c33684fd58f6c9f77982f393337bb0ccdd8b8a73fbc9ca9aacc4da0c9d6753` | |
| `execution-20261015/architect-rulings.json` (P2–P4, label vocabulary) | `1476ce905c4927a827b2bf05319031fb55c67806cca63b78a3264b67b4e37a7d` | |
| `docs/specs/studio-observed-authoring/consensus-plan.md` §9 | `8533a334271403ac307e7ca7e8b780a16e02abb0d1283d0fe9c14f0f3b118ff2` | |
| `docs/specs/studio/openapi.yaml` | `2f4041aec633c69d5614ff6b5dbba74048a52341c58acb9116ec47af1cd61700` | Post-L0 W1 document. |
| `contracts/v3/fixtures.json` / `publication-fixtures.json` | `fb1f9856…2fc6` / `861619da…0144` | Test payloads are these landed documents, varied field by field. |

## 2. What the components do (batons to L5b at F1)

All are presentational: props in, callbacks out. Requests, cancel, focus and Redux belong to the page (L5b) and the hook (L2b).

| Export | Props / input | Callbacks to the page |
|---|---|---|
| `GuidedRunStatus` | `session` (`state`, `progress`, `firstLearnStepId`), `draftStepIds` | none |
| `GuidedClarification` | `clarification`, `step` (= `session.progress.activeStep`), `disabled?` | `onAnswer(choiceId)`; `onNoneOfThese(stepId)`, which the page turns into cancel-then-focus (A3) |
| `LoginRequiredNotice` + `loginNoticeFrom` / `guidedLoginNotice` / `replayLoginNotice` | `notice`, `draftStepIds` | `onGoToStep(stepId)` (the page focuses the row), `onOpenVariables()` |
| `GuidedCompletion` | `input: {kind:'guided', result, firstLearnStepId?} \| {kind:'replay', snapshot}`, `draftStepIds`, `authoredLiteralHint?` | `onGoToStep`, `onOpenVariables` (passed to the login notice) |
| `GuidedStartFeedback` | `input: {kind:'refusal', refusal: GuidedStartRefusal} \| {kind:'unavailable', code}` | `onLearnFromFirstStep()` (BASE_IDENTITY_INCOMPLETE only), `onOpenVariables()` (MISSING_SOURCE only) |
| `ReadinessChip` | `test` (`readiness`, `firstChangedStepId`, `readinessReason`), `draftStepIds` | none |
| `PlanExplanation` | `result` (`explanation`, `publication`, `currentReadiness`) | none |
| `VideoEvidencePanel` | unchanged `snapshot` **or** new `guided: {sessionId, result}` | `ref` (unchanged) |
| `GuidedSeekControls` | `result`, `recording?` (`useVideoSeek().recordingDurationMs`) | `onSeek(offsetMs)` → `useVideoSeek().seekToOffset` |

`guidedNarratives.ts` also exports the replay drift strings (`replayDrift`, `learnAgainFromStep`) and `seekToStep` for L5b's `executionErrorNarratives` / `ExecutionProgressView` work. L5a does not render them on the replay path.

## 3. Copy table (69 entries, generated from `GUIDED_COPY` at sha256 `b1b767b3…`)

This table is produced from the code, not typed by hand. A scratchpad script transpiled `guidedNarratives.ts` and printed `GUIDED_COPY`. `guided.test.tsx` also enforces every row:

- each quote is an exact substring of its cited file (for `.json`, of one of its string values);
- `verbatim`: the template with its `{…}` braces removed equals the quote;
- `adapted` and `delegated`: a `note` is required;
- `delegated`: the quoted `FACT` must exist in its own file.

**Basis counts:** 31 verbatim, 17 adapted, 21 delegated.

- **verbatim:** the text exactly as the source has it. Only the `{token}` values are filled in.
- **adapted:** the source text with the mechanical change stated in the note.
- **delegated:** wording I wrote because the story, ruling or plan names @ux-design-expert as its writer (the `Quote` column cites that clause). The `FACT` is the recorded fact the sentence states.

Root has to rule on whether the delegated rows meet the brief's "no invented copy". See §8 Q1.

**Reused, not copied** (imported from the existing modules, unchanged):

| Use | Narrative | Source |
|---|---|---|
| Guided `CANCELLED` (ruling A3: "the existing `CANCELLED` narrative is shown unchanged") | `EXECUTION_ERROR_NARRATIVES.CANCELLED` (title, browserClaim, remedyOwner) | `frontend/src/components/studio/run/executionErrorNarratives.ts` |
| Start refused `RUNTIME_INCOMPATIBLE`, capability `RUNTIME_INCOMPATIBLE` (P4 "Existing refusal"; D-11 names no cause) | `EXECUTE_CONFLICT_NARRATIVES.RUNTIME_INCOMPATIBLE` | `frontend/src/components/studio/run/executeRefusals.ts` |
| Start refused `403` / `FORBIDDEN_SCOPE`, capability `FORBIDDEN_SCOPE` | `EXECUTE_FORBIDDEN_NARRATIVE` | same |
| Start refusal with no wording here (`401`, `503`, platform `RATE_LIMITED`, other codes), code shown as it arrived | `UNDECLARED_EXECUTE_REFUSAL` | same |
| `READY` chip, current-readiness fact | `LEARNED_READY_LABEL` "Learned · ready to repeat" | `frontend/src/components/studio/run/runEnablement.ts` |
| Guided video states, partial qualifier, playback failure | `videoEvidenceNarratives.ts` (unchanged; PLAYBACK-COPY descoped) | `frontend/src/components/studio/evidence/videoEvidenceNarratives.ts` |

**Absent on purpose:**

- "Secrets can only be typed into a password box." Struck by ruling A2. It is absent from `guidedNarratives.ts`, and two tests assert this: `copy table … > A2: the struck secret-fill copy is absent from guidedNarratives.ts and from every entry`, and `A2 negative: an INVALID_CONTRACT result never renders the secret-fill copy; it gets the generic narrative`.
- The user-initiated `CANCELLED` variant: descoped by the user, 2026-10-17.
- Neutral recording wording (PLAYBACK-COPY): descoped by the user, 2026-10-17.

| # | Key | Text (template; `{…}` = server value) | Basis | Source file | Quote | Note / delegated fact |
|---|---|---|---|---|---|---|
| 1 | `preparing` | Preparing your steps. | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Preparing your steps. |  |
| 2 | `understanding` | Understanding this page — step {N} of {M}. | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Understanding this page — step N of M. |  |
| 3 | `understandingNoStep` | Understanding this page. | verbatim | `docs/specs/studio-observed-authoring/consensus-plan.md` | Understanding this page. | Used only when progress.activeStep is null, so N cannot be stated (P2: never inferred). |
| 4 | `running` | Running step {N} of {M}. | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Running step N of M. |  |
| 5 | `repeatingPrefix` | Repeating saved steps 1–{(k-1)}… | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Repeating saved steps 1–(k-1)… |  |
| 6 | `repeatingPrefixNoBoundary` | Repeating saved steps… | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Repeating saved steps 1–(k-1)… | The range is dropped when the first step to learn is not in the current draft, so k cannot be stated. |
| 7 | `learningFrom` | Learning from step {k} | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Learning from step k |  |
| 8 | `finalizing` | Saving what this run learned… | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Saving what this run learned… |  |
| 9 | `clarificationQuestion` | Step {N} says: '{<step text>}'. Which one did you mean? | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Step N says: '<step text>'. Which one did you mean? |  |
| 10 | `noneOfThese` | None of these — I'll edit step {N} | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | None of these — I'll edit step N | Ruling A3: cancels the session, then the page moves focus to step N. Also the decline of a side-effect confirmation (UX plan sideEffectConfirmation.decline). |
| 11 | `continue` | Continue | verbatim | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json` | Continue | UX plan sideEffectConfirmation.submit. Also the submit of a disambiguation question, which AC-3 gives no button wording for. |
| 12 | `pageDerived` | Page-derived | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | labels are rendered as page-derived (untrusted styling + role/region shown) | The AC-3 term, capitalised as a marker. |
| 13 | `pageRole` | role: {role} | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | role/region shown | The AC-3 word "role" as the label of the value the contract carries (choices[].role). |
| 14 | `pageRegion` | region: {region} | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | role/region shown | The AC-3 word "region" as the label of the value the contract carries (choices[].region). |
| 15 | `expiresIn60` | This question expires in 60 seconds. If it expires, this run will stop and you will need to Run again. | verbatim | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json` | This question expires in 60 seconds. If it expires, this run will stop and you will need to Run again. | AC-3: expiry warnings at 60 s and 20 s stating the consequence. Timed from expiresAt. |
| 16 | `expiresIn20` | This question expires in 20 seconds. If it expires, this run will stop and you will need to Run again. | verbatim | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json` | This question expires in 20 seconds. If it expires, this run will stop and you will need to Run again. |  |
| 17 | `confirmTitle` | Confirm this action before it runs. | verbatim | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json` | Confirm this action before it runs. |  |
| 18 | `confirmBody` | Step {N} says: '{<authored step text>}'. Continue with this action? | adapted | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json` | Step N says: ‘<authored step text>’. Continue with this action? | Curly quote marks replaced by the straight ones AC-3's question uses, so both prompts read alike. |
| 19 | `completedLearned` | Completed — learned from this run. | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Completed — learned from this run. |  |
| 20 | `completedReplay` | Completed — saved steps replayed. | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Completed — saved steps replayed. |  |
| 21 | `completedPartial` | Completed — steps {k}–{n} learned again. | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Completed — steps k–n learned again. |  |
| 22 | `relearnedAfterPrefixDrift` | Steps {j…} were re-learned because the page changed. | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | steps j… were re-learned because the page changed | Capitalised and closed as its own sentence. "j…" is filled as j–(k-1), the window OBS-015 AC-4 (2) marks re-learned ("steps j…k-1"), when the session's original k is known; otherwise as "j…". |
| 23 | `publicationConflict` | Run completed; steps not ready to repeat. | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Run completed; steps not ready to repeat. |  |
| 24 | `unknownOutcome` | Stopped — submission outcome unknown. | verbatim | `docs/specs/studio-observed-authoring/consensus-plan.md` | Stopped — submission outcome unknown. | AC-3 names UNKNOWN_OUTCOME without a sentence; this is the approved wave design row for it. No Run-again control. |
| 25 | `expired` | This run expired before it finished, so it stopped. You will need to Run again. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | AC-3 names EXPIRED without a sentence. The consequence clause is the one the expiry warnings use. FACT: `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json` — "If it expires, this run will stop and you will need to Run again." |
| 26 | `assertionFailed` | A step that checks the page did not pass, so this run stopped. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | AC-3 names ASSERTION_FAILED without a sentence. FACT: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` — "`LOGIN_REQUIRED` (AC-4) · `ASSERTION_FAILED` · `UNSUPPORTED_SURFACE` · `BUDGET_EXCEEDED`" |
| 27 | `unsupportedSurface` | This step needs a part of the page that Studio cannot work with, so this run stopped. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | AC-3 names UNSUPPORTED_SURFACE without a sentence. FACT: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` — "`LOGIN_REQUIRED` (AC-4) · `ASSERTION_FAILED` · `UNSUPPORTED_SURFACE` · `BUDGET_EXCEEDED`" |
| 28 | `budgetExceeded` | This run reached its learning budget, so Studio stopped it. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | AC-3 names BUDGET_EXCEEDED without a sentence. FACT: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-014.story.md` — "daily budget exhausted ⇒ next model call refused and the session ends `BUDGET_EXCEEDED`" |
| 29 | `nothingStartsOnItsOwn` | Nothing starts again on its own. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | Said with every budget refusal and stop. FACT: `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json` — "no automatic start when timerends" |
| 30 | `failedUnnamed` | This run stopped. The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket. | adapted | `frontend/src/components/studio/run/executeRefusals.ts` | The reason the server gave is shown below exactly as it arrived, so it can be quoted in a ticket. | The undeclared-refusal sentence, led by "This run stopped." for a session that failed rather than one that was refused. Used for INVALID_CONTRACT (ruling A2: "the generic INVALID_CONTRACT narrative") and every failure code without its own narrative. |
| 31 | `governedPolicyDeniedTitle` | This action could not be run. | verbatim | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json` | This action could not be run. | Inherited OBS-014 item a (copy by @ux-design-expert, item c). Names no cause and is not the secret-fill copy. |
| 32 | `governedPolicyDeniedBody` | Studio stopped this run under the action safety settings. Check the step wording and ask the CSI owner to review the side-effect setting. | verbatim | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json` | Studio stopped this run under the action safety settings. Check the step wording and ask the CSI owner to review the side-effect setting. |  |
| 33 | `governedPolicyDeniedRemedy` | For a checkbox or switch, say “check” or “uncheck” explicitly. | verbatim | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/ux-implementation-plan.json` | For a checkbox or switch, say “check” or “uncheck” explicitly. |  |
| 34 | `authoredLiteralTargetNotFound` | Studio cannot see page text that matches a value written in this step. Try rewording the step, for example by checking for a longer or different piece of visible text. | delegated | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | @ux-design-expert writes the wording under the AC-3 conventions | Conditional KL-015-Q4 copy key (named for STUDIO-OBS-009 AUTHORED-ECHO-01 f to remove). The trigger is the page's, not this module's. FACT: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` — "the narrative explains that Studio cannot see page text that matches a value written in the step, and suggests rewording (for example, assert a longer or different visible text)" |
| 35 | `replayDrift` | Step {N} no longer matches the page… | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Step N no longer matches the page… |  |
| 36 | `learnAgainFromStep` | Learn again from step {N} | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Learn again from step N | Also the explicit first-step learn a BASE_IDENTITY_INCOMPLETE start refusal offers (architect P4). |
| 37 | `needsRelearn` | Steps changed — next Run learns from step {k} | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Steps changed — next Run learns from step k |  |
| 38 | `needsRelearnNoBoundary` | Steps changed | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Steps changed — next Run learns from step k | The clause naming k is dropped when firstChangedStepId is not in the current draft. |
| 39 | `baseIdentityIncomplete` | Saved learning cannot be reused — next Run learns from step 1 | delegated | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | @ux-design-expert writes the chip copy for this case | D-4: must not tell the author that they changed steps. Same shape as the AC-3 NEEDS_RELEARN chip. FACT: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` — "means saved learning cannot be reused, and the next Run must learn from the first current step" |
| 40 | `loginNoLoginSteps` | This page asks you to sign in. Add login steps before step {N} using your secrets (`<secret NAME>`), then Run again | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | This page asks you to sign in. Add login steps before step N using your secrets (`<secret NAME>`), then Run again |  |
| 41 | `loginStepsFailed` | Your login steps did not sign you in; check the secret and the steps before step {N} | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Your login steps did not sign you in; check the secret and the steps before step N |  |
| 42 | `loginNoLoginStepsStepless` | This page asks you to sign in. Add login steps using your secrets (`<secret NAME>`), then Run again | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/t0-rulings/ruling.md` | @ux-design-expert words the step-less variant | The AC-4 sentence without "before step N", for a step that is no longer in the draft. FACT: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` — "If the step no longer exists in the current draft, "Go to step N" is omitted and "Open Variables" stays" |
| 43 | `loginStepsFailedStepless` | Your login steps did not sign you in; check the secret and your login steps | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/t0-rulings/ruling.md` | @ux-design-expert words the step-less variant | The AC-4 sentence with "the steps before step N" replaced by "your login steps". FACT: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` — "If the step no longer exists in the current draft, "Go to step N" is omitted and "Open Variables" stays" |
| 44 | `loginStepGone` | The step where this happened is no longer in your steps. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/t0-rulings/ruling.md` | @ux-design-expert words the step-less variant | Says why the step-less variant names no step. FACT: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` — "If the step no longer exists in the current draft, "Go to step N" is omitted and "Open Variables" stays" |
| 45 | `goToStep` | Go to step {N} | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Go to step N |  |
| 46 | `openVariables` | Open Variables | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Open Variables |  |
| 47 | `planTitle` | Steps as learned | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Steps as learned |  |
| 48 | `stepHeading` | Step {N} | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Step N says: '<step text>' | The AC-3 step reference, alone, as the heading of a step. |
| 49 | `learnedInThisRun` | Learned in this run | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | whether the step was learned in this run | AC-6 fragment, capitalised. |
| 50 | `reusedFromPreviousRevision` | Reused from a previous revision | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | reused from a previous revision (`reusedFrom`) | AC-6 fragment, capitalised. |
| 51 | `relearnedAfterDrift` | Re-learned after drift | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | re-learned after drift (`relearnedFrom`) | AC-6 fragment, capitalised. |
| 52 | `referenceFlow` | {binding} from step {producer} → {slot} in step {consumer} | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Order number from step 2 → Reference in step 4 | The AC-6 example as a pattern. binding is the declared ID; slot is the P3 label of the operation that consumes it. |
| 53 | `slotFill` | Fill field | adapted | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json` | Fill field | P3 label of operationKind fill, used for argumentSlot fill.value. |
| 54 | `slotSelectOption` | Select option | adapted | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json` | Select option | P3 label of operationKind selectOption, used for argumentSlot selectOption.value. |
| 55 | `slotAssertExpected` | Check expected result | adapted | `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json` | Check expected result | P3 label of operationKind assert, used for argumentSlot assert.expected. |
| 56 | `notReadyNow` | Steps not ready to repeat. | adapted | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Run completed; steps not ready to repeat. | The AC-3 clause, alone, as the current-readiness fact when currentReadiness.ready is false (AC-6: shown apart from PUBLISHED history). |
| 57 | `seekToStep` | Seek to step {N} | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Seek to step N |  |
| 58 | `seekToAction` | Seek to action: {<safe label>} | verbatim | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Seek to action: <safe label> |  |
| 59 | `policyNotApproved` | Learning cannot start until the policy for this application and environment is approved. Ask the CSI owner to approve it. | delegated | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | @ux-design-expert owns the exact source-cited wording | Inherited POLICY_NOT_APPROVED item a. Not action-level POLICY_DENIED, secret copy, entitlement or platform mismatch. FACT: `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json` — "ask CSIowner for application/environment policy approval" |
| 60 | `policyAbsent` | There is no policy for this application and environment yet. | delegated | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | @ux-design-expert owns the exact source-cited wording | messageCode GUIDED_POLICY_ABSENT. FACT: `docs/specs/studio/openapi.yaml` — "approved governed observation policy, or its latest version is not yet approved" |
| 61 | `policyUnapproved` | The policy for this application and environment has not been approved. | delegated | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | @ux-design-expert owns the exact source-cited wording | messageCode GUIDED_POLICY_UNAPPROVED. FACT: `docs/specs/studio/openapi.yaml` — "approved governed observation policy, or its latest version is not yet approved" |
| 62 | `policyPendingVersion` | A newer version of the policy is waiting for approval, and it blocks new learning until it is approved. | delegated | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | @ux-design-expert owns the exact source-cited wording | messageCode GUIDED_POLICY_PENDING_VERSION. FACT: `docs/specs/studio/openapi.yaml` — "an edit awaiting approval blocks new learning even while an older version is active" |
| 63 | `baseIdentityIncompleteStart` | Saved learning cannot be reused, so this Run has to learn from step 1. Nothing was started. | delegated | `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | @ux-design-expert writes the chip copy for this case | D-4 start refusal (REVISION_CONFLICT, messageCode BASE_IDENTITY_INCOMPLETE). Offers "Learn again from step 1"; never learns on its own. FACT: `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json` — "explain saved learning cannot be reused and offer explicit full learn from first currentstep" |
| 64 | `revisionNotReady` | This test is not ready to start learning from that step, so nothing was started. Press Run again to start from the latest saved steps. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | D-3: FIRST_LEARN_STEP_NARROWED, FIRST_LEARN_STEP_UNKNOWN and BASE_REVISION_MISMATCH. FACT: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` — "Each is shown as not-ready start feedback, with no automatic retry and no session." |
| 65 | `referenceMissing` | A step uses a saved input or secret that this test does not declare, so nothing was started. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | Start refusal MISSING_SOURCE / AUTHORING_REFERENCE_MISSING. Offers "Open Variables". FACT: `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json` — "409 AUTHORING_REFERENCE_MISSING: focus declared reference/step editor" |
| 66 | `originNotAllowed` | Studio does not have approved access to this application, so nothing was started. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | Start refusal ORIGIN_NOT_ALLOWED. No login guess and no automatic switch. FACT: `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json` — "explain approved application access is unavailable" |
| 67 | `budgetCsi` | The learning budget for this CSI is used up for now, so nothing was started. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | Start refusal 429 BUDGET_EXCEEDED with retryable true (per-CSI budget). FACT: `docs/specs/studio/openapi.yaml` — "budget (STUDIO-OBS-014 AC-8) and always carries `Retry-After`" |
| 68 | `budgetRetryAfter` | You can Run again in {duration}. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | Retry-After, whole seconds, formatted. Shown only when the header was sent. FACT: `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/architect-rulings.json` — "Use actual retryable/RetryAfter CSIor session distinction" |
| 69 | `budgetSession` | This test is over a limit for a single Run, so nothing was started. Waiting will not change this. | delegated | `docs/qa/evidence/STUDIO-OBS-008/prep-20261016/implementation-plan.md` | ### AC-3: states and copy (L5a components, L5b wiring; copy by Uma) | Start refusal 429 BUDGET_EXCEEDED with retryable false (per-session bound). FACT: `docs/specs/studio/openapi.yaml` — "per-session bound (for example too many source steps) that no wait resolves" |

## 4. Verify rows (what I ran and what it returned)

All commands were run from `frontend/`. Node `v23.10.0` (host default), pnpm `10.33.0`. Logs are in `lanes/L5a/logs/`.

| # | Command | Result |
|---|---|---|
| V1 | `pnpm exec vitest run src/components/studio/guided src/components/studio/evidence --minWorkers=1 --maxWorkers=2` | **exit 0**: 10 files, **368 passed**, 0 failed, 0 skipped (`logs/vitest-guided-evidence.log`). Breakdown: L5a new tests are `guided.test.tsx` 209 (the copy table expands per entry), `clarification.test.tsx` 15, `loginRequired.test.tsx` 15, `planExplanation.test.tsx` 9 and `guidedEvidence.test.tsx` 15. The existing evidence tests are unchanged and green: `evidencePanel` 41, `studioVideoUrl` 12, `stepSeek` 10, `evidenceExpiry` 3. The path also collects L2b's `useGuidedSession.test.ts` (39 passed). It is not this lane's. |
| V2 | `pnpm run type-check` (`tsc --noEmit`, whole tree incl. in-flight lanes) | **exit 0** (`logs/type-check.log`) |
| V3 | `pnpm exec eslint <the 17 changed files in §1>` | **exit 0, 0 errors, 12 warnings** (`logs/eslint.log`). All 12 warnings are `react-refresh/only-export-components`, because the `.tsx` files also export their pure view functions. The repo's `lint` script does not fail on warnings, and existing `run/ExecutionProgressView.tsx` raises the same warning. |
| baseline | Same V1 path for `evidence` only, before any edit | exit 0, 4 files, 66 passed |
| extra (regression, consumers of the changed `VideoEvidencePanel`) | `pnpm exec vitest run src/pages/ChecksStudioPage/pageEvidence.test.tsx src/pages/StudioRunsPage/StudioRunsPage.test.tsx src/components/studio/runs --minWorkers=1 --maxWorkers=2` | exit 0, 3 files, 34 passed. Its stderr shows MSW "unhandled GET /api/v1/csi". That noise is in the existing Runs page test and was not introduced here. |

**Not run:** `studioWcagAudit.test.tsx`. It rewrites `docs/qa/accessibility/axe-results.json`, whose single writer is L6, so the regression-guard run belongs to L6/W4. Note: `git status` shows `axe-results.json` modified, with mtime 2026-10-17T16:16:58. This lane did not write it. My vitest runs were at 16:06 and from 16:21 to 16:24, and none included `src/test/a11y`. My **inference** is that a parallel lane's broader run wrote it.

## 5. Exit criterion → test map

| Exit criterion (lanes.json L5a) | Status | Tests (file › describe › it) |
|---|---|---|
| Copy table with per-string source citations | **PASS** | `guided.test.tsx` › `copy table: every guided string traces to a quoted source` › `%s: its quote is in the cited file` (69), `%s: verbatim, so the template without its braces is the quote` (31), `%s: adapted or delegated, so the change or the delegation is stated` (38), `%s: delegated, so the fact it states is quoted from its own source` (21), `A2: the struck secret-fill copy is absent …`, `no entry offers sign-in, account choice, selectors, capture tokens or DOM upload (AC-3)`, `a token without a value throws instead of rendering a hole` |
| PAGE labels rendered as untrusted text | **PASS** | `clarification.test.tsx` › `page-derived labels are untrusted text (AC-3, security)` › `markup in a PAGE label, role or region is rendered as text, never as elements`; `a PAGE label is isolated in <bdi>, marked "Page-derived", styled apart, with its role and region`; `a PAGE choice with region null shows its role and no region`; `AUTHORED and SAVED_INPUT labels are never decorated as page-derived`. Also `planExplanation.test.tsx` › `reference IDs are shown as IDs, in code style, as text` |
| Expiry warnings as text | **PASS** | `clarification.test.tsx` › `expiry warnings at 60 s and 20 s are visible text, timed from expiresAt (AC-3)` › `thresholds`; `a question mounted 45 s before expiry warns at once: the clock is expiresAt, not mount time`; `the warning appears at 60 s and changes at 20 s as time passes` |
| Visible seek labels | **PASS** | `guidedEvidence.test.tsx` › `AC-7 / D-10: named per-step and per-action seek, from server stamps only` › `visible labels "Seek to step N" and "Seek to action: <safe label>" for the landed stamps`; `a seek sets currentTime to the stamp / 1000 through the page's useVideoSeek`; `no stamp, no button …`; `prefixReplay and clarificationWait readings are never seek points …`; `only an AVAILABLE recording offers seeks`; `a stamp past the known end of the recording is a disabled, still-labelled button` |
| Narrow responsive layout | **PASS (component level)** | Styles are mobile-first: the narrow layout is the base style, and the wide layout is under `breakpoints.up('sm')`. jsdom does not evaluate `@media`, so these tests assert the narrow base styles. `guided.test.tsx` › `narrow layout (AC-8 a) …` › `start-feedback actions stack and fill the width; long text wraps`, `the readiness chip label wraps instead of overflowing`; `clarification.test.tsx` › `narrow layout (AC-8 a)` › `the question actions stack and fill the width …`; `loginRequired.test.tsx` › `narrow layout (AC-8 a)` › `the two actions stack and fill the width …`; `guidedEvidence.test.tsx` › `narrow layout (AC-8 a): seek buttons stack and fill the width …`. The page-level 375×812 case (AC-9 "narrow layout") is L5b's. |
| No live region, `aria-current`, reduced-motion or PLAYBACK-COPY work | **Descoped by the user, 2026-10-17** (not PASS) | None of it was added. No `aria-live`, `role="status"`, `aria-current`, `prefers-reduced-motion` or keyboard handler is in any L5a file, and there are no a11y tests. Also descoped by the user, 2026-10-17, and not added: clarification focus-on-entry, radiogroup keyboard handling beyond MUI defaults, and the user-initiated `CANCELLED` wording variant. MUI components are used as they come (for example, `LinearProgress` keeps its default `role="progressbar"`). |

Other AC coverage in this lane (tests in `guided.test.tsx` unless noted):

- AC-3 Run status: `GuidedRunStatus: N, M and k come only from the server (AC-3, P2)` (9 tests).
- AC-3/D-4 chip: `ReadinessChip (AC-3, D-4)` (4 tests).
- AC-3/AC-6 completion: `GuidedCompletion: success comes from the learned receipt (AC-3, AC-6)` (19 tests). These include: PENDING never shown as success; UNKNOWN_OUTCOME and every other outcome render no Run-again control; governed `POLICY_DENIED` (inherited 014-a); the A2 negative; the KL-015-Q4 hint; the replay `PASSED` line.
- P4 start feedback: `GuidedStartFeedback: a refused start is inline feedback, not a session (P4)` (12 tests). These cover POLICY_NOT_APPROVED × 3 messageCodes, BASE_IDENTITY_INCOMPLETE, D-3 × 3, MISSING_SOURCE, ORIGIN_NOT_ALLOWED, RUNTIME_INCOMPATIBLE/FORBIDDEN reuse, and BUDGET per CSI and per session.
- AC-6: `planExplanation.test.tsx` (9 tests).
- Inherited 014-b: `clarification.test.tsx` › `inherited OBS-014 item b: a side-effect confirmation is a confirmation, not a disambiguation` (2 tests).

## 6. A1.6 and A3 coverage that belongs to this lane

| Item | Here (L5a) | Elsewhere |
|---|---|---|
| A1.6 one adapter `loginNoticeFrom({stepId, loginStepsPresent})` | `LoginRequiredNotice.tsx`. Tests: `loginRequired.test.tsx` › `A1.6: one adapter, two sources` (7 tests: copies only the two fields; guided `errorCode`+`detail` from the landed `loginResult`; guided `failure` carrier; replay `replayFailure` gives the same notice as guided; `TARGET_DRIFT`/null/absent give none; **negative control**: `LOGIN_REQUIRED` text in status, messages or logs is never parsed) | — |
| A1.6 test 1, replay login both variants, both actions | The notice in both variants and both actions: `AC-4: both variants, both actions` (4 tests) | L5b: the page flow from a replay snapshot |
| A1.6 test 2, step deleted, so no "Go to step" | `A1.6: the step-less variant, for a step no longer in the draft` (3 tests) | — |
| A1.6 tests 3–6, drift "Learn again from step N" conditions, precedence over `status`/`errorCode` | Copy only: `replayDrift`, `learnAgainFromStep` (verbatim AC-3) | L5b `run/executionErrorNarratives.ts` and page |
| A1.6 test 7, replay "Seek to step N" via the existing replay seek | Copy only: `seekToStep` (verbatim AC-7). The guided seek is `GuidedSeekControls` | L5b `run/ExecutionProgressView.tsx`. Its replay control today reads "Show in recording" (`SEEK_LABEL`), so L5b decides whether it changes |
| A3 "None of these" never sends `clarify` or a fabricated `choiceId` | `clarification.test.tsx` › `A3: "None of these" never answers; it hands the step ID back so the page can cancel, then focus` | Cancel with `reason: userRequested` + stable key, then focus: L2b hook + L5b page |
| A3 declined side-effect confirmation behaves the same way | `Continue answers with the one choice; declining calls back like "None of these"` | L5b |
| A3 `CANCELLED` shows the existing narrative, no user-initiated variant | `guided.test.tsx` › `A3: CANCELLED shows the existing CANCELLED narrative, unchanged and with no user-initiated variant` | — |
| A3 cancel/expiry race, exactly one cancel | — | L2b/L5b |

## 7. Deviations and autonomous decisions

1. **[AUTO-DECISION] `VideoEvidencePanel` input shape.** The plan's shape was `{kind:'replay', snapshot} | {kind:'guided', sessionId, result}`. I used a union discriminated by the prop present instead: `{snapshot}` or `{guided: {sessionId, result}}`. Reason: `runs/RunDetailsDrawer.tsx` and `pages/ChecksStudioPage/ChecksStudioPage.tsx` pass `snapshot={…}`, and those files belong to other lanes. With this shape they compile unchanged. It is still one panel and one renderer, with no legacy path.
2. **[AUTO-DECISION] `studioVideoUrl.ts` gains nothing.** The plan said "gains a guided path builder", but L2b's `studioGuidedApi.videoPath(sessionId)` already composes through `studioVideoUrl`. The panel calls that, so there is one builder and the export path and signature are unchanged.
3. **Start feedback lives in `GuidedCompletion.tsx`** as a second export, `GuidedStartFeedback`, per plan §1 AC-3.
4. **[AUTO-DECISION] Partial/drift numbering follows the landed contract, not the literal D-5 reading.** `relearnedFrom.stepId` is the *effective* boundary. After a drift it equals `driftSwitchStepId` = j, and the result never reports the original k (publication fixtures `source-plan-failure-after-drift-retains-j`, `drift-result-cannot-report-original-k`). So:
   - "steps k–n learned again" uses the effective boundary;
   - the drift line fills "j…" as j–(k₀−1), with k₀ = the session's `firstLearnStepId` (architect P2), passed in as the optional `firstLearnStepId`;
   - when k₀ is not supplied, the drift line falls back to the AC's literal "j…".

   @dev should confirm this reading at the gate.
5. **[AUTO-DECISION] `GuidedClarification` renders nothing** when `progress.activeStep` is null or is not the question's coordinate. P2 says the server guarantees the match, and a prompt without its step would have no sourced wording.
6. **[AUTO-DECISION] Unresolvable numbers drop the clause** rather than guess it:
   - "Repeating saved steps…" when k is not in the draft;
   - "Steps changed" when `firstChangedStepId` is not in the draft;
   - no "Running step N of M." when `activeStep` is null;
   - no "Learning from step k" when the active step is before k (a drift switch the session view does not describe).
7. **D-10 / 015 H9:** a replay with a null `video.status` renders the `UNAVAILABLE` narrative instead of throwing. That is the one behavioural change to the existing replay panel. The other is a new `data-evidence-kind` attribute.
8. **KL-015-Q4:** only the copy key (`authoredLiteralTargetNotFound`) and an `authoredLiteralHint` prop are provided. The trigger is not here: it is @dev's T2 record, and ADR-SC-003 forbids client intent parsing. I did not check whether AUTHORED-ECHO-01 has landed.
9. **Tests read repository documents at test time:** the story, the ruling, the plan, Uma's UX record, the architect rulings, the consensus plan, the OpenAPI and the v3 fixtures. That is what makes the copy-table check real, but it couples the tests to those paths and bytes. Rewording the story or archiving the evidence files turns the copy table red. That is by design, and @dev should accept or reject it at the gate.
10. **Inferences, not verified:**
    - What a clarification expiry does to the session. The consequence clause "this run will stop and you will need to Run again" is Uma's 2026-10-15 record, whose own constraint was to confirm it against the frozen contract. I found no contract text that states it.
    - The difference between `GUIDED_POLICY_ABSENT` and `GUIDED_POLICY_UNAPPROVED`, which I read from the code names plus the OpenAPI grouping.
11. **Parallel-lane drift observed (not acted on):** `studioGuidedTypes.ts`, `studioGuidedApi.ts` and `useGuidedSession.ts` no longer match the W2.0 freeze hashes, because of L2b's body step. Type-check is green against the current tree.

## 8. Open questions for root

- **Q1 (can change the verdict).** The 21 `delegated` rows are wording I wrote where the story or a ruling names @ux-design-expert as the writer. They cover:
  - EXPIRED, ASSERTION_FAILED, UNSUPPORTED_SURFACE, BUDGET_EXCEEDED (AC-3 names these states with no sentence);
  - the start refusals;
  - the D-4 chip;
  - the step-less login variant;
  - KL-015-Q4.

  Each cites its delegation clause and quotes the fact it states, and the test enforces both. If root reads "no invented copy" as excluding them, those 21 rows need PO wording. The components keep working; only the strings would change in `guidedNarratives.ts`.
- **Q2.** Deviation 4: the effective-boundary reading of `relearnedFrom`, plus the session `firstLearnStepId` for the drift window.
- **Q3.** Should `index.ts` re-export L2b's `useGuidedSession`? I left it out to avoid a cross-lane import edit before the F1 baton.

---

## 9. Gate fix: F-L5a-1 never-echo canaries (appended 2026-10-17, after the @dev technical gate)

Source: `lanes/tech-gate-L4-L5a/review.md` F-L5a-1 (medium). Root relayed it with Q2 CONFIRMED and Q1 accepted. I did not touch `frontend/src/services/mocks/studio/*`, which L2a is editing.

**What was added.** One block in `guided.test.tsx`: `describe('never-echo (AC-5(c); I-B6/I-C11): clarification, result and explanation render IDs, never values')`. It follows L4's `referencePicker.test.tsx` pattern: the same DOM, accessible-name, storage and console checks, plus a serializer that is safe on cycles.

- **Canaries:** `Canary-L5a-secret-6c1f0b37-value` and `Canary-L5a-variable-2a9d44e1-value`.
- **Where they are planted (cast through `unknown`):** value-bearing keys the closed contract never has (`value`, `secretValue`, `resolvedValue`), on:
  - the clarification question, each choice (two PAGE choices plus a `SAVED_INPUT` choice whose label is the ID `ORDER_REF`) and the active step;
  - the guided `loginResult`, its `detail` and its `evidence`;
  - a `SECRET_UNAVAILABLE` result and its `failure`;
  - the landed `recordingResult`, each explanation step, action and reference flow, and the explanation itself.

  They also go into two contract fields these components never display: `documentId` and `evidence.ref`.
- **What is rendered:** in one tree, `GuidedRunStatus`, `GuidedClarification`, `GuidedCompletion` for the login result (so `LoginRequiredNotice` too) and for `SECRET_UNAVAILABLE`, `PlanExplanation`, `VideoEvidencePanel` (guided) and `GuidedSeekControls`. The test then chooses the `SAVED_INPUT` option, presses Continue, "Go to step 5" and "Open Variables".
- **Asserted absent:** the canaries are not in `document.body` text or markup, any accessible name, any callback argument, local or session storage, or any `console.*` call.
- **Asserted present:** the IDs are shown. `<secret LOGIN_PW>` is in the question, `ORDER_REF` is the `SAVED_INPUT` label, the plan reference IDs are `[LOGIN_PW, ORDER_REF]`, the flow reads "ORDER_REF from step 1 → Fill field in step 2", the code `SECRET_UNAVAILABLE` is shown, and the login notice is present. The callbacks carry `'saved-input'` and `'protected-step'` only.
- **Two smaller tests:** "None of these" hands back only the step ID; and `guidedCompletionView` / `guidedRunStatusLines` return no canary.
- **Not planted, because they are rendered verbatim by design and their value-freedom is a server guarantee:** `progress.activeStep.text` (the authored sentence, P2), a PAGE `safeLabel`, `video.error` (the story 10.16a rule) and an unnamed `errorCode` (shown as the code that arrived). The test's doc comment says so.

**One source change the canary test exposed.** "Open Variables" (in `LoginRequiredNotice` and `GuidedStartFeedback`) and "Learn again from step 1" passed the React click event to the page's callback, because the handler was attached directly as `onClick`. The callbacks are typed `() => void`, so they now take no argument. The test asserts `onOpenVariables.mock.calls` equals `[[]]`. Nothing else changed.

**Mutation check (done, then reverted).**
1. I added `{String((action as unknown as Record<string, unknown>).value ?? '')}` after `action.safeLabel` in `PlanExplanation.tsx`.
2. `pnpm exec vitest run src/components/studio/guided/guided.test.tsx -t "never-echo" --minWorkers=1 --maxWorkers=2` returned **exit 1**: 1 failed, 2 passed, with `DOM text carries Canary-L5a-secret-6c1f0b37-value` (`logs/gatefix-mutation-check.log`).
3. I restored the file from a copy. Its sha256 is `23c0aa4479f75bc324a1b2f672e7436fc5848cace4b818767cb906ec2b04bd9d` both before and after, unchanged from §1. The same command then passed 3 of 3.

The mutation run came before a type-only edit to the test (`satisfies GuidedChoice` on the planted choice). That edit changes no runtime behaviour.

**Files after the gate fix (sha256):**

| File | Before (§1) | After |
|---|---|---|
| `frontend/src/components/studio/guided/guided.test.tsx` | `ea10b51a…53a9` | `95554acc5fdda9cb36bc24217edc111e3da5bbe0f50dedcb3c2cfbb8e705d9d9` |
| `frontend/src/components/studio/guided/LoginRequiredNotice.tsx` | `aa826d0c…da1c` | `d7c205669f48dba490406f89759b286d12dde56d08a417c0f2c3ffae5bc75883` |
| `frontend/src/components/studio/guided/GuidedCompletion.tsx` | `2e2b6853…7d60` | `8c59d25d1352e6765afdc8c41095dcc6640d5101f713f05187b8e46c23afb6e9` |
| `frontend/src/components/studio/guided/PlanExplanation.tsx` | `23c0aa44…d9bd` | unchanged (mutation reverted) |

**Verify re-run (from `frontend/`, Node v23.10.0):**

| Row | Command | Result |
|---|---|---|
| V1 | `pnpm exec vitest run src/components/studio/guided src/components/studio/evidence --minWorkers=1 --maxWorkers=2` | exit 0, 10 files, **371 passed** (368 + 3 new), 0 failed (`logs/gatefix-vitest-guided-evidence.log`) |
| V2 | `pnpm run type-check` | exit 0 (`logs/gatefix-type-check.log`). The first attempt failed with TS2322 on the planted choice's `labelSource` widening. I fixed it with `satisfies GuidedChoice`, re-ran, and got exit 0. |
| V3 | `pnpm exec eslint` on the three changed files | exit 0, 0 errors, 6 warnings, all the existing `react-refresh/only-export-components` in the two `.tsx` components; none in `guided.test.tsx` (`logs/gatefix-eslint.log`) |

**F-L5a-2 to F-L5a-6** were not asked for in root's message and were not acted on. F-L5a-2 is a commit-set condition for root.
