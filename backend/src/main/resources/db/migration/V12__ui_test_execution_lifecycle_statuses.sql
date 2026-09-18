-- UI Studio starts locally as PENDING, runs as RUNNING, and then records a terminal outcome.
-- PostgreSQL propagates a parent constraint replacement to its partitions.
ALTER TABLE ui_test_executions
    DROP CONSTRAINT IF EXISTS ui_test_executions_status_check;

ALTER TABLE ui_test_executions
    DROP CONSTRAINT IF EXISTS ui_test_executions_status_check1;

ALTER TABLE ui_test_executions
    ADD CONSTRAINT ui_test_executions_status_check
    CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'PASSED', 'FAILED', 'ERROR', 'TIMEOUT'));
