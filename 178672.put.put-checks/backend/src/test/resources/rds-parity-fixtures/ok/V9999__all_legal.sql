-- Positive fixture: all operations are RDS-legal. The lint MUST NOT flag this file.

CREATE TABLE IF NOT EXISTS test_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_table_name ON test_table (name);

-- Allowlisted extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Standard role operations (no SUPERUSER attribute)
CREATE ROLE app_reader WITH LOGIN PASSWORD 'changeme';
ALTER ROLE app_reader SET search_path TO public;

-- Regular COPY (no PROGRAM keyword)
COPY test_table (id, name, created_at) FROM '/tmp/data.csv' WITH (FORMAT csv, HEADER true);

-- PL/pgSQL function (not LANGUAGE C)
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_test_table_updated
    BEFORE UPDATE ON test_table
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ALTER TABLE (must NOT match ALTER SYSTEM)
ALTER TABLE test_table ADD COLUMN description TEXT;

-- Comment mentioning restricted keywords should be stripped and not flagged:
-- ALTER SYSTEM SET work_mem = '256MB'
-- CREATE EXTENSION postgis
-- SUPERUSER
-- LANGUAGE C
/* Block comment: COPY FROM PROGRAM pg_read_server_files */
