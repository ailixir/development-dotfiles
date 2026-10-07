-- Story 10.23 defect D2 — ui_test_executions.execution_scope is fixed at insert.
--
-- Ruling: docs/architecture/studio-inference-contract-v1.md, "Persistence ruling — execution_scope
-- is fixed at insert". The acceptance writer stamps FULL on the INSERT; no UPDATE may change the
-- value afterwards, in either direction (NULL->FULL forges baseline evidence, FULL->NULL erases
-- it), whatever the row's status. Unchanged values pass: the guard compares values, so an UPDATE
-- that lists the column with the same value (e.g. a Hibernate full-row update) is allowed.
--
-- Deliberately a NEW function: it does not CREATE OR REPLACE studio_execution_trigger_guard (V26)
-- or any other existing function, so no later migration can silently drop this guard (D1).
-- The trigger is created on the partitioned parent; PostgreSQL (13+) clones it to every existing
-- partition, the DEFAULT partition and any partition created later.
--
-- No data change, no CHECK/index change; INSERT and DELETE behaviour are unchanged.
-- Rollback (if ever required, forward migration):
--   DROP TRIGGER trg_studio_execution_scope_immutable ON ui_test_executions;
--   DROP FUNCTION studio_execution_scope_immutable();
CREATE FUNCTION studio_execution_scope_immutable() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.execution_scope IS DISTINCT FROM OLD.execution_scope THEN
        RAISE EXCEPTION 'execution_scope is immutable (execution %)', OLD.id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_studio_execution_scope_immutable
    BEFORE UPDATE ON ui_test_executions
    FOR EACH ROW EXECUTE FUNCTION studio_execution_scope_immutable();
