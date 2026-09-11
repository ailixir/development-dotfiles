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

**Node.** `.nvmrc` (22) pins the Node major **the image must ship**; `engines.node`
(`>=22.11.0 <25.0.0`) is the wider range story 10.2 chose deliberately so the package still
installs on a newer developer machine. `.npmrc` sets `engine-strict=true`, so a Node outside the
range fails at install time rather than at runtime. Stage 3 asserts the recorded Node against the
range everywhere, and against the `.nvmrc` major whenever the record came from inside the pinned
image.

> **OPEN — stage 6a fails today, deliberately.** The public
> `mcr.microsoft.com/playwright:v1.63.0-noble` base image ships **Node v24.20.0**, not 22. Stage 6a
> now names that as a failure instead of passing quietly. It is a real conflict, not a check bug:
> the internal image (`ED-05`) must be built on the `.nvmrc` major, or `.nvmrc` must be changed by
> ADR amendment with @architect. Do **not** widen `.nvmrc` to turn the pipeline green — that
> deletes the only copy that pins Node.

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

### 5. Build

```bash
npm run build      # tsc -p tsconfig.build.json && node scripts/write-runtime-versions.mjs
```

- **Image:** the pinned Playwright image when building the deployable artifact, plain Node when
  only validating the build.
- **Produces:** `dist/` (JS + `.d.ts` + source maps) and `dist/runtime-versions.json`.
- `runtime-versions.json` records `{playwright, playwrightLocked, playwrightImageTag, chromiumBuild,
  node, nodeEngineRange, nodeMajorPin, validatorSchema, validatorParser, syntaxReference, executor,
  artifact, image}`. `chromiumBuild` and `image` are `null` unless the stage ran inside the pinned
  image with `IMAGE_TAG` set.

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
  **Expect this stage to fail against the public base image** until `ED-05` lands (see Environment
  above). Record it as a real failure; do not waive it by editing `.nvmrc`.
- **Open item O-2a is still open, and story 10.12 did not resolve it.** The public base image at
  the pinned Playwright version ships Node v24.20.0 against a `.nvmrc` of 22, so this stage fails
  by design. 10.12 ran Chromium on a developer machine, where the in-image rule does not apply —
  it is read off `chromiumBuild`, which only exists under the image's `PLAYWRIGHT_BROWSERS_PATH` —
  and `test/run/confinement.test.ts` now asserts `.nvmrc` still reads `22` and that
  `engines.node` is unchanged, so a convenience edit is a red build rather than a quiet one. The
  fix remains a base-image choice under `ED-05` or an ADR-001 §4.2 amendment.
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
helm lint helm-chart/put-checks --set studioRunner.enabled=true
helm template helm-chart/put-checks --set studioRunner.enabled=true
```

- **Image:** any with Helm.
- **Produces:** rendered manifests for review.
- The `studioRunner` chart component is story 10.18; until then this stage has nothing
  runner-specific to render.

## Summary

| # | Stage | Command | Needs the pinned image | Artifacts |
|---|---|---|---|---|
| 1 | Install + audit | `npm ci`, `npm audit` | no | `node_modules/` |
| 2 | Static analysis | `npm run type-check`, `npm run lint` | no | — |
| 3 | Pin consistency | `npm run check:pins` | no | — |
| 4 | Tests + coverage | `npm test` | no | `coverage/` |
| 5 | Build | `npm run build` | for the deployable artifact | `dist/`, `dist/runtime-versions.json` |
| 6 | Fixture corpus | `npm run test:fixtures` | **yes — gated by `ED-05`, record as skipped** | — |
| 6a | Pin consistency in-image | `npm run check:pins -- --require-image` | yes (reads the image's file) | — |
| 7 | Image build/push | `docker build` / `docker push` | builds it | image tag |
| 8 | Helm lint/template | `helm lint` / `helm template` | no | rendered manifests |

## Open items owned outside this package

| # | Item | Owner |
|---|---|---|
| O-1 | Pipeline definition location, image-build slot, registry credentials | @devops |
| O-2 | Internal Playwright image following the `v<version>-<distro>` tag convention (`ED-05`) | Platform/SRE |
| O-2a | **The internal image must ship the `.nvmrc` Node major (22).** The public base image at the pinned Playwright version ships Node v24.20.0, so stage 6a fails today by design. Resolving it is either a base-image choice (`ED-05`) or an ADR-001 §4.2 amendment — not a change to `.nvmrc`. | Platform/SRE with @architect |
| O-3 | Location of the language-neutral contract files consumed by `backend/` and `studio-runner/` | 10.1 |
