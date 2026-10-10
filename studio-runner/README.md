# studio-runner

For local startup and API/worker/runner wiring, see [Studio integration setup](../docs/runbooks/studio-integrations.md).

Validation and execution component of the Checks UI Studio (architecture
[§3](../docs/architecture/studio-execution.md#3-system-architecture), §4.5, §5.2). It is the only
component that ever launches Chromium, and the only one that reads an LLM-proposed artifact.

Layout, toolchain, pinning, CI stages and deployment placement are fixed by
[ADR-001](../docs/architecture/ADR-001-studio-runner-scaffolding.md). This README documents what the
package does today and the defaults callers can override.

## What ships today (stories 10.2, 10.3, 10.6)

| Module | Responsibility |
|---|---|
| `src/validator/` | Artifact envelope checks, default-deny AST validation, argument/reference schemas, bounds. Pure and browser-free. |
| `src/executor/` | Trusted executor over a `BrowserAdapter`, `StepReporter` and `ValueResolver`, with outbound redaction. |
| `src/compat/` | `isCompatible` / `assertCompatible`: refuses an artifact whose recorded runtime differs from the running one, with `RUNTIME_INCOMPATIBLE`. |
| `src/server/` | The four internal HTTP routes, the capacity pool, the service-identity check, bounded bodies and structured redacted logging. |
| `src/reporting/` | The admission CAS **client**, the progress/terminal report client, and the `StepReporter` implementation 10.2 left as a seam. |
| `src/run/` | The real browser: the `BrowserLauncher` that forks a killable child, the data-only parent↔child protocol, the Playwright adapter, the recording lifecycle and evidence vocabulary, the run-scoped clock and the runner error-code set — plus story 10.13's **runtime deadline** (`deadline.ts`), **process-tree kill and observation** (`tree.ts`) and **captured, redacted child output relay** (`outputRelay.ts`). |
| `src/main.ts` | Process entry: configuration, server start, `SIGTERM` drain, scratch clearing at startup and on exit. |
| `src/versions.ts` | `VALIDATOR_SCHEMA_VERSION`, `SYNTAX_REFERENCE_VERSION`, `EXECUTOR_VERSION`, `ARTIFACT_VERSION`, `VALIDATOR_PARSER`. |

Not yet present: `src/evidence/` (10.14). Uploading a recording, the durable result manifest and
the `STORED` evidence state are 10.14's; a recording still lives and dies in scratch.

## The two budgets (story 10.13)

**Queue time and browser runtime are separate budgets** (§8.5), with distinct timestamps, and
neither consumes the other.

| Budget | Measured from | Bound | Enforced by |
|---|---|---|---|
| **Queue** — admitted-start | `admittedAtMs`, the instant the admission CAS returned | `job.deadlines.admittedStartMs` (§8.5 starting value 30 s) | a **refusal** in `runCoordinator`: `ERROR` / `START_DEADLINE_EXCEEDED`, no browser started |
| **Runtime** — total browser | the `ready` handshake, and nothing else | `min(job.deadlines.totalRuntimeMs, STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS)` (§5.2, §8.5, 120 s) | **enforcement**: ordered stop, bounded grace, process-tree kill → `ERROR` / `TIMEOUT` |

A run that spends nine-tenths of its queue budget waiting still gets the **whole** of its browser
time: the timer is armed at the handshake and the arithmetic never subtracts one budget from the
other. The parent enforces on its **own** monotonic clock — the child owns the run clock whose zero
is the recording origin (ADR-002 §11.2) and the parent never re-bases onto it, so the timeout's log
entry carries `atMs: null` rather than a wall-derived number.

**Nothing extends the maximum.** `RuntimeDeadline` has no `extend`, `reset` or `refresh`, and
`arm()` is once-only, so a heartbeat, a step event or a protocol keepalive has nothing to call
(§5.4). A job asking for more browser time than the deployment permits gets the deployment's value:
both maxima are enumerated configuration keys, so the fail-closed loader owns them.

### What happens when the deadline fires

1. The reason is **recorded before anything is signalled** — otherwise the abandoned-result path
   reports `run-fault` → `RUN_ERROR`, which is the code for "the protocol broke" rather than for
   the one condition §8.2 names by hand.
2. The child is asked to **stop**, and gets exactly `STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS` to
   close and await the recording context — the only thing that finalizes the webm (§6.1). No step
   executes during the grace: a run does not buy browser time by being slow to die.
3. Whether that ordered stop **completed** is recorded, before the signal. It is the fact ADR-002
   §17.7 makes `RunnerEvidence.partial` depend on, and it stops being observable the instant the
   tree does.
4. The **process tree** is ended. Not the fork: the fork's pid is Node, and Chromium is below it.
   See `src/run/tree.ts` — Playwright starts the browser and the video encoder in process groups of
   their own, so a single group signal reaches the Node layer and orphans the browser; the tree is
   enumerated and each member signalled with the group it leads.

### The deadline tier

`test/fixtures-tier/deadline-cleanup.test.ts` is where these stop being claims about a design. It
runs real pinned Chromium, **suspends the browser** so it cannot exit on its own, kills, and then
asks each previously observed pid whether it is still alive. Without the suspension the browser
tidies itself up when its parent dies and any kill looks correct — which is exactly the vacuous
test AC-11a exists to prevent.

## Child diagnostics (story 10.13)

The child's stdout and stderr are **piped and relayed**, not inherited. §9.2 requires the runner to
scrub every outbound diagnostic *before persistence*, and a pod log is persistence. The relay
redacts with the run's own redactor and **then** bounds each line by `maxLogEntryLength` — that
order, because truncating first would cut a known value in half and the surviving fragment matches
no variant the redactor scrubs. It is line- and volume-bounded, its drops are announced rather than
silent, it is synchronous and contained so it can never delay the run or the control endpoints, and
it is released at the end of the run so nothing holds a path to a resolved value afterwards.

**The chunk-boundary case is closed (story 10.17, AC-21).** The relay's own comment used to say the
general case could not be closed *"without an unbounded buffer, which is the thing this relay exists
to prevent."* That was wrong: the buffer required is bounded by the longest thing the redactor could
possibly match, and the run computes that set at admission. `createRedactor` publishes it as
`longestVariantLength`; the relay **reads** it and computes nothing, because two derivations of one
bound in two modules is this codebase's most-repeated defect. The bound is the longest *variant*,
not the longest known value — base64 is roughly four-thirds of a value, so a tail sized to the raw
value would close the case a test was written for and miss the case an attacker gets. Peak retention
per stream is `retentionBound + maxLineLength`, declared in the module and asserted against the
bound rather than against a number copied into a test.

One case remains and is stated rather than implied: **a child that writes a value with a newline
through the middle of it** produces two lines by its own choice, and neither half matches anything.

## What a resolved value may touch (story 10.17)

A run receives `resolvedVars` and `resolvedSecrets` on its job envelope and holds them in memory for
the length of the run. §9.2: *"Never persist them in jobs, retry queues, manifests or diagnostics."*

**Correspondence is checked before capacity.** `validateEnvelope` is step 1 of `submit` — before
`pool.tryAcquire()`, before admission and before any process — and since story 10.17 it compares the
resolved maps' keys against `references`: every declared name has a value, no resolved key is
undeclared in either map, and a name crossed between the two kinds is a refusal. Before that, a job
declaring a secret and supplying no value was admitted, took a capacity slot, launched Chromium and
died mid-step in front of a real application. Every refusal carries the reference **name** and never
a value, which is what makes the whole `detail` array safe to log.

**Both maps are scrubbed, not only the secrets.** The contract describes only `resolvedSecrets` as
*"additionally scrubbed"*; `knownValuesOf` feeds the redactor both. @po ruled on 2026-09-11 that the
code's stronger behaviour is correct and intended and that the *document* is what is narrower — a
variable value is author-supplied free text the system knows nothing about, and a `REGION` today is
a URL carrying a token tomorrow. Amending the document is Class B and an architect's; story 10.17
records the divergence and changes nothing.

**The redactor scrubs eight variants**, not seven: plain, `encodeURIComponent`, `encodeURI`,
double-encoded, four base64 forms, and — since story 10.17 — the **JSON-escaped** form. `logging.ts`
is serialize-then-redact by design, so the bytes on a log line are escaped and a value containing
`"`, `\` or a newline was not the value the redactor was looking for. `redact` stays `split`/`join`:
no `RegExp` is built over attacker-influenced text.

**The retained log buffer truncates before the report client redacts**, and that order is not
reversed — bounding is `bounds.ts`'s job and scrubbing is not. The requirement that follows is made
a property of the code rather than of today's callers: `RunSnapshot.appendLog` is the only caller
reachable from a run and it applies the run's redactor before delegating, so a producer added later
cannot skip it.

## The real browser (story 10.12)

**The browser is real from this story onward.** `src/main.ts` no longer ships a launcher that
refuses; it wires `createChildBrowserLauncher`, and an admitted run starts pinned Chromium.

### Where the browser runs, and what it may touch

One browser, one context, one page, per run, **in a child process** that exits on every path —
success, step failure, launch failure, error. The parent's `/v1/validate`, `/health`, `/ready` and
`/v1/runs` stay responsive throughout, on separate bounded resources.

The child is forked with **no arguments** and an enumerated environment (`PATH`, `HOME`, `LANG`,
`LC_ALL`, `NODE_OPTIONS`, `PLAYWRIGHT_BROWSERS_PATH`, `DISPLAY`, `XDG_RUNTIME_DIR`, plus `TMPDIR`
pointed at the run's scratch). Nothing in the runner's own `STUDIO_RUNNER_*` namespace is passed
on: the process that opens untrusted pages holds no runner configuration and no service identity.
Resolved variables and secrets travel over the IPC channel and **only** there — never in `argv`,
never in the environment, never in a spawn command line.

Everything Chromium writes goes under the per-run scratch directory — `browser-profile/`, `video/`,
`downloads/`, `traces/`, `tmp/` — which is cleared on success, step failure, launch failure, error
and drain. **The recording is deleted with it.** Until story 10.14 uploads it, no file survives the
run; the runner reports `PENDING` because the evidence is real and unstored, not because something
is being kept.

### The sandbox

`chromiumSandbox: true`, written literally in `src/run/browser.ts`, with **no** configuration key,
environment variable, job field or code path that can set it to `false`, and an explicitly empty
`args` array. Playwright's own default is `false` — it adds a disabling flag — so the requirement is
enforced as a gate rather than left to habit: lint forbids `--no-sandbox`, `--disable-setuid-sandbox`
and `--disable-gpu-sandbox` anywhere in this package (with proving fixtures under `fixtures/lint/`),
and a repo-wide scan in `test/run/sandbox.test.ts` covers the `Dockerfile` too.

If Chromium cannot start with the sandbox, the run reports `BROWSER_SANDBOX_UNAVAILABLE` and the
runner **never** relaunches without it (architecture §9.3).

### The run timeline

Every reading in a report — each step's `startedAtMs`/`finishedAtMs`/`durationMs` and each log
entry's `atMs` — is a fractional offset on **one** monotonic clock whose zero is the browser start.
The zero is taken in the child at the instant the recording context and page are ready, and the
single wall-clock `browserStartedAt` is read **adjacently**, from the same moment. The API computes
`at = browserStartedAt + atMs` and applies no calibration of its own; the wire carries one origin
and no calibration constant (ADR-002 §11).

`executeSteps` has no default clock. It used to default to `performance.now()`, whose origin is
*process start*, which is how the runner came to report offsets from process start while the
browser-start log line carried a literal `0`. The option is now required, and refused at run time
as well as at compile time.

A report with `browserStartedAt: null` carries **no** reading at all: every `startedAtMs`,
`finishedAtMs`, `durationMs` and `atMs` is `null` and `steps` is empty. The snapshot enforces that
as the producer.

### Running it locally

```bash
npm run browsers:install   # pinned Chromium, at the version in package.json
npm run build              # the child entry is spawned from dist/
npm run test:fixtures      # the real-browser tier
```

`npm test` (the unit tier) launches **no** browser and downloads none: the Playwright adapter is
written against a structural page/locator surface and is exercised against a hand-written page, and
the child runtime is exercised against a fake browser factory.

### Running it against the local backend (Studio v1 WP2)

Verified 2026-09-18. From the repository root, `./dev.sh` builds this package, starts it on
`127.0.0.1:8090` and starts the backend so that the two agree on both credentials. The runner's
environment is **enumerated**, not inherited (`env -i`), because the loader refuses any unknown
`STUDIO_RUNNER_*` key and the backend's own `STUDIO_RUNNER_BASE_URL`/`STUDIO_RUNNER_SERVICE_TOKEN` are
exactly such keys. To start it by hand beside a backend on `:8080`:

```bash
npm run build
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$WORK" \
  STUDIO_RUNNER_HOST=127.0.0.1 STUDIO_RUNNER_PORT=8090 STUDIO_RUNNER_POOL_SIZE=1 \
  STUDIO_RUNNER_SERVICE_IDENTITY="$STUDIO_RUNNER_SERVICE_TOKEN" \
  STUDIO_RUNNER_CALLBACK_IDENTITY="$STUDIO_CALLBACK_SERVICE_TOKEN" \
  STUDIO_RUNNER_CALLBACK_BASE_URL=http://127.0.0.1:8080 \
  STUDIO_RUNNER_SCRATCH_DIR="$WORK/scratch" STUDIO_RUNNER_OBJECT_STORE_DIR="$WORK/objects" \
  node dist/main.js
```

`$WORK` is any directory you own; the scratch root must be a **child** of it, because the runner
removes its scratch root on exit. The backend side is `STUDIO_RUNNER_BASE_URL=http://127.0.0.1:8090`
plus the same two tokens (see `backend/README.md`, "Checks Studio end to end on a laptop"). The
recording and terminal manifest land in `$WORK/objects`; `dev.sh` exports that exact directory as
the backend's `STUDIO_EVIDENCE_DIRECTORY`, so playback, ranged reads and recovery work locally.
The default provider is `local`. To activate Sonic, select `s3` and provide its endpoint, region,
bucket, path-style choice and the two mounted credential-file paths.

`../tools/corun.sh` is the automated form: `StudioCoRunIT` starts this process the same way and its
leg 4 requires a real run against a loopback page to end `PASSED` with the ledger row `DONE`.

### Secrets and the video — a disclosed limitation

Architecture §9.2 is explicit and this story does not change it: **a secret typed into a visible
field appears in the recording.** The runner redacts every outbound report body, log line,
diagnostic and failure message, and the canary test asserts that on the bytes that leave and on the
spawn arguments actually passed — but no blurring, masking or transcoding is introduced in V1, and
Security acceptance for on-screen secrets is not claimed by this story.

## The internal service (story 10.6)

### Routes

| Route | Behaviour |
|---|---|
| `POST /v1/validate` | Browser-free wrapper over `validateArtifact` with bounded work. Takes **no capacity slot**, so it answers while the pool is saturated. |
| `POST /v1/runs` | Envelope → artifact → capacity slot → admission CAS → `202`. Nothing starts before the CAS succeeds. |
| `GET /health` | Liveness only. Stays `200` while saturated **and** while draining. |
| `GET /ready` | Ability to admit safely. Saturation alone keeps it **true**; only draining makes it false. |

All four require a restricted service identity in an `Authorization: Bearer` header, checked on the
request head before the body is read, compared in constant time over SHA-256 digests. There is no
credential in any URL or query string, inbound or outbound.

### Saturated is not draining

These are different conditions with different answers, and conflating them is a real defect:

| Condition | `/v1/runs` | `/ready` | Why |
|---|---|---|---|
| Pool saturated | `429` + `Retry-After` | **`200`, ready** | The pod is healthy and about to be free. Removing it from its Service for being busy is the opposite of backpressure. |
| Draining | `503` | `503`, not ready | The pod is leaving. |

`429` is a **definite non-acceptance**: no slot held, no admission request issued, no scratch, no
browser, nothing durable anywhere. It is decided before the runner contacts the API at all.

### Admission, and the two retry policies that must never merge

The runner performs the admission compare-and-set **as a client**; the CAS itself, its ledger and
every persistence decision behind it are story 10.7's.

| Outcome | Meaning | Runner |
|---|---|---|
| `2xx` | This `(runnerInstanceId, admissionId)` owns the attempt | Launch, once |
| `409` / `401` / `403` | Definite non-acceptance | Stop. Release the slot. **Never re-attempt.** |
| Timeout, connection loss, `5xx`, `307`/`308` | **Ambiguous** — admission may already have been granted | Stop. Release the slot. **Never resend.** |

Ambiguity is the dangerous case, not the soft one: a timed-out admission may have committed on the
API side, so a second attempt risks two runners owning one attempt. The runner holds no state and
cannot resolve it; resolving it is 10.7's reaper work.

Redirects are never followed. A followed `307` on the admission route is a second admission POST
wearing a different name.

The two retry policies are deliberately opposite and live in the same files so neither can be
"simplified" into the other:

- **Admission — never retried.** No loop, at any level, and no second `admissionId` for the same
  `attemptId`.
- **Terminal report — retried, byte-identically.** The `FINAL` body is serialized once before the
  first send and those exact bytes are re-sent on every attempt. Nothing is recomputed per attempt,
  timestamps included: the report's timestamps describe the run, not the delivery. The per-delivery
  attempt counter travels in the `x-runner-delivery-attempt` header, where it cannot change the
  bytes the API de-duplicates on. Bounded in count and total time, with jitter.

Progress (`STARTED`, `PROGRESS`) is best-effort: a failed delivery is dropped, because every report
is a full cumulative snapshot and the next one repairs the gap without replaying anything. A `409`
on any report stops reporting for that run immediately — it is the API saying this runner no longer
owns the attempt — and is recorded as a structured audit line plus a counter and nowhere else.

### Drain

`SIGTERM` runs, in this order: readiness goes false → new `/v1/runs` is refused `503` → the
in-flight run finishes and delivers its terminal report (bounded by `DRAIN_TIMEOUT_MS`) → the
listener closes → scratch is cleared. Scratch is also cleared at startup, so a pod killed mid-run
leaves nothing for the next one to inherit.

`SIGKILL` skips all of it. Recovering an attempt whose runner vanished is the running reaper's job
and belongs to story 10.7; nothing in this package claims otherwise.

### Configuration

Every accepted key is enumerated in `src/server/config.ts` under the `STUDIO_RUNNER_` prefix. **Any
unrecognised key in that namespace is a startup failure, not an ignored extra** — so a mounted
database URL or vault address stops the pod rather than sitting unread in the environment. Required:
`STUDIO_RUNNER_SERVICE_IDENTITY`, `STUDIO_RUNNER_CALLBACK_IDENTITY`,
`STUDIO_RUNNER_CALLBACK_BASE_URL`. Everything else has a documented default.

The callback destination is deployment configuration only. A job body carrying a callback URL, host
or port is rejected with `JOB_CALLBACK_NOT_PERMITTED`, and the envelope is default-deny on keys, so
a callback field nobody enumerated is rejected too.

## Commands

```bash
npm ci                 # exact install; never downloads browsers
npm run type-check     # tsc --noEmit over src, test and config
npm run lint           # ESLint 9 flat config, type-checked
npm test               # Vitest unit tier, with coverage gate
npm run build          # tsc -> dist/ + dist/runtime-versions.json
npm run check:pins     # asserts the four copies of the Playwright pin agree
npm run test:fixtures  # fixture tier; the reference corpus against fixtures/pages/
npm start              # node dist/main.js — the image entry point (requires npm run build)
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

On the outbound path the redactor runs over the **serialized** payload — the request body string
handed to the HTTP client and the line handed to the log sink — never over the objects behind them.
A field added to a report next year is therefore scrubbed automatically, rather than escaping
because nobody remembered to add it to a redaction list.

### Isolation: no DB, no vault, no CSI, no LLM

Architecture §9.2: *"the runner … has no platform user session or DB/vault/CSI/LLM credentials"*.
This is the component that renders untrusted pages, so it must hold no credential to anything else.
Three build-gated parts enforce it:

1. **Allowlist over the resolved production dependency closure** (`test/isolation.test.ts`). The
   lockfile's transitive non-dev closure must equal an enumerated list — today `playwright`,
   `playwright-core` and `typescript`. **Any** package not on the list fails, whatever it is. This
   is the part that catches the client nobody predicted; a denylist only fails for one somebody did.
2. **Named-module lint rules** (`eslint.boundary-rules.js` `MODULE_GROUPS`), with one proving
   fixture per entry under `fixtures/lint/`. A fast, readable second line of defence.
3. **The configuration surface** — see above.

What they cannot prove: they stop the runner *linking* a client, not reaching a database over plain
HTTP through a dependency it already has. The complement is the configured outbound destination
allowlist — callback API, object store, target page, and nothing else.

ADR-001 §5 allowed this story one HTTP server library. It took none: `node:http` covers a four-route
surface with no middleware, so the closure did not grow.

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

### Text-entry role equivalence (executor 2.1.0, VAL-031)

The compiler cannot see the page, so the role of a text field is a guess: `searchbox`, `textbox`
and `combobox` are all things "the search field" can be. For `fill` and `press` only, when the
chain's **terminal** segment is `getByRole` with one of those three roles and options limited to
`name`/`exact`/`disabled`, `src/run/playwrightAdapter.ts` resolves the target like this:

1. The authored role is tried first on every poll. If it matches any visible element (see
   visible-only resolution below), it is used, strict mode included.
2. Only after it has matched nothing for `min(2 s, timeout/4)` are the other two roles counted,
   with the same options, as one `.or()` union. Exactly one match is acted on with the remaining
   timeout. Several are refused with a fixed message (`no <role> matched; N other text-entry
   controls did — refusing to choose`). `.first()` is never used. If nothing matches by the
   deadline, the usual "no element matched" failure is reported.
3. `guard()` and the secret-origin check run before any of this.
4. Each use writes one line to the child's stderr, which the output relay redacts and bounds:
   `text-entry-equivalence: authored=<role> resolved=<role> step=<i>`.

`click`, `hover`, `check`, the assertions, other roles, non-terminal segments and any role with
`checked`/`expanded`/`selected`/`pressed`/`level` are unchanged. The step report does not yet name
the resolved role; adding it is an ADR-002 Class B change.

### Visible-only resolution of actions (executor 2.1.0, VAL-040)

Real pages carry hidden twins of their controls. Wikipedia's search input has hidden copies with
the same placeholder, so `getByPlaceholder('Search Wikipedia')` matched 2 elements. Google's
`getByLabel('Search')` matched 6, most of them hidden. Strict mode refused both, even though a
hidden element can't be acted on anyway. For the action operations (`click`, `fill`, `press`,
`check`, `uncheck`, `hover`, `selectOption`), the adapter narrows the authored locator with
`locator.filter({ visible: true })` and polls its count until the step timeout:

| Visible matches | Outcome |
|---|---|
| ≥ 2 | The VAL-028 strict-mode failure, with N the **visible** count: `<action> failed: the locator matched N elements; make the step more specific.` `.first()` is never used. |
| exactly 1 | The action runs on it with the remaining timeout. |
| 0 until the deadline | `<action> failed: the element was not visible within <t>ms.` if the authored locator matched hidden elements, otherwise `… no element matched the locator within <t>ms.` |

- **Assertions are unchanged.** `toBeVisible`, `toContainText` and `toHaveValue` resolve the
  unfiltered locator, so their strict-mode and visibility semantics are the same as before.
- **With text-entry equivalence**, the authored role and the alternatives' `.or()` union are both
  narrowed the same way. A hidden-only authored match therefore counts as no match, and the
  settle-window fallback above applies.
- **`force: true` opts out.** The author asked to skip actionability, so the authored locator is
  used unfiltered, exactly as before.
- `guard()` and the secret-origin check still run first.
- When the filter changed the outcome (the one visible element had hidden twins, so total > 1),
  the child writes one stderr line through the output relay: `visible-only-resolution: step=<i>
  total=<n>`. It carries counts only, never the locator text.

This is part of the same unreleased executor 2.1.0 as VAL-031. There is no further version bump.

## Fixture corpora

| Directory | Purpose |
|---|---|
| `fixtures/reference/` | The pinned syntax reference: one valid artifact per permitted method and option key, each asserting the exact `BrowserAdapter` call sequence. `manifest.json` binds every example to the methods and option keys it demonstrates and to the fixture page it targets. |
| `fixtures/adversarial/` | One rejected artifact per denial class. Every code in `DIAGNOSTIC_CODES` must have a fixture; a test fails when one does not. |
| `fixtures/lint/` | Files containing each construct the execution-boundary lint rules forbid. Excluded from `tsconfig.json` and from `npm run lint` on purpose, and linted programmatically by a test. |
| `fixtures/pages/` | Controlled local HTML the reference corpus targets. Every element carries an explicit `role` attribute so the fixture tier can check a locator against the page exactly. Served on loopback by `test/helpers/pageServer.ts` at the paths `manifest.json` binds them to, so a real Chromium reaches them without reaching `example.com` and without a DNS lookup. `popup.html` and `timeline.html` belong to story 10.12 (unsupported multi-page workflow; seek measurement) and are deliberately **not** in `manifest.json` — that file is the pinned syntax reference, and adding a page to it would bump `SYNTAX_REFERENCE_VERSION`. |

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
against the built image (`ci/stages.md`, stage 6a). An `IMAGE_TAG` build arg that was never passed
arrives inside the image as an empty string rather than as an absent variable, because the
`Dockerfile` gives the `ARG` an empty default; empty and whitespace-only are recorded as `null` and
treated as *not asserted*, so an image that cannot name itself does not pass `--require-image`.

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

#### The Node pin

`.nvmrc` and `engines.node` are not two spellings of the same thing, and `check:pins` treats them
differently on purpose:

| Copy | What it pins | Asserted how |
|---|---|---|
| `.nvmrc` (`22`) | the Node major **the image must ship** | equals the `engines.node` floor major; and equals the major of the recorded `node` whenever the record came from inside the pinned image |
| `engines.node` (`>=22.11.0 <25.0.0`) | what the package is allowed to be installed and built on | the recorded `node` must satisfy it, everywhere |

Story 10.2 widened `engines.node` to a range deliberately, so the package still installs on a
developer machine running a newer Node under `engine-strict=true`. That widening is not licence for
the *image* to drift: ADR-001 §4.2 scopes the `.nvmrc` obligation to the image ("`node --version`
inside the image"), and that is exactly where `check:pins` applies it. "Inside the image" is read
off the record — a recorded `chromiumBuild` exists only under the image's `PLAYWRIGHT_BROWSERS_PATH`
— so it cannot be asserted by a flag, and dropping it to dodge the rule fails `--require-image` on
the missing field instead.

> **Known conflict (`ED-05`).** The public `mcr.microsoft.com/playwright:v1.63.0-noble` base image
> ships Node v24.20.0, which satisfies `engines.node` but is not the `.nvmrc` major. `check:pins`
> therefore **fails** against that image, by design, and says so. The fix belongs to the internal
> image or to an ADR amendment. Widening `.nvmrc` to match whatever the base image ships would
> delete the only copy that pins Node and is not an acceptable way to make the pipeline green.

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

### Guided observed-2 worker

Build with `npm run build`, then launch the isolated guided service with
`STUDIO_GUIDED_CONFIG_FILE=/mounted/guided.json npm run start:guided`.
The trusted mounted JSON configuration contains:

- `workerId`, `host`, `port`, `journalDirectory` (persistent, private, outside disposable replay scratch).
- `tlsKeyFile`, `tlsCertFile`, `tlsCaFile` for mutually authenticated HTTPS.
- `controllerIssuer`, `controllerSubject`, `controllerPublicKeyFile`, and
  `controllerCertificateFingerprint256` to bind controller JWT and certificate identities.
- `callbackBaseUrl` and `callbackTokenFile`; the issuer-issued worker token is reread for each
  callback so an external credential mount can rotate it. The worker never signs credentials.
- `rules` (trusted `ObservationRule` entries), and optional `applicationPolicy` with
  `policyRuleId` and `allowStructuralDiscovery: true`.

The controller commits the context identity before sending `/context`: the worker creates an
actual isolated `about:blank` page and sends its bootstrap callback during that request. The
controller supplies the frozen inputs, cumulative allocations/producer evidence/consumer edges,
lease and lowered limits from the observed-v2 contract. Successful receiver responses are HTTP
200; authenticated policy/conflict failures return bounded `{code}` with HTTP409, and failed
service authentication returns HTTP401. Mutual TLS handshake failures never reach HTTP.
Callbacks accept HTTP202 and discard a response bounded at1MiB. An outcome acknowledgement
precedes the next observation; a lost acknowledgement never causes the browser operation to retry.

Permanent exclusive journal ownership markers and fsynced consumption records prevent a second
process or restarted worker from recreating a consumed session. A missing/corrupt expected journal
or lost local browser/value context requires a new backend session. Do not delete the journal to
resume a session. Values remain private to this worker and are cleared on teardown. The guided
launch has no video, host report or parent IPC; diagnostic environment switches are refused.
Production account setup, model planning and learned-plan publication are separate fail-closed
ports owned by the later observed-authoring stories. Existing one-shot replay remains unchanged.

Guided native mouse/keyboard operations retain the isolated-world element, verify current document,
origin, classification/type, geometry, deep hit target and focus, then issue public Chromium CDP
input commands. Mouse operations recheck after move and before release. Reads and fills keep their
final validation and operation in the same isolated-world invocation. A refused check before any
browser side effect reports `FAILED/TARGET_CHANGED`; uncertainty begins with focus or native input,
including a lost input acknowledgement, and the worker stops without retry. Public Chromium input
has no atomic retained-node precondition: the guarantee is immediate checks, no locator reacquisition
and no retries, not an atomic transaction with arbitrary application scripts.

Positive generic reads are configured once in the trusted application policy, independently of
structural discovery. Omission means no generic read permission. For example:

```json
{
  "policyRuleId": "application-structure",
  "allowStructuralDiscovery": true,
  "readGrants": [{
    "policyRuleId": "operations-business-values",
    "origin": "https://application.example",
    "region": {"kind": "role", "role": "main", "name": "Operations", "exact": true},
    "visibleText": {"classification": "permittedBusinessData"},
    "controlValue": {"classification": "nonsecretApproved", "types": ["text", "textarea"]}
  }]
}
```

An explicit `{ "kind": "application" }` region grants the named read kinds at the exact approved
origin. A unique matching semantic region takes precedence; conflicting equally specific grants
or duplicate region anchors deny reading. Exact field rules remain optional overrides, and an
explicit `structuralOnly` field rule vetoes broader permission. Visible-text grants support scalar
business surfaces such as named output/status elements and term/value cells; they never authorize
arbitrary subtree capture. Hidden, sensitive, password, unsupported or mixed sensitive descendants
refuse the entire source. The same resolver supplies sanitized metadata, preparation and the final
retained-node read, and privately inventories business values before any observation is exported.

Before sending context, the controller persists an immutable assignment and posts `/assign` without
`X-Owner-Fence`. The actual worker uses its mounted owning-worker credential to call the backend
`/claim`, validates the complete HTTP202 session grant, and returns HTTP200 `OWNED` only while
that acknowledgement is live. No browser is created at assignment. An exclusive durable assignment
marker prevents reacquisition after restart. Repeated live assignments return the latest acknowledged
lease; stopped/expired assignment retries return HTTP409. Confirmed `/stop` returns `STOPPED` for
assignment-scoped teardown and omits the fence header, including cancellation before context.

The worker renews serially approximately every10 seconds with a fresh key, while waiting for
context, executing or awaiting clarification. Only acknowledged same-fence grants extend local
authority. Context timestamps cannot extend that authority or regress a newer acknowledgement;
preparation expiry is capped to the acknowledged lease. Invalid, stale, failed or late renewal
stops without replay or resurrection. Assignment and browser share one capacity reservation until
confirmed teardown. Diagnostic environment switches are rejected before reading credentials or
performing initial claim traffic.

The authenticated, fenced `/observe` control refreshes actual browser evidence between source steps
or after a resolved clarification. It requires the current generation and an idle live context,
invalidates unconsumed preparations, reserves observation capacity before collection, and preserves
captured bindings, action counts and source-step ordinals. Its HTTP200 envelope is returned only
after the owning-worker observation callback receives HTTP202. The callback uses the frozen
`oref-` correlation hash of identity, request key and canonical request digest. Identical concurrent
requests join one collection; changed payloads conflict, and cached evidence cannot be returned as
current after a later generation, action, stop or expiry. Remaining cumulative byte capacity also
bounds the private collector before export. A lost callback acknowledgement stops the worker;
a committed callback with a lost final response can be recovered by the controller from its durable
refresh intent without collecting again.

The private observation inventory survives document replacement and same-document removal. It
retains observed input values, explicitly sensitive text, approved business sources and their
locator-normalized aliases, with the strictest provenance. Its independent internal limits are
4,096 distinct entries and 1 MiB total UTF-8; overflow or collection failure permanently refuses
further export rather than evicting earlier values. The isolated collector transfers this inventory
only to the trusted worker's private session store over CDP. The public observation facade returns
only sanitized evidence. Teardown clears the store and rejects late updates/collection results.
These limits do not raise any public observation or runtime-value cap.

Native check/uncheck verifies the requested checked state on the retained original input after
one native attempt. Prevented/reverted toggles or post-effect identity/type loss return uncertainty;
there is no second click or replacement resolution. Native radio uncheck is unsupported and is
refused during preparation, before effects. Already-satisfied supported toggles remain no-ops.

Guided request bodies, controller responses and JWT segments use fatal UTF-8, duplicate-key and
trailing-data rejection. Numeric tokens must be canonical safe integers (no fraction, exponent or
negative zero); JWT claims are closed to `iss/sub/aud/role/iat/exp` and optional nonnegative `nbf`.
The v2 wire timestamp profile is uppercase UTC `YYYY-MM-DDTHH:mm:ss[.fraction]Z`, with valid
Gregorian dates, seconds00–59 and optional1–9 fractional digits. Offsets, lowercase, whitespace,
leap seconds and excess precision are refused without normalizing signed/hashed data. The bundled
validator audits its supported keywords, formats and resolved references/pointers at startup;
unknown semantics, missing definitions and recursive references cannot silently become permissive
schemas. This supports the currently enforced bridge schemas only.

### Observed replay (artifact 2)

Observed artifacts use the separate `observed-replay-1` execution profile. The authenticated `POST /v2/validate-observed` endpoint independently derives the plan, operation guards, input recipes and binding graph from original immutable evidence. `POST /v2/runs` uses ordinary admission, capacity, the confined recorded child, cancellation, reporting and evidence upload. Legacy artifact 1 validation, AST semantics and protocol 1 remain separate.

Enable validation and replay independently with `STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED` and `STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED` (both default false). Trusted startup supplies `STUDIO_RUNNER_OBSERVED_CATALOG_FILE` containing exactly `{profile,build}`, `STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST`, and `STUDIO_RUNNER_OBSERVED_POLICY_FILE` containing the mounted policy projections. The catalog must match packaged schema/reference hashes, the installed Chromium revision and the independently supplied immutable release image digest. A local build records `observedChromiumBuild` separately; it does not assert container provenance or satisfy `check:pins --require-image`.

The compiled account registry in `run/observedAccount.ts` defaults to unavailable. OBS-007 supplies reviewed account connectivity through consume/prepare/apply/dispose; job data cannot select a module, executable function, credential source or account entry URL. The child consumes and prepares before browser creation, then applies once to that same recorded context. Replay values begin empty and remain private to the child. No model call, guided-session continuation, sampled value or original node/receipt authority is used to execute a saved artifact.

A failed or uncertain account apply never emits Ready or permits an authored action. Real recording evidence may still be retained through the ordinary upload path, with `browserStartedAt` and unavailable timings null. Unexecuted steps are SKIPPED with null readings; no synchronized timeline is claimed for a pre-Ready failure. Captured values, account details and raw child output do not enter diagnostics. Fill/select preserve the fixed isolated DOM primitive; click/check/uncheck/hover/press preserve the retained-target native pointer/key primitive and its uncertainty rules.

Run `node ../tools/build-studio-observed-schemas.cjs` before building after contract changes. `npm run build` packages the closed schemas and fixed independent reference fixtures; `npm run check:pins` rejects stale source/dist bundle hashes. The fixtures tier exercises real Chromium and ordinary recorded replay with a controlled account provider; it does not establish production account connectivity or immutable container identity.
# Accepted observed choices during publication

An accepted observed target choice carries private `ObservedChoiceWitness1` evidence on its original preparation. The pure validator checks the original model attempt, historical plan, question, immutable mapping, acceptance snapshot, original question observation and later preparation independently. It selects only the exact accepted locator; the original operation, authored argument, binding and read permission stay authoritative. Question node IDs may differ from refreshed preparation node IDs. Missing prospective question capture, acceptance receipt or original observation refuses publication, including old learning histories; no proof is reconstructed.

The optional proof is omitted for zero-choice and source-choice publication. Its limits are 2–10 alternatives, 16,384 canonical UTF-8 receipt bytes and 262,144 witness bytes, with at most 200 witnesses. The basis ceiling remains 6,291,456 bytes and the complete validation request ceiling remains 8,388,608 bytes. Question-only observations count in the exact used observation union and in the existing observation budget.

This schema extension preserves the executable profile but changes the packaged schema bundle hash. Backend, pure validator and build catalog must use the exact supported tuple. A revision pinned to an older schema bundle refuses on the new build, even when its executable profile is identical; it requires its retained or re-enabled compatible build. There is no old-to-new pin translation. An old validator cannot receive or ignore the new witness. Rollback therefore refuses new choice publication while preserving stored receipts and saved replay on its supported exact build. Changing a model or prompt default alone does not require relearning a compatible saved artifact.
