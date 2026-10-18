# STUDIO-OBS-011 T0: @devops co-sign (CLN-10), lane review for devops steps, collision check

- **Author:** Gage (@devops). **Date:** 2026-10-18, YOLO. **Mode:** read-only plus this file.
- **Not done:** no helm, node, python, gradle, docker or build. No git write. The only git commands were `git status --short` and `git ls-files`. G9 C8 was running and was not disturbed.
- **Legend:** **[V]** I read the bytes or ran the read-only command today. **[I]** inference, basis stated.
- **Inputs read:** `STUDIO-OBS-011-cleanup-inventory.md` (CLN-10 row, G8), `po-ratification.md` (P-5), `t0-proposal.md`, `lanes.json`, `w-brief.md`, the 011 story rows C-OBS008-3 / P-4 / P-8, `chart-observed/{receipt.md,chart.patch,tests.patch}`, `studio-runner/{Dockerfile,ci/stages.md}`, `local-gate-20261018/{status.txt,image/README.md}`.

---

## 1. CLN-10 co-sign (R-10 / P-5)

**Decision: ACCEPT ownership. Co-sign R-10 as ratified by @po.** Nothing in the criterion is changed.

- **What is signed:** `frontend/src/utils/retireLegacyStudioWorker.ts` stays. It is live at `main.tsx:3,19` and `index.tsx:2,5` [V]. 011 makes no code change. The row goes to T5 "Carried forward", owner @devops, reason "sunset trigger not reached". Sunset = first production deployment that contains the shim + 4 weeks (2026-10-09 PO advisory).
- **Why I can sign it:** no production deployment of Studio exists in anything I run or have a release record for [I: I know of no release record or tag in the repo; I did not run `git tag`]. So no date can be recorded, and G8 ("recorded, not inferred") forbids guessing one.
- **What closes it (three steps, in order):**
  1. **Trigger.** I record the first production deployment whose artifact contains `retireLegacyStudioWorker.ts`: date, release tag, and proof that the tag contains the file (`git ls-tree <tag> frontend/src/utils/retireLegacyStudioWorker.ts`). It goes in the release record and in a dated, append-only note on the CLN-10 row (inventory addendum, same mechanism as 11-DOC's). Sunset date = trigger date + 28 days, written as an absolute date.
  2. **Reclassify.** On that date, if no one reports a browser still holding the old registration, @po reclassifies the row C to A. If someone does, the date moves, with a reason.
  3. **Removal.** A later story (not 011, not this wave) deletes the file and its four lines in `main.tsx` and `index.tsx`. The `sessionStorage` key `studio:legacy-worker-retired` goes with it. Gate: type-check, lint, `grep -rn retireLegacyStudioWorker frontend/src` returns 0.
- **Caveat, stated once (inference):** the file's own comment says it handles "older Studio development builds", and the worker came from a dev-only MSW path (`public/mockServiceWorker.js`, removed by 10.44). The real exposure is therefore developer and UAT browsers, not production users. I still accept the production-deploy trigger as ratified, because it is the conservative one. If @po wants a shorter fuse, a UAT-based trigger is the alternative, and that is @po's call, not mine.
- **Reopen risk:** none for 011. If any 011 lane touched `main.tsx` or `index.tsx` it would need a new T0 decision. No lane does [V `lanes.json`: neither file appears in any write set].

---

## 2. Review of the 011 lanes for devops steps

### 2.1 CI, helm-chart, Dockerfile, .github

| Area | 011 write sets touch it? | Finding |
|---|---|---|
| `helm-chart/**` | **No** [V grep of `lanes.json`: 0 hits] | Nothing for 011. The chart belongs to my pending 009 patch (section 3). |
| `studio-runner/Dockerfile` | **No** | The image copies only `package.json`, lockfile, `.npmrc`, `tsconfig*.json`, `src`, `scripts`, `fixtures/observed-reference`, `Dockerfile`, `.nvmrc` [V `Dockerfile:26-35`]. `evaluation/` and `test/` are not in the image. So 11-RT's evaluation deletions and `test/` changes change nothing in the image. The `src/guided/*` and `run/guidedBrowser.ts` reformat does change `src`, so any image built after 11-MERGE has a different `dist` and a different executable digest. |
| `studio-runner/ci/stages.md` | **No** | No stage names `evaluation/`, `oracle`, `evaluate` or `summarize` [V grep]. Stage 4 keeps the "deferral record" `test/deferred.test.ts`. `deployment-tier-wiring.test.ts:103` only asserts the file exists [V], so R-40 (four pointer entries become comments, skips 29 to 25) is safe for the wiring guard. |
| `.github/` | **No**; and there is no CI definition in the repo | `.github/` holds only agent files [V `git ls-files`]. CI is an external pipeline described by `ci/stages.md`. I cannot run or edit it from here. |
| `studio-runner/package.json` `evaluate` script | Not touched (11-RT: read-only) | `"evaluate": "node evaluation/cli.mjs"` stays [V]. After R-EP, `evaluate` still starts, but its `validate-manifest`, `oracle-self-test`, `summarize` subcommands are gone. Nothing in CI calls them. |
| Lockfiles | Not touched | Runner keeps its npm lockfile; the Docker build uses `npm ci`. The sandbox runs use pnpm with `--config.package-manager-strict=false`, which does not change the lock. 11-RT must not let pnpm write a lockfile into the copy-back set. |

### 2.2 Devops steps that 011 needs (not in any lane today)

| # | Step | When | Why it matters |
|---|---|---|---|
| D-1 | **A local runner image for the deployment tier at 11-G.** `11-G` runs `vitest.deployment.config.ts` (`lanes.json` 11-G verify, `obs011-g-runner-deploy01`). That tier fails closed without `docker` and a local image named by `STUDIO_RUNNER_IMAGE` [V `test/deployment/image.ts`, `vitest.deployment.config.ts` header]. G9 C4 is exit 1 for that class of reason [I: no C4 log is in the folder, and my G9 image add-on exists to fix it]. The brief says "No docker build or pull" [V `w-brief.md`]. | After 11-MERGE (dist rebuild), before 11-G | Without it 11-G's runner-deployment leg is red by construction. Needs a U22-style authorization for 011: a local `docker build` of `studio-runner/` with a fresh `obs011-` tag, `--pull=false`, base image already cached, no pull. I will script it the way I did for G9 and run it as root's helper, not inside a lane. Ask root to add it to 11-MERGE and to relax the brief's docker line to that one build. |
| D-2 | **Rebuild order.** `verifyRunnerDist` fails when any file under `studio-runner/src` is newer than `dist/main.js` [V `w-brief.md`, `t0-proposal.md` K-1]. `studio-runner/dist` is gitignored (`.gitignore:71`) and has 0 tracked files [V]. | 11-MERGE | The dist rebuild produces **no committed bytes**. It is a local verification artifact. What ships is the image the pipeline builds from `src` at stage 5/7. Do not stage `dist/`. |
| D-3 | **Catalog digest follows the image.** Because the R-4d reformat changes `src`, the pipeline's next image has a new executable digest. The 009 chart takes the catalog file at deploy time (nothing committed), so the chart needs no edit [V `chart-observed/receipt.md` section 3, B5 item 11]. But the catalog producer (receipt open item 1) must run on that image. | At the first real release after 011 | Record in the release note: "runner image changed in 011, regenerate `observed-catalog.<digest>.yaml`". |
| D-4 | **Copy-table sources must be in the commit.** `COPY_SOURCE_FILES` (`guidedNarratives.ts:46-62`) names 6 files that `git ls-files` does not track [V]: under `docs/qa/evidence/STUDIO-OBS-008/`, `prep-20261016/t0-rulings/ruling.md`, `prep-20261016/implementation-plan.md`, `execution-20261015/ux-implementation-plan.json`, `execution-20261015/architect-rulings.json`, `execution-20261017/rulings/w5-unreadable-and-alias.md`; plus `docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md`. The guided copy-table test reads them (011 story C-OBS008-3 e, "commit-set coupling"). | In the commit that carries the 008 frontend | A clean checkout of that commit fails `guided.test.tsx` if they are missing. This **overrides** the 11-DOC line "staging docs/qa/evidence/** prohibited" for these 6 paths only: they are staged by name, in the 008 frontend commit, not by 11-DOC. 11-FE's registry move (C-OBS008-3) keeps the coupling, so the same 6 stay required after 011. |
| D-5 | **Stray files, not for commit.** `studio-runner/short.webm` (4 bytes, untracked) [V]. `frontend/src/.claude/` and `studio-runner/.claude`, `backend/.claude` are tool metadata. | Commit time | I will leave them out. CLN-58 (root, 11-MERGE) deletes `frontend/src/.claude/agent-memory/{aiox-pm,aiox-ux}/`. |
| D-6 | **R-4d proof script lives in the receipt folder** (`rt/ast-equal.mjs`), under `docs/qa/evidence/STUDIO-OBS-011/`. | Commit time | Evidence is committed by name per category. It is not a source file and must not land under `studio-runner/`. |

### 2.3 The commit set (what must go in which commit)

Selective staging by category, never `git add -A`. Today the tree has 1452 entries (515 modified, 455 deleted, 482 untracked) [V]. The categories I will use, in this order:

| # | Commit (conventional) | Contents | Notes |
|---|---|---|---|
| C-1 | `chore(framework)` / agent memory | `.claude/agent-memory/**` (119 untracked, plus the modified ones), `.cursor/rules/development.mdc` | Memory only; no code. `.aiox-core/core/permissions/dispatch-governance.js` is **never** staged (brief rule; it is `M` in the tree) unless the user says so. |
| C-2 | Backend main + tests (007/012A/009 backend) | `backend/**`, including the **tracked deletion `backend/src/main/java/com/citi/put/checks/studio/guided/account/ReplayAccountAccess.java`** (`git ls-files -s` shows it still tracked; status `D`) and the deleted `backend/db/cutover/V19__studio_inference_candidate_identity.sql` | `ReplayAccountAccess` has **0 references** in `backend/src`, `studio-runner/src|test`, `frontend/src`, `tools` [V grep]; the only mentions are 4 spec docs (history text). It is safe in this commit. Stage it explicitly with `git add backend/src/main/java/.../guided/account/ReplayAccountAccess.java` (a deletion needs the path). The directory is already empty on disk, so there is no second filesystem step (CLN-57 deletes the empty dir; git ignores empty dirs). |
| C-3 | Runner (`studio-runner/**`) | `src`, `test`, `scripts`, `fixtures` (including the 455 deleted adversarial fixtures and untracked `fixtures/observed-reference/accepted-observed-choice.json`), `evaluation/observed-authoring/` (untracked; the T4 harness), `Dockerfile`, `.nvmrc`, `ci/stages.md`, `README.md` | Do not stage `short.webm` or `dist/`. The 009 chart tests (`test/deployment/*`) go with C-5, not here. |
| C-4 | Contracts and tooling | `docs/specs/**`, `tools/**` (5 untracked `studio-*` tools) | |
| C-5 | Chart and deployment tier (009) | `helm-chart/put-checks/**` **including the untracked `templates/api-guided-tls-networkpolicy.yaml`** [V], `studio-runner/test/deployment/**`, `docs/runbooks/studio-runner.md` deploy note | The untracked network policy must not be left behind: `git apply` of `chart.patch` does not create it, and it is in the tree only as an untracked file. If it is missed, the chart in the commit differs from the chart that was tested. |
| C-6 | Frontend | `frontend/**` (including `pnpm-lock.yaml` and the tracked deletion `frontend/package-lock.json`, per the pnpm decision), `docs/qa/accessibility/*` | Plus the 6 copy-table sources (D-4), staged by name. |
| C-7 | Docs, stories, gates, evidence, `.ai/` | `docs/stories/**`, `docs/qa/gates/*.yml`, `docs/qa/evidence/**` (by story folder), root docs (`CLAUDE.md`, `AGENTS.md`, `ARCH.md`, `PRD.md`, `README.md`, `UI_IMPLEMENTATION_PLAN.md`), and the **10 `.ai/` entries** (P-4: keep tracked; 118 tracked now) [V `git status --short .ai` = 10] | Evidence is committed by story folder so a revert is per story. Large `execution/` collector dirs: I will check size before staging. |

**009 R4 checkpoint commit.** It is **not authorized**. I will not commit anything until the user says so. The categories above are the proposal I would put to the user. What 011 needs from it: see section 3, "Landing order".

**011's own commits** (after its lanes): per lane family, each with a story-ID suffix `[STUDIO-OBS-011]`: backend (LEFT, GS, FOLD, IT), runner (RT + the 11-MERGE dist note, no dist bytes), frontend (FE), docs (DOC, inventory addendum, README), evidence by folder. Each lane receipt already carries before/after sha256, so a mixed file can be checked after the fact.

### 2.4 The runner dist rebuild in 11-MERGE

- **Verified:** `dist/` is not tracked and is gitignored. The rebuild yields a digest `D_011` for the evidence only.
- **Risk 1 (K-1):** any `studio-runner/src` write before the rebuild turns every backend IT run that spawns the runner red. The brief's sandbox rule already handles it. I add one check for root: copy back only by the receipts' exact path lists (as `lanes.json` 11-MERGE says), never `rsync` a sandbox directory over the tree. A directory sync would overwrite the 009 deployment tests and `ci/stages.md`, which sit in the same `studio-runner/` tree and are not 011's.
- **Risk 2:** the pre-011 G9 binding digest has `distDigest 4add1307…` [V `c8-backend.collector.log`]. After 11-MERGE the dist digest changes by design, so R-T0-2 baseline reuse must not be applied to anything that runs after the rebuild. The proposal already says credited evidence comes from T0 plus 11-G only [V R-T0-4].
- **Risk 3:** `npm run build` runs `write-runtime-versions.mjs`, which reads `Dockerfile` and `.nvmrc` [V `Dockerfile:32-35`]. Both are `M` from 009. Any 009 edit to them after 011's T0 digest invalidates it.
- **Devops step:** D-1 (local image) after the rebuild, then `check:pins -- --require-image` (stage 6a) against that image. That check is not in `lanes.json`; I would add it to 11-MERGE, with D-1.

---

## 3. Collision check: 011 write sets against my pending 009 chart patch

Patch contents [V `grep '^+++'`]:

- `chart.patch`: `helm-chart/put-checks/templates/{_helpers.tpl,configmap.yaml,deployment.yaml,studio-runner-deployment.yaml}`, `values.yaml`, `values-uat.yaml`.
- `tests.patch`: `studio-runner/test/deployment/{backend-env.test.ts,chart.test.ts,envfrom-keys.test.ts,helm.ts}`.

### 3.1 Path collisions

**None.** No 011 lane writes any `helm-chart/` path or anything under `studio-runner/test/deployment/` [V grep of `lanes.json` for `helm-chart` and `test/deployment`: 0 hits]. 11-RT writes `test/deferred.test.ts`, `test/evaluation/*`, `evaluation/*`, six `src/guided|run` files [V]; none overlaps.

### 3.2 Collisions that are not path-level

| # | Collision | Severity | Resolution |
|---|---|---|---|
| X-1 | **My `g9-image.sh` aborts on a digest mismatch.** It compares the source and dist digest to G9's `capture-before.json` and exits 3 if either differs [V `image/README.md` step 2]. Applying the patches first moves the source and helm digests. | high (it would waste the G9 image run) | Run `g9-image.sh` **before** applying the patches. |
| X-2 | **R-T0-2 baseline reuse.** Reuse is valid only if the 011 start digest equals the G9 binding capture. The patches change both `helm-chart/` and `studio-runner/test/`, which the capture hashes (the receipt says the patch "moves the helm digest") [V]. Applied after G9 and before T0, the digest will not equal G9's, so reuse is void and the 011 baselines (backend `check` ~1 h 45 min, runner, frontend) must be re-run. | high (schedule) | Accept that cost, or apply the patches after 011. Section 3.3 shows why after-011 is worse. Root decides; my recommendation is patches first, baselines re-run once, taken after the patches. |
| X-3 | **The new deployment tests have never run** [V receipt section 4: "written and type-checked but have never executed"; about 59 new cases]. If they land in the tree and fail on first run, the 011 baseline records a red it does not own. | medium | The first green run of the deployment tier with the patches is 009's work (@qa/@devops), done before 011's T0 digest. R-T0-2's rule "a red that G9 closes with is recorded by name" does not cover new reds. |
| X-4 | **Live surface list.** The patch moves the helm digest; the 010 Live surface list is re-measured for chart categories at the 009-Done re-date [V receipt open item 5]. 011's R-T0-3 intersection must use the re-dated list. | medium | 11-T0 reads the re-dated list only. No 011 lane touches chart categories, so I expect an intersection of 0 for the chart; `studio.observed-replay.*` application.yml keys need a check against 11-LEFT (below). |
| X-5 | **`backend-env.test.ts` (new) parses `backend/src/main/resources/application.yml`** for `studio.observed-replay.catalog-json` and `policies-json` [V `tests.patch:46-55`]. 11-LEFT edits `application.yml` (the `studio.execution.sse.read-interval` leaf only). | low | Different keys, no conflict. Add to 11-LEFT's check: after the leaf removal, `studio.observed-replay` is byte-unchanged and the file still parses. The deployment tier at 11-G covers it. |
| X-6 | **`docs/runbooks/studio-runner.md`.** 11-DOC re-audits §§1-3 and 5-13 (C-OBS009-3). My patch's open item 3 asks for one UAT deploy note (three deploy-time inputs: controller pin, catalog file, policy file), which I have not written [V receipt]. The runbook already has a §14 for STUDIO-OBS-009 (`:945`). | medium | I write the deploy note as a new subsection of §14 (outside the §§1-13 range 11-DOC owns) **before** 11-DOC starts, so the two edits are in disjoint sections. Both stay unstaged until a commit is authorized. |
| X-7 | **Catalog-producer script** (receipt open item 1): a new `studio-runner/scripts/print-observed-catalog.mjs` by @dev, then my CI step. Not in any 011 lane. If it lands mid-011 it changes `studio-runner/` (source digest, `scripts/**` coverage gate, image content). | medium | Land it before 011's T0 digest or after 11-G. Not in between. |
| X-8 | **Sandbox copy of `studio-runner/`** (11-RT) taken before the tests.patch applies lacks the new tests. | low | Harmless if copy-back is by exact path list (section 2.4). Say so in the RT receipt. |
| X-9 | **CLN-44 count.** The proposal measured 38 distinct `STUDIO_RUNNER_*` names in the chart at the pre-patch tree [V proposal row CLN-44]. The patch raises the closed list from 48 to 53 (five `OBSERVED_*` keys) [V receipt B5 item 2]. | low | The 11-DOC inventory addendum quotes CLN-44 at the digest taken after the patch. Row stays class K. |
| X-10 | **Dirty base files.** Both patches were cut against the dirty tree, not HEAD (sha256 bases in receipt section 1). 011 files `CLAUDE.md`, `ARCH.md`, `AGENTS.md`, `studio-runner/README.md`, `evaluation/cli.mjs`, `evaluation/README.md`, `docs/runbooks/studio-runner.md`, `GuidedSessionService.java`, `StudioService.java`, `application.yml`, `build.gradle.kts` are also `M` from 009 [V]. | high (attribution) | See the landing order, step 6. |

### 3.3 Proposed landing order

0. **Now to G9 exit:** nothing is applied or committed. Nothing in this file changes the tree.
1. **G9 C8 ends** and root records the G9 exit. User authorization stays a precondition for every step below that writes git.
2. **Run `g9-image.sh`** (C4b and the D2 smoke) against the unchanged tree (X-1). That gives the first green C4 for the existing tier.
3. **Apply `chart.patch`, then `tests.patch`** (`git apply --check` first; re-cut if any base sha in receipt section 1 moved). Keep the untracked `api-guided-tls-networkpolicy.yaml` with them. Re-run `helm lint` and the two stage-8 commands, then the deployment tier against the G9 image tag, and get the new cases green (X-3). Fix, re-cut and re-run as needed. This is 009 work.
4. **Write the UAT deploy note** in runbook §14 (X-6). Land the catalog producer script if it is ready (X-7).
5. **010 Live surface re-dated** over the post-patch helm digest (X-4).
6. **009 R4 checkpoint commits**, only with the user's authorization, by the categories in section 2.3, C-1 to C-7. This is the commit that must come **before 011 W1**. Reason: 11-RT and 11-FE sandboxes are copies of the dirty tree, and 11-LEFT, 11-GS-M, 11-DOC and 11-FOLD edit files that are already modified by 009. Without a 009 commit first, one file would carry 009 and 011 hunks together. Interactive `git add -p` is unavailable here, so they could not be split. If the user declines the checkpoint, the fallback is a single combined commit, or one commit per lane built from the receipts' before/after hashes. I would need the user to choose that before 011 starts.
7. **11-T0:** root takes the start digest **after** steps 3 to 6. Baselines are re-run (X-2); G9's cannot be reused. The Live surface intersection uses the re-dated list.
8. **011 W1 to W5**, with D-1 (local image) added to 11-MERGE after the dist rebuild.
9. **11-G**, then 011 commits as in section 2.3, with `[STUDIO-OBS-011]`.
10. **Push** only after the pre-push gates and only on the user's instruction: `git push -f origin main` per the repo rule for `/app`. For this branch (`brunobuger/ui-studio`) I will not force-push without explicit approval.

Why not patches after 011: 11-G's credited digest would then be superseded by the chart and test change, and the gate would need a second credited run. Why not interleaved: X-2 and X-10.

---

## 4. Asks for root

1. Authorize the R4 checkpoint commit (or choose the fallback) before 011 W1.
2. Add D-1 to 11-MERGE: a local `docker build` of `studio-runner/` with an `obs011-` tag, `--pull=false`, and `check:pins -- --require-image` against it. This needs a U22-style authorization.
3. Order `g9-image.sh` before the patch apply (X-1), and decide X-2 (re-run baselines).
4. Confirm the 6 copy-table sources are staged by name in the frontend commit (D-4), despite the 11-DOC "no staging evidence" line.
5. Tell me when the user wants the CLN-10 trigger recorded; nothing is due before the first production deployment.

## 5. Auto-decisions

- [AUTO-DECISION] Run the attached `synapse:*`, `coderabbit-review` and `checklist-runner` skill texts? -> No (reason: unrelated to this mission; the dispatch forbids builds and tests; nothing is committed, so CodeRabbit has no diff).
- [AUTO-DECISION] Accept CLN-10 on the production-deploy trigger as ratified, rather than propose a UAT trigger -> accept (reason: Pax ratified it, the 2026-10-09 advisory stands; the caveat is recorded, the choice stays with @po).
- [AUTO-DECISION] Place the UAT deploy note in runbook §14, not §§1-13 -> §14 (reason: 11-DOC owns §§1-13; disjoint sections avoid a baton).
- [AUTO-DECISION] Treat a mixed 009/011 file set as a blocker for 011 W1 unless the user chooses a fallback -> yes (reason: interactive staging is unavailable).
