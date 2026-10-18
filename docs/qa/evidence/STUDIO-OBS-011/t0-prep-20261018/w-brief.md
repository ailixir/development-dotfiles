# STUDIO-OBS-011: shared lane brief (Aria proposal, 2026-10-18; root adopts it at T0)

Status: **PROPOSAL** until root, @dev, @qa and @po ratify `t0-proposal.md`. It reuses the STUDIO-OBS-009 W2 brief conventions (`docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w2-brief.md`). Where this brief and the 009 brief differ, this one governs 011.

Every 011 lane agent reads this file first, then its own entry in `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/lanes.json` → `lanes[id=…]`. That entry gives the write set, ACs, verify commands, batons and exit.

## Authoritative inputs

1. **Story:** `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md` (0.2.13 or later), including "Carried items (inbound)" and the PO notes.
2. **T0 rulings:** `t0-proposal.md` §3 as ratified (the ratification record goes in `docs/qa/evidence/STUDIO-OBS-011/t0-<date>/`). The rulings you will need most:
   - R-F1 (F-1 shape);
   - R-4a / R-4b / R-9 (folds and the database clock);
   - R-08-1e (`REFUSED` with publication disabled);
   - R-5 / R-5w (sleep classification, in-repo `Await`);
   - R-EP (compile-era evaluation layer);
   - R-T0-6 (sandboxes) and R-T0-7 ("unchanged" means byte-identical across the change).
3. **Inbound rulings quoted by the story:** the 015 bridge ruling (F-1 rules R-1…R-6), 008 `w1-confirmations.md` §4–§5, 008 `w5-unreadable-and-alias.md` §4, 009 `f-merge/pre-rulings.md` §4–§5, 009 `w3/pre-g9-rulings.md` (RUN-ORPHAN-01, SEC-AUDIT-PREREADY-01).
4. **The dated 010 Live surface list.** Nothing on it is removed (G12). The T0 intersection record names any item that was stopped.
5. **Start digest and baselines:** the 11-T0 record (R-T0-2: either the reused G9 run or `obs011-t0-baseline-*`).

## Command conventions

- **N24:** `export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH`. Use it for runner and backend work.
- **Gradle:** always through the shared lock, always `--no-daemon`, and a NEW `obs011-` label every time:
  `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs011-<lane>-<n> --test-tasks test -- test --tests '<FQCN>' --no-daemon`
  - Up to 4 backend lanes share that lock in W1. Wait on it and never bypass it. Only one Gradle process runs at a time.
  - The collectors write into `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/execution` unless root has made `execute-011` copies (R-T0-5). Use the path root announces.
  - **Use exact FQCNs.** `GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT` and `GuidedPlanningIntegrationTest` are in package `com.citi.put.checks.studio.guided.session` although their files sit in `guided/bridge/` and `guided/translation/`. `'…guided.bridge.*'` does not select them.
  - Any `*` in a `--tests` pattern, or a runner-spawning class name, triggers `verifyRunnerDist` (`build.gradle.kts:295-341`). It passes only while nothing under `studio-runner/src` is newer than `dist/main.js`. That is why runner work happens in sandboxes.
  - `GuidedPublicationReplayIT`: full class only, alone, with `--test-tasks test,guidedIncrementalTest` and `--tests` on both tasks. No single-test credit (D-14).
  - Record `lsof -nP -iTCP -sTCP:LISTEN` before every backend run.
- **Runner (sandbox):** `cd $SANDBOX/repo/studio-runner && <N24>; pnpm --config.package-manager-strict=false exec vitest run <files> --coverage.enabled=false --minWorkers=1 --maxWorkers=2`.
  - Fixtures tier: add `--config vitest.fixtures.config.ts … --maxWorkers=1`. In a sandbox its globalSetup builds the **sandbox** dist only.
  - Build the sandbox as `cp -a` of `studio-runner/`, `docs/specs/` and `tools/` into `$SANDBOX/repo/` with the same relative layout, because runner scripts read `../docs/specs/…`. Record the copy commands and the before hashes.
- **Frontend (sandbox):** `cp -a frontend` to `$SANDBOX/frontend` (008 U1 method). Run with host Node: `pnpm exec vitest run <paths> --minWorkers=1 --maxWorkers=2`. Record `node --version`.
- **pnpm only.** Never run npm or yarn, and install nothing. The runner keeps its npm lockfile, so pnpm commands there need `--config.package-manager-strict=false`.
- **Evidence (R-T0-4):** lane collector runs are non-evidentiary. An exit 2 caused only by `sourceStable:false` while other lanes edit is expected, so report the test counts. Credited evidence comes from the T0 baseline and 11-G only.

## Hard rules

- Write only inside your lane's write set plus your receipt folder `docs/qa/evidence/STUDIO-OBS-011/execution-<date>/<lane>/`. Needing a file outside it is a finding for root; do not edit it.
- **Batons:** a shared file has one owner at a time, in the order of `lanes.json` → `sharedFilesSingleOwner`. You start on a baton file only after root records the hand-over and its sha256.
- **Backend lanes keep the tree compiling** every time they release the Gradle lock. A broken compile blocks every other backend lane.
- **11-FOLD-prep** keeps `GuidedRunnerClient`, `ObservedValidationClient`, `GuidedPublicationAuthorization` and their beans wired until 11-FOLD-final. Adapters live only inside the wave and never ship.
- **Runner and frontend lanes never write the real tree.** They work in sandboxes, and root copies back in 11-MERGE. `AGENTS.md` and `studio-runner/README.md` are delivered as patches.
- **Proof of "unchanged"** (R-T0-7): record the sha256 of each named test file immediately before the change under proof, and show it is equal after.
- **Red-first** for behaviour changes: C-OBS009-1, C-OBS008-1, the F-1 negative test, R9-OBS-3, and RUN-ORPHAN-01/SEC-AUDIT-PREREADY-01 if placed. Save the red log, then the green.
- **Count and name** every dropped, ported or added test: `after = baseline − named drops + named additions`.
- Spot-check mutations on the key assertions (the 409 refusal writes nothing; the shed WARN fires once per interval; the publication grant follows the DB clock both ways; `REFUSED` with publication disabled).
- Migrations are immutable. 011 adds none.
- No contract or pin change is planned. If one becomes necessary, stop and report it to root.
- No git commit, stash or push.
- Never touch `.aiox-core/core/permissions/dispatch-governance.js`.
- Never signal any process you did not start.
- Leave no watchers, servers, browsers or Testcontainers of your own behind.
- Never log secrets or key material. `SecretValue` stays the single secret-bearing serializer (R-4a, K-5).
- No docker build or pull. No real-provider or model calls.
- Accessibility per ADR-SC-006. The only a11y-file change is R-11's deletion of the two duplicate surfaces.
- Report honestly, marked [V] verified or [I] inferred.

## Receipt (every lane)

Write `execution-<date>/<lane>/receipt.md` and `.json` with:
- files written, with sha256 before and after (for sandbox lanes: the copy-back manifest);
- red and green logs;
- every command, with exit code and counts;
- mutation results;
- ACs covered, and anything carried forward with its owner and reason (never dropped silently);
- per-name test tables (drops, ports, additions);
- deviations;
- open findings for root or @architect;
- **batons** handed on, with the sha256 at hand-over.

Your final message to root is concise.
