# Functional visual UI execution — STUDIO-OBS-009/010

Completed actual browser execution with one observed data limitation: the Logs tab opens, but completed guided demo runs leave its content empty. Root subsequently corrected the misleading invitation to run again; the copy-only successor was separately observed as “No logs are available.” Secret creation, editing, layouts, status/result, proof display and playback passed. This report is functional visual evidence, not a formal story lifecycle verdict.

## Runtime and source identity

- Final execution: 2026-10-21 17:40:59–17:43:35 UTC, local Playwright 1.63.0, Chromium 153.0.8010.12, Node v24.20.0 through explicit `/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin` PATH.
- App `http://127.0.0.1:5173`, Vite standalone development; existing root-owned Node MSW proxy `127.0.0.1:5174`. Root coordinated one preview restart after correcting CSI routes; final listener PID 48956. Reviewer did not stop, reset, or duplicate the servers.
- Fresh Playwright browser contexts separate from root. Supplementary Orca page `2854af75-1531-4905-b6d6-444ea0c33daf`, runtime `2b3c68db-0c9b-40ce-9fac-dfb0b150f6cd`, Chrome 150.0.7871.250, used only for independent navigation and selector inspection. Root page `2bcc2534-f593-4376-a76b-6b8aceb53be2` was not manipulated.
- Desktop 1440×1000, narrow 390×844. Followed functional-only accessibility scope: visible labels, flow and layout only; no accessibility audits or expanded requirements.
- All authored data is explicitly SYNTHETIC and uses reserved `https://synthetic.example.invalid`. No real credentials, provider calls or external contact.
- Demo evidence does not prove real Vertex, real Citi website browser automation, masked-login video human approval, full D-C, or a five-person pilot.

## Final synthetic tests

- Test A: [f9be71a1-5a87-4de1-b0c8-0f0b5725fa5f](http://127.0.0.1:5173/checks/studio/f9be71a1-5a87-4de1-b0c8-0f0b5725fa5f) — created through actual UI, not API setup.
- Test B: [52ceb57d-a122-464b-b4eb-51fec845b506](http://127.0.0.1:5173/checks/studio/52ceb57d-a122-464b-b4eb-51fec845b506) — created through actual UI, not API setup.

## Exact outcomes

| Flow | Outcome | Observation |
|---|---|---|
| UI creation of two separate synthetic saved tests | PASS | A and B created through Create Test after demo CSI correction; 2 browser POST /tests responses 201. |
| First-secret popup and no personal fields | PASS | Dialog has disclaimer, Cancel/Continue, zero input/textarea elements. |
| Cancel and reopen | PASS | Cancel closes; reopen shows first disclaimer again before any secret exists. |
| Continue to required existing form | PASS | Name identifier, password Value, Allowed origins unchanged; Create disabled for blank or missing origins, enabled only after synthetic fields filled. |
| Dummy secret creation through Insert reference | PASS | Synthetic alpha created; <secret SYNTHETIC_UI_ALPHA> inserted into authoring input. |
| Subsequent secret skips disclaimer | PASS | Test A New secret opens Create Secret form directly. |
| Variables entrypoint and save | PASS | Synthetic beta created from Variables secret selector; saved rows verified in later fresh context. |
| Another test remains independent | PASS | Test B with no secrets shows first disclaimer via Variables; no test A disclaimer state reused. |
| Edit/save/add/remove steps | PASS | 2 authored steps saved; edited step 2 and removed temporary third step survive reload; no mirrored authored step copy below editor rows. |
| Desktop and narrow layout | PASS | 1440x1000 two-panel editor; 390x844 single column; document scrollWidth390=innerWidth390; Variables table supports horizontal scroll to values/actions; popup buttons visible. |
| Actual demo Run status/result/proof | PASS | Two guided demo learn sessions completed through actual Run button; proof receipt, available video and playback observed. |
| Logs tab visible and operable | PASS | Click #studio-tab-logs displays Live execution logs panel. |
| Populated guided execution logs after completed demo run | NOTEXERCISED | No log data was available in completed guided demo Runs. Empty panel was observed and reported; successor neutral empty copy separately passed. No populated-log claim. |
| Actual replay execution | NOTEXERCISED | Focused supplemental Run selected another guided learn. Two guided-session starts, no replay /execute request; misleading replay names in retained supplemental runner are corrected here. |
| Real provider / Citi automation / human review / full D-C / five-person pilot | NOTEXERCISED | Demo MSW only; no model provider calls, external website automation, real credentials or human pilot claims. |

## Settled screenshot evidence

All listed final images were opened and visually inspected with `view_image`. Relative paths are within this directory.

- `01-first-secret-desktop.png`, `02-cancel-reopen.png`: simple disclaimer and Cancel/reopen.
- `03-secret-form-empty.png`, `04-secret-form-synthetic.png`, `05-secret-inserted.png`, `06-next-secret-direct-form.png`: unchanged required form, masked synthetic value, reference insertion, subsequent direct form.
- `07-authoring-saved.png`: saved edited two-step checklist, no temporary third step.
- `09-independent-test-disclaimer.png`, `10-narrow-disclaimer.png`: independent test B, desktop and narrow first-secret popup.
- `11-narrow-authoring.png`, `12-narrow-variables.png`, `19-narrow-variables-right.png`: single column, no page-level horizontal overflow, table horizontal scroll reaches value/actions.
- `17-variables-settled-desktop.png`, `18-empty-secret-label-settled.png`: persisted alpha/beta and corrected readable empty selector label. Prefer 17 over the closing-transition frame in 08.
- `13-demo-run-progress.png`, `14-demo-run-result-proof.png`: actual first guided run progress and completed receipt/proof.
- `20-demo-replay-result-proof.png`, `21-demo-replay-logs.png`, `22-demo-replay-proof-playback.png`: second guided run result, actual empty Logs content, playing fixture recording. Filenames retain the originally intended replay name; HTTP evidence establishes that the app selected a guided learn. Playback readyState 4, time 0.616885 seconds, duration 6 seconds, media error null.

## Retained failed attempts and corrections

1. `attempt-1-execution.json`, `attempt-1-visual-run.mjs`, `FAILED-1.png/.txt`: UI Tests → Create Test → synthetic Name, System (CSI) stayed disabled for 30 seconds; helper “Systems could not be loaded. Please try again.” Create disabled. Root corrected demo CSI routing and restarted preview; final actual UI creation A/B passed.
2. `attempt-2-execution.json`, `attempt-2-visual-run.mjs`, `attempt-2-screenshots/`: public API setup fallback created A `c29765f4-531b-4b37-a264-8e5338c25cf5` before root requested pause. Explicitly not counted as UI creation pass. Secret/authoring UI checks passed; Variables exact-name selector failed because accessible name includes selected value. Initial faded screenshots retained. This memory-only draft disappeared with coordinated preview restart.
3. `attempt-3-execution.json`, `attempt-3-visual-run.mjs`, `FAILED-11.png/.txt`: final UI A/B flows passed and first guided demo run completed. The test script then timed out looking up exact uppercase “LOGS”; actual component name is “Logs” with CSS uppercase display. Context cleanup removed browser-local sessionStorage; no session pointers were fabricated. Root authorized a focused supplemental Run.
4. `supplemental-execution.json`, `supplemental-run.mjs`: actual UI Run was intended as replay but the demo selected another guided learn; retained stage names are not semantic proof. Actual network metadata counts TWO guided session starts (`guided-session-1`, `guided-session-2`) and ZERO replay calls. Logs click and playback passed; populated logs did not.

## Findings reported to root

- CSI creation limitation resolved in final preview; initial failure retained.
- Confirmed empty SecretInput label overlap corrected by root; settled screenshot 18 is readable. Environment label overlap was initially captured during transition and was timing-uncertain, not proven as a stable defect; final label is readable.
- Remaining exact trigger: create/save synthetic test A with two steps → Run Test → wait for “Completed — learned from this run.” → Logs. Panel shows “No logs yet. Run the test to see live output.” Screenshot 21 and supplemental JSON preserve it. No production patch was made by this reviewer.

## Source binding and artifacts

`attempt-3-execution.json` and `supplemental-execution.json` contain before/after SHA-256 for editor page, SecretInput, ReferencePicker, RunControl, guided narratives and VideoEvidencePanel. Both final attempts had unchanged before/after hashes. `servedModules` records SHA-256 of the actual transformed Vite modules loaded into Chromium. `outcomes.json` provides corrected flow-level conclusions and final source hashes. Final attempts recorded no page errors, no failed requests, and no API responses ≥400.

Final page and secret component SHA-256:

- `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`: `47484d4fc65ed343d69aa2fed69309fde3f2ed6423c2b80ad30acf2f7b3d2d4d`
- `frontend/src/components/studio/SecretInput.tsx`: `1c8dc829c04adcdfe44868ac96bb9359e5be76b8fcb2e139634b394a9ba08ad6`

App remains running. All reviewer changes are evidence/report/automation artifacts in this evidence directory.

## Copy-only successor validation (17:45 UTC)

Root changed only the misleading empty Logs invitation after the completed-run context had already closed. `successor-copy-execution.json` and `successor-copy-run.mjs` record actual UI navigation in a fresh separate Chromium context, clicking the Logs tab and observing “No logs are available.” The old invitation is absent. `23-successor-logs-neutral-copy.png` was opened and visually inspected with `view_image`. No third Run, fabricated session pointer or new data was used. This validates empty copy only; prior status/result/playback are bound to the earlier snapshot and were not repeated on the successor. Populated guided logs remain unproven/absent in this demo.

Successor editor page source SHA-256: `0fb142d2559efbb3ccbe0a773830d6c1591ff1ed5ae4bd8b72f30b946d436a2d`.

Actual served transformed Vite editor module SHA-256: `017eb97695248c1490f6927a0371c1103c9b77de09158d3a464533bf9395d481`. `successor-copy-execution.json` holds all actual served module hashes and unchanged before/after source hashes.
