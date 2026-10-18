# STUDIO-OBS-015 final gates, attempt05 (final-gates05), Gage (@devops)

**EARLY SIGNAL, SUPERSEDED BY THE NEXT GATE RUN.** 2026-10-17 04:59 to 05:07 EDT. HEAD `734ad704f`, uncommitted tree. No commit, no push, no source edit. Machine-readable record: `receipt.json`. [V] means I ran it and read the output. [I] means inferred.

The coordinator told me not to start step 7 (the backend Gradle check), because Aria's F1/R2 follow-ups and Quinn's source review will change the tree. I never started Gradle in this cycle. Every runner step ran on Node v24.20.0 (N24 first on PATH).

**Overall: RED (early signal).** The runner fixtures tier failed 2 tests. Everything else that ran is GREEN. The backend check was not run.

## Freeze

| | Source | Dist |
|---|---|---|
| capture-before (08:59Z) | `650e5294fe74bf45629b4c784aab1acc8e348f2e35160fbd04a55589fd36666c`, 1650 files | `01df6c38341a7b56a239ce264f8d8cc3194e82c72004c8f5371c7a681c6a9a2e` |
| capture-after (09:07Z) | identical | identical |

[V] Versus attempt04 (`f071984a…` / `80d1ba1d…`): 23 files changed and 3 added, all under `studio-runner/`. `frontend/`, `backend/`, `tools/`, `docs/specs/` and the root package files are unchanged. The full build rewrote `dist` with the same bytes (digest unchanged).

## Steps

| Step | Verdict | Result |
|---|---|---|
| 1 capture-before | DONE | digests above |
| 2 type-check | GREEN | exit 0, 6.6 s |
| 2 lint | GREEN | exit 0, 10.0 s |
| 2 unit with coverage (s03c) | GREEN | **2267 passed / 0 failed / 29 skipped** (2296; 105 files passed, 1 skipped). Coverage lines 97.29, branches 89.14, functions 97.35. Thresholds passed (exit 0) |
| 2 full dist build | GREEN | exit 0, dist `01df6c38…`, runtime-versions node v24.20.0, nodeMajorPin 24 |
| 2 host `check:pins` | GREEN | exit 0. chromiumBuild and image are NOT ASSERTED on the host (expected) |
| 3 fixtures (s04c) | **RED** | **253 passed / 2 failed / 9 skipped** (264; 21 files passed, 1 failed, 3 skipped). 246 s |
| 4 image build (s05a) | GREEN | both builds exit 0 |
| 4 dist parity (s05b) | GREEN | `/app/dist` list hash equal in both images (`34ef6d10…`) |
| 4 in-image `check-pins --require-image` (s05c) | **GREEN, exit 0** | node v24.20.0, nodeMajorPin "24", chromiumBuild "1243", image tag recorded, `ok: true`, no failures, nothing NOT ASSERTED. **This is the ED-05 Node-pin verdict.** |
| 5 deployment (s05d) | GREEN | 8 files, **322 passed / 0 failed / 0 skipped**, 46 s |
| 6 contracts + schema `--check` | GREEN (re-run) | both exit 0, no write. Re-run because `studio-runner/src/` is in its inputs |
| 6 frontend | CARRIED_FORWARD | `frontend/` subset 274 files, digest `5988e697…`, identical to attempt04 |
| 6 standalone backend static | CARRIED_FORWARD | all of `backend/` identical to attempt04 |
| 7 backend check | **NOT RUN** | per coordinator instruction |
| 8 capture-after | GREEN | equals capture-before |

**Image.** Runtime `put-checks-studio-runner:obs015-final05-local` is `sha256:e6bb359e2abb5dd986053bd787180df3ac5c7736c3c436bad116b35250ada910`. Build stage `…-buildstage-local` is `sha256:3c3daaaa9d548e4b85c3155b320f2984c2a7bdf2236d8e73ca81eeed7b51e998`.

**ED-05 scope.** Only the Node-pin sub-item is closed by this result. The internal image, non-root user, seccomp and CA bundle stay with Platform/SRE.

## The fixtures failure

[V] Both failures are in `test/fixtures-tier/browser-profile-safety.test.ts`:

- "awaits actual scratch removal after guided preparation rejection without an acquired context": expected `PROFILE_PREFERENCES_REQUIRED`, got `CONTEXT_LOST`.
- "awaits actual scratch removal after guided initial-launch rejection without an acquired context": expected `INJECTED_LAUNCH_REJECTION`, got `CONTEXT_LOST`.

[I] Deterministic, and the test expectations look stale after REL-001 patch A. The tests mock the launch or preparation to fail and expect the raw error message. `launchGuidedBrowser` now rejects with `CONTEXT_LOST` in 0 to 4 ms, with the original cause only in the log line's `links`. I did not read the source to confirm and did not rerun. The other 8 tests in that file passed.

The new guided-start-deadline test file passed (2/2) and the REL-001 cases in `guided-recording.test.ts` passed (5/5).

I ran steps 4 to 6 after this red because your message asked for steps 1 to 6 as an early signal. They are independent of the fixtures result, since the dist is unchanged. That departs from the original "stop at the first deterministic red" rule.

## GUIDED_START_FAILED and CONTEXT_LOST

[V] 13 `GUIDED_START_FAILED` lines, all in the fixtures log. None in the unit or deployment logs. The backend was not run. The full list is in `guided-start-failed-lines.json`.

| Operation | Cause chain | Count |
|---|---|---|
| context | CONTEXT_LOST | 7 |
| assign | CONTEXT_LOST | 5 |
| assign | CONTEXT_LOST then IDENTITY_MISMATCH (session `d3e4561b19847495`, 20 ms) | 1 |

Max `elapsedMs` is 20, and no line has a TIMEOUT cause. The lines carry `operation`, `session`, `elapsedMs` and `links[{name, code}]`. They have no `phase`, `loss` or `kind` fields, so the REL-001 root-cause naming you described cannot come from this format. All 13 come from tests that inject failures (profile safety, stale grant), so none is a real recurrence. The ones tied to the two red tests are at fixtures log lines 9-11 and 102-112 and the single line at 169, which I did not map to individual tests.

## Host and process notes

- Swap used 3464M to 3448M; free memory 70% to 74%. No pressure.
- 3238 fixture-media files were backed up. 22 changed during the run and the originals were restored (`runner-final-fixtures05-artifact-index.json`).
- No container was started, stopped or removed. I created only the two images. PIDs 22246, 44737, 13577 and 13581 were never signalled; 13577, 13581 and 44737 are still alive.
- Wrapper receipts are in `execution/runner-final-*05-*`. Hand-captured receipts are in this folder.
