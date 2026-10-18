# SPK-04 — Chromium sandbox compatibility in-cluster

**Status:** OPEN. This is the record hook created by story 10.19 (AC-16), mirroring `SPK-01/README.md`.
Nothing here is verified in a cluster. **No evidence is recorded below and no spike is closed by
this file's existence.**

**Register entry:** [studio-staging-spikes.md](../../../architecture/studio-staging-spikes.md) §SPK-04
**Epic dependency:** EPIC-10 `external_dependencies: ED-05` (internal Playwright image)
**Accountable owner:** Platform/SRE (cluster policy)
**Executes:** Runner dev + @devops
**Gates (staging acceptance):** 10.18, 10.19
**Shapes earlier:** 10.18 `securityContext`/seccomp values; ADR-001 §9

---

## Why it cannot be established locally

Architecture §9.3: "Prove sandbox startup in staging; do not disable it silently to make the image
run." The chart's existing pods use `runAsNonRoot`, `readOnlyRootFilesystem: true`,
`seccompProfile: RuntimeDefault` and drop all capabilities; the official Playwright image runs as
root, which disables the sandbox.

---

## Questions this spike must answer

*(Verbatim from the register. A negative result is a valid closure — except that there is no
fallback which disables the sandbox; see below.)*

1. Does Chromium launch with `chromiumSandbox: true` (Playwright launch option; the default is
   `false`, which adds `--no-sandbox`) as a non-root user under the cluster's PodSecurity level?
2. Are unprivileged user namespaces available on the nodes (kernel and runtime settings)? The
   Chromium layer-1 sandbox relies on them when the setuid helper is unavailable to a non-root user.
3. Does `seccompProfile: RuntimeDefault` permit the namespace-creating `clone`/`unshare` calls the
   sandbox needs? The container runtime's default profile is expected to block them without
   `CAP_SYS_ADMIN`; if so, is a Platform-approved `Localhost` profile permitted, and who owns it?
4. Do `readOnlyRootFilesystem: true` plus `emptyDir` scratch and `emptyDir{medium: Memory}`
   `/dev/shm` satisfy Chromium (shared memory size, cache/home directories)?
5. Does the internal image (`ED-05`) run as a non-root user with the enterprise CA bundle and
   process reaping (init) in place?
6. Under the chosen policy, does a hung child process get killed by the parent and does the pod
   recover its slot (10.13 behavior in the real environment)?

**Folded in from story 10.19 AC-3 (the Node-major mismatch, `ci/stages.md` O-2a).** The internal
pinned image's `node --version` must match `.nvmrc`/`engines`. ~~Owner of the *resolution* is
Platform/SRE with @architect (`studio-runner/ci/stages.md:301`): either the internal image ships the
pinned major under `ED-05`, or ADR-001 §4.2 is amended.~~ Story 10.19 owns only the **verification**
in the deployed image. Recorded here because this spike is where the image is first run.

**2026-10-17 (@po): Node-pin sub-item (O-2a) resolved in source, ~~in-image re-verification pending
(015 gate run)~~ in-image verified 2026-10-17: final-gates07 check-pins --require-image exit 0, node
v24.20.0, nodeMajorPin 24, chromiumBuild 1243 (final-gates07/receipt.json).** *(Later 2026-10-17,
@po: the image is the local gate build `put-checks-studio-runner:obs015-final07-local`, not the
deployed internal image, which this spike still has to measure. Path:
`docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates07/receipt.json`.)* STUDIO-OBS-015 writer window W9 took the ADR-001 §4.2 amendment route. The runner
pins moved to Node 24 (`.nvmrc` `24`, `engines.node` `>=24.11.0 <25.0.0`) to match the Playwright
1.63 image, which ships Node 24.20.0. Evidence:
`docs/qa/evidence/STUDIO-OBS-015/execution-20261015/ed05-pin-fix01/analysis.md`. The O-2a row is
now at `studio-runner/ci/stages.md:284`. The internal pinned image must ship Node 24. **This spike
and `ED-05` stay open**: the internal image, non-root user, seccomp and CA bundle (questions 1–5)
remain Platform/SRE's. **Open item:** the external CI pipeline must move to Node 24 (@devops,
outside the repo).

---

## Evidence that closes it

Committed under `docs/qa/spikes/SPK-04/`:

- the exact pod spec used (security context, seccomp, volumes, resources);
- Chromium launch logs showing the sandbox active (no `--no-sandbox`, sandbox status reported by the
  browser) — **read from launch logs, not from a config value**;
- node/runtime settings for user namespaces;
- the seccomp profile file if `Localhost` is required, and the Platform approval reference;
- a recorded run of the controlled fixture producing a readable webm from that pod;
- the kill-tree test transcript.

## Findings

_Fill in during the spike. Leave a row empty rather than plausible._

| Question | Finding | Evidence file | Date | By |
|---|---|---|---|---|
| 1. `chromiumSandbox: true` as non-root under PodSecurity | | | | |
| 2. Unprivileged user namespaces on the nodes | | | | |
| 3. `RuntimeDefault` vs `clone`/`unshare`; `Localhost` profile owner | | | | |
| 4. Read-only root + `emptyDir` scratch + `/dev/shm` | | | | |
| 5. Internal image: non-root, CA bundle, init/reaping | | | | |
| 6. Hung child killed; pod recovers its slot | | | | |
| O-2a. Image `node --version` vs `.nvmrc`/`engines` | **Not measured in a cluster.** Pins resolved in source (`.nvmrc` `24`, `engines.node` `>=24.11.0 <25.0.0`), ~~in-image re-verification pending (015 gate run)~~ in-image verified 2026-10-17: final-gates07 check-pins --require-image exit 0, node v24.20.0, nodeMajorPin 24, chromiumBuild 1243 (final-gates07/receipt.json), on the local gate build `put-checks-studio-runner:obs015-final07-local`. The deployed internal image is unmeasured. | `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/ed05-pin-fix01/analysis.md` (the pin change only, not a spike finding); `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates07/receipt.json` (local-image check, not a spike finding) | 2026-10-17 | @po (Pax), bookkeeping |

## Fallback if negative

A custom seccomp profile approved by Platform. **There is no fallback that disables the sandbox**: if
neither `RuntimeDefault` nor an approved profile works, 10.18 is blocked and the issue escalates to
Platform/SRE and Security.

**Owner sign-off:** _(name, date — required by the register's closure rule before `Result` moves off
`OPEN` in `studio-staging-spikes.md` and `ED-05` is updated in `EPIC-10-EXECUTION.yaml`)_
