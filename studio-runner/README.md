# studio-runner

Validation and execution component of the Checks UI Studio (architecture
[§3](../docs/architecture/studio-execution.md#3-system-architecture), §4.5, §5.2). It is the only
component that ever launches Chromium, and the only one that reads an LLM-proposed artifact.

Layout, toolchain, pinning, CI stages and deployment placement are fixed by
[ADR-001](../docs/architecture/ADR-001-studio-runner-scaffolding.md). This README documents what the
package does today and the defaults callers can override.

## What ships today (stories 10.2, 10.3)

| Module | Responsibility |
|---|---|
| `src/validator/` | Artifact envelope checks, default-deny AST validation, argument/reference schemas, bounds. Pure and browser-free. |
| `src/executor/` | Trusted executor over a `BrowserAdapter`, `StepReporter` and `ValueResolver`, with outbound redaction. |
| `src/compat/` | `isCompatible` / `assertCompatible`: refuses an artifact whose recorded runtime differs from the running one, with `RUNTIME_INCOMPATIBLE`. |
| `src/versions.ts` | `VALIDATOR_SCHEMA_VERSION`, `SYNTAX_REFERENCE_VERSION`, `EXECUTOR_VERSION`, `ARTIFACT_VERSION`, `VALIDATOR_PARSER`. |

Not yet present: `src/server/` (10.6), `src/run/` (10.12–10.13), `src/evidence/` (10.14) and the real
Playwright adapter (10.12). No browser is launched by anything in this package today, and nothing
here downloads one.

## Commands

```bash
npm ci                 # exact install; never downloads browsers
npm run type-check     # tsc --noEmit over src, test and config
npm run lint           # ESLint 9 flat config, type-checked
npm test               # Vitest unit tier, with coverage gate
npm run build          # tsc -> dist/ + dist/runtime-versions.json
npm run check:pins     # asserts the four copies of the Playwright pin agree
npm run test:fixtures  # fixture tier; the reference corpus against fixtures/pages/
```

`ci/stages.md` maps these commands onto the eight CI stages of ADR-001 §7.2 and states which of
them need the pinned image. The pipeline YAML is @devops-owned and lives outside this repository.

`npm ci` fetches no browsers. The pinned `playwright` package declares no install script, and the
Dockerfile and CI additionally set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so that stays true if a
future version reintroduces one (ADR-001 §4.2). Browsers come from the image. A developer who wants
a local browser installs the matching build with `npx playwright install chromium` at the pinned
version; Playwright refuses to launch a mismatched build, so drift fails loudly.

## Security model

Generated source is **never evaluated**. `validateArtifact` parses each step with the TypeScript
compiler API and accepts only a bounded sequence of `await <permitted call>;` statements drawn from
the table in architecture §4.5. Accepted steps are converted to a typed, serializable operation
list; the executor then calls its own Playwright methods from that data. There is no `eval`, no
`Function`, no `vm`, no async IIFE and no dynamic `import()` of artifact content anywhere in the
package, and `eslint.boundary-rules.js` makes each of those a lint error (verified by
`test/lint-boundary.test.ts`, and re-checked against the emitted `dist/` by
`test/no-dynamic-evaluation.test.ts`).

This restricts *capabilities*, not intent. A valid artifact can still perform a harmful but
permitted browser action, and the validator cannot prove a locator matches the application or that
an assertion captures the author's intent. Destination and secret-use policy (architecture §9)
remain mandatory and live outside this package.

### Secrets

A secret appears in an artifact only as `vars.secret('ID')` and only as the value argument of
`fill()` — the single approved position in V1. It is rejected in URLs, selectors, key arguments,
assertion arguments and option values. Resolved values are produced by `ValueResolver.secret` at the
moment of the action call, are never placed in operation objects, and every outbound failure message
passes through a redactor that scrubs known values in plain, URL-encoded, double-URL-encoded and
base64 (standard and URL-safe, padded and unpadded) forms.

The redactor scrubs *known* values. It cannot prove an arbitrary string is free of secrets, and
inline credentials that never go through `vars.secret` are invisible here — the backend rejects
known credential patterns before gateway submission (story 10.8).

## Bounds (AC-10 defaults)

Every bound is configuration. Pass overrides as `validateArtifact(artifact, source, refs, { bounds: { … } })`.

| Bound | Default | Meaning |
|---|---:|---|
| `maxArtifactBytes` | 65536 | UTF-8 size of the serialized artifact, checked before anything is parsed |
| `maxSteps` | 100 | Entries in one artifact |
| `maxCodeLength` | 2048 | Characters in one step's `code` |
| `maxStatementsPerStep` | 8 | Statements in one step |
| `maxAstDepth` | 24 | AST nesting depth within one statement |
| `maxStringLength` | 1024 | Any accepted string literal argument |
| `maxSelectorLength` | 512 | CSS selector passed to `locator()` |
| `maxUrlLength` | 2048 | URL literal |
| `maxRegexLength` | 256 | Regular expression literal including delimiters and flags |
| `maxRegexQuantifierNesting` | 1 | Depth of quantified groups tolerated in a regular expression |
| `maxOptionKeys` | 8 | Keys in one options object |
| `maxDiagnosticsPerStep` | 10 | Diagnostics kept per step before truncation |
| `maxDiagnosticMessageLength` | 400 | Characters in a diagnostic message |
| `maxExcerptLength` | 120 | Characters of the failing node echoed back |
| `maxReferenceNameLength` | 64 | Length of a `vars.get`/`vars.secret` name |

## Accepted language

`src/validator/language.ts` is the single machine-readable description of the accepted surface:
receivers, methods, positional argument kinds and option-key schemas. The reference corpus is keyed
on it — `test/reference-manifest.test.ts` fails when a permitted method or option key has no
example, and when an example claims a method the surface does not contain — and the backend
prompt's syntax reference is meant to be generated from it rather than restated.

| Surface | Permitted |
|---|---|
| Statements | `await <permitted call>;`, up to `maxStatementsPerStep` |
| Navigation | `page.goto(url, opts?)`, `page.waitForURL(urlOrRegex, opts?)` |
| Locators | chains rooted at `page`: `getByRole`, `getByText`, `getByLabel`, `getByPlaceholder`, `getByTestId`, `locator` (CSS only) |
| Actions | `click`, `fill`, `press`, `check`, `uncheck`, `selectOption`, `hover` |
| Assertions | `expect(locator).toBeVisible / toContainText / toHaveValue`, `expect(page).toHaveURL / toHaveTitle` |
| Arguments | bounded literals, safe regular expressions, enumerated option keys, `vars.get` / `vars.secret` |

URLs must be absolute `http`/`https`; `locator()` rejects Playwright selector-engine syntax
(`text=`, `xpath=`, `>>`, `:has-text(...)`, …); regular expressions reject backreferences,
lookbehind, unpermitted flags and quantifier nesting beyond the configured depth.

## Fixture corpora

| Directory | Purpose |
|---|---|
| `fixtures/reference/` | The pinned syntax reference: one valid artifact per permitted method and option key, each asserting the exact `BrowserAdapter` call sequence. `manifest.json` binds every example to the methods and option keys it demonstrates and to the fixture page it targets. |
| `fixtures/adversarial/` | One rejected artifact per denial class. Every code in `DIAGNOSTIC_CODES` must have a fixture; a test fails when one does not. |
| `fixtures/lint/` | Files containing each construct the execution-boundary lint rules forbid. Excluded from `tsconfig.json` and from `npm run lint` on purpose, and linted programmatically by a test. |
| `fixtures/pages/` | Controlled local HTML the reference corpus targets. Every element carries an explicit `role` attribute so the fixture tier can check a locator against the page exactly. Served at the URLs in `manifest.json` by the real adapter (10.12). |

### Adding a reference example

1. Add the fixture JSON to `fixtures/reference/` in the shape the existing examples use
   (`source`, `references`, `values`, `artifact`, `expectedCalls`).
2. Add its entry to `fixtures/reference/manifest.json` with the fixture page it targets. The
   `methods`, `optionKeys` and `referenceKinds` fields are re-derived from the validator by
   `test/reference-manifest.test.ts`, which prints the exact expected arrays when they disagree —
   a declaration cannot claim coverage the example does not have.
3. Bump `SYNTAX_REFERENCE_VERSION` in `src/versions.ts`: the corpus is part of the pinned runtime.

## Versions

`npm run build` writes `dist/runtime-versions.json` with the declared, locked and image copies of the
Playwright pin plus the Chromium build, Node, validator, parser, syntax-reference and executor
versions (architecture §4.6, ADR-001 §4.2).

`chromiumBuild` and `image` can only be observed inside the pinned Playwright image — from the
`chromium-<revision>` directory under `PLAYWRIGHT_BROWSERS_PATH` and from the `IMAGE_TAG` build arg.
On a plain Node build they are `null`, and `check:pins` prints them as `NOT ASSERTED`: never as a
pass. `npm run check:pins -- --require-image` turns that into a failure, which is what CI runs
against the built image (`ci/stages.md`, stage 6a).

### The pin

ADR-001 §4.2: **one declared pin, four asserted copies.**

| Copy | Where |
|---|---|
| Declared | `package.json` → `dependencies.playwright`, exact, no range |
| Locked | `package-lock.json` → `packages['node_modules/playwright'].version` |
| Image | `Dockerfile` → `ARG PLAYWRIGHT_VERSION=`, from which the base-image tag is derived |
| Recorded | `dist/runtime-versions.json` → `playwright` |

`npm run check:pins` asserts all four agree and that the `engines.node` floor major equals `.nvmrc`.
Any disagreement exits non-zero and names the copies with their values. `test/pins.test.ts` drifts
each copy alone in a temporary directory and asserts the check fails for every one of them.

### Runtime upgrade procedure

Architecture §4.6 requires a runtime upgrade to revalidate compatibility and run a fixture corpus
before release, and to block an incompatible revision explicitly rather than reinterpret it. The
procedure below is ADR-001 §4.2 made concrete. **One PR does all of it**; a partial bump is exactly
the drift `check:pins` exists to stop.

1. **Bump every copy of the pin in the same commit** — `package.json`, `package-lock.json`
   (`npm install playwright@<new>` with `save-exact=true`), and `Dockerfile` `ARG
   PLAYWRIGHT_VERSION`. The base-image tag follows the `ARG`; never edit the `FROM` line
   independently.
2. **Regenerate the record** — `npm run build`, which rewrites `dist/runtime-versions.json`.
3. **Assert the copies** — `npm run check:pins`, and `npm run check:pins -- --require-image` against
   the rebuilt image so the new `chromiumBuild` and `image` are asserted rather than skipped.
4. **Run both corpora** — `npm test` (unit tier: the adversarial corpus and every reference example
   against the current validator) and `npm run test:fixtures` inside the pinned image. A reference
   example that no longer validates, or an adversarial fixture that is no longer rejected, blocks
   the upgrade. This is the fixture-corpus run §4.6 requires before release.
5. **Decide the compatibility rule** — `src/compat/compatibility.ts` compares Playwright with
   `exact` today. If the fixture tier gives evidence that a range is safe, relax `COMPATIBILITY_RULES`
   in the same PR and record the evidence in its description. Never relax it speculatively.
6. **Record compatibility for existing confirmed revisions** — every confirmed revision carries the
   versions it was validated under. After the bump, `isCompatible` refuses those revisions with
   `RUNTIME_INCOMPATIBLE` and the differing fields, and the backend returns
   `409 RUNTIME_INCOMPATIBLE` on execute (10.8). Preserve the revision and explain why it is
   blocked.
7. **Never rewrite approved source.** A revision is recompiled only by an explicit, reconfirmed
   authoring action. An upgrade does not silently reinterpret an artifact under the new runtime,
   and a vulnerable runtime is not kept alive to preserve replay.

Bump `SYNTAX_REFERENCE_VERSION` in `src/versions.ts` whenever a reference example is added, removed
or changed; it is compared exactly, so the bump is what stops an artifact proposed against the old
corpus from being reinterpreted against the new one.

### Runtime compatibility

`src/compat/` compares an artifact's recorded provenance with the running `runtime-versions.json`:

| Field | Rule | Why |
|---|---|---|
| `validatorSchema` | exact | The accepted language and its parser decide what the source *means*. |
| `syntaxReference` | exact | The corpus the proposal was made against. |
| `playwright` | exact (V1 decision) | The browser image is pinned to the package; nothing has yet measured which deltas are behaviour-preserving. |
| `executor` | same major, runtime `minor.patch` ≥ recorded | Additive changes to the operation contract are compatible; a new major or an older runtime is not. |

`assertCompatible` throws `RuntimeIncompatibleError` with `code: 'RUNTIME_INCOMPATIBLE'` and the
differing fields. Callers place it before any adapter call, so an incompatible artifact never
reaches a browser. Server-side enforcement remains authoritative (architecture §4.6).

## Node version

`.nvmrc` pins the Node major shipped by the Playwright image (22). `engines.node` is expressed as a
range rather than `22.x` so the package also installs on a developer machine running a newer Node;
`engine-strict=true` still rejects anything outside the range, and story 10.3's CI check asserts the
Node version inside the image against `.nvmrc`.
