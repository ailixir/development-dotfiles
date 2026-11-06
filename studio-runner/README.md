# studio-runner

For local startup and API/worker/runner wiring, see [Studio integration setup](../docs/runbooks/studio-integrations.md).

Validation and execution component of the Checks UI Studio (architecture
[§3](../docs/architecture/studio-execution.md#3-system-architecture), §4.5, §5.2). It is the only
component that launches Chromium and validates data-only observed artifacts against their retained evidence.

Layout, toolchain, pinning, CI stages and deployment placement are fixed by
[ADR-001](../docs/architecture/ADR-001-studio-runner-scaffolding.md). This README documents what the
package does today and the defaults callers can override.

## What ships today

| Module | Responsibility |
|---|---|
| `src/validator/` | Closed observed schemas, immutable evidence/history checks, policy and replay validation; pure and browser-free. |
| `src/executor/` | Trusted data-only observed replay operations, step reporting and outbound redaction. |
| `src/compat/` | Reads `dist/runtime-versions.json` (`loadRuntimeVersions`) and refuses a record that lacks a required identity field. The artifact-1 compatibility check was deleted with its engine (STUDIO-OBS-012A); the observed path proves its runtime through the build identity (`assertBuild`). |
| `src/server/` | Internal observed validation/run/cancel and health routes, the optional guided bridge, capacity, peer/service identity, bounded bodies and redacted logging. |
| `src/reporting/` | The admission CAS **client**, the progress/terminal report client, and the `StepReporter` implementation 10.2 left as a seam. |
| `src/run/` | The real browser: the `BrowserLauncher` that forks a killable child, the data-only parent↔child protocol, the Playwright adapter, the recording lifecycle and evidence vocabulary, the run-scoped clock and the runner error-code set — plus story 10.13's **runtime deadline** (`deadline.ts`), **process-tree kill and observation** (`tree.ts`) and **captured, redacted child output relay** (`outputRelay.ts`). |
| `src/main.ts` | Process entry: configuration, server start, `SIGTERM` drain, scratch clearing at startup and on exit. |
| `src/versions.ts` | `OBSERVED_CONTRACT_VERSION` only. The artifact-1 stamps were retired by STUDIO-OBS-009 AC-1 P2; the executable pins are the `const`s of the generated v3 schemas. |

Evidence upload and durable result manifests are implemented under `src/run/`
(`evidenceUpload.ts`, `manifest.ts` and the object-store adapters). `STORED` follows an
acknowledged write; scratch is cleared after the bounded evidence window.

## The two budgets (story 10.13)

**Queue time and browser runtime are separate budgets** (§8.5), with distinct timestamps, and
neither consumes the other.

| Budget | Measured from | Bound | Enforced by |
|---|---|---|---|
| **Queue** — admitted-start | `admittedAtMs`, the instant the admission CAS returned | `job.deadlines.admittedStartMs` (§8.5 starting value 30 s) | a **refusal** in `runCoordinator`: `ERROR` / `START_DEADLINE_EXCEEDED`, no browser started |
| **Runtime** — total browser | the `ready` handshake, and nothing else | `min(job.deadlines.totalRuntimeMs, STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS)` (§5.2, §8.5, default 300 s) | **enforcement**: ordered stop, bounded grace, process-tree kill → `ERROR` / `TIMEOUT` |
| **Step** — per-step | step start | `min(timeoutSeconds×1000, run deadline)`; ceiling `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` = 120 000 (contract max, loader-enforced) | observed jobs above it refused `LIMIT_EXCEEDED` |

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

## What a resolved value may touch

An observed replay job carries authored `inputs`, resolved `secrets` and `secretOrigins` for
run-scoped use. Never persist resolved values in jobs, retry queues, manifests or diagnostics.

**Observed job validation comes before capacity and admission.** `runCoordinator` validates
the closed observed job against its build identity and policy before reserving a slot.
The child-output relay and report paths use the run's redactor. After the bounded evidence
phase, the coordinator clears scratch and wipes input and secret values before terminal
delivery. The former artifact-1 `resolvedVars` correspondence validator is retired.

## Run locally

No Docker. `./dev.sh` (Git Bash, macOS, Linux) runs the same launcher with the same flags. Prerequisites: Node 24 (`.nvmrc`), `openssl` and a JDK `keytool` (JDK 21, `JAVA_HOME`).

```bash
node scripts/dev.mjs   # from studio-runner/: build, prepare the shared files, start the runner on https://127.0.0.1:8090
```

It runs in the foreground; Ctrl+C drains the runner (up to 30 s) and stops its token issuer. Start order is
**runner, then the backend, then the frontend** (`node scripts/dev.mjs` in `backend/` and in `frontend/`). The backend
without the runner's files still starts, but Studio runs close `ERROR/DISPATCH_FAILED`.

`scripts/dev.mjs` depends on this folder only. It checks Node, `npm`, `openssl` and `keytool`, runs `npm ci` when
`node_modules` is missing, installs the pinned Chromium when it is missing (into `PLAYWRIGHT_BROWSERS_PATH`, default
`$PUT_CHECKS_LOCAL_DIR/ms-playwright-<pinned playwright version>`, outside the repository, so a checkout on another
Playwright pin can never make the root mixed-version), and runs
`npm run build`. It then frees the port: the runner's PID file (`pids/studio-runner.json` in the shared directory)
names a leftover of this checkout, which is stopped only while it is alive and the port is still busy; any other
listener (found by a connect and bind test, no `lsof`) is reported and left alone. It runs
`scripts/local-stack.mjs init`, starts `scripts/local-tokens.mjs` (which exits on its own once the launcher is gone),
and spawns the runner with an explicit environment: exactly `runner-environment.json` (its config loader refuses any
unknown `STUDIO_RUNNER_*` key). Guided learning (capacity 1) and observed replay are on. Per-developer overrides go in
`studio-runner/.env.local` (gitignored; dotenv `KEY=value` lines, taken literally, no `$VAR` expansion).

Stopping: on macOS and Linux the runner and the issuer run in their own process groups, so Ctrl+C reaches only the
launcher, which sends SIGTERM to the runner's PID (KILL after 30 s). On Windows the console delivers Ctrl+C to the
runner and the issuer directly; the launcher waits 30 s and then ends anything left with `taskkill /PID <pid> /T /F`.

### The shared directory

The runner and the backend share state only through `$PUT_CHECKS_LOCAL_DIR` (default `~/.put-checks/local`, mode
700, every file 0600 on macOS and Linux; Windows has no mode bits, so there the per-user ACL of your profile folder
protects it and the mode checks are skipped). `init` is idempotent: it reuses what is valid, so a restart of either side keeps the same identity.

| Path | Holds |
|---|---|
| `tls/` | local CA, runner and backend leaves, `backend.p12`, `trust.p12`, store password, health probe files |
| `identity/service.token`, `identity/callback.token` | the two bearer identities (backend to runner, runner to backend) |
| `issuer/issuer.{private,public}.pem`, `tokens/*.jwt` | guided-bridge issuer key and the 240 s service JWTs, refreshed every 30 s |
| `catalog.json`, `backend-overlay.yml` | the runner build's observed catalog; the backend's guided/replay overlay (public values only) |
| `backend.env` | dotenv `KEY=value` lines the backend launcher reads: runner URL, both tokens, its TLS stores, local evidence store, overlay location (a `file:` URL) |
| `runner-environment.json`, `journal/`, `objects/`, `scratch/`, `tmp/`, `logs/` | the runner's environment and working data; `objects/` is also what the backend plays back; `logs/runner.log` is the runner's log |
| `pids/` | the launchers' PID files (`studio-runner.json`, the backend's `backend.json` and `core.json`, the frontend's `frontend.json`) |

Certificates and the CA are valid 30 days and are regenerated when they would expire within a day.

### Ports and environment

| Variable | Default | |
|---|---|---|
| `PUT_CHECKS_LOCAL_DIR` | `~/.put-checks/local` | shared directory |
| `PUT_CHECKS_RUNNER_PORT` | 8090 | the runner |
| `PUT_CHECKS_BACKEND_PORT` | 8080 | where the runner reports back |
| `PUT_CHECKS_GUIDED_PORT` | 8092 | the backend's guided connector |
| `PLAYWRIGHT_BROWSERS_PATH` | `$PUT_CHECKS_LOCAL_DIR/ms-playwright-<pinned playwright version>` | where the pinned Chromium is installed and launched from (one revision only) |
| `PLAYWRIGHT_DOWNLOAD_HOST` | Playwright's CDN | the mirror the launcher's Chromium install downloads from |
| `STUDIO_ALLOW_ALL_DOMAINS` | unset (on) | `true`/`false`, passed to the runner as `STUDIO_RUNNER_ALLOW_ALL_DOMAINS` |
| `STUDIO_RUNNER_SERVICE_TOKEN`, `STUDIO_CALLBACK_SERVICE_TOKEN` | stored | use these identities instead |

Navigation is limited to `localhost,example.com,practicetestautomation.com` unless allow-all is on (the default
for now), the same list the backend's `application-local.yml` carries.

### Restarting

The runner can restart alone: the same CA, tokens and keys come back, so a running backend keeps dispatching. After a
rebuild that changes the observed catalog (or after TLS is regenerated) the launcher prints "restart the backend", because
the backend reads `catalog.json` and its key stores at start.

### Your own TLS identities

To supply your own, set all eight keys; a partial or invalid set fails before anything is stopped and is never mixed
with generated trust: `STUDIO_RUNNER_TLS_KEY_FILE`, `STUDIO_RUNNER_TLS_CERT_FILE`, `STUDIO_RUNNER_TLS_CA_FILE`,
`STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256` (backend leaf, uppercase colon-separated SHA256),
`STUDIO_RUNNER_TLS_KEY_STORE`, `STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE`, `STUDIO_RUNNER_TLS_TRUST_STORE`,
`STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE`. `..._KEY_STORE_TYPE` and `..._TRUST_STORE_TYPE` default to `PKCS12`
(`JKS` is accepted). Key, store and password files must have no group/other permissions (checked on macOS and Linux); leaves need loopback SANs and
both serverAuth and clientAuth usages; the runner CA file authenticates the backend, the backend trust store
authenticates the runner (they may be independent issuers). Operator files are left untouched.

The helper's checks run with `node --test scripts/local-stack.check.mjs` (temporary directories and an owned mTLS
listener; they touch no port you run). They also cover the launcher's PID files, bind test and Windows environment. `npm run test:fixtures` is the real-browser tier; `../tools/corun.sh` is the
automated backend-plus-runner run.

### Windows

**Windows: not verified.** No Windows run is recorded yet; everything below follows from Node, libuv and Playwright
documentation until one is.

Local development only: production stays the Linux image. Prerequisites, natively (no Docker, no WSL):

- **Node 24** and npm.
- **JDK 21** with `JAVA_HOME` set (the launcher uses `%JAVA_HOME%\bin\keytool.exe`).
- **Git for Windows**: it ships `openssl.exe`, which the launcher finds on PATH or under the Git install
  (`Git\mingw64\bin`, then `Git\usr\bin`).
- `git config --global core.longpaths true` and a **short clone path** (for example `C:\src\put-checks`).
- A **non-admin shell** (the backend's embedded Postgres refuses an elevated one).
- `PLAYWRIGHT_DOWNLOAD_HOST` pointing at the bank Artifactory mirror, so the launcher can install the pinned Chromium.

Start it the same way: `node scripts/dev.mjs`. Ctrl+C stops it (see "Stopping" above). On Windows the shared directory
is `%USERPROFILE%\.put-checks\local`, protected by the profile ACL instead of mode bits.

The checks run natively too: `npm ci`, `npm run type-check`, `npm run lint`, `npm run check:pins`,
`npm test -- --coverage.enabled=false` (coverage stays a Linux gate) and `npm run build`; `ci/stages.md` has the stage.

Linux-only, and staying so: the image build, the deployment tier (`npm run test:deployment`, needs Helm and a
container runtime), the perception tier (`test:perception`, machine-bound), Helm, and the frontend's realsite-gate
(needs Docker).

## The real browser (story 10.12)

**The browser is real from this story onward.** `src/main.ts` no longer ships a launcher that
refuses; it wires `createChildBrowserLauncher`, and an admitted run starts pinned Chromium.

### Where the browser runs, and what it may touch

One browser, one context, one page, per run, **in a child process** that exits on every path —
success, step failure, launch failure, error. The parent's `/v2/validate-observed`, `/health`, `/ready` and
`/v2/runs` stay responsive throughout, on separate bounded resources.

The child is forked with **no arguments** and an enumerated environment (`PATH`, `HOME`, `LANG`,
`LC_ALL`, `NODE_OPTIONS`, `PLAYWRIGHT_BROWSERS_PATH`, `DISPLAY`, `XDG_RUNTIME_DIR`, plus `TMPDIR`
pointed at the run's scratch). Nothing in the runner's own `STUDIO_RUNNER_*` namespace is passed
on: the process that opens untrusted pages holds no runner configuration and no service identity.
Resolved variables and secrets travel over the IPC channel and **only** there — never in `argv`,
never in the environment, never in a spawn command line.

Everything Chromium writes goes under the per-run scratch directory — `browser-profile/`, `video/`,
`downloads/`, `traces/`, `tmp/` — which is cleared on success, step failure, launch failure, error
and drain. The bounded evidence window uploads the recording and durable result manifest
before scratch is cleared; an acknowledged object write earns `STORED`. Upload failure is
reported without replacing a known assertion outcome.

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
| `POST /v2/validate-observed` | Browser-free observed validation against immutable evidence and policy; takes no capacity slot. |
| `POST /v2/runs` | Closed observed job → capacity slot → observed admission → `202`; no browser starts before admission. |
| `DELETE /v2/runs/{id}` | Cancels an admitted run through ordered stop, bounded grace and process-tree observation. |
| `GET /health` | Liveness only. Stays `200` while saturated **and** while draining. |
| `GET /ready` | Ability to admit safely. Saturation alone keeps it **true**; only draining makes it false. |

The TLS listener requires a CA-verified client certificate. Replay routes pin the backend peer
before checking the service bearer on the request head; exec health probes accept the
controller or self peer. The optional guided bridge has its own peer pin and JWT. There is
no credential in a URL or query string.

### Saturated is not draining

These are different conditions with different answers, and conflating them is a real defect:

| Condition | `/v2/runs` | `/ready` | Why |
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

`SIGTERM` runs, in this order: readiness goes false → new `/v2/runs` is refused `503` → the
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
npm run test:fixtures  # real-browser observed replay and controlled-page fixtures
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

Observed artifacts are data. Closed schemas and independent evidence/policy checks derive
the permitted replay plan; the trusted executor performs its typed operations. The retired
artifact-1 TypeScript AST language is no longer an execution path. Dynamic evaluation of
artifact content remains forbidden by the boundary lint and emitted-output checks.

Validation cannot establish an author's intent or replace destination and secret-use policy.
Those controls remain mandatory at their existing boundaries.

### Secrets

Observed login uses a `secretRef` in a `fill.value` operation and the trusted
password-control path. The adapter checks the origin and permitted operation before the
fill. Secret values are run-scoped, and outbound diagnostics pass through the redactor.
See [secret-login-design.md](../docs/specs/studio-observed-authoring/secret-login-design.md)
for the login boundary and residuals. Redaction covers known values; it is not proof that
arbitrary authored text contains no credential.

On the outbound path the redactor runs over the **serialized** payload — the request body string
handed to the HTTP client and the line handed to the log sink — never over the objects behind them.
A field added to a report next year is therefore scrubbed automatically, rather than escaping
because nobody remembered to add it to a redaction list.

### Isolation: no DB, no vault, no CSI, no LLM

Architecture §9.2: *"the runner … has no platform user session or DB/vault/CSI/LLM credentials"*.
This is the component that renders untrusted pages, so it must hold no credential to anything else.
Three build-gated parts enforce it:

1. **Allowlist over the resolved production dependency closure** (`test/isolation.test.ts`). The
   lockfile's transitive non-dev closure must equal the explicit list in `test/isolation.test.ts`, including Playwright, TypeScript and
   the S3 SDK's allowed runtime dependencies. **Any** package not on the list fails, whatever it is. This
   is the part that catches the client nobody predicted; a denylist only fails for one somebody did.
2. **Named-module lint rules** (`eslint.boundary-rules.js` `MODULE_GROUPS`), with one proving
   fixture per entry under `fixtures/lint/`. A fast, readable second line of defence.
3. **The configuration surface** — see above.

What they cannot prove: they stop the runner *linking* a client, not reaching a database over plain
HTTP through a dependency it already has. The complement is the configured outbound destination
allowlist — callback API, object store, target page, and nothing else.

ADR-001 §5 allowed this story one HTTP server library. It took none: `node:https` (the one TLS listener,
client certificate required) covers the small route surface with no middleware, so the closure did not grow.

## Current validation bounds and fixtures

Observed byte limits are defined by `OBSERVED_LIMITS` in
`src/validator/observedReferencePolicy.ts`; the packaged closed schemas and trusted replay
policy provide the remaining validation bounds. The retired artifact-1 AST bounds,
accepted-language table and `fixtures/reference` / `fixtures/adversarial` corpora do not
apply to this path.

`fixtures/lint/` retains the boundary-rule proving inputs. `fixtures/pages/` supplies
controlled local pages for the real-browser tier. The observed schema/reference bundles
and replay fixtures are described under [Observed replay](#observed-replay-artifact-2).

## Versions

`npm run build` writes `dist/runtime-versions.json` with the declared, locked and image copies of the
Playwright pin plus the Chromium build, Node and the observed identities (`observedSchemaBundleHash`,
`observedReferenceBundleHash`, `observedChromiumBuild`, `observedBrowserProvenance`,
`observedBrowserLauncherSha256`). The artifact-1 version stamps are not recorded and nothing
replaces them (architecture §4.6, ADR-001 §4.2; STUDIO-OBS-009 AC-1 P2).

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

`.nvmrc` and `engines.node` pin the **same single major**, and `check:pins` asserts that they do:

| Copy | What it pins | Asserted how |
|---|---|---|
| `.nvmrc` (`24`) | the Node major **the pinned image ships** (`mcr.microsoft.com/playwright:v1.63.0-noble` carries Node v24.20.0) | equals the `engines.node` floor major; and equals the major of the recorded `node` whenever the record came from inside the pinned image |
| `engines.node` (`>=24.11.0 <25.0.0`) | what the package is allowed to be installed and built on: Node 24 LTS, patch releases only | the recorded `node` must satisfy it, everywhere |

There is one supported Node major and no second path. A developer machine on any other major
(Node 23 or 22 included) is not supported: `engine-strict=true` rejects the install and
`check:pins` rejects a build recorded on it. ADR-001 §3 defines `.nvmrc` as the Node major shipped
by the pinned Playwright image, so it follows the image: a Playwright bump whose image ships a new
Node major moves `.nvmrc` and `engines.node` in that same change (see the upgrade procedure).
"Inside the image" is read off the record — a recorded `chromiumBuild` exists only under the
image's `PLAYWRIGHT_BROWSERS_PATH` — so it cannot be asserted by a flag, and dropping it to dodge
the rule fails `--require-image` on the missing field instead.

> **Resolved (`ED-05`, O-2a).** The pins used to say 22 while the public base image shipped Node
> v24.20.0, which made `check:pins --require-image` fail by design. The pins now follow the image
> (ADR-001 §4.2 amendment). The internal image `ED-05` delivers must keep the `v<version>-<distro>`
> tag convention and ship Node 24; `check:pins --require-image` is what proves it.

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
4. **Run the current unit and real-browser tiers** — `npm test` and `npm run test:fixtures`
   inside the pinned image. Use the observed validation/replay and controlled-page fixtures;
   the deleted artifact-1 corpora cannot establish current compatibility.
5. **Compatibility is the build identity, not a rule table.** The artifact-1 per-field rule table
   was deleted with its engine (STUDIO-OBS-012A). The observed path compares the bundle hashes,
   the Chromium build and the launcher hash it reports (`assertBuild`), so a bump that changes any of
   them is visible in the next run's identity. Do not reintroduce a range rule speculatively.
6. **Existing recorded runs.** A run records the identity it ran under. After the bump new runs
   report the new identity; preserve the old runs and do not reinterpret them.
7. **Never rewrite approved source.** A new observed revision requires explicit learning and
   publication. An upgrade does not silently reinterpret an artifact under the new runtime;
   the exact supported build tuple governs replay compatibility.

### Runtime compatibility

`src/compat/` reads the `runtime-versions.json` this build emitted and fails closed when a required
field is missing or empty: `playwright`, `observedSchemaBundleHash`, `observedReferenceBundleHash`,
`observedChromiumBuild` and `observedBrowserLauncherSha256`. There is no fallback to an older field.
The artifact-1 per-field rules and its compatibility check were deleted with the artifact-1 engine
(STUDIO-OBS-012A); the observed path proves its runtime through the build identity instead.

## Node version

`.nvmrc` pins the Node major shipped by the Playwright image (24). `engines.node` is
`>=24.11.0 <25.0.0`: Node 24 LTS, patch releases only. `engine-strict=true` rejects anything outside
the range, and story 10.3's CI check asserts the Node version inside the image against `.nvmrc`.

### Guided observed-2 worker

Guided mode is a **mode of the one runner process** (STUDIO-OBS-009 AC-1): `node dist/main.js` with
`STUDIO_RUNNER_GUIDED_ENABLED=true`, served by the same TLS listener as the replay routes. There is no
second entry point, no second start script and no mounted JSON file. Build with `npm run build`; the
configuration is environment keys, every one a `STUDIO_RUNNER_*` name the loader enumerates:

- Every deployment, guided or not: `STUDIO_RUNNER_TLS_KEY_FILE`, `STUDIO_RUNNER_TLS_CERT_FILE` (the leaf
  first; it needs `serverAuth` and `clientAuth`, or no extended key usage), `STUDIO_RUNNER_TLS_CA_FILE`
  and `STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256` (the backend's client certificate, 32
  upper-case hex pairs joined by `:`). `STUDIO_RUNNER_HOST` and `STUDIO_RUNNER_PORT` are the one listener's.
- Every deployment: `STUDIO_RUNNER_ALLOWED_DOMAINS`, the navigation whitelist (see below). Comma-separated, no
  trimming, empty or unset denies every navigation; an invalid value exits 78 and the list is logged at startup.
- Optional: `STUDIO_RUNNER_ALLOW_ALL_DOMAINS`, `true` or `false` exactly (unset or empty is `true`, the default for now; anything else exits 78). On, any
  http(s) URL whose host is a DNS name is allowed, the list is ignored (still validated), and one WARN line is written at startup.
- With the switch on, all eight are required, and with it off any of them is refused:
  `STUDIO_RUNNER_GUIDED_WORKER_ID` (equal to the backend's `translation.worker-id`),
  `..._JOURNAL_DIR` (persistent, private, disjoint from `SCRATCH_DIR` and `OBJECT_STORE_DIR`),
  `..._CONTROLLER_ISSUER`, `..._CONTROLLER_SUBJECT`, `..._CONTROLLER_PUBLIC_KEY_FILE`,
  `..._CALLBACK_BASE_URL` (https only; its own key, never derived from `CALLBACK_BASE_URL`) and
  `..._CALLBACK_TOKEN_FILE`; the issuer-issued worker token is reread for each callback so an external
  credential mount can rotate it. The worker never signs credentials. `..._CAPACITY` (1 to 8) is how many
  learning sessions this one process owns at once; the next assignment is refused `CAPACITY`. Each session
  has its own runtime, browser, journal and recording.
- There is no policy-hash key (the hash arrives in the hash-bound runner context).

Startup order and refusals: configuration (exit 78, one `configuration rejected:` line per problem), the
process table (69), then with guided on the debug environment (`CONFIGURATION_DENIED DEBUG_ENV`, 78), the
build identity (`GUIDED_WORKER_UNAVAILABLE`, 1), `canEnumerateLaunchTree()` including pid greater than 1
(`CONFIGURATION_DENIED LAUNCH_TREE`, 78), the TLS files, and the recording-scratch sweep; only then does
anything listen. Any other failure is `RUNNER_START_FAILED` (1). Each is one value-free line.
`SIGTERM` runs one drain for both halves and exits 1 only when a guided stop could not be confirmed.

Nothing else. What the worker may observe or read is not mounted configuration: a mounted `rules` key,
in any form, is an unenumerated `STUDIO_RUNNER_*` name and the runner refuses to start;
`createGuidedBridge` refuses it as an option with `CONFIGURATION_DENIED`. The observation read profile
is one constant of the runner (`src/run/observationReadProfile.ts`), applied to the navigation whitelist
(one grant per entry): nothing in the context, the configuration or the backend can widen it. Guided
learning uses no field rules.

The controller commits the context identity before sending `/context`: the worker creates an
actual isolated `about:blank` page and sends its bootstrap callback during that request. The
controller supplies the frozen inputs, cumulative allocations/producer evidence/consumer edges,
lease and lowered limits from the observed-v3 contract. Successful receiver responses are HTTP
200; authenticated policy/conflict failures return bounded `{code}` with HTTP409, and failed
service authentication returns HTTP401. Mutual TLS handshake failures never reach HTTP.
Callbacks accept HTTP202 and discard a response bounded at1MiB. An outcome acknowledgement
precedes the next observation; a lost acknowledgement never causes the browser operation to retry.

Permanent exclusive journal ownership markers and fsynced consumption records prevent a second
process or restarted worker from recreating a consumed session. A missing/corrupt expected journal
or lost local browser/value context requires a new backend session. Do not delete the journal to
resume a session. Values remain private to this worker and are cleared on teardown. The guided
launch has no video, host report or parent IPC; diagnostic environment switches are refused.
Secret references use names-only recipe metadata and a transient run-scoped secret inventory.
The password candidate count, admission and fill share the isolated collector's single definition;
password reads are refused. Ordinary observed replay uses frozen recipes without model calls.

Guided native mouse/keyboard operations retain the isolated-world element, verify current document,
origin, classification/type, geometry, deep hit target and focus, then issue public Chromium CDP
input commands. Mouse operations recheck after move and before release. Reads and fills keep their
final validation and operation in the same isolated-world invocation. A refused check before any
browser side effect reports `FAILED/TARGET_CHANGED`; uncertainty begins with focus or native input,
including a lost input acknowledgement, and the worker stops without retry. Public Chromium input
has no atomic retained-node precondition: the guarantee is immediate checks, no locator reacquisition
and no retries, not an atomic transaction with arbitrary application scripts.

Positive generic reads are granted by the observation read profile, independently of structural
discovery (`src/run/observationReadProfile.ts`). It is one constant for every test: structural
discovery on, and for every allowed origin one grant with `region: {"kind": "application"}` and
`visibleText: {"classification": "permittedBusinessData"}`. No `controlValue` grant exists, so no field
value is ever readable. The grant id is a pure function of the origin (`readGrantId`), so a read
recipe learned in a session replays under the same grant in any process. Visible-text grants support
scalar business surfaces such as named output/status elements and term/value cells; they never
authorize arbitrary subtree capture. Hidden, sensitive, password, unsupported or mixed sensitive
descendants refuse the entire source. The same resolver supplies sanitized metadata, preparation and
the final retained-node read, and privately inventories business values before any observation is
exported.

### Navigation whitelist and the return window

`STUDIO_RUNNER_ALLOWED_DOMAINS` is the only navigation control (`src/allowedDomains.ts`, shared vectors in
`docs/specs/studio/allowed-domains-vectors.json`). It is per-environment deployment configuration; the
backend checks its own copy of the same list. An entry is a lowercase punycode host suffix (no wildcard, IP
literal, scheme, port, path, trailing dot or uppercase; at most 32; none a suffix of another). A host matches
an entry when it equals it or ends with `"." + entry`, so `evilciti.com` never matches `citi.com`. Pages may
use `http` or `https` on any port. There is no egress proxy: reachability is the network's business.

With `STUDIO_RUNNER_ALLOW_ALL_DOMAINS=true` (ON by default for now, per environment, rendered by the chart from the same value as the
backend's `studio.navigation.allow-all-domains`) the list is ignored and `domainAllowed` accepts any URL `hostOf` accepts: an
`http(s)` DNS name, still no userinfo or IP literal. The effective list is the single entry `*` (`ALL_DOMAINS`; a wildcard can
never be a configured entry), `entryForHost` returns the page's own host, and the read profile carries one grant for `*` that the
in-page collector matches against the host it is on. `test/fixtures-tier/allow-all-navigation.test.ts` drives it in Chromium.

- Author-directed navigation (a Studio step's destination, replay's first navigation) must be on the list and
  is refused before any request leaves.
- Anything a page does itself is not filtered: a link, a script, a form post, a `30x` chain, iframes and
  subresources may use any host.
- Whenever the runner needs the page (an observation, a replay step's guard) and the main frame is on a host
  off the list (an SSO hop, say) it waits up to 15 s (`RETURN_WINDOW_MS`, bounded further by a replay step's
  own deadline) and observes and does nothing meanwhile. Back on the list, work continues. Otherwise learning
  ends (`ORIGIN_NOT_ALLOWED`, the host name only in diagnostics) and the replay step is refused
  `POLICY_REFUSED`. An identity provider that shows its own login form must be listed, because filling it is
  an action. A popup is still closed, so SSO in a popup is unsupported.
- Read grants are one per list entry, keyed by the entry and matched on the page's hostname; a list that no
  longer holds an entry refuses a learned read (`READ_REFUSED`). A password fill needs the page on the secret's
  own origin list and on this list. Each replay step stays pinned to the exact origin it learned on.

Enable validation and replay independently with `STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED` and `STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED` (both default false). Trusted startup supplies `STUDIO_RUNNER_OBSERVED_CATALOG_FILE` containing exactly `{profile,build}`, and `STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST`. The catalog must match packaged schema/reference hashes, the installed Chromium revision and the independently supplied immutable release image digest. A local build records `observedChromiumBuild` separately; it does not assert container provenance or satisfy `check:pins --require-image`.

Observed login is author-owned: a `<secret ID>` source becomes a value-less `secretRef` input/recipe. Guided delivery carries the value only on its admitted dispatch frame; replay resolves all declared values once per run and uses value-less child metadata to bind each secret ID to its declaring step and `fill.value` slot. The child has no account provider or cookie import and invokes no model during replay.

Secrets fill only the unique rendered, enabled password input in the top-level document, including open shadow roots. The count, preparation and fill share one isolated-world candidate definition. An off-screen rendered decoy counts; frames and closed shadows do not. The prepared element must remain the same attached password input, with unchanged document/generation/mutation/navigation identity. Document origin must belong to both the secret-origin list and the navigation whitelist, and an owning form action must remain within the secret-origin list. Multi-password pages and secret fills into non-password controls are unsupported at GA; absence/ambiguity refuses with nothing typed, and there is no fallback adapter. Password value assertions and reads are refused.

Both launch modes use a persistent scratch profile with a prewritten `Preferences` file disabling credential/password saving, profile/credit-card autofill and session restore. Chromium launch refuses a missing or unsafe file. Controlled tests scan profile bytes before context close and scratch cleanup, recording the exact browser version in evidence. Transient Chromium files, in-memory strings and operator dumps remain stated operational residuals; masked video frames require the manual OBS-009 inspection.

Secret-bearing observed runs and guided contexts recheck names-only authorization on an absolute one-second cadence, with a one-second response deadline. Denial, malformed authority or a missed deadline stops locally before another step; a step already in flight may complete. `LOGIN_REQUIRED` annotates an existing drift/refusal only, using password count plus an actionable exported button/input. Registration/change-password pages can match this signature; passing steps remain passing. Custom password widgets and SSO origins off the whitelist are outside that signature.

Replay usage reports contain only confirmed `USED`, proven pre-effect `REFUSED`, and proven unreached `NOT_USED` facts. An interrupted invocation or missing child result leaves its uncertain entry absent; later faults retain confirmed use. Guided failure diagnostics redact released secrets and known values before bounds or writes. The optional callback `errorMessage`, stderr text, and private bounded per-session diagnostic JSONL carry the same redacted text. The separate diagnostic file has no consume/recovery authority; its delivery failure cannot change a completed verdict. Raw errors are never serialized wholesale.

Run `node ../tools/build-studio-observed-schemas.cjs` before building after contract changes. `npm run build` packages the closed schemas and fixed independent reference fixtures; `npm run check:pins` rejects stale source/dist bundle hashes. The fixtures tier exercises real Chromium and ordinary recorded replay with controlled secret fixtures; it does not establish production authorization, credential-hop TLS provisioning or immutable container identity.
# Accepted observed choices during publication

An accepted observed target choice carries private `ObservedChoiceWitness1` evidence on its original preparation. The pure validator checks the original model attempt, historical plan, question, immutable mapping, acceptance snapshot, original question observation and later preparation independently. It selects only the exact accepted locator; the original operation, authored argument, binding and read permission stay authoritative. Question node IDs may differ from refreshed preparation node IDs. Missing prospective question capture, acceptance receipt or original observation refuses publication, including old learning histories; no proof is reconstructed.

The optional proof is omitted for zero-choice and source-choice publication. Its limits are 2–10 alternatives, 16,384 canonical UTF-8 receipt bytes and 262,144 witness bytes, with at most 200 witnesses. The basis ceiling remains 6,291,456 bytes and the complete validation request ceiling remains 8,388,608 bytes. Question-only observations count in the exact used observation union and in the existing observation budget.

This schema extension preserves the executable profile but changes the packaged schema bundle hash. Backend, pure validator and build catalog must use the exact supported tuple. A revision pinned to an older schema bundle refuses on the new build, even when its executable profile is identical; it requires its retained or re-enabled compatible build. There is no old-to-new pin translation. An old validator cannot receive or ignore the new witness. Rollback therefore refuses new choice publication while preserving stored receipts and saved replay on its supported exact build. Changing a model or prompt default alone does not require relearning a compatible saved artifact.
