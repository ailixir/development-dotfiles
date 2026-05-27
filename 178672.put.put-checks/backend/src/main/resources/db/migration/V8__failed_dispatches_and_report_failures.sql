-- V8: Failed dispatches retry table + report consecutive failure tracking.

CREATE TABLE failed_dispatches (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    dispatch_type  VARCHAR(20)  NOT NULL CHECK (dispatch_type IN ('CHECK', 'REPORT')),
    reference_id   UUID         NOT NULL,
    retry_count    INTEGER      NOT NULL DEFAULT 0,
    max_retries    INTEGER      NOT NULL DEFAULT 3,
    next_retry_at  TIMESTAMPTZ,
    last_error     TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_failed_dispatches_due
    ON failed_dispatches (dispatch_type, next_retry_at)
    WHERE retry_count < max_retries;

ALTER TABLE reports ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
