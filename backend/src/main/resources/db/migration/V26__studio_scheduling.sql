-- STUDIO-SCHED-001: additive Studio scheduling; legacy ui_tests.schedule remains inert.
-- See the approved feature specification and implementation-contract.md. Identity/audit
-- anchors deliberately survive history/video retention and schedule removal/recreation.
-- V18 already owns ui_tests(id,csi_id) and ui_test_revisions(id,test_id,csi_id) uniqueness.

CREATE TABLE studio_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL UNIQUE,
    csi_id VARCHAR(20) NOT NULL REFERENCES csi_systems(id),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    cron_expression VARCHAR(255) NOT NULL,
    time_zone VARCHAR(100) NOT NULL,
    execution_principal VARCHAR(255) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'PAUSED',
    requested_enabled BOOLEAN NOT NULL DEFAULT false,
    blocked_code VARCHAR(40),
    activated_revision_id UUID,
    activation_id UUID,
    next_due_at TIMESTAMPTZ,
    poll_after_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_studio_schedules_owner UNIQUE (id, test_id, csi_id),
    CONSTRAINT fk_studio_schedules_test_owner FOREIGN KEY (test_id, csi_id)
        REFERENCES ui_tests(id, csi_id),
    CONSTRAINT fk_studio_schedules_revision_owner
        FOREIGN KEY (activated_revision_id, test_id, csi_id)
        REFERENCES ui_test_revisions(id, test_id, csi_id),
    CONSTRAINT ck_studio_schedules_state CHECK (
        (state = 'ENABLED' AND requested_enabled AND deleted_at IS NULL
            AND blocked_code IS NULL AND activated_revision_id IS NOT NULL
            AND activation_id IS NOT NULL AND next_due_at IS NOT NULL AND poll_after_at IS NOT NULL)
        OR (state = 'PAUSED' AND NOT requested_enabled AND blocked_code IS NULL)
        OR (state = 'BLOCKED' AND requested_enabled AND deleted_at IS NULL AND blocked_code IS NOT NULL)),
    CONSTRAINT ck_studio_schedules_tombstone CHECK (deleted_at IS NULL OR state = 'PAUSED'),
    CONSTRAINT ck_studio_schedules_fields CHECK (
        length(btrim(cron_expression)) > 0 AND length(btrim(time_zone)) > 0
        AND length(btrim(execution_principal)) > 0
        AND length(btrim(created_by)) > 0 AND length(btrim(updated_by)) > 0)
);

CREATE TABLE studio_schedule_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL,
    test_id UUID NOT NULL,
    csi_id VARCHAR(20) NOT NULL,
    schedule_version BIGINT NOT NULL CHECK (schedule_version > 0),
    revision_id UUID NOT NULL,
    environment VARCHAR(50) NOT NULL,
    execution_principal VARCHAR(255) NOT NULL,
    activated_by VARCHAR(255) NOT NULL CHECK (length(btrim(activated_by)) > 0),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_studio_schedule_activations_owner FOREIGN KEY (schedule_id, test_id, csi_id)
        REFERENCES studio_schedules(id, test_id, csi_id),
    CONSTRAINT fk_studio_schedule_activations_revision
        FOREIGN KEY (revision_id, test_id, csi_id)
        REFERENCES ui_test_revisions(id, test_id, csi_id),
    CONSTRAINT uq_studio_schedule_activations_owner UNIQUE (id, schedule_id, test_id, csi_id),
    CONSTRAINT uq_studio_schedule_activations_schedule UNIQUE (id, schedule_id),
    CONSTRAINT uq_studio_schedule_activations_version UNIQUE (schedule_id, schedule_version),
    CONSTRAINT uq_studio_schedule_activations_snapshot UNIQUE (
        id, schedule_id, schedule_version, test_id, csi_id, revision_id,
        environment, execution_principal)
);

ALTER TABLE studio_schedules ADD CONSTRAINT fk_studio_schedules_activation_owner
    FOREIGN KEY (activation_id, id, test_id, csi_id)
    REFERENCES studio_schedule_activations(id, schedule_id, test_id, csi_id);

CREATE TABLE studio_schedule_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL,
    schedule_version BIGINT NOT NULL CHECK (schedule_version > 0),
    test_id UUID NOT NULL,
    csi_id VARCHAR(20) NOT NULL,
    environment VARCHAR(50) NOT NULL,
    execution_principal VARCHAR(255) NOT NULL,
    activation_id UUID NOT NULL,
    activated_revision_id UUID NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    local_scheduled_at TIMESTAMP NOT NULL,
    time_zone VARCHAR(100) NOT NULL,
    offset_seconds INTEGER NOT NULL CHECK (offset_seconds BETWEEN -64800 AND 64800),
    decision VARCHAR(20) NOT NULL,
    code VARCHAR(40) NOT NULL,
    retry_at TIMESTAMPTZ,
    grace_expires_at TIMESTAMPTZ,
    retry_attempts INTEGER NOT NULL DEFAULT 0 CHECK (retry_attempts >= 0),
    missed_from TIMESTAMPTZ,
    missed_until TIMESTAMPTZ,
    missed_count BIGINT CHECK (missed_count IS NULL OR missed_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_studio_schedule_occurrences_nominal
        UNIQUE (schedule_id, schedule_version, scheduled_at),
    -- Offset/version are deliberately absent: the repeated local slot is the same intent.
    CONSTRAINT uq_studio_schedule_occurrences_local_slot
        UNIQUE (schedule_id, time_zone, local_scheduled_at),
    CONSTRAINT fk_studio_schedule_occurrences_owner FOREIGN KEY (schedule_id, test_id, csi_id)
        REFERENCES studio_schedules(id, test_id, csi_id),
    CONSTRAINT fk_studio_schedule_occurrences_activation FOREIGN KEY (
        activation_id, schedule_id, schedule_version, test_id, csi_id,
        activated_revision_id, environment, execution_principal)
        REFERENCES studio_schedule_activations(
            id, schedule_id, schedule_version, test_id, csi_id, revision_id,
            environment, execution_principal),
    CONSTRAINT ck_studio_schedule_occurrences_decision CHECK (
        decision IN ('ACCEPTED', 'REFUSED', 'SKIPPED', 'DEFERRED')),
    CONSTRAINT ck_studio_schedule_occurrences_retry CHECK (
        (decision = 'DEFERRED' AND retry_at IS NOT NULL AND grace_expires_at IS NOT NULL
            AND retry_at <= grace_expires_at AND grace_expires_at >= scheduled_at)
        OR (decision <> 'DEFERRED' AND retry_at IS NULL)),
    CONSTRAINT ck_studio_schedule_occurrences_code CHECK (
        code IN ('ACCEPTED', 'COMPILE_REQUIRED', 'ACTIVATION_REVISION_MISMATCH',
            'RUNTIME_INCOMPATIBLE', 'STEP_LIMIT_EXCEEDED', 'TEST_DELETED', 'TEST_QUARANTINED',
            'BACKGROUND_AUTHORIZATION_DENIED', 'REFERENCE_UNAVAILABLE',
            'PENDING_QUOTA_EXCEEDED', 'BACKGROUND_AUTHORIZATION_UNAVAILABLE',
            'VAULT_UNAVAILABLE', 'OVERLAP', 'MISFIRE', 'GRACE_EXPIRED',
            'DISPATCH_DISABLED', 'UNCERTAIN_EXECUTION', 'SCHEDULE_PAUSED',
            'SCHEDULE_UPDATED', 'SCHEDULE_REMOVED')
        AND ((decision = 'ACCEPTED') = (code = 'ACCEPTED'))),
    CONSTRAINT ck_studio_schedule_occurrences_misfire CHECK (
        (missed_from IS NULL) = (missed_until IS NULL)
        AND (missed_from IS NULL OR missed_from <= missed_until)),
    CONSTRAINT ck_studio_schedule_occurrences_local_time CHECK (
        local_scheduled_at = (scheduled_at AT TIME ZONE 'UTC')
            + offset_seconds * INTERVAL '1 second')
);

ALTER TABLE studio_dispatch_ledger
    ADD COLUMN scheduled_occurrence_id UUID UNIQUE REFERENCES studio_schedule_occurrences(id),
    ADD COLUMN terminal_error_code VARCHAR(40),
    ADD COLUMN terminal_error_at TIMESTAMPTZ,
    ADD CONSTRAINT ck_studio_dispatch_ledger_scheduled_identity CHECK (
        scheduled_occurrence_id IS NULL OR (principal IS NOT NULL
            AND idempotency_key IS NULL AND request_digest IS NULL)),
    ADD CONSTRAINT ck_studio_dispatch_ledger_terminal_summary CHECK (
        terminal_error_code IS NULL OR (state = 'DONE' AND terminal_error_at IS NOT NULL));

-- Only retained, known outcomes are backfilled. Never fabricate a clean outcome for missing
-- partitions/details. Operator reconciliation is required after an older database restore.
UPDATE studio_dispatch_ledger l
   SET terminal_error_code = e.error_code,
       terminal_error_at = COALESCE(e.ended_at, e.created_at)
  FROM ui_test_executions e
 WHERE l.state = 'DONE' AND e.id = l.execution_id AND e.started_at = l.execution_accepted_at
   AND e.error_code IN ('DISPATCH_UNKNOWN', 'START_TIMEOUT', 'STALE');

CREATE TABLE studio_schedule_uncertainty_ack (
    schedule_id UUID NOT NULL REFERENCES studio_schedules(id),
    execution_id UUID NOT NULL REFERENCES studio_dispatch_ledger(execution_id),
    activation_id UUID NOT NULL,
    acknowledged_by VARCHAR(255) NOT NULL CHECK (length(btrim(acknowledged_by)) > 0),
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (schedule_id, execution_id),
    CONSTRAINT fk_studio_schedule_uncertainty_ack_activation
        FOREIGN KEY (activation_id, schedule_id)
        REFERENCES studio_schedule_activations(id, schedule_id)
);

ALTER TABLE ui_test_executions
    ADD COLUMN trigger_source VARCHAR(20),
    ADD COLUMN schedule_id UUID REFERENCES studio_schedules(id),
    ADD COLUMN schedule_version BIGINT,
    ADD COLUMN occurrence_id UUID REFERENCES studio_schedule_occurrences(id),
    ADD COLUMN scheduled_at TIMESTAMPTZ,
    ADD COLUMN activation_id UUID REFERENCES studio_schedule_activations(id),
    ADD COLUMN activated_by VARCHAR(255),
    ADD COLUMN activated_at TIMESTAMPTZ,
    ADD CONSTRAINT ck_ui_test_executions_trigger_source CHECK (
        (trigger_source IS NOT NULL AND trigger_source = 'SCHEDULED' AND schedule_id IS NOT NULL
            AND schedule_version IS NOT NULL AND schedule_version > 0
            AND occurrence_id IS NOT NULL AND scheduled_at IS NOT NULL AND activation_id IS NOT NULL
            AND activated_by IS NOT NULL AND activated_at IS NOT NULL)
        OR ((trigger_source IS NULL OR trigger_source = 'MANUAL')
            AND schedule_id IS NULL AND schedule_version IS NULL AND occurrence_id IS NULL
            AND scheduled_at IS NULL AND activation_id IS NULL
            AND activated_by IS NULL AND activated_at IS NULL));

CREATE INDEX idx_studio_schedules_due ON studio_schedules(poll_after_at, csi_id, test_id)
    WHERE state = 'ENABLED' AND deleted_at IS NULL;
CREATE INDEX idx_studio_schedules_csi ON studio_schedules(csi_id, test_id);
CREATE INDEX idx_studio_schedule_activations_schedule
    ON studio_schedule_activations(schedule_id, activated_at DESC, id DESC);
CREATE INDEX idx_studio_schedule_occurrences_history
    ON studio_schedule_occurrences(schedule_id, scheduled_at DESC, id DESC);
CREATE INDEX idx_studio_schedule_occurrences_csi
    ON studio_schedule_occurrences(csi_id, test_id, scheduled_at DESC, id DESC);
CREATE UNIQUE INDEX uq_studio_schedule_occurrences_deferred
    ON studio_schedule_occurrences(schedule_id) WHERE decision = 'DEFERRED';
CREATE INDEX idx_studio_dispatch_ledger_active_test
    ON studio_dispatch_ledger(test_id) WHERE state <> 'DONE';
CREATE INDEX idx_studio_dispatch_ledger_uncertain_test
    ON studio_dispatch_ledger(test_id, execution_id)
    WHERE state = 'DONE'
        AND terminal_error_code IN ('DISPATCH_UNKNOWN', 'START_TIMEOUT', 'STALE');

CREATE FUNCTION studio_schedule_append_only() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is immutable retained scheduling audit', TG_TABLE_NAME
        USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_studio_schedule_activations_immutable
    BEFORE UPDATE OR DELETE ON studio_schedule_activations
    FOR EACH ROW EXECUTE FUNCTION studio_schedule_append_only();
CREATE TRIGGER trg_studio_schedule_uncertainty_ack_immutable
    BEFORE UPDATE OR DELETE ON studio_schedule_uncertainty_ack
    FOR EACH ROW EXECUTE FUNCTION studio_schedule_append_only();

CREATE FUNCTION studio_schedule_anchor_guard() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'studio_schedules anchor must be retained; remove with a tombstone'
            USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.id, NEW.test_id, NEW.csi_id, NEW.created_by, NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id, OLD.test_id, OLD.csi_id, OLD.created_by, OLD.created_at)
        OR NEW.version < OLD.version THEN
        RAISE EXCEPTION 'studio_schedules identity is immutable and version cannot decrease'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_studio_schedules_anchor
    BEFORE UPDATE OR DELETE ON studio_schedules
    FOR EACH ROW EXECUTE FUNCTION studio_schedule_anchor_guard();

CREATE FUNCTION studio_schedule_activation_guard() RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ui_test_revisions r
        WHERE r.id = NEW.revision_id AND r.test_id = NEW.test_id AND r.csi_id = NEW.csi_id
            AND r.confirmed_at IS NOT NULL
            AND r.configuration->>'environment' = NEW.environment) THEN
        RAISE EXCEPTION 'activation must reference its confirmed revision and environment'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_studio_schedule_activations_confirmed
    BEFORE INSERT ON studio_schedule_activations
    FOR EACH ROW EXECUTE FUNCTION studio_schedule_activation_guard();

CREATE FUNCTION studio_schedule_occurrence_guard() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'studio_schedule_occurrences identity is retained'
            USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['decision', 'code', 'retry_at', 'retry_attempts', 'updated_at'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['decision', 'code', 'retry_at', 'retry_attempts', 'updated_at']) THEN
        RAISE EXCEPTION 'studio_schedule_occurrences nominal identity and provenance are immutable'
            USING ERRCODE = '23514';
    END IF;
    IF OLD.decision <> 'DEFERRED' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
        RAISE EXCEPTION 'studio_schedule_occurrences terminal decision is immutable'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_studio_schedule_occurrences_immutable
    BEFORE UPDATE OR DELETE ON studio_schedule_occurrences
    FOR EACH ROW EXECUTE FUNCTION studio_schedule_occurrence_guard();

CREATE FUNCTION studio_schedule_ack_guard() RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM studio_schedules s
        JOIN studio_dispatch_ledger l ON l.test_id = s.test_id AND l.csi_id = s.csi_id
        JOIN studio_schedule_activations a ON a.id = NEW.activation_id AND a.schedule_id = s.id
        WHERE s.id = NEW.schedule_id AND l.execution_id = NEW.execution_id AND l.state = 'DONE'
            AND l.terminal_error_code IN ('DISPATCH_UNKNOWN', 'START_TIMEOUT', 'STALE')
            AND a.activated_by = NEW.acknowledged_by) THEN
        RAISE EXCEPTION 'uncertainty acknowledgment must own the test, activation and uncertain run'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_studio_schedule_uncertainty_ack_owner
    BEFORE INSERT ON studio_schedule_uncertainty_ack
    FOR EACH ROW EXECUTE FUNCTION studio_schedule_ack_guard();

CREATE FUNCTION studio_schedule_ledger_identity_guard() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.scheduled_occurrence_id IS NOT NULL AND (
        TG_OP = 'DELETE' OR ROW(NEW.execution_id, NEW.execution_accepted_at, NEW.test_id,
            NEW.csi_id, NEW.principal, NEW.scheduled_occurrence_id)
        IS DISTINCT FROM ROW(OLD.execution_id, OLD.execution_accepted_at, OLD.test_id,
            OLD.csi_id, OLD.principal, OLD.scheduled_occurrence_id)) THEN
        RAISE EXCEPTION 'scheduled ledger identity is immutable retained provenance'
            USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.state = 'DONE'
        AND ROW(NEW.terminal_error_code, NEW.terminal_error_at)
            IS DISTINCT FROM ROW(OLD.terminal_error_code, OLD.terminal_error_at) THEN
        RAISE EXCEPTION 'terminal ledger uncertainty summary is immutable'
            USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_studio_scheduling_ledger_identity
    BEFORE UPDATE OR DELETE ON studio_dispatch_ledger
    FOR EACH ROW EXECUTE FUNCTION studio_schedule_ledger_identity_guard();

CREATE FUNCTION studio_execution_trigger_guard() RETURNS TRIGGER AS $$
BEGIN
    IF ROW(NEW.trigger_source, NEW.schedule_id, NEW.schedule_version, NEW.occurrence_id,
        NEW.scheduled_at, NEW.activation_id, NEW.activated_by, NEW.activated_at) IS DISTINCT FROM
        ROW(OLD.trigger_source, OLD.schedule_id, OLD.schedule_version, OLD.occurrence_id,
            OLD.scheduled_at, OLD.activation_id, OLD.activated_by, OLD.activated_at) THEN
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

-- Called only at new linkage/occurrence changes. Ordinary callbacks and retention never
-- revalidate historical rows after their partition is pruned: the ledger is the identity anchor.
CREATE FUNCTION studio_schedule_check_occurrence(occurrence UUID) RETURNS VOID AS $$
DECLARE
    o studio_schedule_occurrences%ROWTYPE;
    linked_count INTEGER;
BEGIN
    SELECT * INTO o FROM studio_schedule_occurrences WHERE id = occurrence;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT count(*) INTO linked_count FROM studio_dispatch_ledger
        WHERE scheduled_occurrence_id = o.id;
    IF o.decision = 'ACCEPTED' THEN
        IF linked_count <> 1 OR NOT EXISTS (
            SELECT 1 FROM studio_dispatch_ledger l
            JOIN ui_test_executions e ON e.id = l.execution_id
                AND e.started_at = l.execution_accepted_at
            JOIN studio_schedule_activations a ON a.id = o.activation_id
            WHERE l.scheduled_occurrence_id = o.id AND l.test_id = o.test_id
                AND l.csi_id = o.csi_id AND l.principal = o.execution_principal
                AND e.ui_test_id = o.test_id AND e.csi_id = o.csi_id
                AND e.principal = o.execution_principal AND e.environment = o.environment
                AND e.revision_id = o.activated_revision_id AND e.activation_id = a.id
                AND e.activated_by = a.activated_by AND e.activated_at = a.activated_at
                AND e.trigger_source = 'SCHEDULED' AND e.schedule_id = o.schedule_id
                AND e.schedule_version = o.schedule_version AND e.occurrence_id = o.id
                AND e.scheduled_at = o.scheduled_at) THEN
            RAISE EXCEPTION 'accepted occurrence requires exactly one matching ledger/history snapshot'
                USING ERRCODE = '23514';
        END IF;
    ELSIF linked_count <> 0 OR EXISTS (
        SELECT 1 FROM ui_test_executions e WHERE e.occurrence_id = o.id) THEN
        RAISE EXCEPTION 'unaccepted occurrence cannot own an execution'
            USING ERRCODE = '23514';
    END IF;
    IF o.decision = 'DEFERRED' AND NOT EXISTS (
        SELECT 1 FROM studio_schedules s WHERE s.id = o.schedule_id AND s.state = 'ENABLED'
            AND s.deleted_at IS NULL AND s.version = o.schedule_version
            AND s.activation_id = o.activation_id AND s.next_due_at = o.scheduled_at
            AND s.poll_after_at = o.retry_at) THEN
        RAISE EXCEPTION 'deferred occurrence cannot be orphaned from its enabled nominal cursor'
            USING ERRCODE = '23514';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION studio_schedule_occurrence_integrity() RETURNS TRIGGER AS $$
BEGIN
    PERFORM studio_schedule_check_occurrence(NEW.id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trg_studio_schedule_occurrence_integrity
    AFTER INSERT OR UPDATE ON studio_schedule_occurrences
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION studio_schedule_occurrence_integrity();

CREATE FUNCTION studio_schedule_ledger_integrity() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND ROW(NEW.scheduled_occurrence_id, NEW.execution_id,
        NEW.execution_accepted_at, NEW.test_id, NEW.csi_id, NEW.principal)
        IS NOT DISTINCT FROM ROW(OLD.scheduled_occurrence_id, OLD.execution_id,
            OLD.execution_accepted_at, OLD.test_id, OLD.csi_id, OLD.principal) THEN
        RETURN NULL;
    END IF;
    IF NEW.scheduled_occurrence_id IS NOT NULL THEN
        PERFORM studio_schedule_check_occurrence(NEW.scheduled_occurrence_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trg_studio_scheduling_ledger_integrity
    AFTER INSERT OR UPDATE ON studio_dispatch_ledger
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION studio_schedule_ledger_integrity();

CREATE FUNCTION studio_schedule_history_integrity() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.trigger_source = 'SCHEDULED' THEN
        PERFORM studio_schedule_check_occurrence(NEW.occurrence_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trg_studio_scheduling_history_integrity
    AFTER INSERT ON ui_test_executions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION studio_schedule_history_integrity();

CREATE FUNCTION studio_schedule_cursor_integrity() RETURNS TRIGGER AS $$
DECLARE
    pending UUID;
BEGIN
    IF NEW.state = 'ENABLED' AND NOT EXISTS (
        SELECT 1 FROM studio_schedule_activations a WHERE a.id = NEW.activation_id
            AND a.schedule_id = NEW.id AND a.schedule_version = NEW.version
            AND a.revision_id = NEW.activated_revision_id
            AND a.execution_principal = NEW.execution_principal) THEN
        RAISE EXCEPTION 'enabled schedule must match its immutable activation'
            USING ERRCODE = '23514';
    END IF;
    FOR pending IN SELECT id FROM studio_schedule_occurrences
        WHERE schedule_id = NEW.id AND decision = 'DEFERRED'
    LOOP
        PERFORM studio_schedule_check_occurrence(pending);
    END LOOP;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER trg_studio_schedule_cursor_integrity
    AFTER INSERT OR UPDATE ON studio_schedules
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    EXECUTE FUNCTION studio_schedule_cursor_integrity();

COMMENT ON TABLE studio_schedule_activations IS
    'Immutable human activation audit for every successful Resume, including no uncertainty.';
COMMENT ON TABLE studio_schedule_occurrences IS
    'Durable nominal/local slot identity; execution linkage derives from the ledger, not history FK.';
COMMENT ON COLUMN studio_dispatch_ledger.scheduled_occurrence_id IS
    'Trusted scheduled identity, unique and disjoint from public manual idempotency keys.';
COMMENT ON COLUMN studio_dispatch_ledger.terminal_error_code IS
    'Durable terminal uncertainty; retained when execution history partitions are pruned.';
