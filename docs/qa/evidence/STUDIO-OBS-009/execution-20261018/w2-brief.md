# STUDIO-OBS-009 W2: shared lane brief (root, 2026-10-18)

Every W2 lane agent reads this file first. Then it reads its own lane entry in `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/lanes.json`, under key `w0Refold20261017` → `lanes[id=…]`. That entry gives the write set, ACs, verify and exit.

## Authoritative inputs

1. **Story:** `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` (0.3.22+). It includes the PO T0 outcomes, the A2.6 one-pod note and "Carried items (inbound from 008)".
2. **T0 rulings:** `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/t0-rulings/ruling.md`.
3. **W1.5 rulings** (these govern where they differ from T0):
   - `execution-20261018/w1.5/ruling-part1.md`: D1.0 accepted with changes, and the D5 ruling;
   - `execution-20261018/w1.5/ruling-part2.md`: R1 GO, ADJ-1 option (a) GO, and the A4 tripwire count = 0.
4. **Interface drops:**
   - D1.0 `execution-20261018/d1/launch-contract.md` (as amended by part 1);
   - Gage's co-sign `execution-20261018/d1/devops-cosign.md`;
   - D3.0, I.0 and PR-BE receipts under `execution-20261018/{d3,i,pr-be}/`.
5. **Root lane-plan deltas from Aria part 2** (applied here; lanes.json is not edited):
   - **B** gains `StudioDispatchLedgerStatements.java`, `GuidedEvidenceConfiguration.java` and `GuidedSessionEvidenceTest.java`. **B and B-W3 drop `ProgressReportService.java`.**
   - **D3** gains `GuidedTranslationCoordinator.java` (it moves onto `StudioRunnerTls`; tripwire `SSLContext.getDefault` = 0).
   - **R2**'s fixtures command swaps `guidedCloseProbe.test.ts` for `guidedCloseBound.test.ts`. R2 deletes the probe in the same change that turns the new file green.
   - **ADJ-1 is option (a):** no migration and no V23 for ADJ-1. DE keeps only its TF-5 b privilege-delta lane.
6. **W0 decisions:** `execution-20261018/w0/decisions.md`.
   - A17 is confirmed provisionally on the default.
   - R1 is one pod.
   - No Vault image pull.
   - No real-provider calls.

## Command conventions

- **N24:** `export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH`. Use it for runner and backend work.
- **Gradle:** always run it through the shared lock, always with `--no-daemon`, and use a NEW label every time:
  `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-<lane>-<n> --test-tasks test -- test --tests '<FQCN>' --no-daemon`
  Up to 4 lanes share that lock, so wait on it and never bypass it.
- **Runner unit:** `cd studio-runner && pnpm --config.package-manager-strict=false exec vitest run <files> --coverage.enabled=false --minWorkers=1 --maxWorkers=2`.
- **Runner fixtures tier:** add `--config vitest.fixtures.config.ts … --maxWorkers=1`.
  - Protect the 007/013 fixture media. Either go through `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-runner.py`, or back it up and restore it yourself.
  - Its globalSetup re-emits `dist`. **No dist rebuild in W2**: the single rebuild is root's F-merge. If a lane needs the fixtures tier before then, use PR-RT's no-globalsetup config approach (`execution-20261018/pr-rt/`) and record it.
- **Frontend:** host Node; `pnpm exec vitest run <paths> --minWorkers=1 --maxWorkers=2`.
- **pnpm only.** Never run npm or yarn, and install nothing. The runner keeps its npm lockfile, so pnpm commands need `--config.package-manager-strict=false`.
- **Evidence (root R3):** collector runs during W2 are non-evidentiary. An exit 2 caused only by `sourceStable:false` while other lanes edit is expected, so report the test counts. Evidence comes from F-merge and G9.

## Hard rules

- Write only inside your lane's write set plus your receipt folder `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/<lane>/`. Needing a file outside it is a finding for root; do not edit it.
- Red-first for behaviour changes: save the red log, then the green.
- Spot-check mutations on the key assertions.
- Migrations come only from @data-engineer, and only V23+.
- No git commit, stash or push.
- Never touch `.aiox-core/core/permissions/dispatch-governance.js`.
- Never signal PIDs 22246, 44737, 13577, 13581, 5083 or 5095, or any process you did not start.
- Leave no watchers, servers, browsers or Testcontainers of your own behind.
- Never log secrets or key material.
- No docker build or pull. No real-provider or model calls.
- Accessibility per ADR-SC-006.
- Report honestly, marked [V] verified or [I] inferred.

## Receipt (every lane)

Write `execution-20261018/<lane>/receipt.md` and `.json` with:
- files written, with sha256 before and after;
- red and green logs;
- every command, with exit code and counts;
- mutation results;
- ACs covered (local half) and anything owed externally;
- deviations;
- open findings for root or @architect;
- **batons** (files or behaviours F-merge must land atomically).

Your final message to root is concise.

## W3 addendum (root, 2026-10-18)

**F-merge is GREEN** (`f-merge/status2.txt`).
- Source `1411b448…`.
- **Final dist D_F = `4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3`.**
- Runner unit 2475/0 (29 skipped); fixtures 296/0.
- Guided ITs 83/83; FocusMutationJoined 2/2 (this closes O-FM-W3).

**Rules for W3:**
- A dist-dependent run counts only when its collector dist digest equals D_F.
- Do NOT rebuild dist. If a W3 change needs a rebuild, stop and report it to root.
- `*` in any --tests pattern triggers verifyRunnerDist, which passes now that dist is fresh. Prefer explicit class names anyway.
