# Resume / status note — 23 October 2026, local real-stack wave (rounds 044-071)

Written by @dev (Dex) as Article III bookkeeping. It adds to, and does not replace, `RESUME-HANDOFF-20261022-PAUSED.md`. Source of truth: `G/goal-state.json`, with `G` = `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022` (local-only, may be ignored by Git). Story records: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` (Dev Agent Records 2026-10-23, tasks RS71-A..N; change log 0.3.36) and `STUDIO-OBS-010.story.md` (local T0/T1 status). STUDIO-OBS-011 is untouched and Done.

## Lifecycle (updated 2026-10-23 by @po (Pax), PO closure)

| Story | Status | Notes |
|---|---|---|
| 009 | **Done** | Set by @po on @qa round 075 PASS (`G/round-075/qa-gate/GATE.md`, `verdict.json`), after round 073 PASS (local). TF-5 ticked. The other 16 open markers stay unchecked and are annotated "deferred to STUDIO-OBS-016". Change log 0.3.38; section "PO closure — 2026-10-23" |
| 010 | **Done** | Set by @po on the same round-075 PASS. 10 open markers stay unchecked and are annotated. Change log 0.3.22; section "PO closure — 2026-10-23" |
| 011 | Done | unchanged, untouched |
| 016 | **Ready** | PO validate-story-draft GO 9/10. Holds AC-1…AC-22, every one moved from a cited 009/010 item. Deferred, not passed, not waived. Change log 0.1.2 (QA round-075 O1–O3 folded), 0.1.3 (Draft → Ready) |

**User decisions 2026-10-23 (verbatim):** "Keep the scope tight, and focused tests, no regression. we have to close these stories asap"; "The only must have on the list that i agree for now are the item 4(keep budget unlimited and the access will be handled by a RBAC implementation we're going to build in a future version) and 6. Finish them and then close the stories."; budget scope "Both: no gate, no cap"; TF-5 "Update script to V23".

**Completed must-haves:**
- Item 4: CSI daily budget `0` = unlimited (`GuidedCsiBudgetIT` 6/6). Model access is left to a future RBAC version and is out of scope.
- Item 6: TF-5. V19 through V23 grant script plus `GuidedRuntimeRolePrivilegeIT` 6/6. Not applicable by default (the runtime role is the owner).
- Evidence: `G/round-074/dev/receipt.json` and `G/round-075/qa-gate/`.

**Mapping:** 79 open items now map to STUDIO-OBS-016 ACs: 51 from 009 and 28 from 010. The tables are in each story's "PO closure — 2026-10-23" section.

**Descoped by the user, not passed:** the final-tree full backend regression (`check`, C10, D2 smoke), recorded as 016 AC-13 (f).

### Pre-push follow-ups (before any @devops push)

1. Rebuild or touch `studio-runner/dist` so `verifyRunnerDist` passes **without `-x`**. Rounds 072, 073 and 075 ran with the bypass. A scratch `tsc` matched dist for js/d.ts (round 073), but that is not the gate (016 AC-13 g).
2. `git add -A backend/src`, so the 28 untracked backend files in `G/round-072/dev-backend/untracked-commit-set.txt` are staged together with the modified and deleted files (round-073 REL-001).
3. Stage the new untracked `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/de/runtime-role-grants-v19-v23.sql` (round 074).

The history below is the @dev bookkeeping from before closure and is kept unchanged. Where it says "InProgress" or "Next step: @qa 009 gate", that is superseded by the table above.

## Current state (after case439 acceptance)

The requesting user accepted the case437 pack (`G/round-066/human-pack437/`, "Accept all three", 2026-10-23T17:44Z) and the case439 pack (`G/round-070/human-pack439/`, sheet db9f6f7b, commitment 76e33c68, "Tested and approved, whats next?", 2026-10-23T21:37Z). RS71-H is closed; this covers the AC-12 native seek visual (07/11/13) and the AC-10 C-17 password dots. The case439 acceptance excludes D1b and D3 (not visible in the pack). The freeze on frontend/src and sealed backend sources is lifted after the case439 guard collection.

**Next step: @qa 009 gate (local scope).** The outside-owner gates stay open and are not waived: company D-C/T4 (20x3 workflows plus 100 same-artifact replays), staging SSO, origins, accounts and oracles, U13 S&C, TF-5 (and U14), deployment/PID-1, and PM acceptance. STUDIO-OBS-010 needs 009 Done plus D-C PASS; unmet.

## Second local pass: case439 (rounds 067-070)

case439 (runId `113cf3b9-7eae-406e-aa3b-06db4d5e0f08`) is the second complete local real-stack pass, with Candidate B (provider-stall send cap, 50 s) and the UX fixes D1-D7 and D10: workflowCode COMPLETE, replay PASSED (epoch 2), native 07/11/13, 15 of 17 screenshots released (03 and 09 withheld, `WITHHELD_PIXEL_VERIFICATION_UNPROVEN`). The full learn had 6 and the incremental 3 `TRANSPORT_STALL` attempts cut at 50 s, each retried. UX review (`G/round-070/ux-png-review/`): no blocking finding; N1 (03/09 evidence gap), N2 (08/12/15 framing), N3 (step-4 chip cut off in 11/12) are non-blocking. Evidence `G/round-070/projection439/`. Fixes and gates: Candidate B QA PASS `G/round-067/qa-candidate-b/` (patches 61fc496c, 6ef92711, a4291a0f); frontend UX QA PASS `G/round-067/qa-frontend-ux/` (19 files, copy in `docs/qa/evidence/STUDIO-OBS-009/ux-fix-067/copy.md`); D10 functional-ID sentence in the first-secret popup (user decision 2026-10-23T18:15Z).

## Local result

case437 (runId `23208c4c-953b-4804-889c-86cbc0845c1a`) is the first complete local real-stack pass: full learn, the genuine step-5 clarification, publication 1, the middle edit to "Click Open in Primary workspace", the incremental relearn from step 5 with no question, publication 2 (epoch 2, rev 3 confirmed) and the ordinary replay PASSED. 17 of 17 screenshots released, native recordings 07/11/13 captured, DOM seeks validated. Evidence: `G/round-066/projection437/projection-stdout.json`; collectors `G/round-065/devops-case437/diagnostic437/`; UX masked-PNG review `G/round-066/ux-png-review/` (no blocking finding).

## Product fixes (evidence and QA gate)

| Fix | Evidence | Gate |
|---|---|---|
| (a) runner `observationCollector` password-label fix | `G/round-049/qa-runner-fix/` | QA PASS |
| (b) ruling a+b: V23 `rejection_reason` and transient retry | `G/round-054/ruling-impl/`, `G/round-053/architect-ruling/RULING.md` | QA PASS `G/round-057/qa-ruling-impl/` |
| (c) qualified-label product rule | `G/round-057/qualified-impl/`, `G/round-057/architect-qualified-label/RULING.md` | QA PASS `G/round-057/qa-qualified/`; delta G1/G2 accepted |
| (d) runner recording finalize (no ffmpeg SIGKILL) | `G/round-065/dev-video/` | QA PASS `G/round-065/qa-video/`; runner delta 1c27eff8 |
| (e) incremental SOURCE_PLAN test | `G/round-058/dev-incremental-test/` | patch applied to the real tree 2026-10-23, not run there; no QA verdict |
| (f) frontend `pageIncrementalRecording.test.tsx` | `G/round-065/dev-frontend/` | dev only (3 pass); no QA verdict |

Also: harness config call-seconds 45 (round 062, config only) and the code434 catalog identity fix (round 059).

## Failed cases, one line each

- 431: labelled password input poisoned every textbox/label hint; Username fill refused until BUDGET_EXCEEDED (fixed by a).
- 432: the 60 s call deadline killed the step-2 model call; INVALID_CONTRACT terminal (inferred from two real-Vertex probes).
- 433: edited qualified step 5 could not match exact-match target acquisition in the incremental relearn (fixed by c).
- 434 (offline): catalog fixture pinned stale runner bundle hashes, `PROFILE_MISMATCH`; nothing live.
- 435: three provider stalls of 140 s consumed 420 s of the 600 s session TTL, `AUTHENTIC_QUESTION_TIMEOUT` (stall cause unknown).
- 438 (offline): seal refused by the wrapper, `externalCodePins` 502 versus the expected 501 (tooling expectation defect; the 502 is legitimate); fixed as an exact 501+1 in case439. R7/R8/R9 of the chain ran after the refused seal because a loop break did not stop them; nothing live.
- 436: product passed; the incremental WebM was unfinalized because the hard teardown SIGKILLed ffmpeg after a slow graceful close (fixed by d).

## Deferred, non-blocking

UX defects D1-D7 and D10 are fixed (QA PASS) and D8 (harness framing) and the 03 page shift were out of scope; Candidate B is implemented (QA PASS); N1-N3 of case439 are non-blocking; the cause of the slow graceful close (unproven); QA recommendations R1-R6 (`G/round-057/qa-qualified/QA-GATE.md`); spotless/checkstyle red in untracked `GuidedRefusalDiagnostics*` and related files; the runtime-role SELECT/UPDATE grant on `studio_guided_model_attempts.rejection_reason` for a production baseline.

## Still open (not passed, not waived)

- Local carry-forward (RS71-N): `GuidedIncrementalQualifiedPlanIT` applied but not run in the real tree; QA recommendations R1-R6 (R4 includes the spotless/checkstyle cleanup); P4/P5 `RUNNER_PORT` hazard; N1 03/09 evidence gap; D1b and D3 not human-verified in a real-stack pack; Candidate B surviving mutants MQ4 and MQ6 and QA frontend observation O1.
- Outside-owner gates: company D-C/T4 (20x3 workflows plus 100 replays), staging SSO, origins, accounts and oracles, U13 S&C, TF-5, deployment/PID-1, PM acceptance. STUDIO-OBS-010 needs 009 Done plus D-C PASS; unmet.

## Process deviations

Private key-name and size listing of `compiled-runtime-pins.private.json` (round 058); a stray grep that printed two path lines of `external-source-graph.private.json` (round 059); a dev `stat` of native recording sizes and a read of recording manifests (round 065); QA authored the case435 Root pair admission (round 060).
- Rounds 068-070: the case438 chain continued after the refused seal (see above); DevOps scratch preflight runs hashed and parsed two private pin files in-process (admitted-helper pattern, nothing printed); the frontend dev reconstructed before-bytes of four dirty files by reversing its own edits (stated in `changes.json`). Lessons in goal-state: no Gradle or sealed-source edits in the real tree while a case is prepared or active; chain mechanical steps in one script that stops at the first refusal.
