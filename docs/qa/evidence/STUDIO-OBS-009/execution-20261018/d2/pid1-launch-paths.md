# STUDIO-OBS-009 D2: PID-1 c, every launch path of the image with guided mode on

- **Author:** Gage (@devops). **Date:** 2026-10-18.
- **Rule (PID-1 a):** with guided mode on, the runner refuses to start unless `canEnumerateLaunchTree()` holds: its pid is greater than 1 and it appears in both `ps` listings. The guard is not relaxed. It writes `CONFIGURATION_DENIED <reason>` and exits 78 (ruling part 1, Q2). **PID-1 b:** the one Deployment keeps `shareProcessNamespace: true`, and the render fails if guided mode is on without it.
- **Legend:** [V] verified (what ran is named); [I] inference; [K] general Kubernetes or Docker behaviour not verified in this repository; [U] unrun, owner named.

## The table

| # | Launch path | PID 1 is | node pid | Guided start | Basis | State |
|---|---|---|---|---|---|---|
| 1 | `docker run` (no init), image CMD `["sh","-c","ulimit -c 0 && exec node dist/main.js"]` | node (the shell is replaced by `exec`) | 1 | refused, exit 78, `CONFIGURATION_DENIED LAUNCH_TREE` | `exec` keeps the pid. [V] on the host: `dash -c 'echo $$; ulimit -c 0 && exec sh -c "echo \$\$; ulimit -c"'` printed the same pid twice and `0` (macOS `/bin/dash`, not the image's shell). The refusal at pid 1 is the runner's own `canEnumerateLaunchTree` unit test (`test/run/tree.test.ts:209-220`, as the launch contract cites it) and, read today but not run by me, D1's folded `main` (`src/main.ts:162,251`) with its tests (`test/server/guidedMode.test.ts:260,500-506`). | Image run **[U]**: no Docker authorization (R5). |
| 2 | `docker run --init` | `docker-init` (tini) | greater than 1 | starts | [K] an init is PID 1 and forwards SIGTERM. | **[U]**, same. This is the path the image smoke uses. |
| 3 | Pod, `shareProcessNamespace: true` (the only shape the chart renders for guided) | the pause container | greater than 1 | starts | [K]. The chart half is [V]: every value set renders `shareProcessNamespace: true` with guided on and off (`chart.test.ts`, "PID-1 b"). | In-cluster pid **[U]**, owner @devops once a cluster exists (PID-1 d). |
| 4 | Pod, `shareProcessNamespace: false` | node | 1 | refused, CrashLoopBackOff | [I]. **Blocked at render:** guided on with the key false fails the render naming "PID-1 b" (`chart.test.ts`, mutation `m09`, red when the check is deleted). | Render-time [V]; never reaches a cluster. |
| 5 | Host process: vitest, the IT harness (lane I), `tools/corun.sh` | a shell or the JVM | greater than 1 | starts | [I]. Note: `tools/corun.sh:60` still names `StudioCoRunIT`, which A16 records as absent, so the script is not runnable today. Its successor `ObservedCoRunIT` belongs to lane I. | Lane I's, not D2's. |

## What the deployment tier proves for this table, and what it does not

- Proven on rendered manifests, over the four value sets with guided off and on: path 3 (`shareProcessNamespace: true`, one container), and path 4 refused at render. Evidence: `logs/green-lane-files.log`, tests under "PID-1 b" and "A2.6" in `chart.test.ts`.
- Not proven: paths 1 and 2 (no container was run), the deployed pid (PID-1 d), and that the new CMD still drains on `docker stop`.

## The image smoke that is owed (needs the user's Docker authorization, R5)

Run in this order, from `studio-runner/`, against an image built from the new Dockerfile. Record each exit code and stderr line, not a summary:

1. `docker build` of `studio-runner/` with a fresh local tag. Then `docker image inspect --format '{{json .Config.Cmd}}' <tag>` must equal `["sh","-c","ulimit -c 0 && exec node dist/main.js"]` (the tier's image-side check of A6; today the cached image still carries `["node","dist/main.js"]`).
2. `docker run --read-only --init` with the TLS files on a bind mount, `/tmp` and a journal path as `tmpfs`, and `STUDIO_RUNNER_GUIDED_ENABLED=true` plus the seven guided keys: assert it listens, `ps` inside shows node with a pid greater than 1, and the exec probe (`node dist/probe.js /health`) exits 0.
3. The same **without** `--init`: assert exit 78 and the single stderr line `CONFIGURATION_DENIED LAUNCH_TREE`, before anything listens. This is the discriminating case: a smoke that only shows the `--init` start would be green with the guard deleted.
4. The same with `NODE_OPTIONS=--max-old-space-size=1024` set: assert exit 78 and `CONFIGURATION_DENIED DEBUG_ENV`.
5. `docker stop` on the running container: assert `runner.draining` then `runner.drained` within the grace and exit 0. This is the property of `chart.test.ts` "AC-5a" re-recorded with the new CMD (A6 owes it).
6. One real guided assign on Linux: opens a journal inside the `--read-only` container (the journal fsyncs every ancestor directory up to `/`; whether that errors on a read-only root is unverified, devops co-sign 2.3) and opens the recording scratch (`/proc/self/fd` code path, never run on Linux before).
7. `ls -ln` of the TLS mount inside the container: the key is mode 0440 with group 1001 and the process can read it.

Until these run, the record reads **"unrun, no authorization"**. It is never a pass.
