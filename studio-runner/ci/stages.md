# `studio-runner` CI stages — hand-off for @devops

This document is the contract between this package and the CI pipeline. The pipeline YAML itself
lives outside this repository and is owned by @devops
([ADR-001](../../docs/architecture/ADR-001-studio-runner-scaffolding.md) §7.2, open item **O-1**);
this file states what must run, in what order, with which commands, and what each stage produces.

**Working directory for every command: `studio-runner/`.** This package is standalone — it is not a
workspace member and shares no lockfile with `frontend/` (ADR-001 §3).

## Environment

| Variable | Value | Why |
|---|---|---|
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1` | Browsers come from the image, never from `postinstall` (ADR-001 §4.2). Set on **every** stage, including the plain-Node ones. |
| `IMAGE_TAG` | full image tag being built | Recorded as `image` in `runtime-versions.json`. Only set on stages 5–7 when they run inside the image. |
| `PLAYWRIGHT_BROWSERS_PATH` | inherited from the image | Source of the recorded `chromiumBuild`. Never point it at a mixed-version browser root. |

**Node.** `.nvmrc` (24) pins the Node major **the image ships**; `engines.node`
(`>=24.11.0 <25.0.0`) allows that one major, patch releases only. `.npmrc` sets
`engine-strict=true`, so a Node outside the range fails at install time rather than at runtime.
Stage 3 asserts the recorded Node against the range everywhere, and against the `.nvmrc` major
whenever the record came from inside the pinned image. Every stage that runs on the host, including
the unit tier (its pins tests record the host's `process.version`), needs Node 24.

> **RESOLVED — O-2a.** The public `mcr.microsoft.com/playwright:v1.63.0-noble` base image ships
> **Node v24.20.0**. The pins used to say 22, so stage 6a failed by design; the pins now follow the
> image (ADR-001 §4.2 amendment, ED-05 pin-fix01). The internal image (`ED-05`) must ship the
> `.nvmrc` major (24); stage 6a is what proves it. Do **not** widen `.nvmrc` or `engines.node` to
> turn the pipeline green — a base-image change that moves the Node major moves both in one change.

## Stages

### 1. Install and audit

```bash
npm ci
npm audit --audit-level=high   # reported stage; does not gate
```

- **Image:** plain Node (`node:22`) or the pinned Playwright image; either works.
- **Produces:** `node_modules/`.
- **Notes:** `.npmrc` sets `audit=false` so `npm ci` never audits implicitly; the audit is this
  explicit, reported step (ADR-001 §4.1).

### 2. Static analysis

```bash
npm run type-check    # tsc -p tsconfig.json --noEmit  (src + test + config)
npm run lint          # eslint . (type-checked, execution-boundary rules as errors)
```

- **Image:** plain Node.
- **Produces:** nothing; gates on exit code.

### 3. Pin consistency

```bash
npm run check:pins
```

- **Image:** plain Node.
- **Produces:** nothing; gates on exit code.
- **Asserts:** `package.json` `dependencies.playwright`, the lockfile's resolved `playwright`, the
  `Dockerfile` `ARG PLAYWRIGHT_VERSION` and — once stage 5 has run — `runtime-versions.json` all
  carry the same exact version, and that the `engines.node` floor major equals `.nvmrc`.
- **Also asserts the Node that ran**, once stage 5 has run: the recorded `node` must satisfy
  `engines.node`, and — when the record came from inside the pinned image, evidenced by a recorded
  `chromiumBuild` — its major must equal `.nvmrc`. The in-image half cannot be dodged by dropping
  `chromiumBuild`: `--require-image` fails on the missing field instead.
- **Failure output** names every disagreeing copy with its value and exits `1`.
- Run it **before** the build for a fast failure, and again as stage 6a against the built image.
  Before the build, the recorded copy is reported as `NOT ASSERTED`, never as a pass.

### 4. Unit + contract tests with coverage gate

```bash
npm test
```

- **Image:** plain Node.
- **Produces:** `coverage/` (`text`, `json-summary`).
- **Gate:** 85% lines/statements and 80% functions/branches over `src/validator/**` and
  `src/executor/**`; 80% across the board over `src/compat/**` and `scripts/**`. Thresholds live in
  `vitest.config.ts` and fail the run themselves — no external check needed.
- The contract tier (internal routes vs the OpenAPI frozen in 10.1) joins this stage with story
  10.6; nothing extra is needed here today.
- **The deployment-evidence tier is NOT here — it is stage 9**, and that is a correction rather than
  a layout choice. Story 10.18a first landed it inside `npm test`, which this stage runs on a plain
  Node image with neither `helm` nor a built container image; both of its suites were `skipIf`-gated
  and therefore reported **green while enforcing nothing**. Stage 9 has both prerequisites and the
  tier now **fails** without them.
- The **perception tier** (stage 10) is also outside the default run: it needs a real browser. Its wiring guard
  lives in `test/run/importBoundary.test.ts` and stays in this stage.
- What *does* stay here: the tier's **wiring guard** (`test/deployment-tier-wiring.test.ts`) and the
  **deferral record** (`test/deferred.test.ts`). Neither needs a prerequisite, and keeping them here
  is deliberate — a tier moved out of the default run is a tier that can be quietly deleted, so this
  stage reddens if stage 9's config, script, stage entry or files disappear.

### 5. Build

```bash
npm run build      # tsc -p tsconfig.build.json && node scripts/write-runtime-versions.mjs
```

- **Image:** the pinned Playwright image when building the deployable artifact, plain Node when
  only validating the build.
- **Produces:** `dist/` (JS + `.d.ts` + source maps) and `dist/runtime-versions.json`.
- `runtime-versions.json` records `{playwright, playwrightLocked, playwrightImageTag, chromiumBuild,
  node, nodeEngineRange, nodeMajorPin, observedSchemaBundleHash, observedReferenceBundleHash,
  observedChromiumBuild, observedBrowserProvenance, observedBrowserLauncherSha256, image}`. The
  artifact-1 version stamps are not recorded (STUDIO-OBS-009 AC-1 P2). `chromiumBuild` and `image`
  are `null` unless the stage ran inside the pinned image with `IMAGE_TAG` set.

### 6. Fixture corpus inside the pinned image — **GATED BY `ED-05`**

```bash
npm run test:fixtures
```

- **Image:** the pinned Playwright image (`FROM <registry>/playwright:v<PIN>-<distro>`).
- **Produces:** nothing; gates on exit code.
- **Status today:** the internal Playwright image does not exist
  ([EPIC-10](../../docs/epics/EPIC-10-EXECUTION.yaml) `ED-05`, ADR-001 open item **O-2**). Until it
  lands, this stage runs **locally only** and the pipeline must record it as **skipped — not
  passed**. Do not substitute the public `mcr.microsoft.com/playwright` image to make it green in
  the pipeline; ADR-001 §8 permits the public image for local development only.
- The tier itself does not set `passWithNoTests`, so an empty run fails rather than passing
  silently.
- ADR-SC-007 WI-4 moved the live spike blocks of `test/evaluation` (the `SPIKE_LIVE=1` cases of
  `grounding-b-*`, `grounding-f-gt`, `grounding-q-*`) into this tier (`test/fixtures-tier/spike-live*.test.ts`), so
  that no file outside the tier imports Chromium (`test/run/confinement.test.ts`, AC-25). They keep their
  `SPK07_LIVE=1` gate; the unit-tier halves stay where they were.
- Story 10.3 wired this tier against the fake adapter (AC-6a). **Story 10.12 supplied the real
  Playwright adapter**: the tier now launches pinned Chromium in a killable child process against
  `fixtures/pages/`, served on loopback by `test/helpers/pageServer.ts` at the paths
  `fixtures/reference/manifest.json` binds them to. All 28 reference examples execute twice with
  identical per-step statuses, CSS `locator()` selectors resolve in the live DOM, and 10.3's
  `AC-6b` skip is deleted rather than re-skipped.
- **What runs here locally vs. what this stage may claim.** 10.12 ran the tier on a developer
  machine, which the BRD milestone "Real browser, real video (dev)" and `ED-05`'s `gate_note`
  permit. Running it **inside the pinned internal image** is 10.12's AC-18b and is still
  `ED-05`-gated: the pipeline records this stage as **skipped — not passed** until 10.18 lands the
  image and 10.19 confirms it.
- **Story 10.13 added the deadline/kill/cleanup cases** (`test/fixtures-tier/deadline-cleanup.test.ts`):
  a parent-enforced runtime deadline against a genuinely hung real browser, the process-tree kill
  observed by enumerating pids, the filesystem inspected for scratch/profile/temp/partial video,
  "the next run succeeds", the three `partial` cases of ADR-002 §17, and the canary carried through
  a real Chromium. That file also holds this story's deferrals as **live skips naming their
  owners** — AC-5b (10.19 with 10.18), AC-7b (10.19 with 10.17), AC-11b (`ED-05` / 10.18) and
  **O-13** (10.14, the API-side half of `partial`) — recorded as *skipped, not passed*.
- **This tier is load-bearing for one property nothing else can check.** 10.13's first attempt at
  the kill used a single process-group signal, and the unit tier was green. The fixtures tier
  showed the group signal reaches only the Node fork — Playwright starts the browser and the video
  encoder detached, in groups of their own. Removing the kill entirely also left the tier green
  until the browser was suspended so it could not exit on its own. Both facts are recorded in
  `src/run/tree.ts` and `test/run/tree.test.ts`.
- The tier needs a build: the browser runs in a child process, and a child process is started from
  `dist/run/child.js`. `vitest.fixtures.config.ts` emits `dist/` in `globalSetup` rather than
  trusting that a build happened, so the tier cannot quietly test last week's code.
- Browsers still come from the image (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set for the tier).
  For a local run, `npm run browsers:install` installs Chromium at the declared pin; Playwright
  refuses a mismatched build, so drift fails loudly (ADR-001 §4.2).

#### 6a. Pin consistency against the built image

```bash
docker run --rm --entrypoint cat "$IMAGE_TAG" /app/dist/runtime-versions.json > dist/runtime-versions.json
npm run check:pins -- --require-image
```

- Runs on the host, where the `Dockerfile` and `package.json` live, against the
  `runtime-versions.json` the image actually carries.
- `--require-image` turns every `NOT ASSERTED` entry into a failure, so a `chromiumBuild` or
  `image` that the build did not record fails the pipeline instead of passing quietly. An
  `IMAGE_TAG` build arg that was omitted arrives as an empty string inside the image; empty and
  whitespace-only count as *not recorded*, so the slip this stage exists to catch is caught.
- The recorded `node` is asserted here too — this is where the `.nvmrc` major rule applies.
  The public base image ships Node v24.20.0 and `.nvmrc` pins 24, so the Node rule passes against
  it; the internal image `ED-05` delivers must ship the same major.
- **Open item O-2a is resolved by moving the pins, not by touching the check.** Story 10.12 ran
  Chromium on a developer machine, where the in-image rule does not apply — it is read off
  `chromiumBuild`, which only exists under the image's `PLAYWRIGHT_BROWSERS_PATH` —
  and `test/run/confinement.test.ts` asserts `.nvmrc` reads `24` and that `engines.node` is
  `>=24.11.0 <25.0.0`, so changing one without the other is a red build rather than a quiet one.
- This is the stage that makes the browser build and the Node major part of the pin rather than a
  convention.

### 7. Image build and push

```bash
docker build \
  --build-arg REGISTRY=<internal registry> \
  --build-arg IMAGE_TAG="registry.citi.com/put/checks-studio-runner:<appVersion>-<gitSha>" \
  -t "registry.citi.com/put/checks-studio-runner:<appVersion>-<gitSha>" \
  studio-runner/
docker push "registry.citi.com/put/checks-studio-runner:<appVersion>-<gitSha>"
```

- **Produces:** the image, tagged with the chart `appVersion` and the git SHA, matching the existing
  `checks-backend` / `checks-frontend` convention.
- `PLAYWRIGHT_VERSION` is **not** passed as a build arg by CI: its default in the `Dockerfile` is
  one of the four asserted copies of the pin, and overriding it from the pipeline would defeat
  stage 3. Only `REGISTRY`, `PLAYWRIGHT_DISTRO` and `IMAGE_TAG` are pipeline inputs.
- The image runs as `pwuser` (non-root) with the Chromium sandbox enabled. `--no-sandbox` must never
  be added to make a run succeed (architecture §9.3, ADR-001 §8).
- Registry credentials and the image-build slot are @devops's to provide (ADR-001 open item O-1).

### 8. Helm lint / template

```bash
# The controller-certificate pin has no default and the render fails without it (STUDIO-OBS-009
# ruling A3): it is the SHA-256 of an environment's backend client certificate, which CI cannot
# know. Lint and template are given a FIXTURE pin here. It is the same value as `TEST_PIN` in
# `studio-runner/test/deployment/helm.ts`, it proves the chart renders, and it is never a
# deployment value (a real release supplies its own with --set-string).
PIN='0B:12:19:20:27:2E:35:3C:43:4A:51:58:5F:66:6D:74:7B:82:89:90:97:9E:A5:AC:B3:BA:C1:C8:CF:D6:DD:E4'
helm lint helm-chart/put-checks --set studioRunner.enabled=true \
  --set-string studioRunner.tls.controllerCertificateFingerprint256="$PIN"
helm template helm-chart/put-checks --set studioRunner.enabled=true \
  --set-string studioRunner.tls.controllerCertificateFingerprint256="$PIN"
```

- **Image:** any with Helm.
- **Produces:** rendered manifests for review.
- **Without the pin:** `helm template` fails naming `controllerCertificateFingerprint256`, and
  `helm lint` (Helm 4.2.0) exits 0 but prints a `missing required values` WARN naming the same key
  [observed 2026-10-18]. Treat either as a red stage: the pin argument is part of the command, and a
  stage that drops it is a stage that stopped rendering the runner.
- **Guided mode** is rendered by the deployment tier (stage 9), which layers a guided overlay over
  all four values files. To lint it here as well, add `--set studioRunner.guided.enabled=true
  --set studioRunner.replicaCount=1` and the three guided token inputs
  (`studioRunner.guided.token.issuer`, `.controllerSubject`, `.publicKey`); the render refuses guided
  mode with more than one replica, with the autoscaler, or without the runner (A2.6).
- The `studioRunner` chart component landed with story 10.18a: the Deployment, the ClusterIP
  Service and the NetworkPolicy, plus the `studioRunner` block in all four values files. This stage
  renders and lints them.
- **This stage proves the chart is well-formed; it proves nothing about what the chart says.** The
  structural assertions — the security context field by field, the enumerated environment, the
  derived grace period, the two store principals, the peer set against the runner's own
  `PERMITTED_DESTINATIONS` — are stage 9's.

### 9. Deployment evidence — the rendered manifest and the SEC-2 attack

```bash
export STUDIO_RUNNER_IMAGE="${IMAGE_TAG}"   # the tag stage 7 built and pushed
npm run test:deployment
```

- **Image:** any with **Helm** and a **container runtime**, with the image stage 7 produced
  available locally. Both prerequisites are required; see below.
- **Needs the pinned image: YES.** This is the stage that runs @qa's SEC-2 shim attack *inside* the
  built image, in both directions.
- **Produces:** the story 10.18a evidence for AC-1 – AC-12 and **AC-4a part 3**, and the story
  10.18b evidence for **AC-13a**, **AC-16a**, **AC-18**, **AC-19a** (rendered half) and **AC-23a**
  (rendered half).

**AC-18 configuration delivery is repaired in story 10.27.** Backend/worker Spring
`configOverrides` are mounted as `application.yaml`, preserving property spelling and environment
precedence. `envfrom-keys.test.ts` verifies all consumed environment names and the complete mounted
configuration for all value sets, with mutation controls. No test in this stage is expected red.
See `docs/runbooks/studio-runner.md` §11 for the deployment behavior change.

**This stage fails closed, and the reason is a finding rather than a preference.** Story 10.18a's
first version ran this tier in stage 4 with `describe.skipIf(!HELM)` and `it.skipIf(!DOCKER)`. QA
measured what that bought: `helm` off `PATH` gave *1 passed / 89 skipped*, **green**;
`STUDIO_RUNNER_IMAGE` pointed at a tag that does not exist gave *1 passed / 3 skipped in 1 ms*,
**green**. The only surviving assertion was a tautology and the disclosure lived in a test *name*. A
pipeline reads an exit code, not a name — so in CI as documented, **the criterion @po named the
story's weakest had no executable enforcement at all**.

So: **there is no `skipIf` in this tier and no opt-out variable.** A missing `helm` reddens every
chart assertion; a missing or wrong `STUDIO_RUNNER_IMAGE` reddens SEC-2 and the mount-disjointness
check. If this stage cannot be given its prerequisites, the honest outcome is a **red** stage and a
recorded decision — never a green one.

- `STUDIO_RUNNER_IMAGE` **must be passed**. It defaults to a local development tag
  (`put-checks-studio-runner:10.18a-local`) which will not exist on a build agent, and the failure
  message says so.
- The tier is excluded from `npm test` (stage 4) on purpose, and that exclusion is itself guarded by
  `test/deployment-tier-wiring.test.ts`, which runs in stage 4 and reddens if this stage's config,
  script, stage entry or files go missing.
- **Under `ED-05` this stage runs against the PUBLIC Playwright base image**, which ADR-001 §8
  permits for local development only. Running it against `ED-05`'s internal image, in a pod, is
  story 10.18a's **AC-4b** and is recorded as *skipped, never passed*.

### 10. Perception tier — real Chromium, never touches `dist/`

```bash
vitest run --config vitest.perception.config.ts        # the package script is `test:perception`
```

- **Image:** any with the pinned Playwright Chromium build (stage 6's image qualifies). No Helm, no container
  runtime, no built image.
- **Needs the pinned image: no.** It needs Chromium at the pinned build because the tier launches it in the test
  process, and it is machine-bound by design: the layout-dependent parity checks record an environment
  fingerprint (browser build, platform, a hash of text metrics) and **fail** on a mismatch, never skip.
- **`dist/` is not touched, and that is the point of this stage being separate from stage 6.** Stage 6 runs
  `test:fixtures`, whose `globalSetup` re-emits `dist/`; a running runner loads `dist/`. This tier has no
  `globalSetup`, and every file of it signs the `dist/` tree before and after and fails if it changed.
- **Covers:** the perception modules (`src/run/perceive.ts`, `playwrightEngine.ts`, `privateInventory.ts`, and the
  page programs in `perceptionInPage.ts`, which the unit tier cannot execute and therefore excludes from its
  coverage): parity with the spike baseline, the D1/D2 leak canaries and the generated-content quarantine. Since
  ADR-SC-007 WI-4 it also covers the page-state program (`src/run/pageStateInPage.ts`, likewise excluded from unit
  coverage) and the observation session's real-page behaviour (`cutover-observe`). Since ADR-SC-008 it covers
  generated step code on a real page (`stepCodeLive`, `stepRunLive`, `secretFillLive`, `canary-boundary`).
- **Fails closed:** no `skipIf` in the tier, and its wiring is watched from the default run (stage 4,
  `test/run/importBoundary.test.ts`): deleting the config, the script, the `test:fixtures` exclude, the
  tier's files or this entry reddens the default test run.

## Summary

| # | Stage | Command | Needs the pinned image | Artifacts |
|---|---|---|---|---|
| 1 | Install + audit | `npm ci`, `npm audit` | no | `node_modules/` |
| 2 | Static analysis | `npm run type-check`, `npm run lint` | no | — |
| 3 | Pin consistency | `npm run check:pins` | no | — |
| 4 | Tests + coverage | `npm test` | no | `coverage/` — plus the stage-9 wiring guard and the deferral record |
| 5 | Build | `npm run build` | for the deployable artifact | `dist/`, `dist/runtime-versions.json` |
| 6 | Fixture corpus | `npm run test:fixtures` | **yes — gated by `ED-05`, record as skipped** | — |
| 6a | Pin consistency in-image | `npm run check:pins -- --require-image` | yes (reads the image's file) | — |
| 7 | Image build/push | `docker build` / `docker push` | builds it | image tag |
| 8 | Helm lint/template | `helm lint` / `helm template` | no | rendered manifests |
| 9 | **Deployment evidence** | `npm run test:deployment` | **yes — and Helm, and `STUDIO_RUNNER_IMAGE`; fails closed without either** | story 10.18a's AC-1 – AC-12 and AC-4a part 3 evidence |
| 10 | **Perception tier** | `test:perception` (`vitest run --config vitest.perception.config.ts`) | no — needs the pinned Chromium build; no Helm; never touches `dist/` | — |
| 11 | **Windows developer stage** | runner `npm ci`/`type-check`/`lint`/`check:pins`/`test` (coverage off)/`build`; frontend `pnpm install --frozen-lockfile`/`type-check`/`lint`/`vitest run`/`build`/`playwright test --project=msw`; backend `gradlew.bat check` | no — native Windows, no Docker | — |

## Stage 11. Windows developer stage — native, no Docker

The maintaining developers work on Windows with no Docker and no WSL, so this stage proves the three components build
and test natively there. Production stays Linux: stages 6–10 are not repeated here. (It sits after the summary so the stage-10 section, which
`test/run/importBoundary.test.ts` reads up to `## Summary`, stays exactly stage 10.) Run it on a Windows agent (or,
until the bank CI has one, as a recorded developer run with logs and the commit SHA). Use a non-admin agent account
(the backend's embedded Postgres refuses an elevated one), `git config core.longpaths true` and a short checkout path.

```powershell
# studio-runner/ (Node 24; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 as everywhere)
npm ci
npm run type-check
npm run lint
npm run check:pins
npm test -- --coverage.enabled=false   # coverage is the Linux gate (stage 4); off on win32
npm run build

# frontend/ (pnpm; the sibling put-core-components checkout built first)
pnpm install --frozen-lockfile
pnpm run type-check
pnpm run lint
pnpm exec vitest run
pnpm run build                          # webpack --node-env production: no POSIX VAR=x syntax
pnpm exec playwright install chromium   # PLAYWRIGHT_DOWNLOAD_HOST = the Artifactory mirror
pnpm exec playwright test --project=msw

# backend/ (JDK 21 via JAVA_HOME; embedded Postgres, no Docker)
.\gradlew.bat check
```

- **Image:** none; a plain Windows agent with Node 24, pnpm, JDK 21 and Git for Windows (which provides `openssl`).
- **Produces:** nothing beyond each component's own build output; gates on exit codes.
- **Every win32 skip** in the runner suite goes through `test/helpers/platform.ts` with a reason, and the Linux run of
  stage 4 has none.
- **Not here, Linux-only:** the image build (7), Helm (8), the deployment tier (9), the perception tier (10), the
  in-image fixture corpus (6) and the frontend realsite-gate (it needs Docker).
- **Status:** not yet run. Until a Windows run is recorded, the READMEs say "Windows: not verified".

## Open items owned outside this package

| # | Item | Owner |
|---|---|---|
| O-1 | Pipeline definition location, image-build slot, registry credentials | @devops |
| O-2 | Internal Playwright image following the `v<version>-<distro>` tag convention (`ED-05`) | Platform/SRE |
| O-2a | **Resolved by pin-fix01 (pins moved to the image's Node 24; ADR-001 §4.2 amendment).** The internal image must still ship the `.nvmrc` Node major (24); stage 6a proves it in the deployed image. | Platform/SRE with @architect (verification only) |
| O-3 | Location of the language-neutral contract files consumed by `backend/` and `studio-runner/` | 10.1 |
