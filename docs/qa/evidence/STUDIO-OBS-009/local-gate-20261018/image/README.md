# STUDIO-OBS-009 G9 image add-on (U22)

Prepared by Gage (@devops), 2026-10-18. **Not yet run.** The script is written but has not been executed. Nothing below is a result.

Script: `/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/g9-image.sh` (zsh, `set -u`). Run it as root once G9 C8 has ended: `zsh <path>`.

Authorization (U22, `execution-20261018/w0/decisions.md`): local docker build of `studio-runner/` with a fresh tag (no pulls; BuildKit may fetch the `# syntax=docker/dockerfile:1` frontend), C4 re-run against it, D2 image smoke.

## What it does, in order

1. **Gate.** Refuses (exit 2, writes nothing) unless `../status.txt` has a `C8-backend` line and no `obs009-g9-check01` process runs. Also refuses if `summary.json` already exists, docker is unreachable, or the base image `mcr.microsoft.com/playwright:v1.63.0-noble` (derived from the Dockerfile ARG defaults) is not cached, because pulls are not authorized.
2. **capture-before** (`capture-manifest.py`) and compare against G9's `../capture-before.json`: top-level `digest` (source) and `dist.digest`. Either differing aborts before any docker command (exit 3, `summary.json` verdict `ABORTED_CAPTURE_MISMATCH`).
3. `docker images` / `docker ps -a` before (read-only).
4. **Build** `put-checks-studio-runner:obs009-g9-buildstage-local` (`--target build`) and `put-checks-studio-runner:obs009-g9-local`, both `--pull=false --build-arg IMAGE_TAG=<final tag>` as in the 015 runbook rows 5a. Logs, `image-inspect.json`, and a check that `Config.Cmd` equals the Dockerfile `CMD` (and the A6 literal) with no ENTRYPOINT. A failed build skips steps 5 and 6 and writes `NOTRUN-build-failed` status lines.
5. **C4b**: `STUDIO_RUNNER_IMAGE=put-checks-studio-runner:obs009-g9-local run-runner.py obs009-g9-runner-deploy02 pnpm ... exec vitest run --config vitest.deployment.config.ts --minWorkers=1 --maxWorkers=1`, Node 24 PATH as in `g9.sh`. Appends `C4b-runner-deployment exit=N` to `../status.txt`. `run-runner.py` writes its own files under `execution-20261018/execution/obs009-g9-runner-deploy02-*`, as it did for deploy01.
6. **D2 smoke** (`pid1-launch-paths.md` steps 2, 3, 4, 5, 7), containers named `obs009-g9-smoke-*`:
   - step 2: `--read-only --init`, `/tmp` and `/journal` tmpfs, guided on with the seven guided keys. Asserts `runner.started`, node pid greater than 1, `node dist/probe.js /health` exit 0.
   - step 3: same without `--init`. Asserts exit 78, stderr exactly `CONFIGURATION_DENIED LAUNCH_TREE`, no `runner.started`.
   - step 4: `NODE_OPTIONS=--max-old-space-size=1024`. Asserts exit 78 and `CONFIGURATION_DENIED DEBUG_ENV`. Run **with** `--init` so the pid-1 refusal cannot be the cause.
   - step 5: `docker stop -t 30` on the step-2 container. Asserts `runner.draining` before `runner.drained`, stop inside the grace, container exit 0.
   - step 7: `ls -ln /tls` in the running container. Asserts key mode `-r--r-----`, gid 1001, readable by the process.
   - Appends `D2-smoke exit=N`.
   - **Step 6 (one real guided assign on Linux) is not scripted.** It needs the guided protocol driven with a signed token. It is reported as owed in `summary.json`, not as a pass.
7. capture-after, `docker images` / `docker ps -a` after, `summary.json` (verdict `GREEN` only when `Config.Cmd` check, C4b and D2 all exit 0).

## Decisions (auto)

- **[AUTO-DECISION] TLS material = the repository's public self-signed loopback fixtures** (`studio-runner/test/fixtures/guided-tls/`, the ones the unit tests use), copied into a `mktemp` dir that is deleted on exit. Reason: the deployment tests render manifests and carry no TLS material; the unit tests use these fixtures, which satisfy the listener's key/cert/EKU checks. Only the public fingerprint is used on a command line; service identities go through `--env-file`.
- **[AUTO-DECISION] TLS files live in a named volume `obs009-g9-smoke-tls`, not a host bind mount.** Reason: step 7 needs mode 0440 and gid 1001, which the Mac host cannot set on a bind mount. The volume is filled with `docker cp`, then chown/chmod by a root helper from the same image. The volume is mounted `:ro`.
- Cleanup removes only the six exact names in `SMOKE_NAMES`, the volume, and the temp dir. Image tags are left in place for the record.
- Not run: dist parity and in-image `check-pins` (015 rows 5b, 5c), because they were not asked for.

## Files written here

`run.log`, `image-status.txt`, `capture-*.json|summary|compare`, `docker-images-{before,after}.*`, `docker-ps-{before,after}.txt`, `build-*.log|exit`, `build-network-lines.txt`, `image-inspect.json`, `cmd.json`, `cmd-check.txt`, `smoke/` (per-step stdout/stderr, `assertions.tsv`, `commands.txt`), `summary.json`.
