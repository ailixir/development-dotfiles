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
pinned image's `node --version` must match `.nvmrc`/`engines`. Owner of the *resolution* is
Platform/SRE with @architect (`studio-runner/ci/stages.md:301`): either the internal image ships the
pinned major under `ED-05`, or ADR-001 §4.2 is amended. Story 10.19 owns only the **verification**
in the deployed image. Recorded here because this spike is where the image is first run.

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
| O-2a. Image `node --version` vs `.nvmrc`/`engines` | | | | |

## Fallback if negative

A custom seccomp profile approved by Platform. **There is no fallback that disables the sandbox**: if
neither `RuntimeDefault` nor an approved profile works, 10.18 is blocked and the issue escalates to
Platform/SRE and Security.

**Owner sign-off:** _(name, date — required by the register's closure rule before `Result` moves off
`OPEN` in `studio-staging-spikes.md` and `ED-05` is updated in `EPIC-10-EXECUTION.yaml`)_
