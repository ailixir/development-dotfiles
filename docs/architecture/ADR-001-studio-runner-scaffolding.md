# ADR-001 — `studio-runner/` scaffolding: layout, toolchain, pinning, CI and deployment placement

| Field | Value |
|---|---|
| Status | Accepted (architecture decision, 2026-09-10). Pipeline wiring items in §7 await @devops. |
| Author | @architect (Aria) |
| Source of truth | [Studio architecture v2.1](studio-execution.md) §3, §4.3, §4.5, §5.2, §8.4, §8.5, §9.2–9.3, §10 |
| Consumers | Stories 10.2, 10.3, 10.6, 10.12–10.14, 10.18 ([EPIC-10](../epics/EPIC-10-EXECUTION.yaml)) |
| Supersedes | `DEBT-01` in [backend spec](../specs/backend/spec.md) (Playwright Java binding inside the backend container); research recommendations #3 (new repo), #4 (shared IR package) and #6 (Python codegen) in [2026-08-13 runner-language research](../research/2026-08-13-playwright-runner-language/03-recommendations.md) |

This ADR fixes *where the runner lives and how it is built, pinned, tested and deployed*. It contains no implementation code. Runtime behavior (validator, admission, recording, evidence) is owned by the architecture document and the stories. Story numbers (10.x) refer to [EPIC-10-EXECUTION.yaml](../epics/EPIC-10-EXECUTION.yaml); quoted story scope/acceptance text comes from the retired Epic 10 markdown at commit 9425e7e7d and carries into the drafted stories.

## 1. Context

### 1.1 What the architecture requires

- A separate `studio-runner/` (Node + Playwright) with its own image and Deployment; it is the only component that launches Chromium (§3). The API and worker share the Java codebase; the MFE never talks to the runner.
- Playwright package and browser image are pinned together, with model/prompt/validator/executor versions, and CI validates reference examples against that runtime (§4.3, story 10.3). Actual runtime versions are recorded on every execution (§4.6).
- Generated source is never evaluated: no `eval`, `Function`, async IIFEs or Node VM as a boundary; browser work runs in a killable child process with a parent-enforced deadline (§4.5, §5.2).
  - > **Note 2026-10-29 (append-only): superseded by [ADR-SC-008](ADR-SC-008-generated-step-code.md) D1 / D3.1.** Frozen, hash-checked step source is now evaluated by exactly one `AsyncFunction` in `studio-runner/src/run/stepCode.ts`, admitted by a syntax check only. Other `eval`, `Function`, async-IIFE and Node VM use stays forbidden, and the killable child still runs every replay. Learning runs the step code in the runner server process for this release (ADR-SC-008 Deferred item 6). The text above is kept as the record of the earlier decision.
- Internal routes (`/v1/validate`, `/v1/runs`, `/health`, `/ready`) require service identity and are not exposed through public ingress (§8.4).
- Non-root, Chromium sandbox enabled, compatible seccomp, no privileged mode, restricted service account, CPU/memory limits, writable per-run scratch and `/dev/shm`, process reaping, drain on SIGTERM (§9.3). Initial `POOL_SIZE=1`, 1–2 replicas (§5.2, BRD §7.1).
- The runner has no DB, vault, CSI or LLM credentials and no platform user session (§9.2).

### 1.2 Verified repository facts (2026-09-10)

| Fact | Evidence |
|---|---|
| Root `package.json` is the AIOX framework tooling package (`@aios-fullstack/pro`, CommonJS, npm lockfile). It is **not** a JS workspace and is framework-owned (L3 config). | `package.json`, `package-lock.json` at root |
| `frontend/` is an npm project: `package-lock.json`, no `packageManager` or `engines` field, `"type": "module"`, TypeScript ^5.2, Vitest ^1, ESLint 8 legacy config (`.eslintrc.json`), typescript-eslint v6. No Prettier. | `frontend/package.json`, `frontend/.eslintrc.json` |
| `frontend/` declares `"test:e2e": "playwright test"` but has **no Playwright dependency and no `playwright.config`**. There is no Playwright pin anywhere in the repo today. | `frontend/package.json` |
| No Dockerfile and no CI pipeline definition exist in the repo. Images are referenced as `registry.citi.com/put/checks-backend` and `checks-frontend`, tagged by chart `appVersion`. The backend spec states the CI pipeline YAML is owned by @devops and lives outside this repo. | `find . -iname "Dockerfile*"`, `.github/` (agents only), `helm-chart/put-checks/values.yaml`, spec §"CI pipeline yaml (owned by @devops)" |
| The Helm chart is one chart with three components (`backend` api, `worker`, `frontend`) rendered from a single `templates/deployment.yaml`, with `_helpers.tpl` fullname/selector helpers, per-component `securityContext` (`runAsNonRoot`, `readOnlyRootFilesystem: true`, `seccompProfile: RuntimeDefault`, drop `ALL`). | `helm-chart/put-checks/templates/`, `values.yaml` |
| MFE and API are served from **different hosts** (`checks.dev.citi.com` vs `checks-api.dev.citi.com`; prod `checks-api.citi.com`). | `values.yaml`, `values-prod.yaml` |
| The BRD fixes the runner as "one small isolated runner service, shipped inside the existing repo/deployment (no new-repo approval on the critical path)". | BRD §7.1 |
| Backend is Java 21 / Spring Boot 3.3.5 / Gradle KTS with `api` and `worker` profiles. | `backend/build.gradle.kts`, `application-{api,worker}.yml` |

### 1.3 Constraints on the decision

- Wave-1 prerequisite: must be settled before 10.2/10.3/10.6 are drafted; must not require converting `frontend/` or the framework-owned root package.
- The internal Playwright image (EPIC-10 `ED-05`) does not exist yet. The scaffolding must work locally against the public image and switch to the internal one without code change.
- Article IV: nothing here adds runtime capability beyond the architecture.

## 2. Decision summary

| Topic | Decision |
|---|---|
| Location | Top-level `studio-runner/`, a **standalone private Node package** in this monorepo. Not a workspace member; no npm-level sharing with `frontend/`. |
| Package manager | **npm** with `npm ci`, exact pins (`save-exact=true`), `packageManager` and `engines` declared, `engine-strict=true`. Revisit only if the repo becomes a pnpm workspace as a separate decision. |
| Pinning | One version variable for Playwright, asserted equal across `package.json`, lockfile, `Dockerfile` base-image tag and an emitted `runtime-versions.json`; CI fails on mismatch (10.3). Browsers come from the image, never from `postinstall`. |
| Language/build | TypeScript strict, ESM, `NodeNext`, `tsc` to `dist/`, `node dist/main.js`. No bundler, no runtime transpiler in the image. No DOM lib. |
| Lint | ESLint 9 flat config + typescript-eslint (type-aware) with execution-boundary rules as errors. Deliberately newer than the frontend's EOL ESLint 8. |
| Tests | Vitest (node environment). Three tiers: unit (fake Playwright adapters), fixture corpus (pinned browser, runs in the image), contract (internal routes vs the frozen OpenAPI from 10.1). |
| Image | `studio-runner/Dockerfile` in repo, `FROM <internal registry>/playwright:v<PIN>-<distro>`, non-root user, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. Registry name follows the existing pattern: `registry.citi.com/put/checks-studio-runner`. |
| Deployment | New `studioRunner` component in the existing Helm chart: own Deployment + ClusterIP Service, **no Ingress, no HPA**. Hardening values are decided by 10.18 and the sandbox/egress spikes. |
| CI | Stages defined here (§7); pipeline YAML remains @devops-owned outside the repo. Stages needing the internal image are gated by `ED-05`. |

## 3. Workspace layout

```
put-checks/
├── frontend/                 (unchanged, npm)
├── backend/                  (unchanged, Gradle)
├── studio-runner/            NEW — standalone npm package, own lockfile
│   ├── package.json          "private": true, exact pins, packageManager, engines
│   ├── package-lock.json
│   ├── .npmrc                save-exact=true, engine-strict=true, registry per enterprise config
│   ├── .nvmrc                Node major shipped by the pinned Playwright image
│   ├── tsconfig.json         type-check everything (src + test + fixtures)
│   ├── tsconfig.build.json   emit src/ only → dist/
│   ├── eslint.config.js      flat config (see §6)
│   ├── vitest.config.ts      unit tier (default)
│   ├── vitest.fixtures.config.ts  fixture-corpus tier (pinned browser)
│   ├── Dockerfile            base image tag derived from the single pin (see §4)
│   ├── src/
│   │   ├── main.ts           process entry: config, server, drain on SIGTERM
│   │   ├── validator/        10.2 — pure, browser-free AST/schema/policy validation
│   │   ├── executor/         10.2 — trusted operation executor (fake-adapter testable)
│   │   ├── server/           10.6 — /v1/validate, /v1/runs, /health, /ready; service identity
│   │   ├── reporting/        10.6 — admission CAS + progress/final callback client
│   │   ├── run/              10.12/10.13 — child process launch, deadlines, kill tree, scratch
│   │   └── evidence/         10.14 — video upload, manifest, key derivation (write-only)
│   ├── fixtures/
│   │   ├── reference/        10.3 — pinned syntax reference examples (must validate + execute)
│   │   ├── adversarial/      10.2 — every rejected node/receiver/option/argument class
│   │   └── pages/            controlled local HTML fixtures for 10.12/10.16 seek measurement
│   └── test/                 unit + contract tests
└── helm-chart/put-checks/
    ├── values*.yaml          + studioRunner: {...}
    └── templates/
        ├── studio-runner-deployment.yaml   NEW
        ├── studio-runner-service.yaml      NEW (ClusterIP, internal only)
        └── studio-runner-networkpolicy.yaml  10.18 (after the egress spike)
```

Folder names map one-to-one to stories so file ownership in wave planning is unambiguous. The exact internal module structure is the stories' concern; only the top-level boundaries above are fixed by this ADR.

**Why standalone, not a workspace.** There is no JS workspace to join: the root package is framework tooling and `frontend/` is an independent npm project. Nothing is shared at npm level: the artifact and internal-route contracts are language-neutral (JSON Schema/OpenAPI, consumed by Java and Node) and are frozen in 10.1 outside both packages; the earlier "shared IR package" idea is retired with the IR itself (§4.4: Playwright source is the canonical artifact; client grammar and Python export are retired). A shared lockfile would also couple the runner's security-relevant Playwright pin to any future frontend E2E Playwright, which §4.3 forbids in spirit: the runner's pin moves only with its image. Isolation keeps the Docker build context minimal and the dependency tree auditable.

**Why not a new repo.** The research proposed `put-checks-studio-runner`; the BRD (§7.1) explicitly chose in-repo delivery to keep new-repo approval off the critical path, and the architecture (§3) names the folder `studio-runner/`.

## 4. Package manager and pinning strategy

### 4.1 npm

`npm` with `npm ci` everywhere (local, CI, Dockerfile). Rationale: every other Node artifact in this repo uses npm; the enterprise pipeline and the future internal Playwright image need no additional toolchain (no corepack/pnpm provisioning); reproducibility is provided by the lockfile plus `npm ci`. pnpm's stricter dependency isolation is attractive for a security component, but introducing a second package manager into the repo for one package is not justified for a wave-1 prerequisite. **Revisit trigger:** if the repository is converted to a pnpm workspace (a separate decision), `studio-runner/` converts with it; nothing here depends on npm-specific behavior beyond the lockfile.

Required declarations in `package.json`: `"private": true`, `"type": "module"`, `"packageManager": "npm@<exact>"`, `"engines": { "node": "<major>.x" }`. `.npmrc`: `save-exact=true`, `engine-strict=true`, `fund=false`, `audit=false` (audit runs as an explicit CI stage, not on every install).

### 4.2 The Playwright pin

Architecture §4.3 requires the Playwright package and browser image to be pinned together. Decision: **one declared pin, four asserted copies**.

| Copy | Where | Form |
|---|---|---|
| Declared | `package.json` → `"playwright": "1.X.Y"` | exact, no range. The **library** package `playwright`, not `@playwright/test` (the test runner is not a runtime dependency). |
| Locked | `package-lock.json` | resolved to the same version |
| Image | `Dockerfile` → `ARG PLAYWRIGHT_VERSION=1.X.Y` and `FROM ${REGISTRY}/playwright:v${PLAYWRIGHT_VERSION}-<distro>` | tag must equal the package version; Playwright's own images are tagged this way and the internal image (`ED-05`) must keep the convention |
| Recorded | `runtime-versions.json` generated at build, embedded in the image, reported on every admission/final report (§4.6, §8.4) | `{ playwright, chromiumBuild, node, validatorSchema, executor, image }` |

CI (story 10.3) asserts all four agree and that `node --version` inside the image matches `engines`/`.nvmrc`; any mismatch fails the build. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set in the Dockerfile and in CI so `postinstall` never fetches browsers; the browsers are the image's. Locally, developers install the matching browser with `npx playwright install chromium` at the pinned version; Playwright refuses to launch a browser build that does not match the package, so drift fails loudly rather than silently.

**Amendment (ED-05 pin-fix01).** `.nvmrc` pins the Node major shipped by the pinned Playwright image, as §3 says, and follows it. The image at the pinned version (`mcr.microsoft.com/playwright:v1.63.0-noble`) ships Node v24.20.0, so `.nvmrc` is `24` and `engines.node` is `>=24.11.0 <25.0.0`. The pinned image tag ships a single Node major, so a Node 22 image would be a locally assembled variant outside the tag convention above; that path is declined. Supporting a single Node major is the rule: no other major is accepted by `engines`, `check:pins` or the image. A Playwright bump whose image ships a new Node major moves `.nvmrc` and `engines.node` in the same PR as the other pin copies.

**Upgrade procedure.** One PR bumps all four copies, regenerates `runtime-versions.json`, runs the reference and adversarial corpora, and records compatibility for existing confirmed revisions (§4.6: runtime upgrades revalidate; incompatible revisions are blocked with an explanation, never reinterpreted). Model/prompt/language-policy/syntax-reference versions are pinned alongside in the same file by the backend (§4.3); the runner only records what it runs.

**Floor.** The exact version is chosen in 10.3 against the internal image; the 2026-08-13 research recorded a floor of Playwright ≥ 1.59. No version is asserted here.

## 5. TypeScript configuration

| Setting | Value | Reason |
|---|---|---|
| `module` / `moduleResolution` | `NodeNext` | Native Node ESM; matches `"type": "module"`; no bundler semantics |
| `target` / `lib` | `ES2022` / `["ES2022"]` | Node LTS; **no `DOM`**: the runner is a Node process, page interaction goes through the Playwright API only |
| `strict` | `true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`, `verbatimModuleSyntax` | Stricter than the frontend on purpose: the validator is a default-deny boundary (§4.5) |
| `outDir` / build | `dist/` via `tsc -p tsconfig.build.json` | Auditable one-to-one output; no bundler, no minification, no `tsx`/`ts-node` in the image |
| Source maps | `sourceMap: true`, shipped | Stack traces in redacted diagnostics stay readable |
| Path aliases | none | Avoids runtime alias resolution in Node |

Runtime dependency policy: minimal and pinned. `playwright` (library), one HTTP server library (chosen in 10.6), one S3-compatible client (chosen in 10.14), a TypeScript parser for the validator (chosen in 10.2; `typescript` itself is acceptable since it is already a dev dependency). No general-purpose utility bundles.

## 6. Lint and execution-boundary rules

ESLint 9 flat config with `typescript-eslint` (type-checked preset). The following are **errors** and encode §4.5 in tooling:

- `no-eval`, `no-implied-eval`, `no-new-func`, and `no-restricted-syntax` for `NewExpression[callee.name="Function"]`.
- `no-restricted-imports` for `vm`, `node:vm`, `worker_threads` everywhere; for `child_process`/`node:child_process` everywhere except `src/run/**`.
- `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-*` family, `@typescript-eslint/no-floating-promises`, `@typescript-eslint/switch-exhaustiveness-check`.
- `import/no-extraneous-dependencies` (runtime code may only import declared `dependencies`).

The frontend stays on its ESLint 8 configuration; this package does not share config files with it. Formatting: no Prettier, matching the frontend; ESLint stylistic rules only.

## 7. Test setup and CI wiring

### 7.1 Test tiers

| Tier | Command | Needs browser | Runs where |
|---|---|---|---|
| Unit | `npm test` (Vitest, `environment: node`) | No — validator/executor/server/reporting use fake Playwright, storage and callback adapters | Every PR, plain Node image |
| Fixture corpus | `npm run test:fixtures` (`vitest.fixtures.config.ts`) | Yes — pinned Chromium, `chromiumSandbox: true` where the host allows | Every PR **inside the pinned Playwright image**; locally on demand |
| Contract | part of `npm test` | No | Every PR; validates `/v1/*` request/response and callback payloads against the OpenAPI/JSON-schema frozen in 10.1 |

Coverage: Vitest v8 provider with thresholds no lower than the frontend's (80% branches/functions, 85% lines/statements). In addition, and independent of percentages, the adversarial corpus must contain at least one rejected fixture for every node/receiver/option/argument class the validator denies; this is the acceptance stated for 10.2 and review finding P1-1, and it is a required test category, not a coverage number.

### 7.2 Required CI stages (contract for the @devops-owned pipeline)

1. `npm ci` (offline-capable against the enterprise registry), `npm audit` as a reported stage.
2. `tsc --noEmit` (full `tsconfig.json`), `eslint .`.
3. Pin consistency check (§4.2) — fails on any disagreement.
4. Unit + contract tests with coverage gate.
5. Build `dist/` and `runtime-versions.json`.
6. Fixture corpus inside the pinned image — **gated by `ED-05`**; until the internal image exists this stage is local-only and the pipeline records it as skipped, not passed.
7. Image build from `studio-runner/Dockerfile`; tag with the chart `appVersion` and git SHA, matching the existing `checks-backend`/`checks-frontend` convention; push to `registry.citi.com/put/checks-studio-runner`.
8. Helm lint/template of the chart with `studioRunner.enabled=true`.

Where these stages live (pipeline file, agent pool, registry credentials) is not decidable from this repository and is assigned to @devops (see §10). The Dockerfile itself is in-repo because the base-image tag is part of the pin and must be diffed with the package version.

### 7.3 Local development

`npm run dev` (`tsx watch`, dev-only dependency) with locally installed browsers at the pinned version; the backend `local` profile points the worker's runner URL and the runner's callback URL at localhost. Integration with `dev.sh` is optional and not decided here.

## 8. Dockerfile and image contract

- `FROM ${REGISTRY}/playwright:v${PLAYWRIGHT_VERSION}-<distro>`; the public `mcr.microsoft.com/playwright` image is acceptable **only** for local development until `ED-05` lands.
- Multi-stage: build stage runs `npm ci` + `tsc`; runtime stage copies `dist/`, production `node_modules` (`npm ci --omit=dev`), `runtime-versions.json`.
- Runs as a dedicated non-root user with a writable home; the official image defaults to root, which disables Chromium sandboxing (§9.3, Playwright Docker guidance). The image must never add `--no-sandbox`; the launch option is `chromiumSandbox: true`.
- Enterprise CA bundle installed so Chromium and Node trust internal targets, the API callback and Sonic.
- `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; `PLAYWRIGHT_BROWSERS_PATH` inherited from the image.
- No secrets, service identity or endpoints baked in; all via environment (§8.5).

## 9. Helm placement

Add a `studioRunner` component to the existing chart, following the `backend`/`worker`/`frontend` value shape, rendered from its own templates.

| Aspect | Value | Source |
|---|---|---|
| Kind | Deployment (not StatefulSet), `replicaCount: 1` dev, `1–2` staging/prod | §5.2, BRD §3.2 |
| Service | ClusterIP only; **no Ingress** entry; reachable from worker pods only | §8.4 |
| Concurrency | `POOL_SIZE=1` per pod initially; measure before increasing | §5.2 |
| Resources | ~1–2 CPU / 2–4 GiB per pod | BRD §7.1 |
| Probes | liveness `GET /health`; readiness `GET /ready` (false while draining; busy capacity keeps it true and returns 429) | §8.4 |
| Termination | `terminationGracePeriodSeconds` ≥ browser runtime cap (120 s) + finalization/delivery margin; `preStop` flips readiness and drains admitted work | §5.2, §5.4, §8.5 |
| Volumes | `emptyDir` for per-run scratch and `emptyDir{medium: Memory}` for `/dev/shm`; `readOnlyRootFilesystem: true` otherwise | §9.3 |
| Security context | `runAsNonRoot`, `allowPrivilegeEscalation: false`, drop `ALL`, restricted service account. **`seccompProfile` is not copied from the backend's `RuntimeDefault` by default**: the Chromium sandbox spike decides whether `RuntimeDefault` or a Platform-approved `Localhost` profile is required. The sandbox is never disabled to make the image run. | §9.3; spike SPK-04 |
| Network | NetworkPolicy/egress template added in 10.18 once the egress spike names the mechanism | §9.3; spike SPK-05 |
| Config/secrets | `env` for callback URL, Sonic endpoint/bucket/path-style, deadlines, `POOL_SIZE`; `envFromSecrets` for Sonic write credentials and internal service identity | §8.5, §9.2 |

The runner shares the chart's `imagePullSecrets`, labels and `serviceAccount` helpers, but should get its own service account when RBAC differs (restricted access is required by §9.3; decided in 10.18).

## 10. Consequences

**Positive.** The runner's supply chain is small, isolated and fully pinned; §4.3 becomes a CI check rather than a convention; the execution boundary of §4.5 is enforced by lint before review; the deployment follows an existing, understood chart pattern; nothing in `frontend/` or the framework root changes.

**Negative / accepted costs.** Two ESLint generations coexist in the repo; the first in-repo Dockerfile is for the runner only (backend/frontend images are built elsewhere); tsconfig/lint conventions are duplicated rather than shared; the fixture-corpus CI stage cannot be green until the internal image exists.

**Open items (owners).**

| # | Item | Owner | Blocks |
|---|---|---|---|
| O-1 | Pipeline definition location and image-build slot for `checks-studio-runner`; registry credentials | @devops | CI stages 6–8 |
| O-2 | Internal Playwright image following the `v<version>-<distro>` tag convention (`ED-05`) | Platform/SRE | Stage 6, 10.18 |
| O-3 | Location of the language-neutral contract files (artifact JSON Schema, internal-route OpenAPI) consumed by both `backend/` and `studio-runner/` CI | 10.1 (backend) | Contract tier |
| O-4 | seccomp profile decision (`RuntimeDefault` vs approved `Localhost`) | Spike SPK-04 | 10.18 values |
| O-5 | Egress mechanism and NetworkPolicy template | Spike SPK-05 | 10.18 |
| O-6 | `frontend/` has a dead `test:e2e` script with no Playwright dependency; out of scope here, noted for the frontend owners | Frontend | — |

## 11. Alternatives considered

| Option | Why not |
|---|---|
| Root pnpm workspace containing `frontend/` and `studio-runner/` | Requires migrating `frontend/` off npm and touching the framework-owned root package; couples the runner's Playwright pin to a shared lockfile; no shared npm code exists to justify it. Remains the right move if the repo becomes a workspace for other reasons. |
| Separate repository `put-checks-studio-runner` | Rejected by BRD §7.1 (new-repo approval off the critical path); §3 names `studio-runner/` inside this repo. |
| Playwright Java binding inside the backend container (`DEBT-01`) | Superseded by architecture §3/§9.3: Chromium must not run on API/worker pods; Epic 10 "MVP done when" repeats it. |
| Yarn | No precedent in the repo; same trade-offs as pnpm without its isolation benefit. |
| Bundling (`esbuild`/`tsup`) | Removes one-to-one auditability of emitted code for a security component; `tsc` output is sufficient for a service. |
| `@playwright/test` as the runtime dependency | It is a test runner; the runner needs the `playwright` library API only. Extra surface, no benefit. |
| `RuntimeDefault` seccomp copied from the backend | Likely incompatible with the Chromium sandbox's namespace syscalls; decided by measurement (SPK-04), not by copy. |
