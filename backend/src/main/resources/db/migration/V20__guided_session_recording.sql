-- STUDIO-OBS-013: guided session recording fact. Forward-only after V19 (one D unit, RK-5).
-- Ruling: docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-1-obs013.json R5 (ddl_normative), verbatim except
-- one equivalent rewrite: R5 writes the recording_id CHECK as '^[A-Za-z0-9_-]{1,256}$'. PostgreSQL
-- regular expressions cap a repetition bound at 255 (RE_DUP_MAX), so that pattern raises "invalid
-- regular expression: invalid repetition count(s)" on every INSERT. '^[A-Za-z0-9_-]+$' together
-- with varchar(256) accepts exactly the same set (1..256 characters from the same class).
--
-- One immutable fact per session: inserted once, never updated or deleted. Only the storable
-- subset of VideoStatus is kept (AVAILABLE | FAILED | UNAVAILABLE); PROCESSING (no row yet) and
-- EXPIRED (expires_at passed) are derived at read time. No error text is stored. The V14
-- studio_guided_evidence table is not used. OBS-014's pruner does not touch this table: timings
-- carry IDs and integers only. Session rows are never deleted, so the FK needs no ON DELETE.
-- No secondary index: lookups are by primary key.
--
-- Rollback (pre-release, disposable databases only): no down migration. Recreate the database and
-- migrate to V19, or restore a pg_dump taken before V20. V20 adds one table and touches no row.

CREATE TABLE studio_guided_session_recordings (
  session_id varchar(256) PRIMARY KEY,
  scope_hash char(64) NOT NULL,
  recording_id varchar(256) NOT NULL UNIQUE CHECK (recording_id ~ '^[A-Za-z0-9_-]+$'),
  worker_id varchar(256) NOT NULL,
  owner_fence integer NOT NULL CHECK (owner_fence >= 0),
  state varchar(16) NOT NULL CHECK (state IN ('AVAILABLE','FAILED','UNAVAILABLE')),
  partial boolean NOT NULL,
  video_key varchar(1024) NOT NULL,
  manifest_key varchar(1024) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  timings jsonb NOT NULL,
  FOREIGN KEY (session_id, scope_hash) REFERENCES studio_guided_sessions (session_id, scope_hash),
  CHECK (NOT partial OR state = 'AVAILABLE'),
  CHECK ((state = 'AVAILABLE') = (expires_at IS NOT NULL)),
  CHECK (expires_at IS NULL OR expires_at > recorded_at),
  CHECK (jsonb_typeof(timings) = 'array' AND jsonb_array_length(timings) <= 400),
  CHECK (state = 'AVAILABLE' OR jsonb_array_length(timings) = 0),
  CHECK (octet_length(timings::text) <= 262144)
);

CREATE FUNCTION studio_guided_session_recording_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'guided session recording is immutable'; END $$;
CREATE TRIGGER tr_guided_session_recording_immutable BEFORE UPDATE OR DELETE ON studio_guided_session_recordings
 FOR EACH ROW EXECUTE FUNCTION studio_guided_session_recording_immutable();
