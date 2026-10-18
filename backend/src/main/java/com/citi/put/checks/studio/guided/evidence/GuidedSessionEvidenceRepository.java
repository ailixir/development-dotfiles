package com.citi.put.checks.studio.guided.evidence;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * SQL for the guided recording fact, {@code studio_guided_session_recordings} (V20, ruling AR-1
 * R5/R6).
 *
 * <p>Each row is one immutable fact per session, inserted once and never updated or deleted (the
 * table's trigger refuses both). {@code PROCESSING} and {@code EXPIRED} are never stored; they are
 * derived when read. Every time judgement — {@code recorded_at}, {@code expires_at}, the {@code
 * EXPIRED} check and the callback acceptance window — is made on the database clock with {@code
 * clock_timestamp()} inside the statement, never on this process's or the runner's clock.
 */
public class GuidedSessionEvidenceRepository {

  private final JdbcTemplate jdbc;

  public GuidedSessionEvidenceRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** The context materialized for the session, read without the liveness filter. */
  public record Materialized(
      String workerId,
      int ownerFence,
      String contextId,
      int contextRevision,
      String sourceRevision,
      String configurationRevision) {}

  /** The stored fact plus the DB-clock judgements made in the same statement. */
  public record Snapshot(
      String sessionState,
      boolean withinWindow,
      String recordingState,
      boolean partial,
      Instant expiresAt,
      boolean expired,
      String timings) {

    public boolean recorded() {
      return recordingState != null;
    }
  }

  /**
   * The materialization row for the session. {@code live} is deliberately not filtered: the stop
   * path sets it false before the browser context closes, and the recording callback arrives after
   * that. The fence and context identity are still compared exactly.
   */
  public Optional<Materialized> materialization(String sessionId) {
    return jdbc
        .query(
            "SELECT worker_id,owner_fence,context_id,context_revision,source_revision,"
                + "configuration_revision FROM studio_guided_materializations WHERE session_id=?",
            (rs, n) ->
                new Materialized(
                    rs.getString(1),
                    rs.getInt(2),
                    rs.getString(3),
                    rs.getInt(4),
                    rs.getString(5),
                    rs.getString(6)),
            sessionId)
        .stream()
        .findFirst();
  }

  /** This session's admissions, keyed by admission id. */
  public Map<String, GuidedRecordingTimings.LedgerAction> ledger(String sessionId) {
    Map<String, GuidedRecordingTimings.LedgerAction> out = new LinkedHashMap<>();
    jdbc.query(
        "SELECT admission_id,step_id,ordinal,(document->>'dispatchCount')::integer"
            + " FROM studio_guided_actions WHERE session_id=?",
        rs -> {
          out.put(
              rs.getString(1),
              new GuidedRecordingTimings.LedgerAction(
                  rs.getString(1), rs.getString(2), rs.getInt(3), rs.getInt(4)));
        },
        sessionId);
    return out;
  }

  /**
   * Whether the database clock is still before {@code sessions.expires_at + grace}. Judged in one
   * statement with {@code clock_timestamp()}.
   */
  public boolean withinAcceptanceWindow(String sessionId, double graceSeconds) {
    Boolean within =
        jdbc.queryForObject(
            "SELECT clock_timestamp() < expires_at + make_interval(secs => ?)"
                + " FROM studio_guided_sessions WHERE session_id=?",
            Boolean.class,
            graceSeconds,
            sessionId);
    return Boolean.TRUE.equals(within);
  }

  /** Whether the session already holds its write-once recording fact. */
  public boolean recorded(String sessionId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_guided_session_recordings WHERE session_id=?",
            Integer.class,
            sessionId);
    return count != null && count > 0;
  }

  /**
   * Inserts the fact. {@code recorded_at} and {@code expires_at} come from ONE {@code
   * clock_timestamp()} sample; {@code expires_at} is set only for {@code AVAILABLE}.
   */
  public void insert(
      String sessionId,
      String scopeHash,
      String recordingId,
      String workerId,
      int ownerFence,
      String state,
      boolean partial,
      GuidedRecordingKeys.Keys keys,
      String timings,
      long retentionSeconds) {
    jdbc.update(
        "WITH t AS (SELECT clock_timestamp() AS now)"
            + " INSERT INTO studio_guided_session_recordings"
            + " (session_id,scope_hash,recording_id,worker_id,owner_fence,state,partial,"
            + "video_key,manifest_key,recorded_at,expires_at,timings)"
            + " SELECT ?,?,?,?,?,?,?,?,?,t.now,"
            + " CASE WHEN ?='AVAILABLE' THEN t.now + make_interval(secs => ?) END,?::jsonb FROM t",
        sessionId,
        scopeHash,
        recordingId,
        workerId,
        ownerFence,
        state,
        partial,
        keys.videoKey(),
        keys.manifestKey(),
        state,
        (double) retentionSeconds,
        timings);
  }

  /**
   * The session state, the stored fact (if any) and the two DB-clock judgements, from one {@code
   * clock_timestamp()} sample. Empty when the session does not exist.
   */
  public Optional<Snapshot> snapshot(String sessionId, double graceSeconds) {
    return jdbc
        .query(
            "WITH t AS (SELECT clock_timestamp() AS now)"
                + " SELECT s.state, t.now < s.expires_at + make_interval(secs => ?),"
                + " r.state, r.partial, r.expires_at,"
                + " (r.expires_at IS NOT NULL AND r.expires_at <= t.now), r.timings::text"
                + " FROM t CROSS JOIN studio_guided_sessions s"
                + " LEFT JOIN studio_guided_session_recordings r ON r.session_id=s.session_id"
                + " WHERE s.session_id=?",
            (rs, n) -> {
              Timestamp expires = rs.getTimestamp(5);
              return new Snapshot(
                  rs.getString(1),
                  rs.getBoolean(2),
                  rs.getString(3),
                  rs.getBoolean(4),
                  expires == null ? null : expires.toInstant(),
                  rs.getBoolean(6),
                  rs.getString(7));
            },
            graceSeconds,
            sessionId)
        .stream()
        .findFirst();
  }

  /** The session's {@code scope.csiId}, for re-deriving the key on read. */
  public Optional<String> csiId(String sessionId) {
    return jdbc
        .queryForList(
            "SELECT document->'scope'->>'csiId' FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            sessionId)
        .stream()
        .findFirst();
  }
}
