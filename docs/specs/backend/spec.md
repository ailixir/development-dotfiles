# Backend Specification — Project "Checks" (v2.2, Phase 2)

> **Spec Pipeline Phase 4 output, Phase 5 revision applied.** Owner: `@pm (Morgan)` with architectural input from `@architect (Aria)` and research from `@analyst (Alex)`.
> **Inputs:** [`requirements.json`](./requirements.json) · [`complexity.json`](./complexity.json) (22/25 COMPLEX) · [`research.json`](./research.json) · [`critique.json`](./critique.json) (v1 NEEDS_REVISION → v2 revisions applied)
> **Constitutional Gate (Article IV — No Invention):** every non-obvious statement in this document carries an inline trace reference like `[FR-CHK-03]`, `[NFR-AVAIL-01]`, `[CON-STACK-07]`, `[PW-R1]`, `[PRD §5.2]`, or `[ARCH §4.2]`. Statements without a trace are either direct consequences of a preceding traced statement or standard Spring Boot / Java idioms.
> **Revision history:**
> - 2026-04-16 v1 — initial spec (commit `868fc731b`).
> - 2026-04-17 v2 — revision pass addressing `critique.json` REV-01..06 + 13 IMP-* items. Added: §6.4 Bulk Operations, §6.5 Rate Limiting, §13.6 SLO Validation, R-08 JWT claim risk, FR-BULK-01 (retroactive), NFR-SEC-04 (new). Tightened: semaphore/KEDA justifications, live-preview SLO, cache hit-rate target, M6 load-test acceptance, parseSteps port call-out, virtual-thread exception note, video-processing-elimination call-out, log retention, pagination (cursor for partitioned tables).

---

## 0. Executive Summary

The backend is a Java 21 + Spring Boot 3.3+ application `[CON-STACK-01, CON-STACK-02]` organized as a single deployable monorepo module at `backend/`, built with Gradle (Kotlin DSL) `[CON-STACK-03]`. It serves a CSI-organized REST API `[CON-API-01]` over PostgreSQL 15+ (managed RDS in prod, Zonky embedded locally — `[CON-STACK-06, CON-STACK-07]`), integrates with nine external systems, and executes the full catalog of health checks specified in `PRD §5`.

### What changes vs. `ARCH.md`

Three amendments emerged during Phases 2-3 and are embodied in this spec (see §15 ARCH Debt Resolved):

1. **`DEBT-01`** — Checks Studio browser automation is **Playwright (Java binding) bundled in the same backend container, scaled horizontally via K8s replicas**. NOT Selenium Grid, NOT a dedicated studio-runner StatefulSet, NOT a cloud Playwright service. (User constraint, 2026-04-16.)
2. **`DEBT-02`** — `tags` and `secrets` tables have **indefinite retention**. Expired secret references fail at execution-time rather than being deleted (preserves audit trail).
3. **`DEBT-03`** — **Dedicated `/api/v1/schedules` endpoint group** (not inline with `/checks`). `GET /checks/{id}` still embeds schedule read-only for client convenience.

### Key architectural tenets (re-asserted)

- **Orchestration, not replacement** `[PRD §1.2, §2]`
- **CSI as cornerstone** `[PRD §2.1, FR-CSI-01]`
- **Vertical-slice package layout** per bounded context `[CON-ARCH-01, ARCH §4.3]`
- **Virtual threads end-to-end** for request handling + @Async executors `[CON-STACK-04, CON-STACK-05]`
- **Forward-only Flyway** migrations, schema from `ARCH §7` verbatim `[CON-ARCH-03, CON-STACK-09]`
- **Zero DB-team dependency** — partitions self-maintained by the app `[OQ-05]`
- **Security-first** — enterprise OIDC + RBAC + Vault K8s auth `[NFR-SEC-01/02/03, PRD §7]`

---

## 1. Scope

### 1.1 In scope

All 37 Functional Requirements and 22 Non-Functional Requirements from `requirements.json`, phased across six milestones M1-M6 that mirror `ARCH §4.4`. See §14 for milestone boundaries.

### 1.2 Out of scope (inherited from PRD §5.4)

- Automated remediation `[OOS-01]` — the platform reports, it never restarts a service.
- ML anomaly detection `[OOS-02]` — all checks use user-defined thresholds.
- Fully customizable report builder `[OOS-03]` — email-template-based only in v2.2.
- PDF / CSV exports `[OOS-04]`.
- Replacing ITRS / Grafana / Splunk / AppDynamics `[OOS-05]`.

### 1.2.1 Deferred to v2.3 (explicitly out of scope for this spec)

- **Template Library for UI tests** (PRD §5.3 "Pre-built templates for common UI test scenarios"). Rationale: PRD lists it among "Additional Features" alongside keyboard shortcuts and a11y — not a core workflow. Addressable as a curated set of `ui_tests` rows + a `is_template: bool` column in a v2.3 Flyway migration; zero v2.2 impact. **Tracked for v2.3.** Rev source: `[critique.json COMP-02, REV-02]`.
- **GDPR right-to-erasure on `users`** (spec §5.5 not included). Rationale: Citi's enterprise identity platform handles departure/deletion workflows upstream of this system; `users` here is a JWT-claim mirror and contains no data not already in the OIDC issuer. On user departure, the JWT stops being issued and no new writes occur; existing rows remain for audit continuity. **If legal requires hard-erasure, add in v2.3.** Rev source: `[COMP-07, IMP-03]`.

### 1.3 Complexity classification

`COMPLEX (22/25)` per [`complexity.json`](./complexity.json). Triggers the full 6-phase Spec Pipeline + revision cycle on NEEDS_REVISION critique verdict.

---

## 2. System Context

```
                                ┌─────────────────────────┐
                                │  Enterprise OIDC issuer │
                                └──────────┬──────────────┘
                                           │  JWT validation
┌───────────────┐   JWT + JSON   ┌─────────▼─────────────┐
│  React MFE    │ ─────────────▶ │   Spring Boot 3.3     │
│  (frontend/)  │ ◀───────────── │  (backend/)           │
└───────────────┘                │  Java 21 + Virtual    │
                                 │  Threads              │
                                 │                       │
                                 │  ┌──── REST handlers   │───▶ PostgreSQL 15 (RDS)
                                 │  ├──── @Async exec     │◀── S3 (UI test videos)
                                 │  ├──── @Scheduled      │◀── Vault (K8s auth, KV v2)
                                 │  └──── Playwright pool │◀── SMTP relay
                                 └───────────┬───────────┘
                                             │
                    Outbound integrations ───┼───────────────────────────────────
                                             │
          CSI API   Splunk   Grafana   ITRS Geneos   AppDynamics
```

**Nine integration surfaces** drive complexity-dimension `integration = 5/5` from `complexity.json`. Each gets a circuit breaker + bounded timeout in §11.

---

## 3. Module Architecture

### 3.1 Bounded contexts (packages)

Per `[CON-ARCH-01]` and `ARCH §4.3`, top-level packages are organized by bounded context, **not** layer. Each package is a feature-sized unit understandable in isolation.

```
backend/src/main/java/com/citi/put/checks/
├── ChecksApplication.java           # @SpringBootApplication entry point
├── config/                          # cross-cutting Spring config beans
│   ├── AsyncConfig.java             # virtual-thread executors (§4.2)
│   ├── SecurityConfig.java          # OIDC resource server (§7)
│   ├── CacheConfig.java             # Caffeine beans (§4.3)
│   ├── VaultConfig.java             # K8s auth (§7.3)
│   ├── OpenApiConfig.java           # springdoc-openapi
│   ├── MdcTaskDecorator.java        # [VT-R2] correlation-ID propagation
│   └── PartitionHealthIndicator.java# [PG-R1] future-partition alert
├── csi/                             # CSI bounded context
├── checks/                          # check management + execution dispatcher
│   ├── model/                       # CheckConfiguration sealed hierarchy (§5.3)
│   ├── executors/                   # CheckExecutor SPI impls
│   │   ├── HttpCheckExecutor.java
│   │   ├── TcpCheckExecutor.java
│   │   ├── SplunkCheckExecutor.java
│   │   ├── GrafanaCheckExecutor.java
│   │   ├── ItrsCheckExecutor.java
│   │   ├── AppDynamicsCheckExecutor.java
│   │   └── UiTestCheckExecutor.java
│   └── ...
├── scheduling/                      # schedules context (dedicated /schedules API — DEBT-03)
│   └── partitioning/                # [PG-R1] app-managed partition DDL
├── studio/                          # Checks Studio
│   └── playwright/                  # in-process Playwright runner (§9)
├── reports/                         # report defs + rendering + delivery
├── users/                           # JWT-claim-based provisioning [FR-AUTH-03]
├── secrets/                         # Vault client + <secret ID> resolver [FR-SECRET-01]
└── common/                          # shared DTOs, error model, pagination
```

### 3.2 Layering inside a context

Each context follows a standard tri-layer:

- **`controller/`** — `@RestController`; handles HTTP only; delegates to service.
- **`service/`** — business logic; transactions start here; `@Transactional` at service methods.
- **`repository/`** — Spring Data JPA interfaces.
- **`entity/`** — JPA entities; matches Flyway schema 1:1.
- **`dto/`** — request/response records; MapStruct-mapped to/from entities.
- **`mapper/`** — MapStruct interfaces.

No cross-context database joins at the repository layer. Cross-context reads use **service-to-service method calls** (same JVM, no network). Example: the reports service calls `ChecksService.getCheck(id)`, not a `reports → checks` JPA join.

---

## 4. Concurrency & Execution

### 4.1 Virtual threads (default, with one documented exception)

`spring.threads.virtual.enabled=true` `[CON-STACK-04, VT-01]` activates virtual threads for:
- Tomcat request executor
- `@Async` default executor (and `checkExecutor` bean — §4.2)
- `@Scheduled` default scheduler
- Messaging listeners (if added)

**Documented exception:** the `uiTestExecutor` bean (§4.2) uses **platform threads**, not virtual threads, because Playwright objects are bound to their creating carrier thread `[PW-02]`. Virtual threads can be unmounted/remounted across carriers over their lifetime — incompatible with Playwright's affinity constraint. See §9.3 for the full rationale. `[CONS-01 revision]`

**JDK version:** Java 21 LTS `[CON-STACK-01]`. Synchronized pinning in 3rd-party libs is a known pre-JDK-24 concern `[VT-03]` — mitigated by:
- Hibernate 6.4+ already replaced internal synchronized with ReentrantLock `[VT-04]`.
- Preprod JVM flag `-Djdk.tracePinnedThreads=short` surfaces residual pinning `[VT-R3]`.
- HikariCP tuned conservatively (pool = 2 × vCPU) `[VT-R1]`.

### 4.2 Named async executors

Three **separate** `AsyncTaskExecutor` beans (bulkheading `[PW-R7]`):

| Bean name | Purpose | Backing | Concurrency cap |
|---|---|---|---|
| `applicationTaskExecutor` (default) | `@Async` without qualifier | `newVirtualThreadPerTaskExecutor()` | unbounded |
| `checkExecutor` | `CheckExecutor` dispatch for non-UI checks | virtual threads wrapped in a `Semaphore` permit pool, cap = `checks.executor.semaphore-multiplier × hikari.maximum-pool-size` | bounded by semaphore `[VT-R1, VT-09]` |
| `uiTestExecutor` | Checks Studio UI test runs | **Platform threads** — `ThreadPoolTaskExecutor` with core=max=`studio.pool.size` (default 4 per pod) `[PW-R1, PW-R3]` | bounded — dedicated bulkhead (see §9.3) |

**Why `checks.executor.semaphore-multiplier` defaults to 4** `[ACC-01 revision]`: most non-UI check executors perform 2-3 DB queries per execution (read config + write execution_results + optional join). A 4× multiplier gives each in-flight executor ~1 permit of headroom above steady-state DB usage, preventing connection-pool starvation under bursts without under-utilizing. Configurable per-env in `application.yml`; tune from telemetry.

**Why `uiTestExecutor` uses platform threads, not virtual threads** `[PW-02, CONS-01 revision]`: Playwright bound-to-thread constraint (§9.3).

```java
// backend/src/main/java/com/citi/put/checks/config/AsyncConfig.java — executor beans
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "applicationTaskExecutor")
    public AsyncTaskExecutor applicationTaskExecutor(MdcTaskDecorator decorator) {
        var adapter = new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
        adapter.setTaskDecorator(decorator);
        return adapter;
    }

    @Bean(name = "checkExecutor")
    public AsyncTaskExecutor checkExecutor(
            @Value("${checks.executor.semaphore-multiplier:4}") int mult,
            @Value("${spring.datasource.hikari.maximum-pool-size:20}") int pool,
            MdcTaskDecorator decorator) {
        var vt = new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
        vt.setTaskDecorator(decorator);
        return new SemaphoreBoundedExecutor(vt, mult * pool);   // custom wrapper
    }

    @Bean(name = "uiTestExecutor")
    public AsyncTaskExecutor uiTestExecutor(
            @Value("${studio.pool.size:4}") int size,
            MdcTaskDecorator decorator) {
        var tpe = new ThreadPoolTaskExecutor();
        tpe.setCorePoolSize(size);
        tpe.setMaxPoolSize(size);
        tpe.setQueueCapacity(0);              // fail-fast when full → readiness probe flips
        tpe.setThreadNamePrefix("ui-test-");
        tpe.setTaskDecorator(decorator);
        tpe.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        tpe.initialize();
        return tpe;
    }
}
```

Rationale: a stuck Chromium process cannot starve REST handlers or other check executions.

### 4.3 TaskDecorator

A single `MdcTaskDecorator` applied to all three executors `[VT-R2]`:

- Copies MDC (correlation ID) from the submitting thread before `run()`.
- Wraps in `DelegatingSecurityContextExecutor` to propagate `SecurityContextHolder`.
- Clears both on completion to prevent thread-local leaks.

### 4.4 Async request pattern

Per `ARCH §4.2`, `POST /checks/{id}/execute` returns `202 Accepted` with an `ExecutionId` `[FR-CHK-03]`:

```java
@PostMapping("/{id}/execute")
public ResponseEntity<ExecuteResponse> execute(@PathVariable UUID id, ...) {
    var executionId = executionService.startAsync(id, userPrincipal);
    return ResponseEntity.accepted()
        .header("Location", "/api/v1/checks/" + id + "/executions/" + executionId)
        .body(new ExecuteResponse(executionId, "PENDING"));
}
```

The client polls `GET /checks/{id}/executions/{execId}` OR subscribes via SSE at `GET /checks/{id}/executions/stream` (optional; added in M6).

---

## 5. Data Model

### 5.1 Schema source of truth

The Flyway migration `V1__init.sql` is the source of truth for the database schema. It **mirrors `ARCH §7` exactly** `[CON-ARCH-03]` except for the three documented amendments:

| Amendment | Source | Change |
|---|---|---|
| Discriminator CHECK on `checks.configuration` | `[MS-R3]` | `CHECK (jsonb_path_exists(configuration, '$.type'))` |
| No `DEFAULT PARTITION` on `execution_results` | `[PG-09, PG-R2]` | Omit default partition — incompatible with `DETACH CONCURRENTLY` |
| Single current-month partition in V1 | `[PG-R4]` | V1 creates parent + current month only; future months created by runtime scheduler |

Partition DDL detail in §8.2.

### 5.2 Entities (high-level)

| Entity | Table | Bounded context | Key traits |
|---|---|---|---|
| `User` | `users` | `users` | Provisioned from JWT claims at first-auth `[FR-AUTH-03]` |
| `CsiSystem` | `csi_systems` | `csi` | Soft-delete via `deleted_at`; `status` enum |
| `Check` | `checks` | `checks` | Polymorphic config via sealed interface (§5.3) |
| `Schedule` | `schedules` | `scheduling` | 1:1 with Check; cron expression + timezone |
| `ExecutionResult` | `execution_results` | `checks` | Partitioned monthly by `started_at` |
| `UiTest` | `ui_tests` | `studio` | Separate from Check — a Check of type `UI_TEST` references a `ui_test_id` |
| `UiTestExecution` | `ui_test_executions` | `studio` | Has `video_url` pointing to S3 |
| `Report` | `reports` | `reports` | `sections JSONB`, `recipients TEXT[]` |
| `ReportExecution` | `report_executions` | `reports` | Audit of each delivery |
| `Tag` + `CheckTag` + `CsiTag` | `tags`, `check_tags`, `csi_tags` | shared (in `common/`) | Cascade-delete on junction |
| `SecretReference` | `secrets` | `secrets` | Stores only vault reference + masked `last_four` — never the value `[FR-SECRET-02]` |

### 5.3 Polymorphic CheckConfiguration

**Decision (XC-03):** sealed interface `[MS-R1, MS-03]`.

```java
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type", visible = true)
@JsonSubTypes({
    @JsonSubTypes.Type(value = HttpConfiguration.class,        name = "HTTP"),
    @JsonSubTypes.Type(value = TcpConfiguration.class,         name = "TCP"),
    @JsonSubTypes.Type(value = SplunkConfiguration.class,      name = "SPLUNK"),
    @JsonSubTypes.Type(value = GrafanaConfiguration.class,     name = "GRAFANA"),
    @JsonSubTypes.Type(value = ItrsConfiguration.class,        name = "ITRS"),
    @JsonSubTypes.Type(value = AppDynamicsConfiguration.class, name = "APPDYNAMICS"),
    @JsonSubTypes.Type(value = UiTestConfiguration.class,      name = "UI_TEST")
})
public sealed interface CheckConfiguration
    permits HttpConfiguration, TcpConfiguration, SplunkConfiguration,
            GrafanaConfiguration, ItrsConfiguration, AppDynamicsConfiguration,
            UiTestConfiguration {
    CheckType type();
}
```

Stored via `@JdbcTypeCode(SqlTypes.JSON)` on the `Check` entity's `configuration` field `[MS-01]`. MapStruct uses `@SubclassMapping` per variant `[MS-R2, MS-04]`.

**NEVER use `@JsonTypeInfo(use = CLASS)`** — CVE vector `[MS-R4]`.

### 5.4 Migration safety for new check types

Adding an 8th type (e.g., `DATABASE_QUERY`) is:
- ✅ Safe for writes — old clients keep sending their 7 types.
- ✅ Safe for reads — Jackson tolerates unknown fields with `@JsonIgnoreProperties(ignoreUnknown = true)`.
- ⚠️ Requires: new permitted record in the sealed interface, new `@JsonSubTypes.Type`, new `CheckExecutor` impl, AND update the DB `type` column's CHECK constraint via a Flyway migration.

A test in `backend/src/test/.../checks/CheckTypeExhaustivenessTest.java` asserts `CheckType` enum ↔ sealed interface permits ↔ `@JsonSubTypes.Type` are all in sync `[MS-06]`.

---

## 6. API Contract

### 6.1 Conventions

- Base path: `/api/v1` `[CON-API-01]`
- Authentication: `Authorization: Bearer <JWT>` on every endpoint except health probes `[CON-API-02, FR-AUTH-01]`
- Response envelope `[CON-API-03]`:
  ```json
  { "data": {...}, "metadata": {...}, "timestamp": "2026-04-17T10:30:00Z" }
  ```
- Error envelope (uniform across all endpoints):
  ```json
  { "error": { "code": "CHECK_NOT_FOUND", "message": "...", "traceId": "..." } }
  ```
- **Pagination** `[COMP-05 revision]`:
  - **Offset-based (default)** for small result sets (`< 10,000` rows): `?page=0&size=20` → `metadata: { total, page, limit, hasMore }`.
  - **Cursor-based (required)** for `GET /checks/{id}/history`, `GET /reports/{id}/executions`, and any endpoint reading from partitioned tables: `?cursor=<opaque>&limit=20` → `metadata: { nextCursor, hasMore }`. `total` omitted (would be O(N) on 1M+ rows). `NFR-SCALE-02`.
- **Idempotency** `[REV-03]`: All state-mutating endpoints under `/checks`, `/reports`, `/studio`, `/schedules` MUST accept an `Idempotency-Key: <uuid>` request header. Key + userId is cached for 5 minutes (Caffeine). Repeated requests within the window return the original response without re-executing. Applied especially to `POST /checks/{id}/execute` and `POST /reports/{id}/send` to prevent retry-induced duplicate executions and double-sent emails.
- OpenAPI 3.1 generated via `springdoc-openapi` at `/v3/api-docs`; Swagger UI at `/swagger-ui.html` (prod: internal-only). Committed OpenAPI snapshot at `docs/specs/backend/openapi.yaml` (authored in M1, regenerated per release; diff-gated in CI per §13.3).

### 6.2 Endpoint groups

| Group | Paths | Source |
|---|---|---|
| CSI | `GET /csi`, `GET /csi/{id}`, `GET /csi/{id}/metrics`, `GET /csi/{id}/checks` | `[ARCH §12.1]` |
| Checks | `GET/POST /checks`, `GET/PUT/DELETE /checks/{id}`, `POST /checks/{id}/execute`, `GET /checks/{id}/history`, `GET /checks/{id}/executions/{execId}`, **`POST /checks/_bulk`** | `[ARCH §12.1, FR-CHK-02, -03, -10, FR-BULK-01]` |
| **Schedules (new, DEBT-03)** | `GET/POST /schedules`, `GET/PUT/DELETE /schedules/{id}`, `PATCH /schedules/{id}/enabled` | Added per OQ-04 decision |
| Studio | `GET/POST /studio/tests`, `GET/PUT/DELETE /studio/tests/{id}`, `POST /studio/tests/{id}/run`, `GET /studio/tests/{id}/video`, `GET /studio/runs/{runId}` | `[ARCH §12.1, FR-STUDIO-01/02/04]` |
| Reports | `GET/POST /reports`, `GET/PUT/DELETE /reports/{id}`, `POST /reports/{id}/preview`, `POST /reports/{id}/send`, `GET /reports/{id}/executions` | `[ARCH §12.1, FR-REP-01/02/06]` |
| Users | `GET /users/me` | `[FR-AUTH-03]` |
| Tags | `GET /tags`, `POST /tags`, `DELETE /tags/{id}` | `[FR-TAG-01]` |
| Health | `GET /actuator/health`, `/actuator/health/liveness`, `/actuator/health/readiness`, `/actuator/health/studio-capacity`, `/actuator/health/partitions` | Spring Boot Actuator + custom `[PW-R8, PG-R1]` |
| Metrics | `GET /actuator/prometheus` | `[NFR-OBS-03]` |

### 6.3 New `/schedules` endpoints (DEBT-03 detail)

```
GET    /api/v1/schedules                 — list (filters: check_id, enabled, timezone)
POST   /api/v1/schedules                 — create; body { check_id, frequency, cron_expression, timezone, enabled }
GET    /api/v1/schedules/{id}            — fetch one
PUT    /api/v1/schedules/{id}            — replace
PATCH  /api/v1/schedules/{id}/enabled    — body { enabled: true|false }
DELETE /api/v1/schedules/{id}            — delete
```

**Invariant:** one schedule per check, enforced by `idx_schedules_check UNIQUE` in `ARCH §7.1`.

**Client convenience:** `GET /checks/{id}` response **embeds** the schedule as a read-only nested field:
```json
{ "data": { "id": "...", "name": "...", "schedule": { "id": "...", "cron_expression": "*/5 * * * *", "enabled": true } } }
```

### 6.4 Bulk Operations `[REV-01 — FR-BULK-01]`

`POST /api/v1/checks/_bulk` accepts an array of operations (max **100 per request** — bounded to keep request bodies reasonable + bound transaction scope):

```json
{
  "operations": [
    { "op": "delete", "id": "uuid-1" },
    { "op": "update", "id": "uuid-2", "patch": { "enabled": false } },
    { "op": "tag", "id": "uuid-3", "add_tag_ids": ["t-1"], "remove_tag_ids": ["t-2"] }
  ]
}
```

**Semantics** — partial-failure friendly:
- HTTP **207 Multi-Status** on mixed results (at least one success + at least one failure).
- HTTP **200** on all-success, **400** on all-failure (including validation).
- Per-operation result in the response: `{ "op_index": N, "status": "success|failed", "id": "...", "error": {code, message}? }`.
- Each operation authorized independently via `CsiOwnershipEvaluator`; a bulk request touching unowned CSIs fails only those operations, not the whole batch.
- Executed in a single `@Transactional` unit only if all operations share the same CSI; else executed as independent transactions (audit entries record the bulk correlation ID).
- Idempotency-Key (§6.1) applies to the bulk request as a whole.

**Milestone:** M1 delivers `op=delete` only (minimum-viable bulk); M3 adds `op=update` and `op=tag` once the tagging context is live.

### 6.5 Rate Limiting `[REV-04 — NFR-SEC-04]`

Every authenticated endpoint is rate-limited per user (JWT `sub` claim) via Bucket4j:

| Endpoint class | Token bucket | Rationale |
|---|---|---|
| Read (`GET /*`) | 600 req/min | Supports dashboard auto-refresh polling (1/sec) with headroom |
| Write (`POST/PUT/PATCH/DELETE /*` except below) | 120 req/min | Allows bulk-and-retry workflows |
| Execute (`POST /checks/{id}/execute`, `POST /studio/tests/{id}/run`) | 60 req/min | Triggers work; lower to protect executor pool |
| Send (`POST /reports/{id}/send`) | 10 req/min | Guards against email-storm abuse |
| Bulk (`POST /checks/_bulk`) | 20 req/min (plus per-operation read/write bucket consumption) | Double-charge model: 1 bulk call + N op tokens |

**Exceeded:** `429 Too Many Requests` + `Retry-After` header + `X-RateLimit-Remaining: 0`. Bucket state stored in Caffeine (single-pod) through M5; **Redis-backed from M6** for accurate cluster-wide rate limiting. Per-user buckets isolate one noisy user from starving others.

Admins (`roles=['checks-admin']`) have 10× multipliers on all buckets.

---

## 7. Security

### 7.1 Authentication

`spring-boot-starter-oauth2-resource-server` with JWT validation `[CON-STACK-02, FR-AUTH-01, ARCH §4.1]`. Issuer URI configured per environment:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${CHECKS_OIDC_ISSUER}    # resolved from K8s ConfigMap
```

On each request, Spring Security fetches JWKS (cached per issuer), validates signature + `exp` + `aud`, and populates `SecurityContextHolder` with a `JwtAuthenticationToken`.

### 7.2 Authorization (RBAC)

Method-level `@PreAuthorize` expressions `[FR-AUTH-02, ARCH §4.5]` referencing a custom `CsiOwnershipEvaluator` bean:

```java
@PreAuthorize("@csiOwnershipEvaluator.canWrite(authentication, #checkId)")
public Check updateCheck(UUID checkId, CheckUpdateRequest req) { ... }
```

The evaluator reads:
1. The JWT's `citi_csi_claims` array (CSI IDs the user owns — schema TBD with platform team).
2. The check's `csi_id` from the repository.
3. The operation (read / write / execute / admin).

Admins are users whose JWT has `roles=['checks-admin']` — they bypass CSI ownership checks.

### 7.3 Secrets (Vault K8s auth)

`spring-cloud-starter-vault-config` `[HV-R1]` configured for K8s auth `[HV-R2, HV-03]`:

```yaml
spring:
  cloud:
    vault:
      authentication: KUBERNETES
      kubernetes:
        role: checks-backend
        service-account-token-file: /var/run/secrets/kubernetes.io/serviceaccount/token
      kv:
        enabled: false   # bootstrap PropertySource DISABLED — imperative resolution only
      fail-fast: true
```

**Bootstrap PropertySource is DISABLED** `[HV-R1]`. Vault is consumed imperatively at check-execution time via an injected `VaultTemplate`:

```java
@Service
public class SecretResolver {
    private final VaultTemplate vault;

    @Cacheable(cacheNames = "vault-secrets", key = "#reference")
    public ResolvedSecret resolve(String reference) {
        var response = vault.opsForKeyValue(secretMount, KeyValueBackend.KV_2).get(reference);
        if (response == null || response.getRequiredData() == null) {
            throw new SecretNotFoundException(reference);
        }
        return ResolvedSecret.fromVaultData(response.getRequiredData());
    }
}
```

**Cache:** Caffeine, `expireAfterWrite=5m`, `maximumSize=1000` `[HV-R3]`.
**Cache hit-rate target** `[TEST-04 revision]`: `≥ 95%` steady-state, measured via `checks_secret_cache_hits_total / (hits + misses)`. Alert fires on sustained `< 80%` over a 15-minute window — indicates either a cache-bypass bug or a pathological TTL-vs-workload mismatch.
**Resilience:** Resilience4j `@CircuitBreaker(name = "vault")` + `@Retry(name = "vault", ...)` around `resolve()` `[HV-R4]`.
**Never persisted, never returned:** `<secret ID>` tokens in a check's `configuration` JSONB are resolved **only** inside `CheckExecutor.execute()` — never in DTOs returned to the client `[FR-SECRET-02]`.

### 7.4 Secret expiry handling (DEBT-02)

At resolution time, `SecretResolver.resolve()` checks the vault metadata response's custom `expires_at` field. If `expires_at < NOW()`:
- Throw `SecretExpiredException`.
- `CheckExecutionService` catches it, persists `execution_results.status='FAILURE'`, `error_message='Secret reference {{label}} expired on {{date}}'`.
- Emits metric `checks_secret_expired_total` (Prometheus counter tagged by `check_id`, `secret_label`).
- Does NOT delete the `secrets` row — preserves audit trail.
- Admins see a "stale secrets" widget on the dashboard (M4).

---

## 8. Scheduling, Partitioning & Data Lifecycle

### 8.1 Scheduling evolution (XC-05)

| Milestone | Scheduler | HA mechanism | Rationale |
|---|---|---|---|
| M1-M2 | Spring `@Scheduled` in-process `[CON-STACK-13]` | Single replica | Vertical slice; no coordination needed |
| M2 (partition bean) onwards | `@Scheduled` + **ShedLock (JDBC-backed)** `[PG-R5]` | Distributed mutex via DB row | Partition DDL cannot race — DETACH CONCURRENTLY is not re-entrant `[PG-09]` |
| M6 | **Quartz (JDBC-backed, cluster-safe)** `[CON-STACK-13, FR-SCHED-04]` | Full cluster scheduler | Required for 50+ concurrent schedules across N replicas |

ShedLock starts at M2 — not M6 — because the partition scheduler's correctness depends on it the moment the pod count exceeds 1, which happens as soon as we run a live-fire staging deployment.

### 8.2 App-managed partitioning (PG-R1 detail)

**Flyway V1** creates the parent + current month only:

```sql
CREATE TABLE execution_results (...) PARTITION BY RANGE (started_at);
CREATE TABLE execution_results_2026_04
    PARTITION OF execution_results
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
-- No default partition — incompatible with DETACH CONCURRENTLY [PG-09, PG-R2]
```

**Runtime scheduler** (`ExecutionResultsPartitionScheduler`):

```java
@Scheduled(cron = "0 0 3 25 * ?")  // 03:00 UTC on the 25th of each month
@SchedulerLock(name = "partitionCreator", lockAtMostFor = "10m", lockAtLeastFor = "30s")
public void createUpcomingPartitions() {
    for (int offset = 1; offset <= 2; offset++) {
        var targetMonth = YearMonth.now(UTC).plusMonths(offset);
        jdbc.execute("""
            CREATE TABLE IF NOT EXISTS execution_results_%s
                PARTITION OF execution_results
                FOR VALUES FROM ('%s-01') TO ('%s-01')
            """.formatted(
                targetMonth.format(YYYY_MM),
                targetMonth.format(YYYY_MM),
                targetMonth.plusMonths(1).format(YYYY_MM)
            ));
    }
}
```

**Startup safety:** `@EventListener(ApplicationReadyEvent.class)` runs the same logic once at boot, ensuring every freshly-deployed environment has current + next 2 months.

**Retention pruning:** a second `@Scheduled(cron = "0 15 3 1 * ?")` (once a month) detaches partitions older than `NFR-RET-01`'s 1-year cold window:
```sql
ALTER TABLE execution_results DETACH PARTITION execution_results_{old} CONCURRENTLY;
DROP TABLE execution_results_{old};
```

**Health indicator** (`/actuator/health/partitions`) `[PG-R1, PW-R8]`: returns `DOWN` if the partition covering `NOW() + 3 days` does not exist. Alert fires on day 28 if the next-month partition is missing → ops has 3 days to intervene **before** user-facing INSERT failures begin on day 1 of the new month.

**Generalized to 3 tables:** the same pattern applies to `ui_test_executions` (monthly) and `report_executions` (quarterly per `ARCH §7.5`).

### 8.3 Transaction boundaries `[ARCH §8]`

| Operation | Boundary | Notes |
|---|---|---|
| Check creation | Single Tx: `checks` INSERT + `schedules` INSERT + audit | `@Transactional` on `ChecksService.create` |
| Execution recording | Single Tx: `execution_results` INSERT → trigger cascades `checks.status` `[FR-CHK-11]` | `@Transactional(propagation = REQUIRES_NEW)` on `persistResult()` to isolate from the async exec transaction |
| Report generation | Read-only snapshot | `@Transactional(readOnly = true, isolation = REPEATABLE_READ)` |

---

## 9. Checks Studio — Playwright in K8s (CRITICAL, user constraint)

This section is the largest single design divergence from `ARCH.md` and the highest-risk area of the spec. It supersedes the earlier "Selenium Grid client" wording `[DEBT-01, PW-14]`.

### 9.1 Design principles

1. **One container, one Deployment.** Playwright runs in-process alongside REST handlers in the same JVM and same container image. No sidecar, no StatefulSet, no separate service.
2. **Horizontal scale via K8s Deployment replicas.** NFR-THRU-04's 50 concurrent UI tests is achieved by N pods × M per-pod capacity.
3. **Bulkhead.** A stuck Chromium cannot starve REST handlers — UI tests run on a dedicated bounded executor `[PW-R7]`.
4. **Backpressure via readiness probe.** When a pod is at capacity, it fails `/actuator/health/studio-capacity` (503) so K8s Service stops routing new `POST /studio/tests/{id}/run` to it `[PW-R8]`.

### 9.2 Component diagram

```
┌── backend-checks Deployment (replicas: N, HPA via KEDA) ──────────────┐
│  Pod                                                                   │
│  ├─ JVM (Java 21 + Spring Boot 3.3)                                    │
│  │   ├─ Tomcat (virtual threads) ← /api/v1/* REST                      │
│  │   ├─ checkExecutor (@Async, semaphore-bounded)                      │
│  │   └─ uiTestExecutor (bounded VT pool, size = studio.pool.size)      │
│  │       └─ Worker-thread state (held in ThreadLocal):                 │
│  │           - Playwright instance (creates + owns Node driver proc)   │
│  │           - Browser (Chromium, kept warm) [PW-01, PW-02, PW-04]     │
│  │           - Pool of BrowserContexts (cheap, per-test) [PW-03]       │
│  │                                                                     │
│  └─ Chromium subprocesses (1 per active context)                       │
│                                                                        │
│  Resources (per pod):                                                  │
│    requests: 2 CPU, 4 GiB memory, 1 Gi ephemeral-storage               │
│    limits:   2 CPU, 4 GiB memory, 2 Gi ephemeral-storage               │
│                                                                        │
│  K8s metadata:                                                         │
│    terminationGracePeriodSeconds: 180   [PW-12]                        │
│    preStop: exec /usr/local/bin/drain   (§9.5)                         │
│    readinessProbe: /actuator/health/studio-capacity                    │
│    PID 1: tini [PW-R6]                                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Concurrency model (PW-R1)

Fixed worker pool of `studio.pool.size` threads (default **4**). Each thread is pinned to its own Playwright + Browser via `ThreadLocal`:

```java
@Component
public class PlaywrightWorker {
    private static final ThreadLocal<WorkerState> STATE = ThreadLocal.withInitial(() -> {
        var pw = Playwright.create();
        var browser = pw.chromium().launch(new BrowserType.LaunchOptions().setHeadless(true));
        return new WorkerState(pw, browser);
    });

    public UiTestResult run(UiTest test) {
        var state = STATE.get();
        try (var ctx = state.browser().newContext(recordVideoOptions(test))) {
            var page = ctx.newPage();
            // execute plain-English steps via a DSL-to-Playwright translator
            return StepInterpreter.execute(test.steps(), page);
        }
    }
}
```

**Why ThreadLocal + bounded pool (not `newVirtualThreadPerTaskExecutor`):** Playwright objects are bound to their creating thread `[PW-02]`. A virtual thread can be mounted/unmounted to different carrier platform threads over its lifetime — incompatible with Playwright's thread affinity. We therefore use **platform threads** for the UI test executor (the single exception to virtual-thread default).

### 9.4 Per-pod capacity + cluster sizing (PW-R3)

Starting sizing (to be validated in M6 load test):

- Per pod: **4 concurrent UI tests**
- Target: 50 concurrent (NFR-THRU-04)
- Replicas needed: ⌈50 / 4⌉ = **13 pods**
- Safety margin: start with **15 replicas** at M6 rollout

**These numbers are estimates.** `[PW-05, PW-06, PW-07]` are `confidence: medium/low` findings. The M6 load test validates or corrects before we lock resource limits.

**M6 load-test acceptance criteria** `[TEST-03 revision]` — the test PASSES iff all of the following hold across a **60-minute sustained run**:
- 50 concurrent UI tests complete with **P95 duration ≤ 60s** (per NFR-PERF-03 complex-check envelope).
- **Zero OOMKilled** pod events (cgroup memory-limit respected).
- **Zero Chromium zombie processes** surviving pod shutdown (verified by tini-managed PID reaping + post-test `ps aux` on each node).
- **Zero video upload failures** to S3 (beyond the spec-accepted pod-evicted-mid-test edge, §9.7).
- Pod replica count stays within `[3, 20]` bounds — i.e., KEDA does not thrash scaling.

Below spec → tune `studio.pool.size`, pod resource limits, or KEDA thresholds, and re-run. Prod rollout blocked until PASS.

### 9.5 Graceful shutdown sequence (PW-12, PW-R5)

1. K8s sends `SIGTERM` → Spring Boot enters graceful-shutdown phase.
2. `preStop` hook runs `/usr/local/bin/drain` which:
   - `POST /actuator/shutdown-studio` → pod refuses new UI tests (readiness probe returns 503).
   - Waits up to `terminationGracePeriodSeconds - 10s` for in-flight tests to finish.
3. Spring lifecycle: `@PreDestroy` on `PlaywrightWorker` closes all `ThreadLocal` Playwright instances, which reap Chromium subprocesses.
4. JVM exits cleanly. `tini` (PID 1) reaps any orphans `[PW-R6]`.

`terminationGracePeriodSeconds: 180` because typical UI test timeout = 120s; leave 60s for drain + close.

### 9.6 Autoscaling (PW-R4)

**HPA on CPU is unreliable for Chromium workloads** `[PW-13]`. Use **KEDA** with a Prometheus scaler:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata: { name: checks-studio }
spec:
  scaleTargetRef: { name: backend-checks }
  minReplicaCount: 3
  maxReplicaCount: 20
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring:9090
        metricName: studio_active_tests_ratio
        threshold: "0.7"     # scale out when avg(active/capacity) > 0.7
        query: avg(studio_active_tests / studio_capacity)
```

**Why `0.7`** `[ACC-02 revision]`: at 70% saturation, KEDA reacts with ~1 pod of headroom before the readiness probe starts rejecting new tests. Lower (e.g., 0.5) scales eagerly and over-provisions; higher (e.g., 0.9) risks a queue-build before the new pod becomes ready (~30-60s pod cold-start with Chromium). Baseline value; **re-tuned during M6 load test** based on observed scale-up latency vs test-arrival rate.

Custom Micrometer gauges:
- `studio_active_tests` — how many UI tests each pod is currently running.
- `studio_capacity` — `studio.pool.size` (constant).

### 9.7 Video recording + S3 upload (FR-STUDIO-03)

Playwright records `.webm` natively via `BrowserContext.newPage().video()` — **no separate video-processing service needed**. `ASM-03` (Video Processing Service) is effectively eliminated as a dependency.

Flow:
1. `BrowserContext` starts with `recordVideo(new Path(...))` — writes to pod-local tmpfs.
2. On test completion, `Video.saveAs(target)` flushes; then `S3Client.putObject` uploads to `s3://<bucket>/studio/{ui_test_id}/{execution_id}.webm` `[CON-STACK-14]`.
3. URL stored in `ui_test_executions.video_url`.
4. Local tmpfs file deleted.

**Edge case:** if the pod dies mid-test before S3 upload, the video is lost. The `ui_test_executions` row is persisted with `status='ERROR', video_url=NULL, error_message='pod evicted during execution'`. Client sees a retry button. This is acceptable per PRD §10 (best-effort recording).

### 9.8 Image strategy (PW-R2)

Base image: `mcr.microsoft.com/playwright/java:v1.XX-jammy` with **only Chromium** installed `[PW-08, PW-09]`:

```dockerfile
FROM mcr.microsoft.com/playwright/java:v1.45.0-jammy
# Install only Chromium (saves ~1GB vs default "all browsers")
RUN mvn exec:java -e -Dexec.mainClass=com.microsoft.playwright.CLI \
    -Dexec.args="install --with-deps chromium" \
 && rm -rf ~/.cache ~/.m2
# Copy the Spring Boot layered jar
COPY --from=build /app/backend/build/libs/checks-*.jar /app/checks.jar
ENTRYPOINT ["tini", "--", "java", "-jar", "/app/checks.jar"]
```

Final image size: target **< 1.8 GiB** (JRE + Spring Boot app + Chromium + deps).

If Firefox / WebKit are ever requested (PRD §5.2 leaves the door open), publish separate image variants (`checks-backend:1.0.0-chromium`, `-firefox`, `-webkit`) and use NodeAffinity to route `ui_tests.browser=firefox` tests to Firefox pods via separate Deployments.

### 9.9 Step interpreter (FR-STUDIO-04)

Plain-English steps like `1. Go to "https://citi.com"` → `2. Click "Sign On"` are parsed by an interpreter that the frontend already has (see `frontend/src/utils/studio/ir/parseSteps.ts`). The **same IR** is executed by backend against Playwright. The frontend's existing parser becomes the **contract** — backend ports it to Java for server-side execution.

**⚠️ Non-trivial port** `[COMP-08 revision]`: `parseSteps.ts` contains DSL tokenization + step-type dispatch + argument-parsing logic. Direct line-count ≈ 300-500 LoC TypeScript. Port-to-Java is a **distinct SDC story** under EPIC-05 (§14, M5): tokenizer + step-type enum + argument parser + fuzz-test corpus shared with the TS original to prove parity. Estimated 2-3 dev-days.

Variables (`<var NAME>`) resolved from `ui_tests.variables` JSONB. Secrets (`<secret ID>`) resolved by `SecretResolver` just before step execution `[FR-STUDIO-05, FR-SECRET-01]`.

### 9.10 Python code generation (FR-STUDIO-06)

A separate, read-only endpoint: `GET /studio/tests/{id}/codegen?lang=python`. Translates the IR into Playwright-Python code using templates. No browser execution needed. This is a pure-function transformation, not a runtime concern.

---

## 10. Reports

### 10.1 Data model

`reports.sections` is a JSONB array of `ReportSection` objects (another sealed interface):

```java
public sealed interface ReportSection permits
    CheckResultsSection,    // { type: "checks", filters: {...}, group_by: "csi" }
    KpiSection,             // { type: "kpi", metric: "health_percentage" }
    FreeTextSection;        // { type: "text", markdown: "..." }
```

### 10.2 Live preview (FR-REP-02)

`POST /reports/{id}/preview` with body `{ "draft": true }` renders the HTML **against current data** (does NOT mutate, does NOT send). Response:

```json
{ "data": { "html": "<html>...</html>", "subject": "Checks Report: ..." } }
```

Used by the frontend's two-panel editor (`PRD §6 Reports UX`).

**Response-time SLO** `[TEST-02 revision]`:
- Reports with ≤ 50 checks: **P95 ≤ 500ms** (matches NFR-PERF-01 dashboard load envelope — preview is interactively-used).
- Reports with 50-500 checks: **P95 ≤ 2s**.
- Reports with > 500 checks: advisory only; editor should lazy-render sections.

Measured via Micrometer histogram `reports_preview_duration_seconds` (tagged by `section_count_bucket`).

### 10.3 Scheduled delivery

A dedicated `ReportDispatcher` bean `@Scheduled(fixedDelay = 60000)` polls `reports` where `status='active'` and schedule cron is due. For each due report:

1. Render HTML (same path as preview).
2. Build MIME message via `JavaMailSender` `[CON-STACK-14 adjacent]`.
3. Send via enterprise SMTP.
4. Persist `report_executions` row (status/timing/recipient_count/checks_included/email_content).

**Failure handling:** on SMTP failure, set `status='partial'` if some recipients succeeded, else `status='failed'`. Emit metric `reports_delivery_failures_total` (tagged by report_id).

### 10.4 Cross-CSI composition (FR-REP-04)

A `CheckResultsSection` can filter by **multiple CSI IDs** (not just one). The `ChecksService.findForReport(filters)` uses a single SQL query with `csi_id = ANY(?::text[])`. No N+1 issue.

---

## 11. External Integrations

Per complexity-dimension integration=5/5, each of the 9 integrations has a uniform integration pattern.

> **Note on DEBT-01 elimination** `[CONS-02 revision]`: `ASM-03` (external Video Processing Service) is **removed** from the dependency set — Playwright Java records video natively (see §9.7). Any future reference to "video processing service" should be treated as a stale artifact.

### 11.1 Uniform integration config shape `[CLR-01 revision]`

Every external integration's config follows this record shape (or a subtype thereof):

```java
public record IntegrationConfig(
    URI endpoint,
    String tokenSecretRef,           // <secret ID> resolved at runtime (§7.3)
    Duration connectTimeout,
    Duration readTimeout,
    String circuitBreakerName,       // matches resilience4j.circuitbreaker.instances.<name>.* in application.yml
    Map<String, Object> extra        // integration-specific (e.g., Splunk search-scope, Grafana org-id)
) {}
```

Stored in `application.yml` under `checks.integrations.<name>.*`. Per-env overrides via Spring profiles. Concrete subtypes (`SplunkIntegrationConfig extends IntegrationConfig`) add typed `extra` fields. This makes §11 table rows mechanical to implement.

### 11.2 Integration matrix

| Integration | Client | Auth | Timeout budget | Circuit breaker | Used by |
|---|---|---|---|---|---|
| CSI API | Spring `RestClient` `[CON-STACK-11]` | mTLS / static token (via Vault) | 2s connect / 5s read | Resilience4j, fallback: cached CSI read | `CsiService` |
| Enterprise OIDC | Spring Security JWKS | no auth (public key) | 3s | library-default | Every request |
| HashiCorp Vault | `VaultTemplate` | K8s service-account JWT `[HV-03]` | 1s connect / 3s read | `@CircuitBreaker("vault")` `[HV-R4]` | `SecretResolver` |
| SMTP | `JavaMailSender` | Relay auth (optional) | 30s | Retry 3× exp backoff | `ReportDispatcher` |
| Splunk | `RestClient` | Vault-resolved token | 5s connect / 60s read (SPL queries can be slow) | `@CircuitBreaker("splunk")` | `SplunkCheckExecutor` |
| Grafana | `RestClient` | Vault-resolved API key | 3s connect / 10s read | `@CircuitBreaker("grafana")` | `GrafanaCheckExecutor` |
| ITRS Geneos | `RestClient` | mTLS (Vault-resolved cert) | 3s connect / 10s read | `@CircuitBreaker("itrs")` | `ItrsCheckExecutor` |
| AppDynamics | `RestClient` | OAuth2 client-credentials (Vault-resolved) | 3s connect / 10s read | `@CircuitBreaker("appdynamics")` | `AppDynamicsCheckExecutor` |
| S3 | AWS SDK v2 `[CON-STACK-14]` | IAM role (IRSA) | SDK defaults | library-default retry | `UiTestVideoUploader` |

**Principle:** Every integration's timeout budget is lower than the surrounding SLO. For example, Splunk's 60s read is within `NFR-PERF-03` (P99 complex check < 30s) only because Splunk checks are explicitly classified "complex". If a faster SLA is needed, the check's timeout cap overrides.

---

## 12. Observability

### 12.1 Logs `[NFR-OBS-01, ARCH §11.2]`

- Format: JSON via `logstash-logback-encoder`.
- Correlation ID: `traceId` (OpenTelemetry-propagated), plus `userId`, `checkId`, `executionId` where applicable.
- Levels per context: `ERROR` (user-visible failure), `WARN` (degraded behavior or retry), `INFO` (lifecycle events), `DEBUG` (per-step trace; off in prod).
- No PII in logs — masked via `MaskingPatternLayout` on fields matching secret/email patterns.
- **Retention** `[COMP-06 revision]`: Shipped to enterprise Splunk collector. Follows `ARCH §11.2`: **30 days hot / 90 days warm**. Application emits, does not retain — no local log archiving beyond pod ephemeral-storage.

### 12.2 Metrics `[NFR-OBS-03]`

Micrometer → `/actuator/prometheus`. Standard JVM + Tomcat + Hikari + Hibernate metrics plus domain-specific counters/gauges:

| Metric | Type | Tags | Notes |
|---|---|---|---|
| `checks_executed_total` | counter | `check_type`, `status` (SUCCESS/FAILURE/WARNING/TIMEOUT), `csi_id` | FR-CHK-03 |
| `checks_execution_duration_seconds` | histogram | same as above | NFR-PERF-02/03 |
| `studio_active_tests` | gauge | pod | PW-R4 |
| `studio_capacity` | gauge | pod | PW-R4 |
| `reports_delivered_total` | counter | `status` | FR-REP-05 |
| `reports_delivery_failures_total` | counter | `report_id` | §10.3 |
| `checks_secret_expired_total` | counter | `check_id`, `secret_label` | §7.4 |
| `vault_calls_total` / `_errors_total` | counter | `operation` | HV-R4 |
| `integration_circuit_breaker_state` | gauge | `circuit_name` | §11 |
| `partition_future_months_available` | gauge | (none) | §8.2 health indicator |

### 12.3 Tracing `[NFR-OBS-02]`

OpenTelemetry auto-instrumentation agent attached at JVM start. Spans automatically created for: HTTP in/out, JDBC, Redis (M6+), Vault calls, S3 calls. Custom spans added via `@WithSpan` for `CheckExecutor.execute` and `ReportDispatcher.dispatch`.

Exporter: OTLP to enterprise collector (configured per env).

---

## 13. Testing

### 13.1 Pyramid (per ARCH §9.1)

| Tier | Tool | Target coverage |
|---|---|---|
| Unit | JUnit 5 + AssertJ + Mockito | 80% line (JaCoCo gate in `./gradlew check`) `[NFR-QUAL-01, CON-STACK-15]` |
| Slice | `@WebMvcTest`, `@DataJpaTest`, `@JsonTest` | controllers, repositories, DTO serialization |
| Integration (local) | `@SpringBootTest` + Zonky embedded PG `[CON-STACK-07]` | full stack, fast |
| Integration (CI) | `@SpringBootTest` + Testcontainers-Postgres + Testcontainers-Vault `[CON-STACK-16, HV-R5]` | RDS parity |
| E2E | Cypress (exists in frontend/) + backend deployed to staging | user journeys |
| Load | k6 | `NFR-THRU-01/02/03/04` validation in M6 |

### 13.2 RDS parity lint (ZK-R2)

A unit test scans Flyway migrations for RDS-forbidden statements:
- `ALTER SYSTEM` → FAIL
- `CREATE EXTENSION <not_in_allowlist>` → FAIL
- `SUPERUSER` grants → FAIL
- `ALTER USER ... SUPERUSER` → FAIL

Allowlist: `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `hstore` (matches standard RDS catalog).

### 13.3 Contract tests

REST API contracts generated from OpenAPI 3.1 spec. `springdoc-openapi-starter-webmvc-ui` emits the spec; a CI job diffs it against the committed `docs/specs/backend/openapi.yaml` — any unintended change fails the PR.

### 13.4 Partition tests

`PartitionSchedulerIT` runs against Zonky with `refresh=AFTER_CLASS` `[ZK-R4]`:
- Asserts idempotency of `CREATE TABLE IF NOT EXISTS ... PARTITION OF`.
- Asserts the boot-time listener creates +2 months.
- Asserts DETACH CONCURRENTLY works (requires non-transactional test scaffolding).
- Asserts the health indicator fails when the +3-day partition is missing.

### 13.5 Playwright tests

`UiTestExecutionIT` runs against Zonky + a headless Chromium in CI:
- Asserts `ThreadLocal<Playwright>` lifecycle (close on @PreDestroy).
- Asserts capacity is respected (submit N+1 tasks, N+1 blocks on semaphore).
- Asserts readiness probe flips when at capacity `[PW-R8]`.
- Asserts video upload happens; asserts tmpfs cleanup.

### 13.6 SLO validation framework `[REV-05 / TEST-01]`

Verifies NFR-AVAIL-01 (99.95% uptime) + NFR-PERF-01..04 + NFR-THRU-01..04 in staging before prod promotion.

| Component | Choice |
|---|---|
| **Soak duration** | **30 days** of continuous staging traffic at production-like RPS (~500 RPS average, per NFR-THRU-03) |
| **Error budget** | 99.95% = 0.05% allowed → ~21.6 minutes of downtime per 30-day window |
| **Synthetic probe cadence** | 1 probe/minute per critical path (`/csi`, `/checks/{id}` read, `/checks/{id}/execute` sync mode, `/reports/{id}/preview`). Probes emit metric `synthetic_probe_success_ratio` |
| **SLI calculation** | `synthetic_probe_success_ratio` rolled up to 1-hour windows; availability = % of windows with ≥ 99.9% success |
| **Prod-promotion gates** | (1) Error budget consumed < 50% in the prior 30-day staging window. (2) All NFR-PERF P95 SLOs met for ≥ 28 of the 30 days. (3) Zero critical CVEs in the deployed SBOM. (4) `./gradlew check` green on the exact commit being promoted. |
| **Alert routing** | Grafana on-call rota (same as ARCH §11 Monitoring). Error-budget burn > 2× rate pages immediately; `< 1×` emails daily summary |
| **Burn-rate alerts** | Multi-window, multi-burn-rate (1h × 14.4 + 6h × 6 fast burn; 24h × 3 + 72h × 1 slow burn) — Google SRE workbook pattern |

The M6 milestone's exit is extended to include "30-day staging soak complete with error budget < 50% consumed".

---

## 14. Milestone Roadmap

This section is a **preview** of Phase 6's `implementation.yaml`. It defines milestone boundaries so each can be independently epic'd in SDC.

| M | Scope | Exit criteria |
|---|---|---|
| **M1 — Walking skeleton** | `users`, `csi` (read-only), `checks` CRUD, `HttpCheckExecutor`, sync + async execute, `execution_results` with partition V1, JWT validation, Flyway | Frontend can point `VITE_API_URL` at `http://localhost:8080` and disable MSW for `/csi`, `/checks`, HTTP execution paths. `./gradlew check` green. |
| **M2 — Scheduling + TCP** | `schedules` CRUD, `@Scheduled` dispatcher + ShedLock `[PG-R5]`, `TcpCheckExecutor`, partition scheduler `[PG-R1]` + health indicator | Scheduled HTTP + TCP checks run + persist. `/actuator/health/partitions` green for +3 days. |
| **M3 — Integration checks + Vault** | `SplunkCheckExecutor`, `GrafanaCheckExecutor`, `ItrsCheckExecutor`, `AppDynamicsCheckExecutor`, `SecretResolver` with Vault K8s auth + Caffeine, tags CRUD | All 6 non-UI check types pass contract tests vs WireMock stubs. |
| **M4 — Reports** | `reports` CRUD, live preview, `ReportDispatcher`, SMTP, `report_executions` audit, cross-CSI composition | Maria's UC (PRD §6) completes end-to-end in staging. |
| **M5 — Checks Studio** | `ui_tests` CRUD, `PlaywrightWorker`, `UiTestCheckExecutor`, **step-IR port from frontend parseSteps.ts to Java (distinct story)** `[COMP-08]`, S3 upload, video streaming endpoint, Python codegen endpoint | Priya's UC (PRD §6) completes end-to-end. 4 concurrent UI tests per pod. |
| **M6 — Hardening** | Quartz migration, Redis cache tier, KEDA autoscaling, OpenTelemetry wiring, full k6 load test | NFR-THRU + NFR-PERF SLOs met in staging at 15 replicas. |

**Dependency DAG** (@architect elaborates in implementation.yaml):
```
M1 → M2 → M3 ──┐
              ├─→ M6
M1 → M4 ──────┤
M1 → M5 ──────┘
```
M3/M4/M5 can partly parallelize after M2 lands.

---

## 15. ARCH Debt Resolved

This spec resolves three inconsistencies found during Phases 2-3. The `ARCH.md` document should be amended to match — a follow-up cleanup PR owned by `@architect` (tracked outside this spec).

### DEBT-01 — Browser automation

- **ARCH §4.4 M5** currently reads "UI test execution via Selenium Grid client".
- **Change to:** "UI test execution via Playwright Java bundled in the backend container; scaled via K8s Deployment replicas; per-pod capacity bounded by `studio.pool.size` (default 4)."
- **ARCH §11 Assumptions** — "Browser Automation Service" becomes internal (not an external dependency).
- **ARCH §11** — "Video Processing Service" assumption **removed** (Playwright records natively, see §9.7).

### DEBT-02 — Retention for tags + secrets

Amend `ARCH §8 Retention Policy` table:

| Entity | Hot | Warm | Cold | Deletion |
|---|---|---|---|---|
| **Tags** | Active | N/A | N/A | **Indefinite — cascaded only via junction table ON DELETE CASCADE** |
| **Secret references** | Active | N/A | N/A | **Indefinite — enforced at use-time via `expires_at`** (§7.4) |

### DEBT-03 — Schedules endpoint group

Append to `ARCH §12.1` after `Check Operations`:

```
# Schedule Management
GET    /schedules                      # List schedules
POST   /schedules                      # Create schedule (body includes check_id)
GET    /schedules/{id}                 # Get schedule details
PUT    /schedules/{id}                 # Update schedule
PATCH  /schedules/{id}/enabled         # Toggle enabled
DELETE /schedules/{id}                 # Delete schedule
```

---

## 16. Open Risks (carry-forward)

| ID | Risk | Mitigation | Phase to retire |
|---|---|---|---|
| **R-01** | Playwright Java embedded in Spring Boot prod pod has no public precedent `[PW-14]`. | Phase 6 M5 includes a 48h burn-in before M6 load test. Detailed runbook for Chromium zombies + OOM in `docs/runbooks/studio.md` (M5). | M6 |
| **R-02** | `[PW-05/06/07]` sizing estimates (Chromium RSS, video CPU, per-pod cap) are `confidence: medium/low`. | M6 k6 + Playwright load test confirms or corrects `studio.pool.size` and pod replica count before prod rollout. | M6 |
| **R-03** | JDK 21 synchronized pinning may still affect 3rd-party libs outside Hibernate 6.4+. `[VT-03]` | Preprod runs with `-Djdk.tracePinnedThreads=short`; any hot lib switched or worked around. Full fix awaits JDK 24+ `[JEP 491]`. | M6 (or JDK upgrade) |
| **R-04** | Vault K8s auth role creation is a platform-team touchpoint `[HV-09]`. | Request submitted at M3 kickoff; blocker clearly called out in M3 epic. | M3 |
| **R-05** | Multi-replica scheduler race on partition DETACH `[PG-R5]`. | ShedLock integrated at M2 (not M6) specifically to cover this. | M2 |
| **R-06** | RDS parameter-group / extension allowlist differences from Zonky + Testcontainers `[ZK-06, ZK-08]`. | RDS-parity lint (§13.2) + staging run before prod promote on every release. | M1 (lint added) |
| **R-07** | Host PUT platform may inject different Jackson `ObjectMapper` `[MS-07]`, bypassing `@JsonSubTypes` registration. | Federated-mode integration test (M5) asserts polymorphic JSON roundtrip works when module is loaded by the host. | M5 |
| **R-08** | **JWT claim schema for CSI ownership (`citi_csi_claims`) is TBD with the enterprise identity platform team** `[REV-06, §7.2]`. Blocks `@PreAuthorize` implementation at M1. | Platform-team engagement as first task of M1 sprint 1. Fallback: stubbed local claim for dev/staging, production rollout blocked on real schema contract. | M1 (sprint 1) |

---

## 17. Traceability Appendix

### 17.1 FR coverage matrix

All 37 Functional Requirements from `requirements.json` are addressed in this spec. Below shows each FR → spec section + milestone.

| FR | Section(s) | Milestone |
|---|---|---|
| FR-CSI-01 | §5.2, §6.2 | M1 |
| FR-CSI-02 | §6.2 | M1 |
| FR-CSI-03 | §6.2 | M2 |
| FR-CHK-01 | §5.3 | M1-M5 |
| FR-CHK-02 | §6.2, §3.1 | M1 |
| FR-CHK-03 | §4.4, §6.2 | M1 |
| FR-CHK-04 | §11 (HTTP client) | M1 |
| FR-CHK-05 | §11 | M2 |
| FR-CHK-06 | §11 (Splunk) | M3 |
| FR-CHK-07 | §11 (Grafana) | M3 |
| FR-CHK-08 | §11 (ITRS) | M3 |
| FR-CHK-09 | §11 (AppD) | M3 |
| FR-CHK-10 | §5.2, §8.2 | M1 |
| FR-CHK-11 | §8.3 (trigger) | M1 |
| FR-CHK-12 | §11 (deep link in error payload) | M3 |
| FR-SCHED-01 | §6.3, §8.1 | M2 |
| FR-SCHED-02 | §6.3 | M2 |
| FR-SCHED-03 | §6.3 | M2 |
| FR-SCHED-04 | §8.1 M6 Quartz | M6 |
| FR-STUDIO-01 | §6.2, §9 | M5 |
| FR-STUDIO-02 | §9 | M5 |
| FR-STUDIO-03 | §9.7 | M5 |
| FR-STUDIO-04 | §9.9 | M5 |
| FR-STUDIO-05 | §9.9, §7.3 | M5 |
| FR-STUDIO-06 | §9.10 | M5 |
| FR-REP-01 | §10 | M4 |
| FR-REP-02 | §10.2 | M4 |
| FR-REP-03 | §10.4 | M4 |
| FR-REP-04 | §10.3 | M4 |
| FR-REP-05 | §10.3 | M4 |
| FR-REP-06 | §6.2 | M4 |
| FR-AUTH-01 | §7.1 | M1 |
| FR-AUTH-02 | §7.2 | M1 |
| FR-AUTH-03 | §3.1 users/ | M1 |
| FR-SECRET-01 | §7.3 | M3 |
| FR-SECRET-02 | §7.3 | M3 |
| FR-TAG-01 | §5.2, §6.2 | M3 |
| FR-FILTER-01 | §6.2 | M1 (basic) / M3 (tags) |
| FR-BULK-01 | §6.4 | M1 (delete) / M3 (update, tag) |

### 17.2 NFR coverage matrix

| NFR | Section | Validated in |
|---|---|---|
| NFR-PERF-01..04 | §11 (timeout budgets), §12 (metrics) | M6 load test |
| NFR-THRU-01..04 | §9.4 (sizing), §4.2 (bulkhead) | M6 load test |
| NFR-SCALE-01..04 | §8.2 (partitioning) | M6 load test + staging soak |
| NFR-AVAIL-01 | §11 (circuit breakers), §4.2 (bulkhead), §16 R-01 mitigation | staging soak |
| NFR-SEC-01..03 | §7 | M1 (SSO) / M3 (Vault) |
| NFR-SEC-04 (new) | §6.5 rate limiting | M1 (basic per-pod) / M6 (Redis cluster-wide) |
| NFR-OBS-01..03 | §12 | M1 (logs) / M6 (tracing) |
| NFR-QUAL-01 | §13 | CI (every PR) |
| NFR-RET-01..02 | §8.2 retention pruning | M6 |

### 17.3 Complexity signals → design response

| Signal (from complexity.json) | Response in this spec |
|---|---|
| 9 external integrations | Uniform pattern with circuit breakers + Vault-resolved auth (§11) |
| 99.95% availability | Bulkhead (§4.2) + graceful shutdown (§9.5) + circuit breakers + partition health alert |
| 500 RPS + 100k checks/hour | Virtual threads + bounded Hikari + partitioned writes + K8s HPA |
| Regulated domain | OIDC + RBAC + Vault + audit tables + PII masking + RDS parity lint |
| Browser automation | §9 entire section |
| Polymorphic checks | Sealed interface + MapStruct @SubclassMapping + Flyway CHECK constraint |
| 1M+ records/day | Monthly partitioning + app-managed DDL + DETACH CONCURRENTLY |

---

## 18. What this spec does NOT specify

Deferred to Phase 6 (`implementation.yaml`) or to individual SDC stories:

- Exact `build.gradle.kts` dependency versions (only policies here).
- Concrete OpenAPI yaml (will be generated from controllers + committed).
- Concrete Flyway SQL (will be authored against the ARCH §7 schema).
- Kubernetes manifests (referenced via Helm / Kustomize templates — M6 scope).
- Runbooks for ops scenarios (M5 authors `docs/runbooks/studio.md`; M6 authors `docs/runbooks/autoscaling.md`).
- Exact KEDA thresholds for scale-up / scale-down (tuned during M6 load test).
- CI pipeline yaml (owned by @devops).

---

## 19. Attestation (Article IV — No Invention)

Every claim in this specification traces to at least one of:
1. A PRD v2.2 section (`[PRD §x.y]`)
2. An ARCH.md section (`[ARCH §x.y]`)
3. A requirement ID in `requirements.json` (`[FR-*, NFR-*, CON-*, ASM-*, OOS-*]`)
4. A complexity classification in `complexity.json` (`[OQ-*, XC-*]`)
5. A research finding in `research.json` (`[PW-*, VT-*, MS-*, PG-*, ZK-*, HV-*]`)
6. A direct consequence of a preceding traced statement (e.g., "therefore…", "this implies…").

Where this spec **extends** `ARCH.md` (the 3 DEBT items in §15), the extension is explicitly labeled and carries its origin trace back to either a user decision (OQ-02, OQ-04) or an @architect proposal (OQ-03, OQ-05).

**Signed:** `@pm (Morgan)` · v1 2026-04-16 · v2 2026-04-17 · inputs at commits `2e5552def` (requirements), `08cde6fc0` (complexity), `20740b686` (research), `49cc591e4` (critique v1).

**Next step:** re-critique by `@qa (Quinn)` verifies revisions address REV-01..06. Expected verdict: APPROVED → Phase 6 `implementation.yaml` by `@architect`.
