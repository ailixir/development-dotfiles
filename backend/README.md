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
| `dev` | Local dev + sample data (Zonky embedded Postgres) | Pre-populated with 3 CSIs, 15 checks, ~450 execution results, reports, tags, UI tests. |
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
- **12 schedules**, **8 tags**, **3 reports**, **3 UI tests**, **2 secrets**
- Materialized view `csi_metrics_current` refreshed with live metrics

Use for development, frontend integration, and stakeholder presentations.

### Vertex AI Gemini Flash

Studio uses the Google Gen AI Java SDK in Vertex AI mode. The default model is
`gemini-3.8-flash`; both the model and SDK are pinned in source and can be overridden by deployment
configuration.

For local API-key authentication through the Gemini Developer API, keep the key outside the
repository. ADC and service-account modes use Vertex AI for deployed environments:

```bash
export STUDIO_GATEWAY_ENABLED=true
export STUDIO_GATEWAY_CREDENTIALS_MODE=api-key
export STUDIO_GATEWAY_API_KEY='<your Google Cloud API key>'
./gradlew bootRun --args='--spring.profiles.active=local,dev'
```

The key remains in backend process configuration. The status endpoint
`GET /api/v1/studio/ai/status` reports the provider, model and credential mode without exposing the
key. Deployed environments can instead use `application-default` with
`STUDIO_GATEWAY_PROJECT` and `STUDIO_GATEWAY_LOCATION`, or `service-account-file` with
`STUDIO_GATEWAY_CREDENTIALS_KEY_FILE`.

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
