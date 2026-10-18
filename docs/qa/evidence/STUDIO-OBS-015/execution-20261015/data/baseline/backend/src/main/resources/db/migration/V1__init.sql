-- V1__init.sql
-- Initial schema for put-checks backend.
-- Source: ARCH.md §7 (verbatim) + 3 amendments from spec.md v3:
--   (1) checks.configuration carries CHECK (jsonb_path_exists(configuration, '$.type'))  [spec §5.1, MS-R3]
--   (2) execution_results declares parent + current-month + next-month partitions; NO DEFAULT PARTITION  [spec §8.2, PG-R2, PG-09]
--   (3) shedlock table added (javacrumbs standard shape) for use by stories 2.4+   [spec §8.2]
-- Inline comments mark each ARCH §7.x origin for traceability.

-- ─────────────────────────────────────────────────────────────
-- ARCH §7.1 — Core Tables
-- ─────────────────────────────────────────────────────────────

-- users (ARCH §7.1)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sso_id VARCHAR(255) NOT NULL UNIQUE,
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

-- csi_systems (ARCH §7.1)
CREATE TABLE csi_systems (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    business_unit VARCHAR(100) NOT NULL,
    criticality VARCHAR(20) NOT NULL CHECK (criticality IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    owner_email VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE RESTRICT,
    environment VARCHAR(20) NOT NULL CHECK (environment IN ('Production', 'Staging', 'Development')),
    status VARCHAR(20) NOT NULL DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL', 'DEGRADED', 'DOWN', 'MAINTENANCE')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_csi_business_unit ON csi_systems(business_unit);
CREATE INDEX idx_csi_status ON csi_systems(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_csi_owner ON csi_systems(owner_email) WHERE deleted_at IS NULL;
CREATE INDEX idx_csi_owner_status ON csi_systems(owner_email, status) WHERE deleted_at IS NULL;

-- checks (ARCH §7.1) + AMENDMENT 1: discriminator CHECK on configuration
CREATE TABLE checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('HTTP', 'TCP', 'SPLUNK', 'GRAFANA', 'ITRS', 'APPDYNAMICS', 'UI_TEST')),
    csi_id VARCHAR(20) NOT NULL REFERENCES csi_systems(id),
    csi_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PASSING', 'FAILING', 'WARNING', 'PENDING', 'UNKNOWN')),
    description TEXT,
    environment VARCHAR(50),
    configuration JSONB NOT NULL,
    schedule_id UUID,
    last_execution_id UUID,
    last_execution_at TIMESTAMPTZ,
    next_execution_at TIMESTAMPTZ,
    created_by VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT fk_checks_csi FOREIGN KEY (csi_id) REFERENCES csi_systems(id),
    CONSTRAINT ck_checks_configuration_has_type CHECK (jsonb_path_exists(configuration, '$.type'))
);

CREATE INDEX idx_checks_csi ON checks(csi_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_type ON checks(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_status ON checks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_next_execution ON checks(next_execution_at) WHERE deleted_at IS NULL AND next_execution_at IS NOT NULL;
CREATE INDEX idx_checks_configuration ON checks USING GIN (configuration);
CREATE INDEX idx_checks_created_by ON checks(created_by) WHERE deleted_at IS NULL;
CREATE INDEX idx_checks_created_by_csi ON checks(created_by, csi_id) WHERE deleted_at IS NULL;

-- schedules (ARCH §7.1)
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    frequency VARCHAR(50) NOT NULL,
    cron_expression VARCHAR(100),
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    enabled BOOLEAN NOT NULL DEFAULT true,
    days_of_week INTEGER[],
    time_of_day TIME,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_schedules_check ON schedules(check_id);
CREATE INDEX idx_schedules_enabled ON schedules(enabled) WHERE enabled = true;

-- execution_results (ARCH §7.1) + AMENDMENT 2: parent + current-month + next-month; NO DEFAULT PARTITION
CREATE TABLE execution_results (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILURE', 'WARNING', 'TIMEOUT')),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    duration_ms INTEGER NOT NULL,
    output TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, started_at)
) PARTITION BY RANGE (started_at);

-- Current-month partition (bootstrap; scheduler in 2.5 creates future months going forward).
CREATE TABLE execution_results_2026_04 PARTITION OF execution_results
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Next-month partition (so the app doesn't stall the moment midnight crosses into May before 2.5 lands).
CREATE TABLE execution_results_2026_05 PARTITION OF execution_results
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- Indexes propagate to all current and future child partitions automatically on PG 15 (PG-02).
CREATE INDEX idx_execution_check_time ON execution_results(check_id, started_at DESC);
CREATE INDEX idx_execution_status ON execution_results(status, started_at DESC);

-- ui_tests (ARCH §7.1)
CREATE TABLE ui_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    csi_id VARCHAR(20) REFERENCES csi_systems(id),
    description TEXT,
    environment VARCHAR(50) NOT NULL,
    browser VARCHAR(20) NOT NULL CHECK (browser IN ('chrome', 'firefox', 'safari', 'edge')),
    viewport_width INTEGER NOT NULL DEFAULT 1920,
    viewport_height INTEGER NOT NULL DEFAULT 1080,
    timeout_seconds INTEGER NOT NULL DEFAULT 30,
    wait_strategy VARCHAR(20) DEFAULT 'networkidle',
    steps JSONB NOT NULL,
    variables JSONB DEFAULT '[]',
    created_by VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_run_at TIMESTAMPTZ,
    last_run_status VARCHAR(20) CHECK (last_run_status IN ('PASSED', 'FAILED')),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_ui_tests_csi ON ui_tests(csi_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ui_tests_environment ON ui_tests(environment);
CREATE INDEX idx_ui_tests_created_by ON ui_tests(created_by) WHERE deleted_at IS NULL;

-- ui_test_executions (ARCH §7.1)
CREATE TABLE ui_test_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ui_test_id UUID NOT NULL REFERENCES ui_tests(id) ON DELETE CASCADE,
    check_id UUID REFERENCES checks(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PASSED', 'FAILED', 'ERROR')),
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    duration_ms INTEGER NOT NULL,
    video_url TEXT,
    screenshot_urls TEXT[],
    logs TEXT,
    error_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ui_test_exec_test ON ui_test_executions(ui_test_id, started_at DESC);
CREATE INDEX idx_ui_test_exec_check ON ui_test_executions(check_id) WHERE check_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- ARCH §7.2 — Supporting Tables
-- ─────────────────────────────────────────────────────────────

-- reports (ARCH §7.2)
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template VARCHAR(50) NOT NULL CHECK (template IN ('standard', 'executive', 'detailed', 'alert-digest', 'trend-analysis')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'paused', 'draft')),
    schedule JSONB NOT NULL,
    recipients TEXT[] NOT NULL,
    sections JSONB NOT NULL DEFAULT '[]',
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

-- report_executions (ARCH §7.2)
CREATE TABLE report_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
    executed_at TIMESTAMPTZ NOT NULL,
    recipient_count INTEGER NOT NULL,
    checks_included INTEGER NOT NULL,
    checks_failed INTEGER DEFAULT 0,
    generation_duration_ms INTEGER,
    email_content TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_report_exec_report ON report_executions(report_id, executed_at DESC);

-- tags (ARCH §7.2)
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50),
    description TEXT,
    color VARCHAR(7),
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

-- secrets (ARCH §7.2)
CREATE TABLE secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id VARCHAR(255) NOT NULL UNIQUE,
    label VARCHAR(255) NOT NULL,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('project', 'org', 'user')),
    owner VARCHAR(255) NOT NULL,
    last_four VARCHAR(4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_secrets_owner ON secrets(owner);
CREATE INDEX idx_secrets_scope ON secrets(scope);

-- ─────────────────────────────────────────────────────────────
-- ARCH §7.3 — Materialized Views
-- ─────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────
-- ARCH §7.4 — Constraints & Triggers
-- ─────────────────────────────────────────────────────────────

-- updated_at bump trigger + wiring for every table with an updated_at column.
-- NOTE: `users` has no updated_at column in ARCH §7.1 (only last_login), so no trigger there.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_csi_systems_updated_at BEFORE UPDATE ON csi_systems
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_checks_updated_at BEFORE UPDATE ON checks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ui_tests_updated_at BEFORE UPDATE ON ui_tests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Check status cascade: when a new execution_result lands, propagate status + last-execution pointer to the parent check.
CREATE OR REPLACE FUNCTION update_check_status_from_execution()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE checks
    SET status = CASE NEW.status
                     WHEN 'SUCCESS' THEN 'PASSING'
                     WHEN 'FAILURE' THEN 'FAILING'
                     WHEN 'WARNING' THEN 'WARNING'
                     WHEN 'TIMEOUT' THEN 'FAILING'
                     ELSE 'UNKNOWN'
                 END,
        last_execution_id = NEW.id,
        last_execution_at = NEW.ended_at
    WHERE id = NEW.check_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_check_on_execution
AFTER INSERT ON execution_results
FOR EACH ROW EXECUTE FUNCTION update_check_status_from_execution();

-- ─────────────────────────────────────────────────────────────
-- AMENDMENT 3: shedlock (for stories 2.4+)
-- javacrumbs ShedLock standard shape (unchanged across versions).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE shedlock (
    name VARCHAR(64) NOT NULL,
    lock_until TIMESTAMPTZ NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL,
    locked_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
