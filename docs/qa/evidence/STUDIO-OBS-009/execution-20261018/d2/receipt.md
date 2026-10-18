# Receipt: STUDIO-OBS-009 W2 lane D2 (chart and Dockerfile)

- **Agent:** Gage (@devops). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No Docker build, pull or container run. No cluster. No install. `.aiox-core/core/permissions/dispatch-governance.js` not touched. No process signalled that I did not start.
- **Verdict: GREEN** for the local half of AC-1, AC-2, AC-4, AC-5 and AC-11 d. Owed items are in section 6.
- **Legend:** [V] ran or read today; [I] inference; [U] unrun with owner.

## 1. Tests (deployment tier, helm v4.2.0, Node v24.20.0)

All runs: `cd studio-runner && <N24>; STUDIO_RUNNER_IMAGE=put-checks-studio-runner:obs015-final07-local pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts <files> --minWorkers=1 --maxWorkers=1`.

| Run | Files | Result | Log |
|---|---|---|---|
| Baseline before any change (image tag at its default, which is absent locally) | chart, envfrom-keys, backend-env, scaling | exit 1, 224 passed / 3 failed. The 3 are the tests that read the image (default tag `10.18a-local` is not built). Not my change. | `logs/baseline-before-changes.log` |
| **Red**: new tests against the HEAD chart and HEAD Dockerfile (my 11 chart/Dockerfile files temporarily reverted with `git show HEAD:`, sha256 before/after equal, restored) | the six lane files | exit 1, **176 failed** / 290 passed (466) | `logs/red-run-against-HEAD-chart.log` |
| **Green**, final bytes | chart, dump-settings (new), tls-client-cert (new), envfrom-keys, backend-env, scaling | exit 0, **466 passed / 466**, 6 files | `logs/green-lane-files.log` |
| Green, other deployment files | edge, integrations, cancel-budget-env | exit 0, 91 passed / 91, 3 files | `logs/green-other-deployment-files.log` |
| Green, default-tier files that read the Dockerfile or chart | pins, runtime-versions, disclosure, run/sandbox, run/confinement, deployment-tier-wiring | exit 0, 111 passed / 1 skipped (pre-existing) | `logs/green-default-tier-readers.log` |
| `helm lint` x 4 value sets x guided off/on (with the pin set) | n/a | 8/8 `0 chart(s) failed`; without the pin the lint fails naming `controllerCertificateFingerprint256` [V, ran] | not logged to file |

- The red run is **retroactive**: the tests were written after the code, then run against the reverted chart. It shows the tests discriminate. It is not red-first in time.
- **Not run:** `test/deployment/sec2.test.ts` (it does `docker run` of the image; no Docker authorization, R5).
- The image-reading tests (`imageFacts`) ran against a locally cached image through `docker image inspect` only (read-only metadata). The image under test carries the OLD CMD, so the A6 CMD is asserted on the Dockerfile text, not on an image.
- Test counts for the tier were taken during active multi-lane editing: non-evidentiary (root R3).

## 2. Mutations (key assertions)

Ten spot-check mutations on the live files, each reverted automatically (cmp against backup confirmed). Results in `logs/mutation-results.json`:

| Id | Mutation | Red |
|---|---|---|
| m01 | delete `strategy: Recreate` | 4 tests (guided sets) |
| m02 | delete `terminationMessagePolicy` | 4 |
| m03 | secret file mode 288 to 420 | 16 |
| m04 | delete the `/tmp` mount | 5 |
| m05 | worker `JAVA_OPTS` loses `-XX:-CreateCoredumpOnCrash` in `values.yaml` | 3 |
| m06 | delete the HOST guard | 1 |
| m07 | Dockerfile CMD loses `exec` | 1 |
| m08 | delete the fingerprint format check | 1 |
| m09 | delete the `shareProcessNamespace` guard | 5 |
| m10 | delete the guided TLS egress port | 1 |

Template mutations built into the tests (scratch chart copy, inside the measurement window): replica check deleted lets `replicaCount: 2` render; autoscaling check deleted; sidecar added to a guided pod; `TMPDIR` injected; `defaultMode` dropped; `TLS_CA_FILE` dropped; SIEM stream renamed. Each asserts the red or the changed outcome.

## 3. Files written (sha256: HEAD blob, then final bytes)

Full hashes in `files.json`. Files marked `*` already carried uncommitted edits from earlier lanes before this lane started (`values.yaml`: the `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` line; `Dockerfile`: two `COPY` lines; `chart.test.ts`: the STUDIO-OBS-015 G tests). I did not touch those; the HEAD hash is therefore not the exact "before" for them.

| File | HEAD | After |
|---|---|---|
| `helm-chart/put-checks/templates/_helpers.tpl` | 567a2486e946 | see `files.json` |
| `.../configmap.yaml` | 6cce5ae1b513 | " |
| `.../deployment.yaml` | a1a8389c462e | " |
| `.../studio-runner-deployment.yaml` | fbafd93c0172 | " |
| `.../studio-runner-networkpolicy.yaml` | 3ea14acb6c36 | " |
| `.../studio-runner-service.yaml` | f9e7ee6915f5 | " |
| `helm-chart/put-checks/values.yaml` * | b1eabf559a8d | " |
| `values-dev.yaml`, `values-uat.yaml`, `values-prod.yaml` | 7b2ff78401d7, 1e569740539a, a26814326c2a | " |
| `studio-runner/Dockerfile` * | 83217bd31edc | " |
| `studio-runner/test/deployment/{chart *,backend-env,envfrom-keys,scaling}.test.ts`, `helm.ts`, `image.ts` | in `files.json` | " |
| `studio-runner/test/deployment/dump-settings.test.ts`, `tls-client-cert.test.ts` | new | " |
| `docs/.../execution-20261018/d2/**` | new | n/a |

Not written: `studio-runner-scaledobject.yaml` (no change needed once the guard exists; co-sign item 6), `service.yaml` (outside the write set, and not needed: see finding F2).

## 4. ACs covered (local half)

| AC | What now holds, on rendered manifests over the four value sets | Evidence |
|---|---|---|
| **AC-1 chart** | One runner Deployment, none named guided, no guided template file; guided is `STUDIO_RUNNER_GUIDED_ENABLED` plus seven keys rendered only when on. A2.6: render **fails** for guided on with `replicaCount != 1`, `autoscaling.enabled`, `shareProcessNamespace` not true, or the runner disabled (each negative has a positive control and a deleted-guard mutation). `strategy: Recreate` when guided. Resources, `/dev/shm`, liveness threshold sized for two browsers. **PID-1 b:** `shareProcessNamespace: true` and one container asserted on guided sets, private-key Secret now always mounted so the one-container bound bites even without s3. **PID-1 c:** `pid1-launch-paths.md`. `/tmp` disk emptyDir, journal emptyDir (not a PVC), neither TMPDIR nor NODE_OPTIONS, secret mounts 0440 read-only with no subPath, probe env present and non-empty, `terminationMessagePolicy`, HOST guard. | `chart.test.ts` (new blocks), `logs/green-lane-files.log` |
| **AC-2 values and rotation inputs** | Backend client key store/trust store Secret (separate from the runner's), `studio.runner.tls.*`, https runner URL, guided connector port + Service + NetworkPolicy port, issuer/public key/worker id single-source across runner and backend, token files as separate directory mounts, fail-closed negatives for each missing part. Rotation: `tls.rotationRevision`, key ConfigMap checksum, procedures in `rotation-and-cert-inputs.md`. | `tls-client-cert.test.ts`, `rotation-and-cert-inputs.md` |
| **AC-4 dump flags and lint (A6)** | Both negative JVM flags on API and worker on all four value sets, guided on/off, last-occurrence semantics, predicate has controls. Dockerfile CMD `["sh","-c","ulimit -c 0 && exec node dist/main.js"]`, one CMD, no ENTRYPOINT, chart overrides neither `command` nor `args`. `STUDIO_RUNNER_VAULT_ADDRESS` is refused at render. | `dump-settings.test.ts` |
| **AC-5 SIEM values** | `studioAuditSiem` block, off by default; enabled needs a sink name; pod annotation and ConfigMap compared to the application's own stream and logger (`logback-spring.xml` and `StudioActionAudit.CATEGORY`), mutation red. | `backend-env.test.ts` (AC-5) |
| **AC-11 d alert spec (A15)** | Platform-neutral log-based specification: events `report.terminal_rejected` and `report.terminal_abandoned`, window, grouping, severity, owed items. The runner has no metrics endpoint. | `r82-alert-spec.md` |

Q5 (no `closeGraceSeconds` key): the inequality is recorded in `resource-basis.md` section 4 and asserted on the rendered pod.

## 5. Deviations and decisions

- **[AUTO-DECISION] The controller fingerprint has no default and the render fails without it** (Gage co-sign 3.5, "one key, no default"). Consequence: any `helm lint` or `helm template` of this chart with the runner enabled needs `--set-string studioRunner.tls.controllerCertificateFingerprint256=...`. The test harness supplies a fixture pin (`TEST_PIN`) through `--set`, and `omitPin` proves the render still refuses without it. Reason: a placeholder default would let a real environment run with a fake pin.
- **[AUTO-DECISION] Backend guided properties go into the mounted `application.yaml`** (the chart's story 10.27 rule), merged over `configOverrides` by one helper, `put-checks.backend.springProperties`, and reserved in `validateProperties`. `envfrom-keys.test.ts` now checks "every configured key arrives unchanged, and the only additions are `studio.runner.tls.*`" instead of strict equality.
- **[AUTO-DECISION] The guided TLS Service lives in `studio-runner-service.yaml`**, not `service.yaml` (outside my write set). It selects the API pods and exposes only the connector port, so the ordinary API Service is byte-identical with guided on or off (asserted).
- **Edited an existing test:** the M4 mutation in `chart.test.ts` carried the sandbox flag through `STUDIO_RUNNER_HOST`; the new HOST guard rejects that, so the mutation now uses `STUDIO_RUNNER_OBJECT_STORE_MAX_ATTEMPTS`. Reason is in the test comment.
- `JAVA_OPTS` flags are in the values files (as ruled "add"), not appended by the template. A future override that drops them is caught by the lint, not prevented.
- The `/tmp` basis could not cite "the recorder's byte bound" because the recorder has none (its bounds are attempts and windows). The nominal bound is stated instead (`resource-basis.md` section 2).

## 6. Owed externally (never a pass)

| Item | Owner | State |
|---|---|---|
| Image smoke: build, `docker image inspect` Cmd equals the A6 form, `--init` start, no-`--init` refusal `CONFIGURATION_DENIED LAUNCH_TREE`, `NODE_OPTIONS` refusal, `docker stop` shows `runner.draining` then `runner.drained` with the new CMD, journal on a read-only root, Linux recording scratch, TLS mount modes | @devops, needs the user's Docker authorization (R5) | **unrun, no authorization** (procedure in `pid1-launch-paths.md`) |
| `sec2.test.ts` (docker run) | @devops/@qa with the image | unrun, no authorization |
| PID-1 d: deployed pid recorded in a pod | @devops | unrun, no cluster |
| Probe over mTLS in a pod, exec probe cost, liveness threshold, resource sizing for two browsers, Secret propagation delay, effective 0440 + fsGroup modes | @devops/@qa (G-4) | unmeasured |
| G-1 in a shared environment | Platform/SRE | unrun (U4) |
| SIEM sink and its forwarding | Platform/SRE | unrun (U6) |
| Alert rendering and firing (A15) | @devops with Platform/SRE | unrun |
| Guided token issuer, certificate issuance, Secret provisioning | Platform/SRE (register U21) | not delivered; blocks any guided-enabled shared environment |
| Whether the backend image's entrypoint consumes `JAVA_OPTS` (no backend Dockerfile in this repository); backend core rlimit | Platform/SRE | unknown |
| Mutating webhook or mesh sidecar injecting `NODE_OPTIONS` or a container | Platform/SRE | unknown |
| SPK-04: guided browser sandbox under `RuntimeDefault` seccomp | SPK-04 | open |

## 7. Findings for root

- **F1 (outside my write set, now broken by this lane):** `studio-runner/ci/stages.md:205-206` runs `helm lint` / `helm template ... --set studioRunner.enabled=true` with no pin, which now fails by design. It needs `--set-string studioRunner.tls.controllerCertificateFingerprint256=<fixture>`. `docs/runbooks/studio-runner.md` and `studio-runner/README.md` still describe the plain-HTTP runner; both are outside the write set.
- **F2 (to D3):** the chart renders connector properties `studio.guided-authoring.tls-connector.port` and `.client-auth: need`, and reuses the `studio.runner.tls.*` stores for the connector. D3 owns the connector code and its names: if it names them differently, change the one helper `put-checks.backend.springProperties` in `_helpers.tpl` and the reserved list beside it. The backend certificate needs SANs for `<fullname>-api-guided-tls`.
- **F3 (to D3):** `GuidedRunnerClient` takes an `SSLContext` only. Passing `tls.sslContext()` relies on the JDK's default endpoint identification (D3.0 receipt).
- **F4:** the three `values-*.yaml` files carry per-environment Secret names that do not exist yet; `values-uat.yaml` already enables the runner, so UAT stays in `ContainerCreating` until `checks-studio-runner-tls-uat` and `checks-studio-backend-runner-tls-uat` exist and the pin is supplied.
- **F5:** `tools/corun.sh` still names `StudioCoRunIT` (A16): not runnable; lane I.
- **F6:** the tier's default image tag (`put-checks-studio-runner:10.18a-local`) is not built locally. F-merge's rebuilt image should be passed as `STUDIO_RUNNER_IMAGE`; the old cached image was used here for `docker image inspect` only.

## 8. Batons (land together at F-merge)

1. The rebuilt `dist` and the image built from the new `Dockerfile`: until then the cached image still has the old CMD, and the image-side check of A6 is owed.
2. D1's 12 `ACCEPTED_KEYS` (already present in `src/server/config.ts` when the final run was taken) must stay in step with `put-checks.studioRunner.acceptedEnvKeys`; the test compares both directions for the new keys.
3. D3's binding of `studio.runner.tls.*` and the connector must match F2, or the helper changes in the same merge.
4. `ci/stages.md` pin argument (F1) in the same merge as this chart, or the CI helm stage goes red.
