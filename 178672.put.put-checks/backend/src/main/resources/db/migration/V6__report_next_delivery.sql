ALTER TABLE reports ADD COLUMN IF NOT EXISTS next_delivery_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reports_next_delivery
  ON reports(next_delivery_at)
  WHERE status = 'active' AND deleted_at IS NULL AND next_delivery_at IS NOT NULL;
