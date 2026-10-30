-- STUDIO-GOV-001.2: UI tests are scheduled through the ordinary check schedule flow.
--
-- Forward-only. V16's Studio-specific scheduler (studio_schedules and its activation, occurrence
-- and uncertainty-acknowledgement tables) is removed; a UI test now owns a row in the shared
-- `schedules` table, exactly as a check does. Studio scheduling was never enabled anywhere, so no
-- data is converted: the Studio tables are dropped with whatever they hold.

-- 1. Detach everything that points at, or is guarded by, the Studio scheduler.
DROP TRIGGER trg_studio_scheduling_history_integrity ON ui_test_executions;
DROP TRIGGER trg_studio_execution_trigger_immutable ON ui_test_executions;
DROP TRIGGER trg_studio_scheduling_ledger_integrity ON studio_dispatch_ledger;
DROP TRIGGER trg_studio_scheduling_ledger_identity ON studio_dispatch_ledger;

ALTER TABLE ui_test_executions
    DROP CONSTRAINT ck_ui_test_executions_trigger_source,
    DROP COLUMN schedule_id,
    DROP COLUMN schedule_version,
    DROP COLUMN occurrence_id,
    DROP COLUMN activation_id,
    DROP COLUMN activated_by,
    DROP COLUMN activated_at;

ALTER TABLE studio_dispatch_ledger
    DROP CONSTRAINT ck_studio_dispatch_ledger_scheduled_identity,
    DROP COLUMN scheduled_occurrence_id;

DROP INDEX idx_studio_dispatch_ledger_uncertain_test;

DROP TABLE studio_schedule_uncertainty_ack, studio_schedule_occurrences,
    studio_schedule_activations, studio_schedules;

DROP FUNCTION studio_schedule_append_only();
DROP FUNCTION studio_schedule_anchor_guard();
DROP FUNCTION studio_schedule_activation_guard();
DROP FUNCTION studio_schedule_occurrence_guard();
DROP FUNCTION studio_schedule_ack_guard();
DROP FUNCTION studio_schedule_ledger_identity_guard();
DROP FUNCTION studio_schedule_check_occurrence(UUID);
DROP FUNCTION studio_schedule_occurrence_integrity();
DROP FUNCTION studio_schedule_ledger_integrity();
DROP FUNCTION studio_schedule_history_integrity();
DROP FUNCTION studio_schedule_cursor_integrity();

-- 2. The terminal-outcome summary stays write-once; it was bundled with the scheduled-identity
--    guard dropped above but is not scheduling state.
CREATE FUNCTION studio_ledger_terminal_summary_guard() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.state = 'DONE'
        AND ROW(NEW.terminal_error_code, NEW.terminal_error_at)
            IS DISTINCT FROM ROW(OLD.terminal_error_code, OLD.terminal_error_at) THEN
        RAISE EXCEPTION 'terminal ledger summary is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_studio_ledger_terminal_summary
    BEFORE UPDATE ON studio_dispatch_ledger
    FOR EACH ROW EXECUTE FUNCTION studio_ledger_terminal_summary_guard();

-- 3. A UI test's execution points at the shared schedule that produced it. Removing the schedule
--    keeps the run (and its SCHEDULED attribution) and only clears the pointer.
ALTER TABLE ui_test_executions
    ADD COLUMN schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
    ADD CONSTRAINT ck_ui_test_executions_trigger_source CHECK (
        (trigger_source = 'SCHEDULED' AND scheduled_at IS NOT NULL)
        OR ((trigger_source IS NULL OR trigger_source = 'MANUAL')
            AND schedule_id IS NULL AND scheduled_at IS NULL));

CREATE INDEX idx_ui_test_executions_schedule
    ON ui_test_executions(schedule_id) WHERE schedule_id IS NOT NULL;

CREATE OR REPLACE FUNCTION studio_execution_trigger_guard() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(NEW.trigger_source, NEW.scheduled_at)
        IS DISTINCT FROM ROW(OLD.trigger_source, OLD.scheduled_at)
        OR (NEW.schedule_id IS DISTINCT FROM OLD.schedule_id AND NEW.schedule_id IS NOT NULL) THEN
        RAISE EXCEPTION 'execution trigger attribution is immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.trigger_source = 'SCHEDULED' AND ROW(NEW.id, NEW.started_at, NEW.ui_test_id,
        NEW.csi_id, NEW.principal, NEW.environment, NEW.revision_id) IS DISTINCT FROM
        ROW(OLD.id, OLD.started_at, OLD.ui_test_id, OLD.csi_id, OLD.principal,
            OLD.environment, OLD.revision_id) THEN
        RAISE EXCEPTION 'scheduled execution acceptance snapshot is immutable'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_studio_execution_trigger_immutable
    BEFORE UPDATE ON ui_test_executions
    FOR EACH ROW EXECUTE FUNCTION studio_execution_trigger_guard();

-- 4. The shared schedule's target is a check or a UI test, never both and never neither. Like a
--    check, a UI test has at most one schedule. A UI test is not a row in `checks`, so there is no
--    shadow check; the schedule row names the test directly.
ALTER TABLE schedules
    ALTER COLUMN check_id DROP NOT NULL,
    ADD COLUMN ui_test_id UUID REFERENCES ui_tests(id) ON DELETE CASCADE,
    ADD CONSTRAINT ck_schedules_one_target CHECK (num_nonnulls(check_id, ui_test_id) = 1),
    ADD CONSTRAINT ck_schedules_ui_test_type CHECK (ui_test_id IS NULL OR check_type = 'UI_TEST');

CREATE UNIQUE INDEX idx_schedules_ui_test ON schedules(ui_test_id);
