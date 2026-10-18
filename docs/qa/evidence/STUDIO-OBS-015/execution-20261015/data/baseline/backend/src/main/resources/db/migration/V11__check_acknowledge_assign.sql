ALTER TABLE checks ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE checks ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_checks_assigned_to
  ON checks(assigned_to)
  WHERE deleted_at IS NULL AND assigned_to IS NOT NULL;
