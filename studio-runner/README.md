# studio-runner

Validation and execution component of the Checks UI Studio (architecture
[§3](../docs/architecture/studio-execution.md#3-system-architecture), §4.5, §5.2). It is the only
component that ever launches Chromium, and the only one that reads an LLM-proposed artifact.

Layout, toolchain, pinning, CI stages and deployment placement are fixed by
[ADR-001](../docs/architecture/ADR-001-studio-runner-scaffolding.md). This README documents what the
package does today and the defaults callers can override.

## What ships today (story 10.2)

| Module | Responsibility |
|---|---|
| `src/validator/` | Artifact envelope checks, default-deny AST validation, argument/reference schemas, bounds. Pure and browser-free. |
| `src/executor/` | Trusted executor over a `BrowserAdapter`, `StepReporter` and `ValueResolver`, with outbound redaction. |
| `src/versions.ts` | `VALIDATOR_SCHEMA_VERSION`, `EXECUTOR_VERSION`, `ARTIFACT_VERSION`, `VALIDATOR_PARSER`. |

Not yet present: `src/server/` (10.6), `src/run/` (10.12–10.13), `src/evidence/` (10.14) and the real
Playwright adapter (10.12). No browser is launched by anything in this package today.

## Commands

```bash
npm ci                 # exact install; never downloads browsers
npm run type-check     # tsc --noEmit over src, test and config
npm run lint           # ESLint 9 flat config, type-checked
npm test               # Vitest unit tier, with coverage gate
npm run build          # tsc -> dist/ + dist/runtime-versions.json
npm run test:fixtures  # fixture tier; needs the pinned Playwright image (10.3)
```

`npm ci` never fetches browsers: the Dockerfile and CI set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, and
the image supplies Chromium. Set the same variable locally if your npm configuration runs install
scripts. A developer who does want a local browser installs the matching build with
`npx playwright install chromium` at the pinned version; Playwright refuses to launch a mismatched
build, so drift fails loudly.

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
receivers, methods, positional argument kinds and option-key schemas. Story 10.3's reference corpus
and the backend prompt's syntax reference are meant to be generated from it rather than restated.

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
| `fixtures/reference/` | One valid artifact per permitted method; each asserts the exact `BrowserAdapter` call sequence against a fake adapter. Story 10.3 extends this into the pinned-runtime corpus. |
| `fixtures/adversarial/` | One rejected artifact per denial class. Every code in `DIAGNOSTIC_CODES` must have a fixture; a test fails when one does not. |
| `fixtures/lint/` | Files containing each construct the execution-boundary lint rules forbid. Excluded from `tsconfig.json` and from `npm run lint` on purpose, and linted programmatically by a test. |
| `fixtures/pages/` | Controlled local HTML for the browser tiers (10.12, 10.16). Empty today. |

## Versions

`npm run build` writes `dist/runtime-versions.json` with the declared, locked and image copies of the
Playwright pin plus the Node, validator, parser and executor versions (architecture §4.6,
ADR-001 §4.2). This package *records* those values; the CI check that fails the build when the four
copies disagree is story 10.3.

## Node version

`.nvmrc` pins the Node major shipped by the Playwright image (22). `engines.node` is expressed as a
range rather than `22.x` so the package also installs on a developer machine running a newer Node;
`engine-strict=true` still rejects anything outside the range, and story 10.3's CI check asserts the
Node version inside the image against `.nvmrc`.
