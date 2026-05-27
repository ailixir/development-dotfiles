-- V7: Convert ui_test_executions and report_executions to range-partitioned tables,
-- add DEFAULT partitions to all three execution tables.
-- Pre-production: uses rename-recreate strategy (safe for empty/small tables).

-- ─────────────────────────────────────────────────────────────
-- (1) execution_results — add DEFAULT partition only
-- ─────────────────────────────────────────────────────────────
CREATE TABLE execution_results_default PARTITION OF execution_results DEFAULT;

-- ─────────────────────────────────────────────────────────────
-- (2) ui_test_executions — convert to range-partitioned by started_at
-- ─────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_ui_test_exec_test;
DROP INDEX IF EXISTS idx_ui_test_exec_check;

ALTER TABLE ui_test_executions RENAME TO ui_test_executions_old;

CREATE TABLE ui_test_executions (
    id             UUID         NOT NULL DEFAULT gen_random_uuid(),
    ui_test_id     UUID         NOT NULL REFERENCES ui_tests(id) ON DELETE CASCADE,
    check_id       UUID         REFERENCES checks(id),
    status         VARCHAR(20)  NOT NULL CHECK (status IN ('PASSED', 'FAILED', 'ERROR')),
    started_at     TIMESTAMPTZ  NOT NULL,
    ended_at       TIMESTAMPTZ  NOT NULL,
    duration_ms    INTEGER      NOT NULL,
    video_url      TEXT,
    screenshot_urls TEXT[],
    logs           TEXT,
    error_details  JSONB,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, started_at)
) PARTITION BY RANGE (started_at);

-- Bootstrap: current month + next 2
CREATE TABLE ui_test_executions_2026_05 PARTITION OF ui_test_executions
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE ui_test_executions_2026_06 PARTITION OF ui_test_executions
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE ui_test_executions_2026_07 PARTITION OF ui_test_executions
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE ui_test_executions_default PARTITION OF ui_test_executions DEFAULT;

INSERT INTO ui_test_executions (id, ui_test_id, check_id, status, started_at, ended_at,
    duration_ms, video_url, screenshot_urls, logs, error_details, created_at)
SELECT id, ui_test_id, check_id, status, started_at, ended_at,
    duration_ms, video_url, screenshot_urls, logs, error_details, created_at
FROM ui_test_executions_old;

DROP TABLE ui_test_executions_old;

CREATE INDEX idx_ui_test_exec_test ON ui_test_executions(ui_test_id, started_at DESC);
CREATE INDEX idx_ui_test_exec_check ON ui_test_executions(check_id) WHERE check_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- (3) report_executions — convert to range-partitioned by executed_at
-- ─────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_report_exec_report;

ALTER TABLE report_executions RENAME TO report_executions_old;

CREATE TABLE report_executions (
    id                     UUID         NOT NULL DEFAULT gen_random_uuid(),
    report_id              UUID         NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    status                 VARCHAR(20)  NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
    executed_at            TIMESTAMPTZ  NOT NULL,
    recipient_count        INTEGER      NOT NULL,
    checks_included        INTEGER      NOT NULL,
    checks_failed          INTEGER      DEFAULT 0,
    generation_duration_ms INTEGER,
    email_content          TEXT,
    error_message          TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, executed_at)
) PARTITION BY RANGE (executed_at);

-- Bootstrap: current month + next 2
CREATE TABLE report_executions_2026_05 PARTITION OF report_executions
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE report_executions_2026_06 PARTITION OF report_executions
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE report_executions_2026_07 PARTITION OF report_executions
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE report_executions_default PARTITION OF report_executions DEFAULT;

INSERT INTO report_executions (id, report_id, status, executed_at, recipient_count,
    checks_included, checks_failed, generation_duration_ms, email_content, error_message, created_at)
SELECT id, report_id, status, executed_at, recipient_count,
    checks_included, checks_failed, generation_duration_ms, email_content, error_message, created_at
FROM report_executions_old;

DROP TABLE report_executions_old;

CREATE INDEX idx_report_exec_report ON report_executions(report_id, executed_at DESC);
