# **Architecture Document: Project "Checks"**

## **1. Overview**

This document outlines the technical architecture and implementation plan for **Project "Checks"**, a centralized orchestration and standardization layer for operational health monitoring at Citibank. The primary goal is to provide a scalable, secure, and maintainable platform that fulfills the requirements detailed in the "Checks" PRD v2.2.

### **1.1. Architectural Principles**

- **Orchestration, Not Replacement:** The system is designed as an orchestration layer that integrates with existing monitoring tools like ITRS, Splunk, Grafana, and AppDynamics, not replace them.
    
- **Decoupled Frontend & Backend:** The React-based single-page application (SPA) will be developed independently from the Java backend services, enabled by a well-defined API contract.
    
- **Scalability by Design:** The architecture must handle a high volume of checks, including resource-intensive UI tests. For the initial build, this will be managed via in-process background tasks, with a design that allows for future migration to a more robust task queue system.
    
- **CSI as the Cornerstone:** The Citi System Inventory (CSI) is the primary organizing principle for all checks, dashboards, and reports.
    
- **Security First:** The design incorporates enterprise security standards from the ground up, including SSO, Role-Based Access Control (RBAC), and integration with a secrets vault.
    

---

## **2. High-Level System Architecture**

### **2.1. Current Implementation: Phase 1 (Frontend Prototype)**

The current implementation is a **frontend-only micro-frontend module** designed for stakeholder validation and approval before full backend development. This approach enables:
- Rapid prototyping with realistic user interactions
- Early stakeholder feedback and requirement validation
- Parallel development of backend services after UI approval

**Current Architecture Components:**

1. **Frontend Module (React Micro-Frontend):**
   - Built as a Module Federation remote module exposing `./Module`
   - Integrates with PUT Platform Shell via `@put/core-components` package
   - Complete UI implementation for all features: Check Builder, Checks Studio, Dashboards, Reports
   - Adaptive layout system that detects standalone vs federated deployment modes

2. **Mock Backend (MSW - Mock Service Worker):**
   - Browser-intercepted API layer providing realistic responses during development
   - Comprehensive mock data for all check types, CSI entities, execution results
   - Located in `src/services/mocks/` with handlers organized by domain
   - Enables full application functionality without backend dependency

3. **Platform Integration:**
   - **Federated Mode:** Webpack dev server on port 3002 (`npm run dev`)
   - **Standalone Mode:** Vite dev server on port 5173 (`npm run dev:standalone`)
   - Shared dependencies with host application: React, MUI, React Router, Emotion
   - Event-based communication with platform shell for navigation updates

4. **Development Workflow:**
   - Mock-first development using MSW for all API interactions
   - Component-driven development with isolated testing
   - Build outputs optimized for Module Federation consumption

### **2.2. Target Architecture: Phase 2 (Post-Approval Full Stack)**

Upon stakeholder approval of the UI prototype, the full architecture will be implemented with these additional components:

1. **Backend Platform:** A containerized Java 21 application using **Spring Boot 3.3+** providing the REST API and check orchestration engine. Source lives under `backend/` within this repository, built with **Gradle (Kotlin DSL)**. Runs on Eclipse Temurin 21 with Java virtual threads enabled for request handling and async orchestration.

2. **Data & Persistence:**
   - **Primary Database (PostgreSQL 15+):** Stores all core data including check definitions, schedules, historical results, users, and report configurations. Production uses a managed PostgreSQL service; local development uses an **embedded PostgreSQL** distribution (`io.zonky.test:embedded-postgres`) that runs a real Postgres binary in-process with zero external dependencies (the "SQLite-style" local story — no Docker required). This guarantees identical SQL semantics (JSONB, partitioning, GIN indexes, `gen_random_uuid()`) between local and production, which is why H2/compat-mode alternatives were rejected.
   - **Object Storage (S3/Equivalent):** Dedicated store for large binary objects, specifically video recordings from "Checks Studio".

3. **External & Supporting Services:** Critical dependencies the platform will integrate with:
   - **Monitored Systems:** ITRS, Splunk, Grafana, and AppDynamics
   - **Enterprise Services:** CSI API, SSO (OIDC), Secrets Vault, SMTP Relay for email reports
   - **"Checks Studio" Services:** Isolated Node/Playwright runner, authoring-time Citi LLM gateway, and private Sonic video/result-manifest storage. Java owns identity/CSI, immutable revisions, durable dispatch/results and SSE/GET progress. See [Studio architecture v2.1](docs/architecture/studio-execution.md) for component boundaries and contracts.
        

---

## **3. Frontend Architecture**

The frontend is a modern web application built with React, designed to be intuitive and aligned with the Citi Design System.

### **3.1. Technology Stack**

The UI is built using the following technology stack:

- **Framework:** React 18.2+ with TypeScript (strict mode).

- **Build Tools:**
    - **Webpack 5** with Module Federation for production and federated development (port 3002)
    - **Vite 5** for standalone development mode (port 5173)

- **UI Components:** Material-UI (MUI) v5.15 and Emotion for styling.

- **Routing:** React Router v6.21.

- **State Management:** Redux Toolkit with React Query for server state.

- **Authentication:** JWT-based authentication with `jwt-decode` (OIDC integration planned).
    

### **3.2. Mock Service Strategy**

To enable independent frontend development and facilitate the prototype-first approach, a mock service layer is a mandatory first step.

- **Implementation:** We will use **Mock Service Worker (MSW)**. MSW intercepts outgoing requests from the browser, allowing the UI to be fully developed without any dependency on a live backend.
    
- **Benefit:** This allows the UI team to build and test the entire application, including complex flows like the "Checks Studio," against a predictable mock backend, paving the way for stakeholder demos and approval.
    

---

## **4. Backend Architecture (Target - Phase 2)**

> **Note:** This section describes the planned backend architecture for Phase 2 implementation, post-UI approval. The current Phase 1 implementation uses MSW for all backend functionality.

The backend is a **Java 21 / Spring Boot 3** application, designed for modern concurrency (virtual threads), strong typing, and first-class Citi-tooling interoperability. It lives under `backend/` in this repository.

### **4.1. Technology Stack**

| Concern | Choice |
|---|---|
| Language | **Java 21 (LTS)** with preview features disabled — uses finalized pattern matching, records, sealed types |
| Framework | **Spring Boot 3.3+** (Spring Framework 6.1+) |
| Build | **Gradle 8+ (Kotlin DSL)** — `build.gradle.kts`, `settings.gradle.kts`, Gradle Wrapper committed |
| Web layer | Spring Web MVC with `spring.threads.virtual.enabled=true` (virtual-thread request handling) |
| Persistence | Spring Data JPA + **Hibernate 6.4+** (JSONB via `@JdbcTypeCode(SqlTypes.JSON)`; no SQLAlchemy/JPA-compat shims) |
| Migrations | **Flyway** (`org.flywaydb.flyway` Gradle plugin) — forward-only, versioned SQL under `backend/src/main/resources/db/migration` |
| Local DB | **Zonky Embedded PostgreSQL** (`io.zonky.test:embedded-postgres`) — activated via `local` Spring profile; real Postgres 15 binary, auto-provisioned, no Docker |
| Validation | Jakarta Bean Validation 3 (`jakarta.validation.constraints.*`) |
| Mapping | **MapStruct** for DTO ↔ entity conversion |
| Security | Spring Security + `spring-boot-starter-oauth2-resource-server` (JWT validation against enterprise OIDC issuer) |
| HTTP clients | Spring 6 `RestClient` (sync, default) and `WebClient` (streaming) for Splunk, Grafana, ITRS, AppDynamics, CSI API |
| Caching | **Caffeine** (local/in-process) for vertical slice; Redis (via `spring-boot-starter-data-redis-reactive`) layered in when horizontally scaled |
| Scheduling | Spring `@Scheduled` with `ThreadPoolTaskScheduler` for the vertical slice; **Quartz** (JDBC-backed, cluster-safe) introduced when >1 replica is deployed |
| Email | Spring Mail (`JavaMailSender`) via enterprise SMTP relay |
| Object storage | AWS SDK v2 (`software.amazon.awssdk:s3`) for UI test videos |
| Observability | Micrometer → Prometheus + **OpenTelemetry** auto-instrumentation agent; structured JSON logs via Logback + `logstash-logback-encoder` |
| Testing | JUnit 5, AssertJ, Mockito, `@SpringBootTest`, `@DataJpaTest`, **Testcontainers-PostgreSQL** for CI integration tests, Zonky embedded Postgres for local integration tests |
| Code quality | Spotless (google-java-format), Checkstyle, SpotBugs, JaCoCo (80% line coverage gate matching §9.1) |

### **4.2. Asynchronous Execution**

Ordinary check executions and report work use asynchronous executors. Studio has its own durable acceptance/dispatch lifecycle described below. A basic virtual-thread executor example is:

```java
@Bean("checkExecutor")
public AsyncTaskExecutor checkExecutor() {
    return new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
}
```

The REST controller immediately returns `202 Accepted` with an execution ID; the `@Async` method performs the work on a virtual thread and persists the result. This gives FastAPI-BackgroundTasks-equivalent simplicity while scaling to tens of thousands of concurrent blocking I/O operations (HTTP probes, Splunk queries) without a thread-per-task OS cost. The design stays queue-agnostic: when multi-instance scheduling or durable retries become required, the `@Async` call sites swap to a Spring Integration / Kafka / Rabbit producer with no controller-level change.

**Studio execution exception:** V1 uses a PostgreSQL dispatch ledger, dedicated bounded worker capacity, exclusive runner admission and idempotent callbacks/results. An in-memory `@Async` task is not the accepted-work store, and Studio does not consume the ordinary `checkExecutor`. SSE observes committed execution snapshots through the API; browser processes run only in `studio-runner`. See [Studio architecture §§3–5](docs/architecture/studio-execution.md#3-system-architecture).

### **4.3. Project Structure**

```
backend/
├── build.gradle.kts
├── settings.gradle.kts
├── gradle/wrapper/
├── gradlew, gradlew.bat
└── src/
    ├── main/
    │   ├── java/com/citi/put/checks/
    │   │   ├── ChecksApplication.java
    │   │   ├── config/          # Spring, security, async, cache, OpenAPI config
    │   │   ├── csi/             # CSI bounded context (controller, service, repo, entity, dto)
    │   │   ├── checks/          # Check management + execution dispatcher
    │   │   │   ├── executors/   # HttpCheckExecutor, TcpCheckExecutor, SplunkCheckExecutor, ...
    │   │   ├── scheduling/      # Schedule entity, cron resolution, @Scheduled dispatcher
    │   │   ├── studio/          # UI Test / Checks Studio
    │   │   ├── reports/         # Report definitions, rendering, delivery
    │   │   ├── users/           # User provisioning from JWT claims
    │   │   ├── secrets/         # Vault client + secret reference resolution
    │   │   └── common/          # Shared DTOs, error handling, pagination
    │   └── resources/
    │       ├── application.yml
    │       ├── application-local.yml     # activates Zonky embedded Postgres
    │       ├── application-prod.yml
    │       └── db/migration/V1__init.sql # mirrors §7 schema exactly
    └── test/
        ├── java/…
        └── resources/
```

Each bounded context is a package (vertical-slice layout, not layered-by-type) so a feature can be understood and modified in one place. Cross-cutting concerns live in `common/` and `config/`.

### **4.4. Implementation Strategy — Vertical Slice First**

The backend is built as a sequence of end-to-end vertical slices rather than layer-by-layer, to validate the full stack (controller → service → JPA → Postgres → Flyway → security → observability) as early as possible.

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M1 — Walking Skeleton** | CSI read-only endpoints + Checks CRUD + **HTTP check** executor + manual `/execute` + history list. JWT auth stubbed (dev issuer). Flyway V1 migration covering §7.1 core tables. Zonky local + Testcontainers CI. | Frontend MSW handlers for CSI/Checks/HTTP execution can be disabled and the UI works against the real backend on `localhost:8080`. |
| **M2 — Scheduling + more basic checks** | `@Scheduled` dispatcher, cron-based schedules, **TCP** executor. Execution result partitioning (V2 migration). | Scheduled HTTP + TCP checks run and persist results; status updates propagate via DB trigger. |
| **M3 — Integration check types** | Splunk, Grafana, ITRS, AppDynamics executors. Secrets vault integration for credentials. Caffeine caching for check configs. | All non-UI check types pass contract tests against stub servers. |
| **M4 — Reports** | Reports CRUD, live-preview endpoint, scheduled delivery, SMTP integration, `report_executions` audit. | Maria's UC (PRD §6) completes end-to-end. |
| **M5 — Checks Studio (UI tests)** | Exact revision compilation/confirmation; isolated Chromium; PostgreSQL dispatch ledger and admission/result callbacks; SSE snapshots with GET fallback; native video and durable manifest; private Range/download proxy; V1 recovery/security prerequisites. | Priya's revised UC (PRD §6) works in staging with stale-confirmation, restart, CSI, SSE and evidence tests; see Epic 10. |
| **M6 — Hardening** | Quartz migration for cluster-safe scheduling, Redis cache tier, OpenTelemetry wiring, load test vs §10 SLOs. | §10 throughput + §10.1 P95 SLOs met in staging. |

### **4.5. Key Responsibilities**

- **API Provision:** Exposes the RESTful API defined in §12 for the frontend to manage and view all checks, results, and reports.
- **Check Orchestration:** Dispatches check execution through a `CheckExecutor` SPI (one implementation per `CheckType`); executors make outbound calls to Splunk, Grafana, ITRS, AppDynamics, or the Browser Automation Grid. Results are persisted via a single atomic write path (see §8.2).
- **Authentication & Authorization:** Validates enterprise OIDC JWTs on every request via Spring Security; enforces RBAC using method-level `@PreAuthorize` expressions keyed on CSI ownership claims.
- **Scheduling:** Resolves cron expressions and next-execution timestamps, dispatches due checks to the async executor.
- **Secret resolution:** Replaces `<secret ID>` tokens in check configurations with vault-retrieved values at execution time only (never persisted in plaintext, never returned in API responses).

---

## **5. Data and Persistence (Target - Phase 2)**

> **Note:** This section describes the planned data persistence strategy for Phase 2. Current Phase 1 uses in-memory mock data via MSW.

- **Primary Database (PostgreSQL 15+):** Will house structured data for check definitions (e.g., HTTP, Splunk Query, UI Test Steps), schedules, historical results, and report configurations. The CSI will be the primary key for organizing most data.

- **Local development database:** Uses **Zonky Embedded PostgreSQL** activated by the `local` Spring profile — the backend starts a real Postgres 15 binary in-process on a random port, applies Flyway migrations, and tears it down on shutdown. No Docker, no `brew install postgres`, identical JSONB/partitioning/GIN semantics to production. This is the "SQLite-style" developer story requested in the design brief.

- **Object Storage (Sonic, S3-compatible):** Stores native Studio videos and small redacted terminal result manifests. The database stores private object keys, never durable public/presigned URLs. The API enforces immutable execution-CSI authorization and logical 30-day video expiry; Sonic lifecycle deletion/versioning behavior must be verified. Result manifests support recovery after API/runner delivery loss.


---

## **6. Security (Target - Phase 2)**

> **Note:** This section describes the planned security implementation for Phase 2. Current Phase 1 has placeholder authentication for UI demonstration.

- **Authentication:** User authentication will be handled via the enterprise SSO platform using the OIDC protocol. The frontend will use OIDC integration to manage the token flow, and the backend API will validate the JWT on every request.

- **Authorization (RBAC):** Access control will be managed by the backend, using claims within the JWT to determine which actions a user can perform based on their role and CSI ownership.

- **Secrets Management:** All credentials for connecting to databases and external tools will be stored in and retrieved from the enterprise secrets vault.
    

---

## **7. Database Schema (Target - Phase 2)**

> **Note:** This section describes the planned PostgreSQL database schema for Phase 2 implementation. The current Phase 1 uses TypeScript interfaces (see `src/types/`) and MSW mock data that mirror this schema design. The Java backend maps these tables with Spring Data JPA + Hibernate 6; JSONB columns use `@JdbcTypeCode(SqlTypes.JSON)` with a `Map<String, Object>` or a sealed-interface check-configuration type. All DDL in this section is expressed verbatim as Flyway migrations under `backend/src/main/resources/db/migration/`.

The database schema is designed around the **CSI (Citi System Inventory)** as the primary organizing principle, implementing a normalized relational model with strategic denormalization for performance.

### **7.1. Core Tables**

#### **users**
Central registry of all platform users integrated with enterprise SSO.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sso_id VARCHAR(255) NOT NULL UNIQUE,           -- Unique identifier from SSO/OIDC
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    department VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX idx_users_sso_id ON users(sso_id);
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE is_active = true;
CREATE INDEX idx_users_department ON users(department) WHERE is_active = true;
CREATE INDEX idx_users_last_login ON users(last_login DESC);
```

#### **csi_systems**
Central registry of all monitored systems from the Citi System Inventory.

```sql
CREATE TABLE csi_systems (
    id VARCHAR(20) PRIMARY KEY,                    -- CSI ID (e.g., "174523")
    name VARCHAR(255) NOT NULL,
    description TEXT,
    business_unit VARCHAR(100) NOT NULL,
    criticality VARCHAR(20) NOT NULL CHECK (criticality IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    owner_email VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE RESTRICT,
    environment VARCHAR(20) NOT NULL CHECK (environment IN ('Production', 'Staging', 'Development')),
    status VARCHAR(20) NOT NULL DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL', 'DEGRADED', 'DOWN', 'MAINTENANCE')),
    metadata JSONB DEFAULT '{}',                   -- Additional flexible attributes
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ                         -- Soft delete support
);

CREATE INDEX idx_csi_business_unit ON csi_systems(business_unit);
CREATE INDEX idx_csi_status ON csi_systems(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_csi_owner ON csi_systems(owner_email) WHERE deleted_at IS NULL;
CREATE INDEX idx_csi_owner_status ON csi_systems(owner_email, status) WHERE deleted_at IS NULL;
```

#### **checks**
Polymorphic table supporting all check types through JSONB configuration.

```sql
CREATE TABLE checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('HTTP', 'TCP', 'SPLUNK', 'GRAFANA', 'ITRS', 'APPDYNAMICS', 'UI_TEST')),
    csi_id VARCHAR(20) NOT NULL REFERENCES csi_systems(id),
    csi_name VARCHAR(255) NOT NULL,                -- Denormalized for performance
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PASSING', 'FAILING', 'WARNING', 'PENDING', 'UNKNOWN')),
    description TEXT,
    environment VARCHAR(50),
    configuration JSONB NOT NULL,                  -- Type-specific configuration
    schedule_id UUID,                              -- FK to schedules table
    last_execution_id UUID,                        -- FK to execution_results
    last_execution_at TIMESTAMPTZ,
    next_execution_at TIMESTAMPTZ,
    created_by VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT fk_checks_csi FOREIGN KEY (csi_id) REFERENCES csi_systems(id)
);

CREATE INDEX idx_checks_csi ON checks(csi_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_type ON checks(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_status ON checks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_next_execution ON checks(next_execution_at) WHERE deleted_at IS NULL AND next_execution_at IS NOT NULL;
CREATE INDEX idx_checks_configuration ON checks USING GIN (configuration);
CREATE INDEX idx_checks_created_by ON checks(created_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_created_by_csi ON checks(created_by, csi_id) WHERE deleted_at IS NULL;
```

#### **schedules**
Cron-based scheduling configuration for checks.

```sql
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    frequency VARCHAR(50) NOT NULL,                -- Human-readable (e.g., "every_5_minutes")
    cron_expression VARCHAR(100),                  -- Standard cron format
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    enabled BOOLEAN NOT NULL DEFAULT true,
    days_of_week INTEGER[],                        -- 0-6 (Sunday-Saturday)
    time_of_day TIME,                              -- For daily schedules
    metadata JSONB DEFAULT '{}',                   -- Additional scheduling params
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_schedules_check ON schedules(check_id);
CREATE INDEX idx_schedules_enabled ON schedules(enabled) WHERE enabled = true;
```

#### **execution_results**
Immutable audit trail of all check executions.

```sql
CREATE TABLE execution_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'WARNING', 'TIMEOUT')),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    duration_ms INTEGER NOT NULL,                  -- Execution time in milliseconds
    output TEXT,                                   -- Execution logs/output
    error_message TEXT,                            -- Error details if failed
    metadata JSONB DEFAULT '{}',                   -- Type-specific result data
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (started_at);

-- Monthly partitions for performance
CREATE TABLE execution_results_2024_01 PARTITION OF execution_results
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE INDEX idx_execution_check_time ON execution_results(check_id, started_at DESC);
CREATE INDEX idx_execution_status ON execution_results(status, started_at DESC);
```

#### **ui_tests**

Mutable Studio drafts and metadata, scoped to a registered immutable CSI. Add source/configuration revisions, compile request/status/diagnostics and candidate/confirmed revision references. Canonical browser is `chromium`; migrate the legacy `chrome` value explicitly. Name/description edits preserve readiness; execution-affecting edits require a new confirmation. Existing schedule/status fields do not imply scheduled Studio execution is implemented.

#### **ui_test_revisions**

New immutable source artifacts and nonsecret execution configuration, including source/artifact hashes, token references, model/prompt/validator/executor/runtime provenance and write-once confirmation identity/time. Executions retain their approved revision after later edits or soft deletion.

#### **ui_test_executions**

Partitioned execution history with immutable CSI/revision snapshot. Outcomes are `PENDING | RUNNING | PASSED | FAILED | ERROR`; steps include terminal `SKIPPED`. Video availability/error/expiry is independent of outcome. Store object keys and structured bounded redacted logs/results; no resolved secrets.

The physical primary key is `(id, started_at)` after the existing V7 migration. Keep `started_at` immutable as acceptance/partition time, add nullable `browser_started_at`, and make end/duration nullable for in-flight rows. The public DTO distinguishes `acceptedAt` from browser `startedAt`. Migrate all partitions/defaults and update `last_run_status` to include ERROR, guarded against older late results.

#### **Studio dispatch ledger**

New unpartitioned ledger with globally unique execution identity and the history partition locator. Owns persistent execute idempotency, claim leases/deadlines, attempt/admission identity, runner sequence, snapshot revision and known manifest key. Admission is exclusive; an ambiguous browser attempt is never automatically replayed. Pending/running/finalization recovery is required in V1.

Studio target field definitions and migration requirements are maintained in [Studio architecture §8](docs/architecture/studio-execution.md#8-data-model--api-contracts); do not copy its DDL into a second target schema here. Existing Flyway migrations describe the deployed schema until forward-only migrations implement the target. Studio SSE uses persisted snapshots across API replicas; no broker or sticky session is required. Scheduled/unified UI_TEST dashboard/report integration follows V1.

### **7.2. Supporting Tables**

#### **reports**
Report configurations for scheduled delivery.

```sql
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template VARCHAR(50) NOT NULL CHECK (template IN ('standard', 'executive', 'detailed', 'alert-digest', 'trend-analysis')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'paused', 'draft')),
    schedule JSONB NOT NULL,                       -- Scheduling configuration
    recipients TEXT[] NOT NULL,                    -- Array of email addresses
    sections JSONB NOT NULL DEFAULT '[]',          -- Report section configurations
    created_by VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sent_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_reports_status ON reports(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_last_sent ON reports(last_sent_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_created_by ON reports(created_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_created_by_status ON reports(created_by, status) WHERE deleted_at IS NULL;
```

#### **report_executions**
Audit trail for report generation and delivery.

```sql
CREATE TABLE report_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
    executed_at TIMESTAMPTZ NOT NULL,
    recipient_count INTEGER NOT NULL,
    checks_included INTEGER NOT NULL,
    checks_failed INTEGER DEFAULT 0,
    generation_duration_ms INTEGER,
    email_content TEXT,                            -- Generated HTML content
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_exec_report ON report_executions(report_id, executed_at DESC);
```

#### **tags**
Flexible tagging system for checks and CSI systems.

```sql
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    description TEXT,
    color VARCHAR(7),                              -- Hex color code
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE check_tags (
    check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (check_id, tag_id)
);

CREATE TABLE csi_tags (
    csi_id VARCHAR(20) NOT NULL REFERENCES csi_systems(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (csi_id, tag_id)
);

CREATE INDEX idx_check_tags_check ON check_tags(check_id);
CREATE INDEX idx_check_tags_tag ON check_tags(tag_id);
CREATE INDEX idx_csi_tags_csi ON csi_tags(csi_id);
```

#### **secrets**
Secret references for vault integration.

```sql
CREATE TABLE secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id VARCHAR(255) NOT NULL UNIQUE,     -- Vault reference ID
    label VARCHAR(255) NOT NULL,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('project', 'org', 'user')),
    owner VARCHAR(255) NOT NULL,
    last_four VARCHAR(4),                          -- Masked preview
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_secrets_owner ON secrets(owner);
CREATE INDEX idx_secrets_scope ON secrets(scope);
```

### **7.3. Aggregate/Materialized Views**

#### **csi_metrics_current**
Real-time aggregated metrics per CSI.

```sql
CREATE MATERIALIZED VIEW csi_metrics_current AS
SELECT
    cs.id as csi_id,
    cs.name as csi_name,
    COUNT(c.id) as total_checks,
    COUNT(c.id) FILTER (WHERE c.status = 'PASSING') as passing_checks,
    COUNT(c.id) FILTER (WHERE c.status = 'FAILING') as failing_checks,
    COUNT(c.id) FILTER (WHERE c.status = 'WARNING') as warning_checks,
    CASE
        WHEN COUNT(c.id) = 0 THEN 100
        ELSE (COUNT(c.id) FILTER (WHERE c.status = 'PASSING')::DECIMAL / COUNT(c.id)) * 100
    END as health_percentage,
    MAX(c.last_execution_at) as last_check_execution,
    NOW() as calculated_at
FROM csi_systems cs
LEFT JOIN checks c ON cs.id = c.csi_id AND c.deleted_at IS NULL
WHERE cs.deleted_at IS NULL
GROUP BY cs.id, cs.name;

CREATE UNIQUE INDEX idx_csi_metrics_current_csi ON csi_metrics_current(csi_id);
```

### **7.4. Database Constraints & Triggers**

#### **Updated_at Trigger**
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_checks_updated_at BEFORE UPDATE ON checks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_csi_updated_at BEFORE UPDATE ON csi_systems
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### **Check Status Update Trigger**
```sql
CREATE OR REPLACE FUNCTION update_check_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status != OLD.status THEN
        UPDATE checks
        SET status = NEW.status,
            last_execution_id = NEW.id,
            last_execution_at = NEW.ended_at
        WHERE id = NEW.check_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_check_on_execution
AFTER INSERT ON execution_results
FOR EACH ROW EXECUTE FUNCTION update_check_status();
```

### **7.5. Performance Optimization**

#### **Partitioning Strategy**
- **execution_results**: Monthly range partitions on `started_at`
- **ui_test_executions**: Monthly range partitions on `started_at`
- **report_executions**: Quarterly range partitions on `executed_at`

#### **Index Strategy**
- Primary lookups: B-tree indexes on foreign keys and timestamps
- JSON searches: GIN indexes on JSONB columns
- Full-text search: GiST indexes on text fields (future)

#### **Connection Pooling**
- **PgBouncer** configuration for connection pooling
- Pool size: 25 connections per app instance
- Max client connections: 1000

---

## 8. Data Access Patterns

### 1. Query Patterns

**Most Common Queries:**
```sql
-- Checks by CSI with current status
SELECT c.*, er.status as last_status
FROM checks c
LEFT JOIN execution_results er ON c.last_execution_id = er.id
WHERE c.csi_id = ? AND c.deleted_at IS NULL;

-- Health metrics aggregation
SELECT
  csi_id,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'PASSING' THEN 1 ELSE 0 END) as passing
FROM checks
GROUP BY csi_id;

-- Recent failures for alerting
SELECT * FROM execution_results
WHERE status = 'FAILURE'
  AND start_time > NOW() - INTERVAL '1 hour'
ORDER BY start_time DESC;
```

### 2. Write Patterns

**Transaction Boundaries:**
- Check creation: Check + Schedule in single transaction
- Execution recording: Result + Check status update atomic
- Report generation: Read-only snapshot isolation

### 3. Caching Strategy

**Redis Cache Layers:**
```
L1: Session data (5 minutes)
L2: CSI metrics (5 minutes)
L3: Check configurations (1 hour)
L4: Report templates (24 hours)
```

## Data Lifecycle

### 1. Creation Flow
```
User Input → Validation → Transaction Start →
  Insert Check → Insert Schedule → Insert Audit Log →
Transaction Commit → Cache Invalidation → Event Emission
```

### 2. Execution Flow
```
Scheduler Trigger → Load Check Config → Execute Check →
  Store Result → Update Check Status → Update CSI Metrics →
Notify Subscribers → Update Cache
```

### 3. Retention Policy

| Entity | Hot Storage | Warm Storage | Cold Storage | Deletion |
|--------|------------|--------------|--------------|----------|
| Checks | Active | N/A | N/A | Soft delete |
| Execution Results | 30 days | 90 days | 1 year | Hard delete |
| UI Test Videos | 7 days | 30 days | N/A | Hard delete |
| Audit Logs | 90 days | 1 year | 7 years | Archive |
| CSI Metrics | 24 hours | 30 days | 1 year | Aggregate |

## Performance Considerations

### 1. Indexing Strategy

**Primary Indexes:**
- checks(csi_id, status, deleted_at)
- execution_results(check_id, start_time)
- execution_results(status, start_time)

**Secondary Indexes:**
- checks(type, environment)
- checks(tags) - GIN index for array search
- reports(status, next_execution)

### 2. Denormalization

**Purposeful Redundancy:**
- `csiName` in Check entity (avoid joins)
- `lastExecution` in Check (avoid subquery)
- Aggregated metrics in CSIMetrics (avoid COUNT queries)

## Migration Strategy

### Schema Versioning
- **Flyway** (forward-only) via the `org.flywaydb.flyway` Gradle plugin
- Migrations under `backend/src/main/resources/db/migration/` named `V{n}__{description}.sql`
- Backward compatibility for 2 versions (no destructive DDL without a prior additive release)
- `flywayValidate` runs in CI; `flywayMigrate` runs at app startup in all environments

## **9. Testing Strategy**

### **9.1. Test Pyramid**

- **Unit Tests:** 80% line-coverage target (enforced by JaCoCo gate in Gradle `check` task)
    - Components: React Testing Library
    - Frontend Business Logic: Vitest
    - Backend: **JUnit 5 + AssertJ + Mockito**; slice tests with `@WebMvcTest`, `@DataJpaTest`, `@JsonTest`

- **Integration Tests:** Critical paths
    - `@SpringBootTest` with **Testcontainers-PostgreSQL** in CI, **Zonky embedded Postgres** locally (identical Postgres 15 binary both sides, so test parity is preserved)
    - External service connectors verified against **WireMock** stubs for Splunk/Grafana/ITRS/AppDynamics
    - Contract tests for the REST API generated from the OpenAPI spec via `springdoc-openapi`

- **E2E Tests:** User journeys
    - Check creation and execution
    - Checks Studio workflows
    - Report generation

- **Performance Tests:**
    - Load testing with K6
    - Stress testing for concurrent checks
    - UI performance with Lighthouse

### **9.2. Quality Gates**

- **Pre-commit:** Linting and formatting
- **Pull Request:** Unit tests, coverage check
- **Pre-deployment:** Full test suite
- **Post-deployment:** Smoke tests and monitoring

---

## **10. Performance Requirements**

### **10.1. Response Time SLOs**

| Operation | P50 | P95 | P99 |
|-----------|-----|-----|-----|
| Dashboard Load | < 500ms | < 1s | < 2s |
| Check Execution (Simple) | < 100ms | < 500ms | < 1s |
| Check Execution (Complex) | < 5s | < 10s | < 30s |
| Report Generation | < 10s | < 30s | < 60s |

### **10.2. Throughput Requirements**

- **Concurrent Users:** 1,000+
- **Checks per Hour:** 100,000+
- **API Requests per Second:** 500 RPS
- **UI Test Concurrent Executions:** 50

### **10.3. Scalability Targets**

- **Total Checks:** 10,000+
- **Execution History:** 1M+ records/day
- **CSI Entities:** 5,000+
- **Active Reports:** 1,000+

---

## **11. Monitoring & Observability**

### **11.1. Application Metrics**

- **Business Metrics:**
  - Check success/failure rates by CSI
  - Mean time to detection (MTTD)
  - Report delivery success rate
  - UI test completion rate

- **Technical Metrics:**
  - API response times and error rates
  - Database query performance
  - Background task queue depth
  - Memory and CPU utilization

### **11.2. Logging Strategy**

- **Structured Logging:** JSON format with correlation IDs
- **Log Levels:** ERROR, WARN, INFO, DEBUG
- **Centralized Aggregation:** Splunk integration
- **Retention:** 30 days hot, 90 days warm

### **11.3. Tracing & Debugging**

- **Distributed Tracing:** OpenTelemetry implementation
- **Request Correlation:** UUID tracking across services
- **Performance Profiling:** Critical path analysis
- **Error Tracking:** Automated alerting for critical failures

---

## **12. API Contract**

### **12.1. RESTful API Design**

**Base URL:** `/api/v1`

**Core Endpoints:**

```
# CSI Management
GET    /csi                      # List all CSI entities
GET    /csi/{id}                # Get specific CSI
GET    /csi/{id}/metrics        # Get CSI health metrics
GET    /csi/{id}/checks         # List checks for CSI

# Check Operations
GET    /checks                   # List checks with filters
POST   /checks                   # Create new check
GET    /checks/{id}              # Get check details
PUT    /checks/{id}              # Update check
DELETE /checks/{id}              # Delete check
POST   /checks/{id}/execute     # Trigger manual execution
GET    /checks/{id}/history     # Get execution history

# UI Test Management
GET    /studio/tests            # List UI tests
POST   /studio/tests            # Create UI test
GET    /studio/tests/{id}       # Get test details
PUT    /studio/tests/{id}                 # Save draft with optimistic revisions
DELETE /studio/tests/{id}                 # Soft delete; preserve history
POST   /studio/tests/{id}/compile         # Asynchronous compilation
POST   /studio/tests/{id}/confirm-compile # Confirm exact candidate identity
POST   /studio/tests/{id}/execute         # Durable idempotent acceptance
GET    /studio/executions                 # CSI-filtered paged history; optional testId
GET    /studio/executions/{id}            # Current execution/evidence snapshot
GET    /studio/executions/{id}/events     # Authorized SSE snapshots
GET    /studio/executions/{id}/video      # Authorized Range stream; download=true supported

# Reporting
GET    /reports                  # List reports
POST   /reports                  # Create report
GET    /reports/{id}            # Get report details
POST   /reports/{id}/preview    # Generate preview
POST   /reports/{id}/send       # Send report immediately
```

### **12.2. Response Format**

```json
{
  "data": {},
  "metadata": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "hasMore": true
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### **12.3. Authentication**

- **Method:** Bearer token (JWT)
- **Header:** `Authorization: Bearer <token>`
- **Token Refresh:** Automatic with refresh token
- **Session Duration:** 8 hours

---

## **13. Deployment Architecture**

### **13.1. Containerization**

- **Frontend:** Nginx container serving static React assets
- **Backend:** Eclipse Temurin 21 JRE running a Spring Boot **layered jar** image produced by the Gradle `bootBuildImage` task (Paketo buildpacks) or a multi-stage `Dockerfile`. Default container port **8080**. `JAVA_TOOL_OPTIONS` tuned for container-aware heap sizing.
- **Database:** Managed PostgreSQL service (production/staging); Zonky embedded Postgres in local dev (see §5)
- **Cache:** Managed Redis cluster (introduced at milestone M6 — see §4.4); vertical slice runs with Caffeine only

### **13.2. Kubernetes Deployment**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checks-frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: checks-frontend
  template:
    spec:
      containers:
      - name: frontend
        image: checks-frontend:latest
        ports:
        - containerPort: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checks-backend
spec:
  replicas: 5
  selector:
    matchLabels:
      app: checks-backend
  template:
    spec:
      containers:
      - name: backend
        image: checks-backend:latest
        ports:
        - containerPort: 8000
```

### **13.3. Environment Configuration**

| Environment | Frontend URL | Backend URL | Database |
|------------|--------------|-------------|----------|
| Development | localhost:5173 | localhost:8080 | Zonky Embedded PostgreSQL 15 (in-process, `local` profile) |
| Staging | checks-staging.citi.com | api-staging.checks.citi.com | PostgreSQL (RDS) |
| Production | checks.citi.com | api.checks.citi.com | PostgreSQL (RDS) |

---

## **14. Future Enhancements**

### **14.1. Phase 3 Features (Post-MVP)**

- **Advanced Analytics:** ML-based anomaly detection
- **Mobile Application:** Native iOS/Android apps
- **GraphQL API:** Alternative to REST for complex queries
- **Webhook Support:** Real-time notifications
- **Plugin Architecture:** Custom check type extensions

### **14.2. Technical Improvements**

- **Event-Driven Architecture:** Kafka integration
- **Multi-Region Deployment:** Geographic distribution
- **Graph Database:** Neo4j for dependency mapping
- **Time-Series Database:** TimescaleDB for metrics
- **Service Mesh:** Istio for microservices communication

### **14.3. Integration Roadmap**

- **ServiceNow:** Incident management integration
- **Jira:** Automated ticket creation
- **Slack/Teams:** Chat notifications
- **PagerDuty:** On-call escalation
- **Tableau:** Advanced visualization