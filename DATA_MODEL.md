# Data Model Documentation - PUT Checks Platform

## Overview

The PUT Checks platform data model is designed around the **CSI (Citi System Inventory)** as the primary organizing principle. All entities are directly or indirectly related to CSI entities, creating a hierarchical and interconnected system that supports comprehensive health monitoring, reporting, and analysis.

## Core Design Principles

1. **CSI-Centric Architecture**: Every check, report, and metric is associated with a CSI entity
2. **Polymorphic Check Model**: Single check entity supports 7 different check types through flexible configuration
3. **Temporal Data Management**: Historical tracking for all check executions and state changes
4. **Flexible Scheduling**: Cron-based scheduling with timezone support
5. **Audit Trail**: Complete tracking of all entity modifications
6. **Soft Deletes**: Logical deletion for compliance and recovery

## Entity Relationship Diagram

```
┌─────────────┐         ┌──────────────┐         ┌─────────────────┐
│     CSI     │ 1     * │    CHECK     │ 1     * │   EXECUTION     │
│             ├─────────┤              ├─────────┤    RESULT       │
│ - id (PK)   │         │ - id (PK)    │         │ - id (PK)       │
│ - name      │         │ - csiId (FK) │         │ - checkId (FK)  │
│ - owner     │         │ - type       │         │ - status        │
│ - status    │         │ - config     │         │ - timestamp     │
└─────────────┘         └──────────────┘         └─────────────────┘
       │                        │
       │                        │
       ▼                        ▼
┌─────────────┐         ┌──────────────┐         ┌─────────────────┐
│ CSI_METRICS │         │   SCHEDULE   │         │    UI_TEST      │
│             │         │              │         │                 │
│ - csiId(FK) │         │ - checkId(FK)│         │ - id (PK)       │
│ - health    │         │ - cron       │         │ - steps (JSON)  │
│ - metrics   │         │ - enabled    │         │ - variables     │
└─────────────┘         └──────────────┘         └─────────────────┘
                                │
                                ▼
                        ┌──────────────┐
                        │    REPORT    │
                        │              │
                        │ - id (PK)    │
                        │ - sections   │
                        │ - schedule   │
                        └──────────────┘
```

## Core Entities

### 1. CSI (Citi System Inventory)

The foundational entity that represents a business system or application in the Citibank ecosystem.

```typescript
interface CSI {
  id: string;                                      // Primary key (e.g., "174523")
  name: string;                                     // Display name
  description: string;                              // Business description
  businessUnit: string;                            // Owning business unit
  criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  owner: string;                                    // Primary owner email
  tags: string[];                                   // Categorization tags
  environment: 'Production' | 'Staging' | 'Development';
  status: 'OPERATIONAL' | 'DEGRADED' | 'DOWN' | 'MAINTENANCE';
  createdAt: string;                               // ISO 8601 timestamp
  updatedAt: string;                               // ISO 8601 timestamp
}
```

**Relationships:**
- One-to-Many with Checks
- One-to-One with CSIMetrics
- Referenced by Reports (via check associations)

### 2. CheckEntity

Central entity supporting all 7 check types through polymorphic configuration.

```typescript
interface CheckEntity {
  id: string;                                      // UUID
  name: string;                                     // User-friendly name
  type: CheckType;                                 // Discriminator field
  csiId: string;                                   // Foreign key to CSI
  csiName: string;                                 // Denormalized for performance
  status: CheckStatus;                             // Current health status
  lastExecution: string | null;                    // ISO 8601 timestamp
  nextExecution: string | null;                    // Computed from schedule
  configuration: CheckConfiguration;               // Polymorphic config
  schedule: CheckSchedule;                         // Execution schedule
  createdAt: string;
  updatedAt: string;
  createdBy: string;                              // User email
  tags: string[];                                  // Flexible categorization
  description?: string;                            // Optional documentation
  environment?: string;                            // Target environment
}
```

**Polymorphic Configuration:**

The `configuration` field adapts based on `type`:

```typescript
interface CheckConfiguration {
  // HTTP Check
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  expectedStatus?: number;
  timeout?: number;

  // TCP Check
  host?: string;
  port?: number;

  // Splunk Check
  query?: string;                                  // SPL query
  timeRange?: string;
  threshold?: ThresholdConfig;

  // Grafana Check
  datasource?: string;
  duration?: string;

  // ITRS Check
  gateway?: string;
  sampler?: string;
  dataitem?: string;
  expectedValue?: string;

  // AppDynamics Check
  application?: string;
  healthRule?: string;
  tier?: string;

  // UI Test Check
  uiTest?: {
    testId: string;                               // Reference to UITest entity
    variables?: Record<string, VariableValue>;
    overrides?: TestOverrides;
  };
}
```

### 3. ExecutionResult

Immutable record of each check execution.

```typescript
interface ExecutionResult {
  id: string;                                      // UUID
  checkId: string;                                 // Foreign key to Check
  status: 'SUCCESS' | 'FAILURE' | 'WARNING' | 'TIMEOUT';
  startTime: string;                               // ISO 8601
  endTime: string;                                 // ISO 8601
  duration: number;                                // milliseconds
  output: string;                                   // Execution logs/output
  metadata: Record<string, any>;                   // Type-specific metadata
  error?: string;                                  // Error details if failed
}
```

**Storage Strategy:**
- Partitioned by month for performance
- Retention: 90 days for detailed data, 1 year for summary
- Indexed on: checkId, startTime, status

### 4. UITest (Checks Studio)

Specialized entity for browser automation tests.

```typescript
interface UITest {
  id: string;                                      // UUID
  name: string;
  csiId?: string;                                  // Optional CSI association
  description?: string;
  environment: string;
  configuration: {
    browser: 'chrome' | 'firefox' | 'safari' | 'edge';
    viewport: { width: number; height: number };
    timeout: number;
    waitStrategy: 'none' | 'networkidle' | 'domcontentloaded';
  };
  variables: VariableDefinition[];                 // Test parameters
  steps: StepIR[];                                // Intermediate representation
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastRunAt?: string;
  lastRunStatus?: 'PASSED' | 'FAILED';
}
```

**Step Types:**
- `go_to`: Navigate to URL
- `click`: Click element
- `type`: Enter text
- `wait_for_text`: Assert text presence
- `check_url_contains`: Assert URL content

### 5. Report

Configuration for scheduled email reports.

```typescript
interface ReportEntity {
  id: string;
  name: string;
  description: string;
  sections: ReportSection[];                       // Content configuration
  schedule: ReportSchedule;
  recipients: string[];                            // Email addresses
  template: ReportTemplate;
  status: 'active' | 'paused' | 'draft';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastSent?: string;
}
```

**Section Types:**

```typescript
type ReportSection =
  | ManualReportSection    // Explicit check selection
  | RuleReportSection;      // Dynamic check selection

interface RuleReportSection {
  id: string;
  title: string;
  kind: 'rule';
  rule: {
    csiIds?: string[];      // Filter by CSI
    tags?: string[];        // Filter by tags
    types?: string[];       // Filter by check type
    status?: string[];      // Filter by status
    timeframe?: string;     // Recent failures window
    sort?: string;          // Result ordering
    limit?: number;         // Max results
  };
}
```

## Supporting Entities

### 6. CSIMetrics

Aggregated health metrics per CSI.

```typescript
interface CSIMetrics {
  csiId: string;                                   // Foreign key to CSI
  totalChecks: number;
  passingChecks: number;
  failingChecks: number;
  warningChecks: number;
  overallHealth: number;                           // 0-100 percentage
  lastUpdated: string;
  criticalAlertsCount: number;
  avgResponseTime: number;                         // milliseconds
  uptime: number;                                  // 0-100 percentage
  totalExecutions: number;
  successRate: number;                             // 0-100 percentage
}
```

**Update Strategy:**
- Computed every 5 minutes via background job
- Cached in Redis for fast access
- Historical snapshots stored hourly

### 7. CheckSchedule

Flexible scheduling configuration.

```typescript
interface CheckSchedule {
  frequency: string;                                // Human-readable
  timezone: string;                                 // IANA timezone
  enabled: boolean;
  daysOfWeek?: number[];                           // 0-6 (Sunday-Saturday)
  time?: string;                                    // HH:MM format
  cron?: string;                                    // Advanced scheduling
}
```

**Supported Patterns:**
- Simple: "every_5_minutes", "hourly", "daily"
- Complex: Cron expressions for advanced scheduling
- Business hours: Weekday-only execution
- Maintenance windows: Pause during scheduled downtime

### 8. Secret Management

Secure credential storage integration.

```typescript
interface SecretRef {
  id: string;                                      // Vault reference ID
  label: string;                                    // Display name
  scope: 'project' | 'org' | 'user';
  last4?: string;                                   // Masked preview
  createdAt: string;
}
```

**Security Features:**
- Never stored in database
- Retrieved on-demand from vault
- Audit trail for all access
- Automatic rotation support

## Data Access Patterns

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

### 3. Partitioning

**Time-Series Data:**
- ExecutionResults: Monthly partitions
- AuditLogs: Quarterly partitions
- Metrics: Daily partitions with automatic rollup

## Migration Strategy

### Schema Versioning
- Flyway/Liquibase for version control
- Forward-only migrations
- Backward compatibility for 2 versions

### Data Migration Patterns
- Blue-green deployment support
- Zero-downtime migrations via column addition
- Batch processing for large data updates

## Future Considerations

### Planned Enhancements
1. **Graph Relationships**: Neo4j for dependency mapping
2. **Time-Series Optimization**: TimescaleDB for metrics
3. **Event Sourcing**: Full audit trail replay capability
4. **Multi-Region**: Geographic data distribution
5. **ML Features**: Anomaly detection data pipeline

### Scalability Targets
- 10,000+ checks
- 1M+ executions/day
- 100ms p95 query latency
- 99.95% availability