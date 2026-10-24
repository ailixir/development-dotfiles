# STUDIO-UNIFY-001.5 task 5.17: real-stack visual re-check (2026-10-24)

Reviewer: aiox-ux subagent, Playwright headless Chromium at 1440x900 and 390x844. Screenshots: `shots/` next to this file (scripts and logs stayed in the session scratchpad).

Stack: `./dev.sh --seed` shape with guided governance provisioned locally (CSI 178672 / Development, application `studio-local-ux`, trusted policy for https://example.com). Real Spring Boot backend :8080, real studio-runner :8090 with Chromium, real Vertex (gemini-3.8-flash), Vite :5181 serving the story .5 working tree. One stand-in: a local identity endpoint on :8081 replaces platform Core for the publish step's `put_session` re-check (`put_session=local-dev-session`).

## Verdict: READY WITH FIXES

The run path works end to end in the browser, all 13 first-pass fixes pass, and no first-pass regression was found. One new Major (N1) and five Minors remain; N3 is a side effect of the M1 fix.

## Run path (observed)

| # | Test | Action | Result | Time |
|---|---|---|---|---|
| R1 | New "Example Domain link recheck 04:57" `96f230a5-410a-49bd-9941-ab7b56c96385` | Create, 2 steps, Save, Run (learn) | "Completed — learned from this run"; both steps "Learned in this run"; 21.4 s recording plays; chip "Learned · ready to repeat" | ~21 s server side; Run re-enabled after 28–33 s |
| R2 | Same | Run again (replay) | Passed; both steps PASS; Logs 5 lines + "run PASSED"; video plays | run 1.1 s |
| R3 | READY test `8c182e4b-5f71-4b86-93bb-359857e23f46` | Run icon on All Checks row | opens editor, one execute, Passed, video plays | ~5 s |
| R4 | Same | Run Test in editor | Passed | ~7 s |
| R5 | Same, 390 px | Run Test on mobile | Passed | <10 s |
| R6 | Heading test `64b94b49-3922-4dcc-9265-b97c8cef233e` | Run (learn) | ends with "This run reached its learning budget, so Studio stopped it…" (example.com has no h1); step 2 not marked failed; Logs empty | 216 s |
| R7 | Detail page Runs tab | open | READY test lists 4 replays, new test 1; learning runs are not listed (by the tab's text) | — |
| R8 | Run drawer | `/runs/d7b2068d-…` | details, step results with Seek, "Show logs (6)", video plays; deep-link reload reopens and plays; Close returns to `/runs` | — |
| R9 | All Checks after runs | rows | "Passing" + last-run time; heading test "Not learned" / "Never"; mobile caption "Last run: …" | — |

Console clean on the run path apart from the known font warning (p7); no HTTP >= 400.

## Fix verification

| Finding | Result | Screenshots | Checked |
|---|---|---|---|
| M1 | PASS | `03-run1-final-after*.png` | real refusal on a Staging test without governance (`484b457d-…`): caption beside Run, "Reference: RUNTIME_INCOMPATIBLE" secondary monospace line, button still "Run Test", second press shows one message, no learning request |
| M2 | PASS | `06-missing-studio-after.png`, `06-badid-studio-after.png`, `07m-missing-studio-after.png` | only "UI test not available", message, "Back to All Checks"; no editor controls |
| m1 | PASS | `03-studio-ready-after.png` | All Checks › name (link to detail) › Studio; "UI Tests" button gone |
| m2 | PASS | `07m-studio-viewport-after.png` | Environment–Variables gap 12 px |
| m3 | PASS | same | opens at scrollY 0; header, Save, Run visible |
| m4 | PASS | `07m-allchecks-*-after.png` | 340/340; actions and pager visible; caption and flask icon |
| m5 | PASS | `02-*-after.png` | each missing item named; disappears when valid; name error after blur |
| m6 | PASS | `06-missing-detail-after.png`, `06-missing-runs-after.png`, `06-badid-detail-after.png` | same component as M2 |
| m7 | PASS | `01-palette-*-after.png` | palette "UI tests" → `/checks/all?type=UI_TEST`; no "Open Tests"/"Open Checks Studio" in src/e2e; "Back to UI tests" checked in source only (branch unreachable in browser) |
| m8 | PASS | (desk.log) | no cancelled-request errors, no prop-type warning; missing-test pages log the real 403 |
| m9 | PASS | `07m-create-*-after.png` | Name top 529 px; summary and "Change type" |
| m10 | PASS | `07m-home-viewport-after.png`, `07m-nav-drawer-after.png` | "Navigation" button on :5181 opens drawer Home / Checks / Reports |
| m11 | PASS | `01-home-after.png` | sidebar Home / Checks / Reports matches CLAUDE.md / AGENTS.md |

## New findings

- **N1 (Major).** A failed learn says only "learning budget", does not name the failing step or what to change, does not mark step 2 failed, and the Logs tab shows "No logs are available." for every learning run (also the successful R1); progress sat at "step 1 of 2" ~110 s. Expected: name the step and give a plain next step, mark it failed, show learning activity or say learning has no live logs. Likely: `guidedNarratives.ts` L294 (`budgetExceeded`), `GuidedCompletion.tsx`, `ChecksStudioPage.tsx` L1845 (Logs reads only `studio.executionLogs`). Not checked whether session data names the failing step. Shots `21-heading-*.png`, `22-heading-*.png`.
- **N2 (Minor).** After leaving the editor a failed learn leaves no trace (editor "No run history", detail "Never run", Runs empty, All Checks "Never"). Expected a "Last learning attempt failed (date)" line. May need backend data. Shots `34-*.png`, `35-runs-heading.png`, `38-*.png`, `39-*.png`.
- **N3 (Minor, from the M1 fix).** At 1440 px the Run column grows to the caption width; breadcrumb wraps to three lines and the title truncates ("M1 refusal probe (non-…"); with the readiness chip the title truncates despite ~400 px free. Expected: caption wraps in a fixed width or sits on its own line. `ChecksStudioPage.tsx` header ~L1170-1240, `RunControl.tsx` L347-356. Shots `03-run1-final-after.png`, `13-r1-final.png`, `03-studio-ready-after.png`.
- **N4 (Minor).** Mobile Runs tab pager needs 360 px in a 310 px box; next arrow off-screen. Same treatment as m4. `UiTestRunsTab.tsx`. Shot `07m-runs-after.png`.
- **N5 (Minor).** A new replay starts showing the previous run's time and "recording still being produced… outcome may already be final", steps "not attempted not attempted". `ChecksStudioPage.tsx` run panel, `GuidedCompletion.tsx`. Shot `31-runicon-landing.png`.
- **N6 (Minor).** Log lines count steps from 0; final "run PASSED" line has no timestamp. Shot `13-r2-logs.png`.
- Polish: N7 detail header ⋮ wraps below actions once "Last run" shows; N8 replay video blank first frame until play; N9 palette Enter selects nothing (predates the story; keyboard work out of scope per ADR-SC-006). p1–p8 unchanged.

## Not verified

Unsaved-changes guard on the new breadcrumb link (covered by unit tests, not driven live); whether the heading test's recording ever arrived; Vertex stall screens during a successful learn (R1 had none); "Back to UI tests" in the browser (unreachable branch); federated mode; sidebar highlight on direct `/ui-tests/...` URLs (inferred to be due to direct navigation).

## Test data left on the local stack

`96f230a5-…` (learned, 1 replay); `484b457d-…` (Staging refusal probe, never started); READY test +3 replays; heading test +1 failed learning session.
