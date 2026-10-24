# Root v4 dispatch amendments

This version preserves the v3 proof obligations and adopts the read-only specialist reviews. Source remains frozen until B1 reconciliation, fresh B7 and root signature. Use lanes.v4.json schedule.rows (three workers plus root), the exact sandboxCopyLists and resolvedAliases. Historical v3 schedules are evidence only. Before any real backend/src/main change (including neutral seams), GS-T must pass its complete gate with every src/main file byte-identical to S_011. Parallel GS-M/FOLD-prep work before that gate is off-tree drafting only. The original schedule estimate is conditional on this order. R-08-3 is conditionally co-ratified as specified in rootRatifications; teardown D5 and ReplayIT audit D5 are distinct. The two guarded RT deletions remain carried until T0-EP confirmation. IT-S hands only its files among the exact 21 FOLD_TESTS to FOLD; its other two files are released. All final gate subjects and red/green/mutant obligations remain unchanged.

# STUDIO-OBS-011: shared lane brief v3 (Aria, 2026-10-18; binds when root signs `t0/t0-record.md`)

- **Supersedes** `t0-prep-20261018/w-brief.v2.md` (sha256 `946d6189…`) and `w-brief.md` (`57fe80a7…`); neither is edited.
- **v3 changes:** the evidence folder is `docs/qa/evidence/STUDIO-OBS-011/execution/` (root decision at T0); the wait library is **branch A** (T0-AW passed); line numbers come from `t0/lanes.v4.json` → `anchorsS011` and `t0/t0-record.md` §10; new section "Before the tree opens".
- **Folds in:** qa-cosign C1–C8, dev-cosign RC-1–RC-10, devops-cosign D-1–D-6, po-ratification RD-1–RD-4, and the user decisions of 2026-10-18 (R4 local commits; 011 Docker on U22 terms).
- **Where this brief and the 009 brief differ, this one governs 011.**

Every lane agent reads this file first. Then it reads its own entry in `docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v4.json` → `lanes[id=…]` and `anchorsS011[<lane>]`, then the signed T0 record (`docs/qa/evidence/STUDIO-OBS-011/t0/t0-record.md`). **Line numbers in `t0-proposal.md`, `lanes.v4.json` and the rulings are pre-start and do not bind. The S_011 values in `lanes.v4.json` → `anchorsS011` and the record §10 do,** and only while the file's sha256 is unchanged: re-grep the symbol before each edit.

## Authoritative inputs

1. **Story:** `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md`, the current version at the start digest, including the PO ratification notes.
2. **Rulings:** `t0-proposal.md` §3 as amended by the T0 record §5. The amended rulings you will need most:
   - R-F1 v2 (helper, placement, four operations);
   - R-4a v2 and R-4b v2 (transport table; worker profile);
   - R-5w v2 (wait library: **branch A**, decided at T0);
   - R-EP v2 (reduced; most of it carried);
   - R-T0-2 v2 (fresh baselines; G9 not reused);
   - R-T0-4 v2 (the F-1 freeze window is credited);
   - R-08-1e, R-9, R-T0-6 v2 (sandboxes), R-T0-7.
3. **Inbound rulings** quoted by the story: unchanged from the v1 brief.
4. **The re-dated 010 Live surface list.** Nothing on it is removed (G12).
5. **Start digest set S_011 and the fresh baselines:** the T0 record §2–§3 (HEAD `b39359f78`, source `061fc41f…`, dist `698a9365…`, helm `46070907…`).

## What is already in the tree when you start

The 009 residue, the post-G9 batch and the planning fix have landed and have been committed locally, with no push (the user's R4 decision; seven category commits plus the receipt, HEAD `b39359f78`). Root's order put them before the start digest. So:

- Edit **committed** bytes.
- `GuidedPublicationReplayIT`, `GuidedPlanningIntegrationTest`, `cli.mjs`, `evaluation/README.md` and `application.yml` already carry the 009 changes.
- Do not re-apply or re-base any 009 patch.
- If a file in your write set is still `M` relative to the R4 HEAD at start, that is a finding for root before you edit it, because it would mix 009 and 011 hunks (Gage X-10). At S_011 the only `M` files are `.aiox-core/core/permissions/dispatch-governance.js`, `.claude/agent-memory/aiox-devops/MEMORY.md` and `docs/qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/CLAUDE-RESUME-STATE.md`; none is in any write set.

## Before the tree opens (v3)

B1 (`obs011-t0-baseline-check01`) runs on a frozen tree, and B2–B7 follow it (T0 record §3). Until root announces **"tree open"**:

- Only lanes listed as early read-only in the T0 record §14 may work.
- They read, and they write only under `docs/qa/evidence/STUDIO-OBS-011/t0/early/<lane>/`. Root moves or cites that folder when the tree opens.
- Light commands only: `grep`, `sed`, `cat`, `shasum`, `python3 -I`. No gradle, node, vitest, helm or docker. No `cp -a` of `node_modules` (sandbox seeding is root's, after B7).
- Any heavy I/O perturbs the AC-5 "before" timings, which come from B1.

W1 lanes dispatched at B1 green may plan and draft in `$EV/<lane>/` before "tree open"; their first write under a capture root, `helm-chart/` or a quoted doc waits for it.

## Command conventions

The macros (`N24`, `LOCK`, `BK`, `RR`, `RB`, `RFE`, `EV`, `BACKEND_FORM`, `RED_FORM`, `MUTANT_FORM`, `RF`, `RFX`, `FE`) are defined in `lanes.v4.json` → `commandConventions`. Expand them literally. `$EV` = `docs/qa/evidence/STUDIO-OBS-011/execution`.

- **Collectors:** the **execute-011** copies under `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/`.
  - Output goes to `docs/qa/evidence/STUDIO-OBS-011/execution/` (RD-4, C5; **announced by root at T0**). The folder exists; `run-backend.py` and `run-runner.py` do not create it.
  - They still take the **execute-008** Gradle lock, which 008, 009 and 011 share.
  - The execute-011 copies differ from execute-009 only in five path lines (tasked `:92`, `:112`; `run-backend.py:6`; `run-runner.py:6`; `run-runner-build.py:18`). `run-frontend.py` is new: it does **not** restore `docs/qa/accessibility/axe-results.json` (it records `axeResultsRewritten`), and it detects vitest only through `pnpm exec vitest`. If a collector writes into 009's folder, stop and report it.
- **Gradle:**
  - always through `LOCK`, always `--no-daemon`, a NEW `obs011-` label every time;
  - one Gradle process at a time;
  - up to 4 backend lanes share the lock in W1 and W3; wait on it and never bypass it.
- **FQCNs are keyed on the declared `package`, not the folder.** `GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest` and `GuidedPublicPresentationIT` are `com.citi.put.checks.studio.guided.session`. `GuidedObservationPrunerIT` is `…guided.retention`.
- **`verifyRunnerDist`:** any `*` or runner-spawning class name in `--tests` requires that nothing under `studio-runner/src` is newer than `dist/main.js`. That is why runner work happens in sandboxes.
- **`GuidedPublicationReplayIT`:** full class only, alone, with `--tests` on both `test` and `guidedIncrementalTest`. No single-test credit (D-14).
- **Before every backend run:** `lsof -nP -iTCP -sTCP:LISTEN`.
- **Lane runs carry no `--allowed-skips-file`.** A skip-policy exit 2 in a lane run is expected noise, so report the counts.
- **Staged units (Dex N-1):** a backend change that spans several files is prepared as a patch in your receipt folder. You apply and compile it inside one `LOCK` hold, then release. Never leave a half-applied multi-file edit between lock holds.
- **pnpm only:**
  - never npm or yarn, and install nothing;
  - the runner keeps its npm lockfile, so runner pnpm commands need `--config.package-manager-strict=false`;
  - no pnpm lockfile enters a copy-back set.

### Sandboxes (R-T0-6 v2, RC-6)

Root seeds both sandboxes from the start tree right after the start capture. Use **copies, never symlinks**: a symlink would send the tiers' evidence writes into the real tree.

- **Runner, `$SANDBOX/repo/`, same relative layout:**
  - `studio-runner/`, `docs/specs/`, `tools/` and `helm-chart/` (the unit tier reads `values-uat.yaml` and `values-prod.yaml`);
  - **only** the evidence subpaths that the unit and fixtures tiers read, from the T0-SB list. Not all of `STUDIO-OBS-007` (1.2 GB).
  - The fixtures tier's globalSetup builds the **sandbox** dist only.
- **Frontend, repo-shaped:**
  - `$SANDBOX/repo/frontend/`, plus every path in `COPY_SOURCE_FILES` and every other `REPO_ROOT` read in the T0-SB list (stories, the five STUDIO-OBS-008 evidence files, `consensus-plan.md`, `contracts/v3`, `openapi.yaml`, ADR-SC-006, `ExecutionReadinessService.java`).
  - Run from `$SANDBOX/repo/frontend` with host Node, and record `node --version`.
  - The old `$SANDBOX/frontend` layout fails the copy-table test for layout reasons.

### Runner dist (RC-6, D-2)

- **11-MERGE** makes one clean build. Its digest is `D_011`.
- Every later emit, whether the fixtures tier at MERGE or at 11-G, must leave the dist digest equal to `D_011`.
- `dist/` is gitignored and never committed.
- 11-RT proves with a `tsc` emit byte-compare whether R-4d moves the dist digest. If it does, AC-4 (d) is carried forward unless root accepts the move in writing.

### Docker (user decision 2026-10-18, U22 terms)

- **Lanes never run docker.**
- Root, with a @devops helper, builds **one** local image of `studio-runner/` in 11-MERGE:
  - tag `put-checks-studio-runner:obs011-<n>-local`;
  - `--pull=false`, no pulls; fetching the BuildKit syntax frontend is allowed;
  - then `check:pins -- --require-image` against it.
- 11-G runs the deployment tier with `STUDIO_RUNNER_IMAGE` set to that tag.
- The image must be built from the same source and dist digest as the 11-G runs. Any later tree edit means a rebuild.

## Evidence model (R-T0-4 v2)

- **Lane collector runs are non-evidentiary.** An exit 2 caused only by `sourceStable:false` while other lanes edit is expected, so report the test counts.
- **Credited evidence:** the fresh T0 baseline (B1–B7), the **F-1 freeze window** runs (`obs011-gsm-b01..b03`), and 11-G (G1–G10).
- **F-1 freeze window (C4).**
  - Root announces its start and end.
  - While it is open, **no lane writes anything in the real tree** under the capture roots (`backend frontend studio-runner tools docs/specs .github package.json package-lock.json pnpm-lock.yaml AGENTS.md`) or under `helm-chart/`.
  - Lanes may read, plan and edit in sandboxes or receipt folders.
  - It lasts about 40 minutes (ReplayIT alone is about 18 minutes).
  - A freeze run is credited only with exit 0, `sourceStable:true` and `distStable:true`.
- **"Unchanged" (R-T0-7):** byte-identical across the change under proof. Record the sha256 immediately before. The collector's before/after manifests are the record.

## Red-first and mutation protocol (C3)

**Red-first** applies to C-OBS009-1, C-OBS008-1, F-1 and R9-OBS-3. For each:

1. Write the new test.
2. Run `RED_FORM` (`obs011-<lane>-red<k>`) **before** the main edit.
3. Red must be an **assertion failure of the new test against the old main**. A compile error or "no tests found" is not red. For F-1, red is "200/accepted where 409 `RUNTIME_INCOMPATIBLE` is expected", one case per operation.
4. Record the main file's sha256 immediately before and after the edit.
5. Save the red log, then the green.

**Mutation:**

- Use `MUTANT_FORM` only: edit, run and restore **inside one lock hold**, or in a scratch copy. A mutant must never sit in the shared tree while another lane compiles.
- Record the restored sha256. It must equal the pre-mutation sha256.
- One mutant per site: the four F-1 `requireTranslation` calls; the admit require moved after `access.authorizeAction`; the four R-9 clock sites; the C-OBS009-1 WARN every-time and never; C-OBS008-1 `REFUSED`→`PENDING`.
- Every mutant must go red. A surviving mutant is a finding.

**Grep positive control:** every grep used as proof (AC-7, F-1, CLN-F2, the symbol greps) is also run on a string known to exist at the start digest, so that "0" cannot mean a broken command.

## Wait library (R-5w v2)

**Decided at T0: branch A.** T0-AW passed: `org.awaitility:awaitility:4.2.2` resolves offline on `testRuntimeClasspath` and `testCompileClasspath`, transitively from `spring-boot-starter-test` 3.3.5 (Dex, `t0/setup-receipt.md` §2). Branch B is void: nobody creates `Await.java` and no lane waits for it. No shared wrapper either: a helper would be a new baton file for four lanes and adds nothing Awaitility's `alias` and timeout message do not already give.

- **Branch A (in force).**
  - Use `org.awaitility.Awaitility` directly. It comes transitively from `spring-boot-starter-test` 3.3.5, scope compile, version 4.2.2.
  - **No `build.gradle.kts` edit**, and no explicit declaration.
  - Convention:
    - `atMost` = the deadline the loop already had;
    - `pollInterval` = the interval it already had (typically 20–25 ms);
    - `pollInSameThread()` where the condition reads thread-bound state;
    - `.alias("<condition name>")` so a timeout names the condition.
  - No `Await.java`.
- **Branch B (void; kept for the record).**
  - 11-LEFT lands `backend/src/test/java/com/citi/put/checks/studio/support/Await.java` on W1 day 1.
  - It is an ADAPT of the existing private `await(BooleanSupplier, long)` loop (for example `GuidedBridgeIntegrationTest:1664`), with a failure message naming the condition and the last observed value.
  - It is read-only for every other lane once landed.

In both branches:

- Convert only POLL sleeps, in files in your write set.
- DELIBERATE sleeps stay, each with its reason.
- Private `await` copies in files outside your write set stay; that is no bonus refactor.
- Census uses `grep -c '\.sleep('`. ReplayIT has 95, one of them `TimeUnit.NANOSECONDS.sleep`.
- AC-5 asks for before/after wall time, not for a reduction. A flat ReplayIT time is not a failure, because its time is runner and browser time [I, Dex RC-5].

## Hard rules

- Write only inside your lane's write set plus `docs/qa/evidence/STUDIO-OBS-011/execution/<lane>/`. Needing another file is a finding for root, not an edit.
- **Batons:** follow the order in `lanes.v4.json` → `sharedFilesSingleOwner`. You start on a baton file only after root records the hand-over and its sha256.
- **Backend lanes keep the tree compiling** at every lock release.
- **Folds:**
  - 11-FOLD-prep keeps `GuidedRunnerClient`, `ObservedValidationClient`, `GuidedPublicationAuthorization` and their beans wired until 11-FOLD-final;
  - no adapters ship;
  - the existing 3-arg and 4-arg `HttpRunnerDispatchClient` constructors stay (R-4a v2.4);
  - per-operation connect timeout and HTTP version are preserved (R-4a v2.1).
- **Runner and frontend lanes never write the real tree.** Root copies back in 11-MERGE by exact path list, never by directory sync. `AGENTS.md` and `studio-runner/README.md` are delivered as patches.
- **Count and name** every dropped, ported or added test: `after = baseline − named drops + named additions`. Reconcile on the declared package.
- Migrations are immutable, and 011 adds none.
- No contract or pin change is planned. If one becomes necessary, stop and report it.
- **Git:**
  - no git write by any lane: no add, commit, stash or push;
  - commits are @devops's, by category, after 11-G and only on the user's word;
  - nothing is pushed.
- Never touch `.aiox-core/core/permissions/dispatch-governance.js`.
- Never signal a process you did not start.
- Leave no watchers, servers, browsers or Testcontainers behind.
- Never log secrets or key material. `SecretValue` stays the single secret-bearing serializer (K-5).
- No docker, except root's D-1 build in 11-MERGE.
- No real-provider or model calls.
- **Accessibility follows ADR-SC-006.** The only a11y-file change is R-11's deletion of surfaces 4 and 5. The recorded reason is: "duplicate pair; the unlearned state is no longer scanned; accepted under ADR-SC-006".
- **A red recorded by name in the T0 baseline** inside a file you own (for example a ReplayIT or TransportFaultIT case) is yours to stabilise if the cause is in the test. A main-code cause is reported to root, not fixed.
- **11-IT-R is timeboxed** (`lanes.v4.json` → `11-IT-R.timebox`).
  - TEST-001 goes first.
  - At the stop point, unconverted POLL sleeps are carried forward by name.
  - The last state that was green twice is the baton.
- Report honestly, marking each claim **[V]** verified or **[I]** inferred.

## Receipt (every lane)

Write `docs/qa/evidence/STUDIO-OBS-011/execution/<lane>/receipt.md` and `.json` with:

- files written, with sha256 before and after (sandbox lanes: the copy-back manifest);
- the red log, then the green log;
- the mutant table, with restored shas;
- grep results with their positive controls;
- every command, with its exit code and counts;
- ACs covered;
- carried-forward items, each with an owner and a reason (never dropped silently);
- per-name test tables (drops, ports, additions);
- deviations, and open findings for root or @architect;
- **batons** handed on, with the sha256 at hand-over.

Your final message to root is concise.
