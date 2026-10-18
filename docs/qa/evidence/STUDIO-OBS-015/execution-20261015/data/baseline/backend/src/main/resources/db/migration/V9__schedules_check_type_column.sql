-- V9: Add check_type to schedules for capacity-gated dispatch (Story 2.9).

ALTER TABLE schedules ADD COLUMN check_type VARCHAR(20);

UPDATE schedules s
SET check_type = c.type
FROM checks c
WHERE c.id = s.check_id;

-- Remove orphan schedules that reference deleted checks (cannot set NOT NULL otherwise).
DELETE FROM schedules WHERE check_type IS NULL;

ALTER TABLE schedules ALTER COLUMN check_type SET NOT NULL;

CREATE INDEX idx_schedules_type_next
    ON schedules (check_type, next_execution_at)
    WHERE enabled = true AND next_execution_at IS NOT NULL;
