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

Node major must match `.nvmrc` (22). `.npmrc` sets `engine-strict=true`, so a wrong Node fails at
install time rather than at runtime.

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
- Story 10.3 wires this tier against the fake adapter (AC-6a). Story 10.12 supplies the real
  Playwright adapter, serves `fixtures/pages/` at the URLs in `fixtures/reference/manifest.json`,
  and is where a real Chromium actually executes the corpus (AC-6b).

#### 6a. Pin consistency against the built image

```bash
docker run --rm --entrypoint cat "$IMAGE_TAG" /app/dist/runtime-versions.json > dist/runtime-versions.json
npm run check:pins -- --require-image
```

- Runs on the host, where the `Dockerfile` and `package.json` live, against the
  `runtime-versions.json` the image actually carries.
- `--require-image` turns every `NOT ASSERTED` entry into a failure, so a `chromiumBuild` or
  `image` that the build did not record fails the pipeline instead of passing quietly.
- This is the stage that makes the browser build part of the pin rather than a convention.

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
| O-3 | Location of the language-neutral contract files consumed by `backend/` and `studio-runner/` | 10.1 |
