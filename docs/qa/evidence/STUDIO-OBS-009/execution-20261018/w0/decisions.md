# STUDIO-OBS-009 W0: root decisions (2026-10-18, root as orchestrator, user yolo mandate)

**Baseline:** `baseline-manifest.json`.
- Source `50692d55e40807f67bf959f0d9672d9305d69b72ad693860506a3f7055e12dd3` (1705 files), equal to the 008 Done binding tree S_F2.
- Dist `897182d5…`; Flyway head V22; openapi `b5ecdcad…`.
- Environment facts: `environment.txt`.

## Root decisions (from Aria's T0 refold §R)

| Id | Decision |
|---|---|
| R1 | Guided mode runs only where the runner Deployment has exactly 1 pod, enforced by a chart check (A2.6). **Provisional:** it is in the user batch for a possible override. Pax placed it as a note under AC-1. |
| R2 | The execute-009 collectors exist: pnpm build, widened vitest detection, Gradle lock shared with execute-008 (`.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/README.md`). |
| R3 | Collector runs taken during active multi-lane editing are non-evidentiary. A collector exit 2 caused only by `sourceStable:false` while other lanes edit is expected; lanes report their test counts. The evidence is the G9 gate run inside a hold window. |
| R4 | No checkpoint commit without the user's request. The fallback is this baseline manifest. |
| R5 (008) | "Someone pressed Stop" after "None of these" is a pending user decision (README F08). Not 009 scope. |
| R6 | The AE-01 acknowledgement request draft is ready (`prep-20261016/t0-rulings/ae01-ack-request-draft.md`) for the user to forward. Root sends nothing externally. The O-AE, C9-AE and FE9 lanes wait for U13. |
| R7 | At most 5 concurrent agents in any 009 wave, because host free memory is low (`environment.txt`). |

## User-batch items

These proceed on the recommended defaults, provisionally. The user may override.

- **A17 (Q2):** observed schedules use parity with `ConfiguredBackgroundAuthorization`, and G-3 refuses outside `local`/`test`. This is the default the story is written against; it is confirmed provisionally so lane S can run. If the user overrides it, AC-6 returns to @po.
- **B8:** the headroom R and the ED-01 price are unknown. Budget admission = `ADMISSION_REFUSED_PRICE_UNKNOWN`, and no real-provider call is made.
- **Vault image pull:** not authorized. The A18 rehearsal is skipped by name (`REHEARSAL_ONLY_NON_CREDITING`, owed).
- **C-17 reviewer:** unnamed; owed.
- **Docker for the image smoke:** Docker is available locally (27.4.0). Pulling an image is not authorized, so only cached images are used.

## Carried into 009 from 008

- C-OBS008-4 (start 422 undeclared): the C9 lane, together with the P2 re-anchor so the pins move once (Pax recommendation).

## U22 / R5 image half: user decision (2026-10-18)

The user chose **"Authorize local build"**:
- a local `docker build` of `studio-runner/` with a fresh tag. No image pulls. BuildKit may fetch the Dockerfile syntax frontend from Docker Hub, as the 015 builds did.
- then a C4 re-run at the G9 frozen digest with `STUDIO_RUNNER_IMAGE=<tag>`.
- then the D2 image smoke from `d2/pid1-launch-paths.md` §"The image smoke that is owed": container run with `--init` and without it, then `docker stop` / drain.

All of this runs after G9 C8 has ended. Nothing else heavy runs alongside, because Testcontainers shares the Docker VM. Root records the build and the run.

## R4 checkpoint commit + 011 Docker: user decisions (2026-10-18)

- **R4:** the user chose **"Local commits, no push"**. @devops makes local checkpoint commits on `brunobuger/ui-studio` once 009 G9 is ruled.
  - Commits are grouped by category: agent memory, backend, runner, contracts/tools, chart, frontend, docs/evidence.
  - Files are staged by path, and nothing goes in that should not.
  - No push and no PR; that remains a separate decision.
  - `.aiox-core/core/permissions/dispatch-governance.js` is never staged.
- **011 Docker:** the user chose **"Yes, same terms as U22"**. 011 may run a local `docker build` of `studio-runner/` with an `obs011-` tag, plus the deployment tier, in 11-MERGE/11-G.
  - No image pulls. Fetching the syntax frontend is OK.

## OI-1: the post-residue 009 image (root, 2026-10-18)

Root treats one further fresh-tag local build of `studio-runner/` (tag `obs009-residue-local`) as covered by the user's U22 authorization:
- it is taken after the 009 residue lands (the catalog-entry change edits the Dockerfile; model-sizing changes the dist);
- it is the same operation, under the same terms: no pulls; fetching the syntax frontend is OK;
- the user's same-day extension of those terms to 011 shows the intent covers local gate builds.

That image serves both the post-residue deployment tier and the 011 T0 deployment baseline.

## G9b C8: targeted backend run instead of the full check (user decision, 2026-10-18 ~18:05)

The user chose **"Targeted backend run"**. Root stopped the full G9b `check` (`obs009-g9b-check01`) a few minutes after it started; it credits nothing. In its place, `local-gate-20261018b/g9b-c8t.sh` runs:
- the 9 classes the post-G9 batch touched or that failed in G9, each class in full;
- the fixed `guidedIncrementalTest` set;
- spotlessCheck, checkstyleMain, checkstyleTest and spotbugsMain.

**Waived here, by the user:** the full backend regression and the JaCoCo coverage gate at the G9b digest. Coverage stays at G9's informational reading (bundle 91.66% line, every package floor met), which is not a gate result.

**Owed:** a full fresh `check`, at the 011 T0 fresh baseline, before any 011 lane claims credit.

The user was told beforehand that this cannot make 009 or 010 Done today:
- 009 still needs T4 (U17/U18/U7, ED-01), the deployed stack (DEPLOY-OBSERVED-01, U24) and U3;
- 010 needs 009 Done and a real pilot.
Today's reachable scope is 009 local validation plus 010 T2.
