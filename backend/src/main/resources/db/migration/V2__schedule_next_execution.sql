-- V2__schedule_next_execution.sql
-- Story 2.1: Add next_execution_at to schedules for cron dispatcher polling (story 2.3).

ALTER TABLE schedules ADD COLUMN next_execution_at TIMESTAMPTZ;

CREATE INDEX idx_schedules_next_execution
    ON schedules(next_execution_at)
    WHERE enabled = true AND next_execution_at IS NOT NULL;
