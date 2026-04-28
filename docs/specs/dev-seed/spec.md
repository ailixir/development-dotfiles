# Dev Profile Sample Data — Specification

| Field | Value |
|-------|-------|
| **Spec ID** | `dev-seed-v1` |
| **Phase** | 4 — Write Spec |
| **Owner** | @pm (Morgan) |
| **Date** | 2026-04-27 |
| **Status** | DRAFT |
| **Classification** | SIMPLE (7/25) |
| **Inputs** | `requirements.json`, `complexity.json`, `research.json` |

---

## 1. Purpose

Provide a `dev` Spring profile that populates the embedded PostgreSQL database with realistic sample data on startup, enabling:
- Frontend-backend integration development without manual data entry
- Stakeholder presentations with meaningful dashboard metrics
- Developer onboarding with a pre-populated environment

**Trace:** FR-DEV-01, FR-DEV-02, FR-DEV-07, USER_REQ

---

## 2. Approach — Flyway Repeatable Migration

**Selected:** Option A from RF-01 — Flyway Repeatable Migration with profile-scoped `spring.flyway.locations`.

**Rationale:**
1. Native Flyway mechanism — zero custom Java code (NFR-DEV-02)
2. Runs after all V* migrations — schema guaranteed current (CON-DEV-02)
3. Profile isolation via `spring.flyway.locations` override (FR-DEV-05)
4. Checksum tracking — auto re-runs on content change (FR-DEV-06)
5. Established pattern in codebase: V3 seeds check_templates via Flyway (RF-05)

**Rejected alternatives:**
- Option B (ApplicationRunner): Adds Java code to production classpath; slower startup; Hibernate lifecycle complexity (RF-01)
- Option C (spring.sql.init): Spring explicitly warns against combining with Flyway (RF-01)

**Trace:** RF-01, RF-02, RF-05

---

## 3. New Files

| # | File | Purpose |
|---|------|---------|
| 1 | `backend/src/main/resources/application-dev.yml` | Spring profile config — includes `local`, adds Flyway seed location |
| 2 | `backend/src/main/resources/db/seed/dev/R__dev_sample_data.sql` | Repeatable migration — all sample data |

**Modified files:**
| # | File | Change |
|---|------|--------|
| 1 | `backend/README.md` | Add dev profile usage instructions |

**Trace:** NFR-DEV-02 (no production code changes), NFR-DEV-05 (self-documenting)

---

## 4. Profile Configuration

### 4.1 `application-dev.yml`

```yaml
spring:
  config:
    activate:
      on-profile: dev
  profiles:
    include: local
  flyway:
    locations:
      - classpath:db/migration
      - classpath:db/seed/dev

checks:
  scheduling:
    dispatcher-enabled: false

logging:
  level:
    com.citi.put.checks: DEBUG
    org.flywaydb: INFO
```

**Key design decisions:**

| Decision | Rationale | Trace |
|----------|-----------|-------|
| `profiles.include: local` | Inherits Zonky embedded Postgres — zero Docker | FR-DEV-02, APP_LOCAL |
| `flyway.locations` lists BOTH paths | Override replaces, not appends — must include base `db/migration` | RF-02 |
| `dispatcher-enabled: false` | No auto-execution during demos — checks stay in seeded state | Inherited from local profile |
| `logging.level DEBUG` | Useful for development; INFO for Flyway shows migration execution | NFR-DEV-05 |

**IMPORTANT (RF-02):** `spring.flyway.locations` in a profile-specific YAML **replaces** the base value. Both `classpath:db/migration` and `classpath:db/seed/dev` must be listed explicitly. Omitting the first would skip versioned migrations entirely.

---

## 5. Sample Data Narrative

The seed data tells the story of three CSI systems at different health levels, monitored by a team of five users across Citi's Technology division.

### 5.1 Users (5 rows)

| sso_id | Name | Email | Department | Role |
|--------|------|-------|------------|------|
| jm78901 | John Martinez | john.martinez@example.com | Technology Operations | ADMIN |
| sk12345 | Sarah Kim | sarah.kim@example.com | Site Reliability Engineering | USER |
| rp45678 | Raj Patel | raj.patel@example.com | Quality Assurance | USER |
| lw23456 | Lisa Wang | lisa.wang@example.com | Software Engineering | USER |
| mc67890 | Mike Chen | mike.chen@example.com | Engineering Management | VIEWER |

**Trace:** V1_INIT — users table; NFR-DEV-04 (fictional names/emails)

### 5.2 CSI Systems (3 rows)

| CSI ID | Name | Criticality | Environment | Status | Health Story |
|--------|------|-------------|-------------|--------|-------------|
| CSI-10001 | Global Payments Gateway | CRITICAL | Production | OPERATIONAL | ~90% healthy — 1 failing HTTP check (demo: near-green state with alert) |
| CSI-10002 | Trade Settlement Engine | HIGH | Production | DEGRADED | ~60% healthy — multiple failures (demo: degraded system) |
| CSI-10003 | Developer Portal | MEDIUM | Production | OPERATIONAL | 100% healthy (demo: green state) |

**Business units:** Global Transaction Services, Securities Services, Technology

**Trace:** FR-DEV-07 (coherent demo narrative), V1_INIT (csi_systems table, criticality/status CHECK constraints)

### 5.3 Checks (15 rows)

| CSI | Check Name | Type | Intended Final Status | Configuration Summary |
|-----|-----------|------|----------------------|----------------------|
| CSI-10001 | GPG Health Endpoint | HTTP | PASSING | GET /health, expect 200 |
| CSI-10001 | GPG Auth Service | HTTP | PASSING | GET /auth/status, expect 200 |
| CSI-10001 | GPG Payment Processing | HTTP | FAILING | POST /api/payments/validate, expect 200 |
| CSI-10001 | GPG Database Primary | TCP | PASSING | host: gpg-db-primary.internal, port: 5432 |
| CSI-10001 | GPG Cache Cluster | TCP | PASSING | host: gpg-redis.internal, port: 6379 |
| CSI-10002 | TSE Health Endpoint | HTTP | PASSING | GET /health, expect 200 |
| CSI-10002 | TSE Order Matching | HTTP | FAILING | GET /api/matching/status, expect 200 |
| CSI-10002 | TSE Settlement Queue | HTTP | FAILING | GET /api/settlement/queue/health, expect 200 |
| CSI-10002 | TSE Risk Calculator | HTTP | WARNING | GET /api/risk/status, expect 200 |
| CSI-10002 | TSE Database Primary | TCP | PASSING | host: tse-db-primary.internal, port: 5432 |
| CSI-10002 | TSE Message Broker | TCP | FAILING | host: tse-mq.internal, port: 5672 |
| CSI-10003 | DevPortal Health | HTTP | PASSING | GET /health, expect 200 |
| CSI-10003 | DevPortal API Gateway | HTTP | PASSING | GET /api/v1/status, expect 200 |
| CSI-10003 | DevPortal CDN | HTTP | PASSING | GET /cdn/health, expect 200 |
| CSI-10003 | DevPortal Database | TCP | PASSING | host: devportal-db.internal, port: 5432 |

**Status propagation (RF-06):** Checks are inserted with `status = 'PENDING'`. The `update_check_status_from_execution` trigger on `execution_results` propagates the final status. The last inserted execution result per check determines the visible status.

**JSONB configuration contracts (CON-DEV-04):**
- HTTP: `{"type":"HTTP","method":"...","url":"...","expectedStatusCode":200,"timeoutMs":5000,"followRedirects":true,"verifyTls":true}`
- TCP: `{"type":"TCP","host":"...","port":...,"timeoutMs":5000}`

**Trace:** FR-DEV-03 (all core entities), CON-DEV-04 (JSONB contracts), CON-DEV-06 (unique constraints)

### 5.4 Schedules (12 rows)

Attached to 12 of the 15 checks (3 checks intentionally unscheduled to demonstrate the "no schedule" UI state).

| Frequency | Cron Expression | Count | Example Checks |
|-----------|----------------|-------|----------------|
| every_5m | `*/5 * * * *` | 3 | Health endpoints (critical) |
| every_15m | `*/15 * * * *` | 4 | Service status checks |
| hourly | `0 * * * *` | 3 | Database/infrastructure checks |
| daily | `0 8 * * *` | 2 | Non-critical checks (DevPortal) |

**Trace:** FR-DEV-03 (schedules entity), V2_SCHEDULE (next_execution_at column)

### 5.5 Execution Results (~450 rows)

**Distribution strategy:**
- 30 results per check × 15 checks = 450 rows
- Temporal spread: last 28 days from CURRENT_TIMESTAMP (all within current-month partition)
- Status distribution per check matches its intended final status:
  - PASSING checks: ~90% SUCCESS, ~5% WARNING, ~5% TIMEOUT
  - FAILING checks: ~30% SUCCESS, ~50% FAILURE, ~10% WARNING, ~10% TIMEOUT
  - WARNING checks: ~60% SUCCESS, ~30% WARNING, ~10% FAILURE

**Partition safety (CON-DEV-03, CON-DEV-07, RF-04):**
All `started_at` timestamps use `CURRENT_TIMESTAMP - (N * INTERVAL '1 day')` where N ranges from 0 to 27. This guarantees all rows land in the current-month partition (created by V1 if April/May 2026, or by PartitionScheduler.bootstrap() for subsequent months).

**Trigger interaction (RF-06):** Rows inserted in `started_at ASC` order per check_id. The last row (most recent) fires the `update_check_status_from_execution` trigger and sets the check's current status.

**Trace:** FR-DEV-04 (dashboard metrics), FR-DEV-08 (partition demonstration), CON-DEV-03 (partition safety)

### 5.6 Tags (8 rows) + Junction Tables

| Tag Name | Category | Color | Applied To |
|----------|----------|-------|-----------|
| production | environment | #d32f2f | CSI-10001, CSI-10002, CSI-10003 |
| critical-path | priority | #f57c00 | CSI-10001 |
| sre-owned | team | #1976d2 | CSI-10001, CSI-10002 |
| http-monitor | type | #388e3c | HTTP checks |
| tcp-monitor | type | #7b1fa2 | TCP checks |
| payments | domain | #0288d1 | CSI-10001 checks |
| trading | domain | #e64a19 | CSI-10002 checks |
| internal-tools | domain | #455a64 | CSI-10003 checks |

**Junction tables:** ~20 check_tags rows + ~6 csi_tags rows

**Trace:** FR-DEV-03 (tags, check_tags, csi_tags entities), V1_INIT (tags table)

### 5.7 Reports (3 rows) + Report Executions (9 rows)

| Report Name | Template | Status | Schedule | Recipients |
|-------------|----------|--------|----------|-----------|
| Daily Health Summary | standard | active | `{"frequency":"daily","time":"08:00","timezone":"America/New_York"}` | john.martinez@example.com, sarah.kim@example.com |
| Weekly SLA Report | detailed | active | `{"frequency":"weekly","dayOfWeek":1,"time":"09:00","timezone":"America/New_York"}` | mike.chen@example.com |
| Monthly Executive Brief | executive | active | `{"frequency":"monthly","dayOfMonth":1,"time":"10:00","timezone":"America/New_York"}` | mike.chen@example.com, john.martinez@example.com |

Report executions: 3 per report (last 3 execution dates), mix of `success` and `partial` statuses.

**Trace:** FR-DEV-03 (reports, report_executions entities), V5_STORY3 (selected_checks column)

### 5.8 UI Tests (3 rows) + UI Test Executions (6 rows)

| Test Name | CSI | Browser | Steps |
|-----------|-----|---------|-------|
| Login Flow Verification | CSI-10001 | chrome | Navigate to login → Enter credentials → Click sign in → Verify dashboard |
| Dashboard Load Test | CSI-10003 | chrome | Navigate to dashboard → Wait for metrics → Verify widgets → Screenshot |
| API Health Check UI | CSI-10002 | firefox | Navigate to API status → Verify all endpoints listed → Check response times |

UI test executions: 2 per test, with mock video_url and screenshot_urls.

**Trace:** FR-DEV-03 (ui_tests, ui_test_executions entities), V5_STORY3 (status, schedule columns)

### 5.9 Secrets (2 rows)

| Reference ID | Label | Scope | Owner | Last Four |
|-------------|-------|-------|-------|-----------|
| vault/checks/project/gpg-api-key | GPG API Key | project | john.martinez@example.com | *k3y1 |
| vault/checks/org/tse-broker-cert | TSE Broker Certificate | org | sarah.kim@example.com | *rt01 |

**Note:** `encrypted_value` (BYTEA) left NULL — M3 stub encryption not yet active.

**Trace:** FR-DEV-03 (secrets entity), V4_SECRETS (encrypted_value column)

---

## 6. SQL Structure

### 6.1 File: `R__dev_sample_data.sql`

```
R__dev_sample_data.sql
├── Header comment (purpose, safety warning, trace refs)
├── Idempotency: INSERT ... ON CONFLICT (pk) DO NOTHING
├── 1. Users (5 rows)
├── 2. CSI Systems (3 rows)
├── 3. Checks (15 rows, JSONB configs, status='PENDING')
├── 4. Schedules (12 rows)
├── 5. Tags (8 rows)
├── 6. Check Tags (~20 rows)
├── 7. CSI Tags (~6 rows)
├── 8. Reports (3 rows)
├── 9. Report Executions (9 rows)
├── 10. Secrets (2 rows)
├── 11. UI Tests (3 rows)
├── 12. UI Test Executions (6 rows)
├── 13. Execution Results (~450 rows, generate_series for temporal distribution)
├── 14. Refresh Materialized View (csi_metrics_current)
└── Total: ~535 rows
```

### 6.2 Idempotency Strategy

**Selected:** Strategy 2 from RF-03 — `INSERT ... ON CONFLICT (pk) DO NOTHING`

**Rationale:**
- Safe for both ephemeral (Zonky) and persistent Postgres
- No destructive DELETEs — preserves any user-created data
- Simple SQL — no column-by-column UPSERT needed
- On Zonky (fresh DB every startup): all INSERTs succeed (no conflicts)
- On persistent DB (restarted app): existing rows preserved, only new rows added

**Trace:** FR-DEV-06, RF-03

### 6.3 Execution Results Generation Pattern

```sql
-- Use generate_series to create temporal distribution
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    check_uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','FAILURE','WARNING'])[1 + floor(random()*5)::int],
    base_time + (n * INTERVAL '1 day') + (random() * INTERVAL '12 hours'),
    base_time + (n * INTERVAL '1 day') + (random() * INTERVAL '12 hours') + (random() * INTERVAL '5 seconds'),
    (100 + floor(random() * 4900))::int,
    '{"seeded":true}',
    '{}'
FROM generate_series(0, 29) AS n
CROSS JOIN (SELECT ... check UUIDs and base times ...) AS checks_to_seed
ON CONFLICT DO NOTHING;
```

**Partition safety:** `base_time` anchored to `date_trunc('month', CURRENT_TIMESTAMP)` + offset, ensuring all timestamps fall within the current month partition.

**Trace:** CON-DEV-03, CON-DEV-07, RF-04, RF-06

### 6.4 Materialized View Refresh

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY csi_metrics_current;
```

Runs at the end of the seed to ensure dashboard metrics reflect the seeded execution results and check statuses.

**Note:** `CONCURRENTLY` requires the unique index `idx_csi_metrics_current_csi` (created in V1). This is safe because no other sessions access the dev database during Flyway execution.

**Trace:** FR-DEV-04

---

## 7. Activation

### 7.1 Command Line

```bash
# Primary usage
./gradlew bootRun --args='--spring.profiles.active=dev'

# Or via environment variable
SPRING_PROFILES_ACTIVE=dev ./gradlew bootRun
```

### 7.2 Profile Inheritance Chain

```
dev → includes → local → inherits → (base application.yml)
```

**Effective configuration:**
1. `application.yml` — base (Flyway enabled, validate mode, port 8080)
2. `application-local.yml` — Zonky datasource, dispatcher disabled
3. `application-dev.yml` — Flyway locations override (adds seed path), DEBUG logging

### 7.3 Verification

After startup, verify seed data via:
```bash
# CSI systems with health metrics
curl http://localhost:8080/api/v1/csi

# Checks per CSI
curl http://localhost:8080/api/v1/checks

# Dashboard should show 3 CSIs with varied health percentages
# Swagger UI for exploration
open http://localhost:8080/swagger-ui.html
```

**Trace:** NFR-DEV-05 (self-documenting activation)

---

## 8. Traceability Matrix

| Requirement | Satisfied By | Section |
|-------------|-------------|---------|
| FR-DEV-01 | `application-dev.yml` with `profiles.include: local` | §4 |
| FR-DEV-02 | Inherited from `local` profile (Zonky embedded Postgres) | §4.1 |
| FR-DEV-03 | `R__dev_sample_data.sql` — all 15 entity types covered | §5, §6.1 |
| FR-DEV-04 | ~450 execution results + REFRESH MATERIALIZED VIEW | §5.5, §6.4 |
| FR-DEV-05 | `spring.flyway.locations` only adds seed path in `dev` profile | §4.1 |
| FR-DEV-06 | INSERT ON CONFLICT DO NOTHING | §6.2 |
| FR-DEV-07 | 3-CSI narrative with distinct health stories | §5.2 |
| FR-DEV-08 | Execution results span 28 days within current month | §5.5 |
| NFR-DEV-01 | Pure SQL, ~535 rows ≈ <1s additional startup | §6.1 |
| NFR-DEV-02 | 2 new files + 1 README edit; zero Java changes | §3 |
| NFR-DEV-03 | SQL not subject to Java quality gates; YAML is config | §3 |
| NFR-DEV-04 | All names/emails/URLs are fictional | §5.1, §5.2 |
| NFR-DEV-05 | README.md update with dev profile instructions | §3, §7 |
| CON-DEV-01 | Repeatable migration (R__ prefix), not in V* sequence | §2, §6.1 |
| CON-DEV-02 | Flyway runs R__ after all V* migrations | §2 (RF-02) |
| CON-DEV-03 | CURRENT_TIMESTAMP arithmetic stays in current month | §5.5, §6.3 |
| CON-DEV-04 | JSONB matches HttpConfiguration/TcpConfiguration contracts | §5.3 |
| CON-DEV-05 | INSERT order: users → csi → checks → schedules → ... | §6.1 |
| CON-DEV-06 | Static UUIDs as PKs, ON CONFLICT DO NOTHING | §6.2 |
| CON-DEV-07 | Current-month only; partition exists via V1 or bootstrap | §5.5 (RF-04) |
