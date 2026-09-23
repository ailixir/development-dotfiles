# PUT Checks — Backend

Spring Boot 3.3 · Java 21 · Gradle (Kotlin DSL).

Part of the [Project Checks monorepo](../README.md). Frontend lives under `../frontend/`.

---

## Prerequisites

- **JDK 21** (temurin-21 recommended). Gradle toolchains will auto-download if your default JDK is older, but a system JDK 21 is faster.
- **No local Postgres needed for M1.** Story 1.2 wires Zonky embedded Postgres (runs in-process) for the `local` profile; Testcontainers-PG for the `test` profile.

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
| `./gradlew bootRun --args='--spring.profiles.active=local'` | Start the app on `:8080`. Health probe: `GET /actuator/health` → `{"status":"UP"}`. |
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
| `test` | Integration tests (Testcontainers) | Clean schema per test. |
| `staging` | Staging environment (env-var driven) | Placeholder; ready for 5.x stories. |
| `prod` | Production (env-var driven) | Placeholder; ready for 5.x stories. |

### Dev profile (sample data for development and demos)

```bash
./gradlew bootRun --args='--spring.profiles.active=dev'
```

Starts the app with Zonky embedded Postgres pre-populated with realistic sample data:
- **3 CSI systems** at different health levels (healthy, degraded, green)
- **15 checks** (HTTP + TCP) with valid configurations
- **~450 execution results** spanning 28 days with mixed statuses
- **12 schedules**, **8 tags**, **3 reports**, **2 secrets**
- **No Studio tests or run history** — those appear only after a real save and run
- Materialized view `csi_metrics_current` refreshed with live metrics

Use for development, frontend integration, and stakeholder presentations.

---

## Checks Studio end to end on a laptop

`../dev.sh` starts the backend (`local` profile), a real `studio-runner` and the Vite frontend, and
wires them together. **Verified 2026-09-18** with `./dev.sh --seed` (on non-default ports, see
below): a test created in the Studio, confirmed in the UI and started with **Run Test** ran in
real Chromium and showed `Passed` on the Studio page and on the Runs page.

```bash
cd studio-runner && npm run browsers:install   # once: the pinned Chromium
cd .. && ./dev.sh --seed                       # --seed: CSIs to own a test (local alone has none)
```

What `dev.sh` wires, and why each piece is needed:

| Setting | Value | Without it |
|---|---|---|
| `STUDIO_RUNNER_BASE_URL` | `http://127.0.0.1:8090` (`DEV_STUDIO_RUNNER_PORT`) | dispatch closes `ERROR`/`DISPATCH_FAILED` naming `studio.runner.base-url` |
| `STUDIO_RUNNER_SERVICE_TOKEN` | generated per session; the runner gets the same value as `STUDIO_RUNNER_SERVICE_IDENTITY` | dispatch closes `ERROR`/`DISPATCH_FAILED` naming `studio.runner.service-identity-token` |
| `STUDIO_CALLBACK_SERVICE_TOKEN` | generated per session; the runner gets it as `STUDIO_RUNNER_CALLBACK_IDENTITY` | the API refuses every runner callback (its callback chain has no token to accept), so nothing the runner reports is recorded |
| `CHECKS_SOURCE_UI_TEST` | `true` | the Studio pages say "not available in this environment" |
| `STUDIO_GATEWAY_PROVIDER` | `vertex` | plain-English steps cannot be compiled |
| `STUDIO_GATEWAY_ENDPOINT`, `PROJECT`, `LOCATION`, `MODEL` | your Vertex deployment | startup refuses incomplete translation configuration |
| `STUDIO_GATEWAY_CREDENTIALS_MODE` | `application-default` or `service-account-file` | Vertex authentication fails explicitly |

The `local` profile itself runs the Studio dispatcher and reapers (`studio.execution.dispatcher.enabled`
defaults to `true` there; the schedulers are gated `worker` or `local & !api`), so one `bootRun` is
both the API and the worker.

**Real translation only.** Studio accepts plain-English instructions. Compilation uses Vertex and
fails visibly when Vertex configuration, credentials, or the model are unavailable. There is no
passthrough, recorded response, or offline success path.

**Ports.** `DEV_BACKEND_PORT`, `DEV_FRONTEND_PORT` and `DEV_STUDIO_RUNNER_PORT` move the three
listeners (defaults 8080, 5173, 8090). With a non-default frontend port, `dev.sh` adds that origin to
`CHECKS_CORS_ALLOWED_ORIGINS`, because otherwise every browser POST gets `403 Invalid CORS request`.
`--no-studio-runner` skips the runner.

**Evidence.** Local development shares one filesystem evidence directory between the runner and
API. If that store is unavailable, recording and manifest errors are reported; the application does
not invent an available recording.

**The automated version.** `../tools/corun.sh` runs `StudioCoRunIT`: the real API and the real
runner in one JVM session, five legs, the last of which runs a real Chromium against a page the test
serves on loopback and requires the execution `PASSED` and its ledger row `DONE`.

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
