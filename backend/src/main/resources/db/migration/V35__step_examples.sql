-- SC008-E16: retrieved step-code examples (ADR-SC-008 D6 "Examples"). Forward-only on top of V1-V34.
--   1. studio_step_examples: a sanitized {step text, code, origin host} of a step whose frozen code passed
--      the model-free proof. One row per (revision, step ordinal). Whether a row may still be retrieved is
--      derived at read time from the live receipts and the test's head revision (V34), not stored.
--   2. studio_step_example_snapshots: a frozen member list for gate runs (FR-14). One immutable row.

-- 1. Examples.
CREATE TABLE studio_step_examples (
    id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    csi_id             varchar(20)  NOT NULL,
    revision_id        uuid         NOT NULL REFERENCES ui_test_revisions (id),
    step_ordinal       integer      NOT NULL CHECK (step_ordinal >= 0),
    proof_execution_id uuid         NOT NULL,
    step_hash          char(64)     NOT NULL,
    source_hash        char(64)     NOT NULL,
    step_text          varchar(1024) NOT NULL CHECK (step_text <> ''),
    origin_host        varchar(255),
    code               varchar(4096) NOT NULL CHECK (code <> ''),
    created_at         timestamptz  NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (revision_id, step_ordinal)
);
CREATE INDEX idx_studio_step_examples_csi ON studio_step_examples (csi_id, created_at DESC);

-- What this proves: a PASSED receipt tuple exists for this revision step (same proof execution, same
-- step hash), the revision belongs to the same CSI, and the row carries the code identity (sourceHash)
-- of that step's operation in the revision artifact. It cannot prove that the stored, placeholdered
-- text derives from that code; that binding is the recorder, which recomputes hash(code) and
-- hash(operation record) against the artifact and the receipt before it sanitizes. Rows are immutable.
CREATE FUNCTION studio_step_example_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'step examples are immutable' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM studio_step_receipts r
          JOIN ui_test_revisions v ON v.id = r.revision_id
         WHERE r.revision_id = NEW.revision_id
           AND r.step_ordinal = NEW.step_ordinal
           AND r.status = 'PASSED'
           AND r.proof_execution_id = NEW.proof_execution_id
           AND r.step_hash = NEW.step_hash
           AND v.csi_id = NEW.csi_id
           AND v.artifact #>> ARRAY['steps', NEW.step_ordinal::text, 'operations', '0', 'operation',
                                    'sourceHash'] = NEW.source_hash) THEN
        RAISE EXCEPTION 'step example needs a PASSED proof receipt of the same step, CSI and code'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tr_studio_step_example_guard BEFORE INSERT OR UPDATE ON studio_step_examples
    FOR EACH ROW EXECUTE FUNCTION studio_step_example_guard();

-- 2. Frozen gate snapshot: the member ids and their hash. Eligibility is checked once, at freeze.
CREATE TABLE studio_step_example_snapshots (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_hash char(64)    NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
    example_ids   uuid[]      NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION studio_step_example_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'step example snapshots are immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER tr_studio_step_example_snapshot_immutable BEFORE UPDATE OR DELETE
    ON studio_step_example_snapshots
    FOR EACH ROW EXECUTE FUNCTION studio_step_example_snapshot_immutable();
