# Targeted synthetic publication/replay visual supplement

PASS for the local Node MSW UI lifecycle. New attempt: exactly **one guided learn and one replay**, with **zero new guided-session starts for the second Run**. No failed UI assertions or extra Run attempts. This is mock replay evidence; it does not prove live-backend execution, model-free real replay, provider behavior, real website automation or a validated artifact.

## Runtime and fresh synthetic test

- Actual Chromium 153.0.8010.12 through pinned local Playwright 1.63.0, Node v24.20.0 via explicit Node24.20.0 PATH; fresh isolated context, desktop1440×1000.
- Existing root preview PID 80093: Vite `127.0.0.1:5173`, Node MSW `127.0.0.1:5174`. Root coordinated the restart; reviewer did not stop/reset/duplicate it or manipulate the root browser page.
- `2026-10-21T17:58:01.463Z`–`2026-10-21T17:58:17.316Z`.
- Test [3d6fce15-a9bb-4173-af84-74566b08d54a](http://127.0.0.1:5173/checks/studio/3d6fce15-a9bb-4173-af84-74566b08d54a), named `SYNTHETIC Replay lifecycle C 20261021`, created through actual UI and saved with two explicitly synthetic steps using reserved `.invalid` origin. No credentials.

## Actual outcome evidence

| Check | Result | Evidence |
|---|---|---|
| UI create, author and save C | PASS | `01-created-synthetic-C.png`, `02-saved-steps.png` |
| First Run uses guided learning | PASS | One POST `/api/v1/studio/guided-sessions`; `03-guided-progress.png`, `04-guided-completed-publication.png` |
| Published result and saved READY identity agree | PASS | Closed result PUBLISHED; saved source revision2/configuration revision1; confirmed revision `11111111-1111-4111-8111-000000000001`, artifact hash64 digits of3 match publication receipt; `confirmedRevisionArtifact:null`. UI editor and test list say Learned·ready to repeat (`05-saved-test-list-READY.png`). |
| Guided fixture recording playback | PASS | Six-second known fixture, readyState4/currentTime0.214463/media errornull; `06-guided-fixture-playback.png`. It is not a website execution recording. |
| Second Run selects actual execute route | PASS | One POST `/api/v1/studio/tests/3d6fce15-a9bb-4173-af84-74566b08d54a/execute`; ZERO guided starts during replay. |
| Actual replay lifecycle | PASS | Execution `f5ccede9-74bd-4bdc-8341-7f43ab41bc92`: PENDING/revision1 → RUNNING/revision2 → PASSED/revision3, streamComplete true. UI says Completed—saved steps replayed (`07-replay-accepted.png`, `08-replay-completed-no-recording.png`). |
| Synthetic replay logs | PASS | Three visible accepted/started/completed messages explicitly state Synthetic MSW and no browser execution/recording (`09-replay-synthetic-logs.png`). |
| Honest replay proof state | PASS | VideoUNAVAILABLE, videoPathnull, runtime versions allnull, zero video elements. UI says This run has no usable recording (`10-replay-proof-unavailable.png`). No replay recording or playback claimed. |
| Runtime and request failures | PASS with disclosed demo transport boundary | Zero page errors or requestfailed events. Three `/events` responses502, each followed by ordinary snapshot GET200, yielding PENDING/RUNNING/PASSED. |

All ten screenshots were saved and opened with `view_image`; no visual issue requiring a source patch was found in this targeted flow. Previously accepted secret and narrow-layout flows were not repeated.

## Transport observation

The existing Node mock does not serve SSE events. Actual browser requests made three GETs to `/api/v1/studio/executions/f5ccede9-74bd-4bdc-8341-7f43ab41bc92/events`, each answered502. The existing EventSource error diagnosis then read the ordinary authorized snapshot route three times, each200; the third terminal frame closed the lifecycle. This proves UI recovery through those GETs, not successful SSE delivery or a separate bounded-poll fallback. No transport setting, source or response was altered by the reviewer.

## Source and evidence binding

Before/after hashes in `execution.json`, `source-before.json` and `source-after.json` match for the UI, transport, actual Node mock sources and proxy. The actual browser-served transformed Vite module hashes are also recorded.

- Editor source SHA-256: `0fb142d2559efbb3ccbe0a773830d6c1591ff1ed5ae4bd8b72f30b946d436a2d`.
- Actual served transformed editor module SHA-256: `017eb97695248c1490f6927a0371c1103c9b77de09158d3a464533bf9395d481`.
- `handlers.ts` SHA-256: `99e317154e6c64909495bca58d6c11fb704bb14e808a2b946ba619489f899bf9`.
- `guidedHandlers.ts` SHA-256: `95e373a15d6db92bca6e931795cda05934235c7a8e652cbe6e169deb2b2c191d`.

These mock hashes match the frozen mock-fix receipt at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/resume-close64/mock-replay-fix/receipt.json` and its source-hashes file. `closed-network-metadata.json` contains only route/method/status and projected closed publication/readiness/execution metadata; no raw request bodies, credentials or media.

## Append-only history boundary

The prior report's **two guided learns and zero replays** remain historical truth for its earlier source snapshots. This supplement adds **one learn and one synthetic replay** after the mock publication fix; cumulative visual-session activity is **three guided learns and one synthetic replay**. Old reports/outcomes/manifests are copied into this directory before appending this history; earlier failed attempts, original captions and copy-only successor proof remain intact. No real backend/provider/browser website proof follows from these totals. App remains running.
