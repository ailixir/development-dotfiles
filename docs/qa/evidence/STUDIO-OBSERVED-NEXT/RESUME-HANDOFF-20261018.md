> **User-requested pause — 2026-10-19; saved 2026-10-20T02:28:39.994268+00:00.** The current checkpoint supersedes execution directions below. Read [RESUME-HANDOFF-20261019-CODEX.md](RESUME-HANDOFF-20261019-CODEX.md). Source08 is HOLD1; revisionB is not dispatched. All specialists completed; original held session29815 is preserved. Resume only on explicit user request.

# Resume handoff: STUDIO-OBSERVED 009 / 010 / 011 (2026-10-18, about 20:30 EDT)

> **SUPERSEDED after the user's new pause:** read `RESUME-HANDOFF-20261018-CODEX.md`. Copyable next-session prompt: `RESUME-PROMPT-20261018-CODEX.md`. The B7 queue and watcher mentioned below have been cancelled (both exit143); B7 did not start. The inherited B1 backend baseline was still live at the final probe. Revalidate it without duplication. All paragraphs below are history.

> **Resumed by Codex/Orion on the user's explicit resume request, 2026-10-18 EDT.** Current execution is recorded in `../STUDIO-OBS-011/t0/resume-root-state.json` and `../STUDIO-OBS-011/t0/root-resume-decisions.md`; the pause below is history. B1 was revalidated live, with current-run ReplayIT failures under independent QA investigation. Source/dist remain frozen. A fresh B7 is queued behind verified B1 completion in tool session 39422; root's B1 watcher is session 26469. Revalidate those handles/process state before any new run; never duplicate a live or incompletely observed execution. `lanes.v4.json` / `w-brief.v4.md` supersede the dispatch draft, including three-worker capacity and the literal unchanged-main GS-T gate. Off-tree GS-T/GS-M(a) drafts and independent architecture review are in progress. 009–011 remain open; no completion is claimed.

**Paused on the user's request: "Close the current task, then persist the necessary information the current state so i can start a new session (handoff)."** This file is the entry point for the next session. It supersedes `execute-015-008/RESUME-HANDOFF.md`.

The full append-only log of this session is `execute-015-008/CLAUDE-RESUME-STATE.md`; read its tail for detail.

## 0. First actions in the new session
1. **Check B1.** It is the 011 T0 fresh full backend baseline, and it was still running at handoff.
   - `cat docs/qa/evidence/STUDIO-OBS-011/t0/status.txt`
   - If the file has `B1-DONE`, read the results:
     - `docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-results.json`
     - `t0/b1-coverage-tasks.txt`, which must show jacocoTestCoverageVerification and requireFreshGuidedPartitions executed
     - `t0/end-capture.summary`, which must equal `t0/start-capture.summary`
   - If there is no `B1-DONE`, check `pgrep -fl obs011-t0-baseline-check01`.
     - Process alive: wait.
     - Process dead: rerun with a NEW label. Edit the label in `t0/b1-baseline.sh` from check01 to check02, then run `zsh docs/qa/evidence/STUDIO-OBS-011/t0/b1-baseline.sh`. It takes about 2 h.
   - **Do not edit any source while B1 runs.** The collector requires a stable source.
   - At handoff: 1,500 PASSED and 0 FAILED, still in `:test`.
2. **When B1 is green:**
   - Fill §B1 in `docs/qa/evidence/STUDIO-OBS-011/t0/t0-record.md`: counts, JaCoCo, coverage tasks executed. Also resolve RC-10, the dispatch package 0.75 line-coverage headroom.
   - Run B7, the frontend baseline, fresh with `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-frontend.py`. It takes about 10 min.
   - B2–B6 reuse G9b (root decision, option B).
   - Root signs t0-record, announces "tree open", and dispatches **011 W1**.
3. **If B1 is red,** follow the outcome table in t0-record §3.1. A red in `GuidedPlanningIntegrationTest`-style shared-CSI budget 429s would mean other classes need the `ObservedPublicationFixture.installGovernance(..., GuidedCsiBudgetProperties)` overload Dex added.

## 1. Story state

| Story | State |
|---|---|
| 015 | Done |
| 008 | Done (QA CONCERNS) |
| 009 | Story 0.3.28; status field still reads Ready (the move belongs to @dev). **Local validation trigger MET** under the user's C8 waiver. Done is NOT claimed. |
| 010 | InProgress (0.3.16). **T2 complete:** dated Live surface list accepted. |
| 011 | 0.2.16. Start conditions satisfied. **T0 in progress.** |

### 009: local validation MET
- Record: `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/qa-local-validation-record.{md,json}`. `isVerdict:false`. Bound to:
  - source `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617`
  - dist `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210`
  - helm `4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8`
- **G9** (`local-gate-20261018/`):
  - C1–C6 green.
  - C4 initially red: no image existed. C4b then went 581/581 on image `obs009-g9-local`.
  - D2 smoke green; step 6 owed.
  - C8 failed on 2 cases:
    - F2: a stage-file read race in the test, now fixed.
    - F1: ReplayIT video FAILED on a passing run. Unexplained; a diagnostic is armed.
  - C10 mutations green (v2), at the G9 digest.
- **Post-G9 batch** (`execution-20261018/post-g9/receipt.md`): model-sizing (§7), catalog-entry script plus a Dockerfile COPY, chart observed-env (`studioObserved`, 5 OBSERVED_* keys, closed list 48→53), consensus-plan §8.3, and the F1/F2 test fixes.
- **G9b** (`local-gate-20261018b/`):
  - R0 rebuild green; C1–C6 green.
  - C4 green: image `obs009-residue-local`, deploy tier.
  - **C8: the full check was replaced by a targeted run, by USER DECISION** (`execution-20261018/w0/decisions.md`). Waived: the full regression and JaCoCo at that digest, owed at 011 T0. B1 is that run.
  - Targeted run: 255/267. The 12 reds were GuidedPlanningIntegrationTest fixtures (shared-CSI daily budget at 98,304 per session), fixed test-only. planfix01 is 67/67, archived in `post-g9/planfix-archive/`.
- **For 009 Done**, the 14-row table is in the 009 story's "PO notes — 009 local validation MET". Main items:
  - T4 benchmark: U17, U18, U7, and naming the ED-01 gateway owner. MODEL-SIZING is ruled, @pm-acked and landed.
  - Deployed stack DEPLOY-OBSERVED-01: chart fix landed; U24 policy owner unnamed; UAT controller pin from Platform/SRE; CI step running `print-observed-catalog.mjs`.
  - U3 staging app.
  - U13 / AE-01 / FM-01 runner fixes.
  - RUN-ORPHAN-01: in-pod check by @devops.
  - SEC-AUDIT-PREREADY-01.
  - D2 smoke step 6.
  - The F1 watch.
  - The F2 race proof.
  - B2/B3 rulings and the N-RS1 sentence (@po with @architect).

### 010: T2 complete
- List: `docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.json`, sha256 `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57`. It has 729 ids, 671 protected.
- Sign-offs:
  - @architect: CROSS-CHECKED-WITH-NOTES
  - @po: 16 removals confirmed
  - @qa trigger line: MET
  - @pm: ACCEPTED-WITH-NOTES
- Stale JSON fields (`g9Record`, `storyStatusChange`) and AX-5..8 are fixed at the re-date after 009 Done, which needs a new @pm ack.
- Remaining 010 work:
  - T0 and T1, the pilot: needs 009 Done plus participants;
  - T3, release readiness;
  - T4, handoff;
  - OI-25, writing the list into the runbook.

### 011: T0 in progress
- Start digest = 009's bound digest above, HEAD `b39359f78`.
- Plan: `docs/qa/evidence/STUDIO-OBS-011/t0/{t0-record.md, lanes.v3.json, w-brief.v3.md}`. Earlier versions are in `t0-prep-20261018/`.
- Evidence folder: `docs/qa/evidence/STUDIO-OBS-011/execution/` (root decision). Lane receipts go in `execution/<lane>/`.
- Collectors: `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/`. They are copies of execute-009 with only the paths changed, plus `run-frontend.py`, which is new and unrun. The lock is still `execute-008/with-gradle-lock.py`.
- Approved skips: `STUDIO-OBS-011/execution/qa/approved-skips.json`. It is a placeholder copied from 009, sha `c6f16987…`. @qa derives the real file.
- Awaitility 4.2.2 resolves (branch A). Use it directly; there is no Await.java.
- Co-signs:
  - @qa (C1–C8), @dev (RC-1..10), @devops, @po: all received.
  - Early co-signs in `t0/early/`:
    - R-CO (Uma): SIGN-WITH-NOTES. Root added `scheduleProvenance.test.tsx` to 11-FE.
    - R-F2 (Dara): SIGN-WITH-NOTES. Root added `GuidedReplayingPrefixMigrationIT` to 11-LEFT for port P-3.
    - 11-IT-R prep (Dex): done.
    - T0-DEV check: **stopped mid-run at handoff.** Partial artifacts are in `t0/early/T0-DEV/`; `check.md` was not written. **Rerun it:** validate lanes.v3, the sandbox copy lists, the Live-surface intersection, and the @dev fold confirmation.
- Root decisions on 11-IT-R:
  - D5 accepted provisionally; @qa must co-sign "not weaker" at lane exit.
  - The private `awaitLast` helper is OK.
  - "Green twice" = two consecutive full-class runs on the same sha.
  - The six unprovable POLL ids (1, 2, 4, 6, 93, 95) are carried by name.
- Still open: the T0-EP confirmation from the 009 T4 harness owner, before 11-RT deletes anything; R-08-3 co-ratification by root (before 11-FE); the D5 tick.
- **W1 (dispatch after B1 green and "tree open"):**
  - 11-GS-T (critical path)
  - 11-GS-M part a
  - 11-LEFT
  - 11-FOLD-prep
  - 11-IT-R (5 full-class runs, cap 6)
- Then, as slots free: 11-RT (sandbox; seeded after B7), 11-FE, 11-DOC.
- Critical path, about 10.5 working days: GS-T → GS-M b (with a ~40 min write freeze) → IT-R apply → FOLD-final → MERGE (local `obs011-` image, Docker authorized) → 11-G.

## 2. User decisions recorded today
All are in `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w0/decisions.md`:
- **U22:** local docker build plus the C4 rerun plus the D2 smoke, authorized. No pulls; the syntax-frontend fetch is OK.
- **OI-1** (root, on U22 terms): the post-residue image build.
- **R4:** local checkpoint commits, no push. Done: `f075dc085..b39359f78`, 8 commits. Only `.aiox-core/core/permissions/dispatch-governance.js` stays modified.
- **011 Docker:** authorized on U22 terms (11-MERGE/11-G).
- **G9b C8:** a targeted run instead of the full check. The regression and coverage are waived there and owed at 011 T0 (B1).
- **Done today is not possible:** the user was told that 009/010 Done cannot be reached today because of external items.

## 3. Pending user decisions and reminders
- **T4:**
  - U17: remaining R under the USD 500 ceiling;
  - U18: gateway price list and thinking-token billing;
  - U7: budget admission signature;
  - naming the ED-01 gateway owner.
- **U24:** the per-environment trusted policy content owner. Recommended split: pilot app owner writes, Security & Compliance approves, @devops applies.
- **Earlier items:**
  - R5, "Someone pressed Stop" copy;
  - R1 one-pod override;
  - A17 confirmation;
  - Vault image pull;
  - C-17 reviewer;
  - forwarding the U13 ack request (`STUDIO-OBS-009/prep-20261016/t0-rulings/ae01-ack-request-draft.md`).
- **Before any push:** the docs commit `4f9e451a0` carries about 314 MB of evidence. The @devops pre-push gate must rule on it.
- **Reminder:** restart the `supabase_*_outvo` containers.

## 4. Standing rules (unchanged)
- aiox-dev, aiox-qa and aiox-devops run with model sonnet and effort high. Other agents use their defaults.
- Yolo: make routine calls yourself; stop only for real external blockers.
- About 5 concurrent agents at most. Run nothing heavy alongside a timing-sensitive backend run: the G9 F1/F2 reds coincided with load.
- **Gradle:** only through `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py`, with `--no-daemon` and a fresh label each run. A `*` in `--tests` triggers verifyRunnerDist. Use exact FQCNs: the bridge and planning ITs declare package `guided.session`, and `GuidedDefaultModelReservationIT` sits in `translation/` but declares `guided.session`.
- **Node:** N24 = `$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin` for the runner and backend; the frontend uses host Node.
- **pnpm only.** The runner needs `--config.package-manager-strict=false`.
- No git push or PR without the user; @devops owns push. Never use bare `git stash`. Never touch `dispatch-governance.js`.
- Never signal PIDs 22246, 44737, 13577, 13581, 5083 or 5095, or any process you did not start. Never remove unrelated containers.
- Never log secrets. No real model or provider calls. No docker pull. Accessibility per ADR-SC-006.
- Report what was verified versus inferred.
