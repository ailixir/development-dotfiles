-- V5__story_3_schema_additions.sql
-- Stories 3.10-3.12: Add missing columns for reports, studio, and ui_tests entities.

-- Story 3.10: Add selected_checks column to reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS selected_checks JSONB;

-- Story 3.11: Add status and schedule columns to ui_tests
ALTER TABLE ui_tests ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'paused';
ALTER TABLE ui_tests ADD COLUMN IF NOT EXISTS schedule JSONB;
