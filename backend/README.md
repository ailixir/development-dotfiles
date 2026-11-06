# PUT Checks — Backend

Spring Boot 3.3 · Java 21 · Gradle (Kotlin DSL).

Part of the [Project Checks monorepo](../README.md). Frontend lives under `../frontend/`.

---

## Prerequisites

- **JDK 21** (temurin-21 recommended). Gradle toolchains will auto-download if your default JDK is older, but a system JDK 21 is faster.
- **No local Postgres needed for M1.** Story 1.2 wires Zonky embedded Postgres (runs in-process) for the `local` profile; the tests use Zonky embedded Postgres 15.6 too, one shared instance per test JVM, so no Docker is needed.
- **Node** (24, like the runner) for the local launcher and the Core stand-in.

### Citi Artifactory access

On a Citi VDI, put personal Artifactory credentials in your user-level Gradle properties file, not in this repository:

```properties
# ~/.gradle/gradle.properties
citiMavenRepositoryUrl=https://<artifactory-host>/artifactory/<maven-virtual-repo>
citiGradlePluginRepositoryUrl=https://<artifactory-host>/artifactory/<gradle-plugin-virtual-repo>
citiArtifactoryUser=<SOE ID>
citiArtifactoryPassword=<Artifactory identity token>
```

`citiGradlePluginRepositoryUrl` can be omitted when the Maven virtual repository also proxies the Gradle Plugin Portal. Existing `citiEarUser` / `citiEarPassword` properties are also supported as aliases.

If the Gradle wrapper distribution itself is served from an authenticated Artifactory URL, also set:

```properties
systemProp.gradle.wrapperUser=<SOE ID>
systemProp.gradle.wrapperPassword=<Artifactory identity token>
```

---

## Canonical commands

Run from `backend/`:

| Command | Purpose |
|---|---|
| `node scripts/dev.mjs` (`--seed` for sample data) | Run the backend locally on `:8080` with hot reload and the Core stand-in; see [Run locally](#run-locally). Health probe: `GET /actuator/health` → `{"status":"UP"}`. |
| `./gradlew check` | Full quality gate: Spotless (format), Checkstyle, SpotBugs, JUnit 5, JaCoCo 80% line coverage. |
| `./gradlew bootJar` | Build the executable jar at `build/libs/checks-backend-0.1.0-SNAPSHOT.jar`. |

Useful extras:

| Command | Purpose |
|---|---|
| `./gradlew spotlessApply` | Auto-format all Java sources to google-java-format. |
| `./gradlew test` | JUnit 5 only (skips lint + coverage gate). |
| `./gradlew jacocoTestReport` | Produce HTML coverage at `build/reports/jacoco/test/html/index.html`. |

---

## Profiles

Five Spring profiles are defined. Activate via `--spring.profiles.active=<name>` or `SPRING_PROFILES_ACTIVE=<name>`:

| Profile | Purpose | State |
|---|---|---|
| `local` | Local dev (Zonky embedded Postgres) | Clean schema, no sample data. |
| `dev` | Local dev + sample data (Zonky embedded Postgres) | Pre-populated platform data; Studio starts empty. |
| `test` | Integration tests (embedded Zonky Postgres, no Docker) | `test`-profile classes share one `checks` database per JVM; classes that had their own container get a fresh database. |
| `staging` | Staging environment (env-var driven) | Placeholder; ready for 5.x stories. |
| `prod` | Production (env-var driven) | Placeholder; ready for 5.x stories. |

### Dev profile (sample data for development and demos)

```bash
node scripts/dev.mjs --seed
```

Starts the app (profiles `local,dev`) with Zonky embedded Postgres pre-populated with realistic sample data:
- **3 CSI systems** at different health levels (healthy, degraded, green)
- **15 checks** (HTTP + TCP) with valid configurations
- **~450 execution results** spanning 28 days with mixed statuses
- **12 schedules**, **8 tags**, **3 reports**, **2 secrets**
- **No Studio tests or run history** — those appear only after a real save and run
- Materialized view `csi_metrics_current` refreshed with live metrics

Use for development, frontend integration, and stakeholder presentations.

---

## Run locally

One command, no Docker (Windows, macOS and Linux). `./dev.sh` (Git Bash, macOS, Linux) runs the same launcher with the
same flags:

```bash
node scripts/dev.mjs          # backend (local profile) + Core stand-in
node scripts/dev.mjs --seed   # same, with sample CSIs, checks and executions (local alone has none)
```

Needs JDK 21 (`JAVA_HOME`, else `java` on PATH; on macOS it also looks in `java_home`, Homebrew and `~/.jdks`;
otherwise Gradle provisions one) and Node (it runs the launcher and the Core stand-in). The script runs in the
foreground and Ctrl+C stops only what it started. Its PID files (`pids/backend.json` for the bootRun JVM,
`pids/core.json` for the stand-in, in the shared directory below) name a leftover of this checkout, which is stopped
when it still holds its port; any other process on a port (found by a connect and bind test, no `lsof`) is reported
and left alone. The bootRun JVM is forked by the Gradle daemon, so the launcher learns its PID from `/actuator/info`
(`MANAGEMENT_INFO_PROCESS_ENABLED=true`, set for this local run only). On macOS and Linux each child runs in its own
process group and is stopped with SIGTERM (KILL after the grace period). On Windows the console delivers Ctrl+C to
Gradle and the stand-in directly, and whatever is left after the grace period is ended with `taskkill /PID <pid> /T /F`.

**Start order.** Three components, each in its own terminal and each with its own `node scripts/dev.mjs`:
the studio-runner, then the backend, then the frontend. The backend works without the runner, but a Studio run then
closes `ERROR`/`DISPATCH_FAILED` (the script warns "studio-runner not prepared"). If you rebuild the runner and its
catalog changes, restart the backend.

**Shared directory.** `PUT_CHECKS_LOCAL_DIR` (default `$HOME/.put-checks/local`) is the only thing the
components share. The studio-runner launcher writes `backend.env` there (dotenv `KEY=value` lines); this script reads
it. It
carries the wiring the backend needs, so you never set these by hand:

| Setting | Source | Without it |
|---|---|---|
| `STUDIO_RUNNER_BASE_URL` | the runner's mutual-TLS URL (`https://127.0.0.1:8090`) | dispatch closes `ERROR`/`DISPATCH_FAILED` naming `studio.runner.base-url` |
| `STUDIO_RUNNER_SERVICE_TOKEN` | token the runner also holds as its service identity | dispatch closes `ERROR`/`DISPATCH_FAILED` naming `studio.runner.service-identity-token` |
| `STUDIO_CALLBACK_SERVICE_TOKEN` | token the runner presents as its callback identity | the API refuses every runner callback, so nothing the runner reports is recorded |
| `STUDIO_RUNNER_TLS_*` | backend key store and trust store from the local CA | any `https://` hop to the runner fails closed |
| `STUDIO_EVIDENCE_PROVIDER`, `STUDIO_EVIDENCE_DIRECTORY` | `local`, and the directory the runner writes | recordings and manifests are not found |
| `SPRING_CONFIG_ADDITIONAL_LOCATION` | an overlay turning on the guided bridge (`PUT_CHECKS_GUIDED_PORT`, default 8092) | guided learning and replay are unreachable |

**Ports.** `PUT_CHECKS_BACKEND_PORT` (8080), `PUT_CHECKS_CORE_PORT` (8081) and
`PUT_CHECKS_FRONTEND_PORT` (5173) move the listeners; the guided bridge and the runner use
`PUT_CHECKS_GUIDED_PORT` (8092) and `PUT_CHECKS_RUNNER_PORT` (8090). The script adds the frontend port
to `CHECKS_CORS_ALLOWED_ORIGINS` (unless you set that yourself), because otherwise every browser POST
from a non-default port gets `403 Invalid CORS request`.

**Learning (Run Test).** Plain-English steps are translated by Vertex. By default
`STUDIO_GATEWAY_PROVIDER=disabled`, so Run Test answers that learning is unavailable. To enable it,
put these in `backend/.env.local` (gitignored, loaded by `scripts/dev.mjs`; dotenv lines, no `$VAR` expansion):

```bash
STUDIO_GATEWAY_PROVIDER=vertex
STUDIO_GATEWAY_ENDPOINT=<Vertex or Vertex-compatible proxy base URL>
STUDIO_GATEWAY_PROJECT=<project>
STUDIO_GATEWAY_LOCATION=<location>
STUDIO_GATEWAY_MODEL=<model>   # default gemini-3.8-flash
```

Credentials come from Application Default Credentials (`gcloud auth application-default login`);
`STUDIO_GATEWAY_CREDENTIALS_MODE` selects `application-default` (default) or `service-account-file`.
Startup refuses an incomplete Vertex configuration.

**Core stand-in.** Guided publication and replay re-check the caller against PUT Core with the
browser's `put_session` cookie. Locally there is no Core, so `scripts/dev.mjs` starts
`scripts/local-core.mjs` on `PUT_CHECKS_CORE_PORT` and points `CHECKS_CORE_SERVICE_URL` at it. It
answers `GET /api/v1/users/me[/permissions]` with the developer identity for exactly one fixed cookie
value (`put_session=local-dev-session`) and `401` for anything else. The frontend dev proxy adds that
cookie, which is why you reach the backend through the frontend's dev server rather than calling the API
without it.

**Embedded database.** The `local` profile uses Zonky embedded Postgres in the JVM, so data is reset
on every restart. That includes the DevTools restarts the launcher triggers whenever Gradle recompiles a
class (a continuous `classes` build runs alongside `bootRun`). Use `--seed` to get sample data back.

**Allowed domains (STUDIO-FLEX-001).** Where Studio may navigate is one deployment list,
`studio.navigation.allowed-domains` (`STUDIO_ALLOWED_DOMAINS`): comma-separated lowercase punycode host
suffixes, no spaces, at most 32, none a suffix of another. A page is allowed when its host equals an
entry or ends with `"." + entry`, on `http` or `https` and any port; an IP address can never be an entry.
It ships empty, which denies every start (`403 ORIGIN_NOT_ALLOWED`) when allow-all is off, and an invalid value stops startup.
The `local` profile defaults to `localhost,example.com,practicetestautomation.com`. The runner reads the
same list from `STUDIO_RUNNER_ALLOWED_DOMAINS`. `studio.navigation.allow-all-domains` (`STUDIO_ALLOW_ALL_DOMAINS`, default
`true` for now, user decision 2026-10-25; only exactly `true` or `false` is accepted) is the per-environment option that allows every http(s) URL whose host is a
DNS name (still no userinfo or IP literal) and ignores the list; it logs one WARN line at startup, and the chart renders it
to the runner (`STUDIO_RUNNER_ALLOW_ALL_DOMAINS`) from the same value. The deployment-wide cap on concurrent learning sessions is
`studio.guided-authoring.max-concurrent-sessions` (default 1; the 429 is `LEARNING_CAPACITY_EXHAUSTED`).

The `local` profile itself runs the Studio dispatcher and reapers (`studio.execution.dispatcher.enabled`
defaults to `true` there; the schedulers are gated `worker` or `local & !api`), so one `bootRun` is
both the API and the worker.

**Real translation only.** Studio accepts plain-English instructions. Compilation uses Vertex and
fails visibly when Vertex configuration, credentials, or the model are unavailable. There is no
passthrough, recorded response, or offline success path.

**Vertex and proxy routing (user clarification, 2026-10-21).** Use Vertex directly for current
integration work. `STUDIO_GATEWAY_ENDPOINT` is the existing SDK base-URL argument: it can point to
Vertex directly or to an owner-supplied Vertex-compatible proxy. The provider remains `vertex`,
using the same client and model request/response contract. Gateway operation and its billing belong
to the external owners; no separate gateway provider or administration feature is needed here.
Direct Vertex validation can proceed independently of proxy availability; it establishes results
for the route actually exercised.

**Evidence.** Local development shares one filesystem evidence directory between the runner and
API. If that store is unavailable, recording and manifest errors are reported; the application does
not invent an available recording.

**The automated version.** `../tools/corun.sh` runs `StudioCoRunIT`: the real API and the real
runner in one JVM session, five legs, the last of which runs a real Chromium against a page the test
serves on loopback and requires the execution `PASSED` and its ledger row `DONE`.

### Windows

**Windows: not verified.** No Windows run is recorded yet; the notes below are inferred from the Gradle, Java and
Zonky documentation until one is.

Local development only: production stays Linux. Prerequisites, natively (no Docker, no WSL):

- **JDK 21** with `JAVA_HOME` set (Gradle reads it; `gradle.properties` pins no JDK path).
- **Node 24** for `node scripts/dev.mjs` and the Core stand-in.
- **Git for Windows**, `git config --global core.longpaths true` and a **short clone path** (for example
  `C:\src\put-checks`).
- A **non-admin shell**: Zonky's embedded Postgres refuses to start elevated.
- The Microsoft Visual C++ runtime, which the embedded Postgres binaries need.
- Artifactory credentials in `%USERPROFILE%\.gradle\gradle.properties` (see above).

`node scripts/dev.mjs` runs `gradlew.bat` for you. The quality gate is `gradlew.bat check` and the tests are
`gradlew.bat test`; both use embedded Postgres and need no Docker. The studio-runner and the frontend have their own
Windows notes; the image build, the deployment and perception tiers, Helm and the realsite-gate stay Linux-only.

---

## Quality gates

`./gradlew check` runs:

1. **Spotless** — google-java-format. Failing format → `./gradlew spotlessApply` fixes.
2. **Checkstyle** — config at `config/checkstyle/checkstyle.xml` (google_checks baseline; Citi-standard replacement is a tracked follow-up).
3. **SpotBugs** — threshold HIGH; exclusions at `config/spotbugs/exclude.xml` (empty baseline).
4. **JUnit 5** — unit + integration tests.
5. **JaCoCo** — line coverage ≥ 80% on the project's own packages (excludes `ChecksApplication`, DTOs, generated code).

A red `check` is the shared definition of "not ready to merge."

---

## Follow-up chores

- Replace `config/checkstyle/checkstyle.xml` with the official Citi-standard ruleset once the Citi-standard ruleset artifact is located. Document deviations.
- Add a `suppressions.xml` when specific files need targeted Checkstyle exemptions.

---

## Related docs

- [`docs/stories/1.1.story.md`](../docs/stories/1.1.story.md) — this scaffold's source story.
- [`docs/specs/backend/spec.md`](../docs/specs/backend/spec.md) — full backend spec (v3, DEBT-04-corrected).
- [`docs/epics/EPIC-01-EXECUTION.yaml`](../docs/epics/EPIC-01-EXECUTION.yaml) — M1 execution manifest.
- [`ARCH.md`](../ARCH.md) — system architecture.
