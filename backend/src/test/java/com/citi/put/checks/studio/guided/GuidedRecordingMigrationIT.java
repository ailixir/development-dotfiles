package com.citi.put.checks.studio.guided;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-013 V20 ({@code V20__guided_session_recording.sql}) on the Flyway head, per architect
 * ruling AR-1 R5 (docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-1-obs013.json) and its
 * negativeTestExpectations.data_GuidedRecordingMigrationIT. One immutable fact per session: insert
 * only, storable states AVAILABLE | FAILED | UNAVAILABLE. Every case runs in a transaction that is
 * rolled back.
 */
@Testcontainers(disabledWithoutDocker = true)
class GuidedRecordingMigrationIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("guided_recording");
  private static final String SCOPE = "a".repeat(64);

  @BeforeAll
  static void migrate() {
    POSTGRES.start();
    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations("classpath:db/migration")
        .load()
        .migrate();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @Test
  void headIsV21AndTheTableHasExactlyTheRuledShape() throws SQLException {
    try (Connection c = connect()) {
      assertThat(scalar(c, "SELECT max(version::int) FROM flyway_schema_history")).isEqualTo("29");
      assertThat(scalar(c, "SELECT description FROM flyway_schema_history WHERE version='20'"))
          .isEqualTo("guided session recording");
      assertThat(
              rows(
                  c,
                  "SELECT column_name||':'||data_type||':'||is_nullable FROM"
                      + " information_schema.columns WHERE"
                      + " table_name='studio_guided_session_recordings' ORDER BY ordinal_position"))
          .containsExactly(
              "session_id:character varying:NO",
              "scope_hash:character:NO",
              "recording_id:character varying:NO",
              "worker_id:character varying:NO",
              "owner_fence:integer:NO",
              "state:character varying:NO",
              "partial:boolean:NO",
              "video_key:character varying:NO",
              "manifest_key:character varying:NO",
              "recorded_at:timestamp with time zone:NO",
              "expires_at:timestamp with time zone:YES",
              "timings:jsonb:NO");
      assertThat(
              rows(
                  c,
                  "SELECT indexname FROM pg_indexes WHERE"
                      + " tablename='studio_guided_session_recordings' ORDER BY 1"))
          .as("no secondary index: PK and the recording_id UNIQUE only")
          .hasSize(2);
    }
  }

  @Test
  void eachStorableStateIsAcceptedWithItsRuledShape() throws SQLException {
    try (Connection c = transaction()) {
      exec(
          c,
          insert(
              session(c),
              "r1",
              "AVAILABLE",
              true,
              "+ interval '30 days'",
              "[{\"kind\":\"step\",\"startMs\":0}]"));
      exec(c, insert(session(c), "r2", "FAILED", false, null, "[]"));
      exec(c, insert(session(c), "r3", "UNAVAILABLE", false, null, "[]"));
      assertThat(scalar(c, "SELECT count(*) FROM studio_guided_session_recordings")).isEqualTo("3");
      c.rollback();
    }
  }

  @Test
  void updateOfAnyColumnAndDeleteAreRefused() throws SQLException {
    try (Connection c = transaction()) {
      String session = session(c);
      exec(c, insert(session, "r1", "AVAILABLE", false, "+ interval '1 day'", "[]"));
      List<String> accepted = new ArrayList<>();
      for (String column :
          rows(
              c,
              "SELECT column_name FROM information_schema.columns WHERE"
                  + " table_name='studio_guided_session_recordings'")) {
        String sql =
            "UPDATE studio_guided_session_recordings SET \""
                + column
                + "\"=\""
                + column
                + "\" WHERE session_id='"
                + session
                + "'";
        if (!rejected(c, sql, "guided session recording is immutable")) {
          accepted.add(sql);
        }
      }
      assertThat(accepted).isEmpty();
      reject(c, "DELETE FROM studio_guided_session_recordings", "immutable");
      c.rollback();
    }
  }

  @Test
  void derivedStatesAreNeverStored() throws SQLException {
    try (Connection c = transaction()) {
      reject(
          c,
          insert(session(c), "r1", "PROCESSING", false, null, "[]"),
          "violates check constraint");
      reject(
          c, insert(session(c), "r2", "EXPIRED", false, null, "[]"), "violates check constraint");
      c.rollback();
    }
  }

  @Test
  void partialIsOnlyForAvailableAndExpiryOnlyForAvailable() throws SQLException {
    try (Connection c = transaction()) {
      reject(c, insert(session(c), "r1", "FAILED", true, null, "[]"), "violates check constraint");
      reject(
          c,
          insert(session(c), "r2", "UNAVAILABLE", true, null, "[]"),
          "violates check constraint");
      reject(
          c, insert(session(c), "r3", "AVAILABLE", false, null, "[]"), "violates check constraint");
      reject(
          c,
          insert(session(c), "r4", "FAILED", false, "+ interval '1 day'", "[]"),
          "violates check constraint");
      reject(
          c, insert(session(c), "r5", "AVAILABLE", false, "", "[]"), "violates check constraint");
      reject(
          c,
          insert(session(c), "r6", "AVAILABLE", false, "- interval '1 second'", "[]"),
          "violates check constraint");
      c.rollback();
    }
  }

  @Test
  void timingsAreABoundedArrayAndEmptyUnlessAvailable() throws SQLException {
    try (Connection c = transaction()) {
      // Non-array input fails either the typeof CHECK or jsonb_array_length itself; both refuse.
      rejectAny(c, insert(session(c), "r1", "AVAILABLE", false, "+ interval '1 day'", "{}"));
      String item = "{\"kind\":\"action\",\"startMs\":1}";
      String four01 = "[" + String.join(",", java.util.Collections.nCopies(401, item)) + "]";
      reject(
          c,
          insert(session(c), "r2", "AVAILABLE", false, "+ interval '1 day'", four01),
          "violates check constraint");
      String four00 = "[" + String.join(",", java.util.Collections.nCopies(400, item)) + "]";
      exec(c, insert(session(c), "r3", "AVAILABLE", false, "+ interval '1 day'", four00));
      String big = "[\"" + "x".repeat(262144) + "\"]";
      reject(
          c,
          insert(session(c), "r4", "AVAILABLE", false, "+ interval '1 day'", big),
          "violates check constraint");
      reject(
          c,
          insert(session(c), "r5", "FAILED", false, null, "[" + item + "]"),
          "violates check constraint");
      c.rollback();
    }
  }

  @Test
  void oneFactPerSessionUniqueRecordingIdAndSafeRecordingId() throws SQLException {
    try (Connection c = transaction()) {
      String session = session(c);
      exec(c, insert(session, "r1", "FAILED", false, null, "[]"));
      reject(c, insert(session, "r2", "UNAVAILABLE", false, null, "[]"), "duplicate key");
      reject(c, insert(session(c), "r1", "FAILED", false, null, "[]"), "duplicate key");
      reject(
          c, insert(session(c), "a/b", "FAILED", false, null, "[]"), "violates check constraint");
      reject(c, insert(session(c), "", "FAILED", false, null, "[]"), "violates check constraint");
      exec(c, insert(session(c), "z", "FAILED", false, null, "[]"));
      exec(c, insert(session(c), "c".repeat(255), "FAILED", false, null, "[]"));
      for (String invalid : List.of("a.b", "..", "../x", "café", "界")) {
        reject(
            c,
            insert(session(c), invalid, "FAILED", false, null, "[]"),
            "violates check constraint");
      }
      // AR-1 R5 bounds the id at 1..256 characters; varchar(256) carries the upper bound because a
      // PostgreSQL repetition bound cannot exceed 255.
      exec(c, insert(session(c), "a".repeat(256), "FAILED", false, null, "[]"));
      reject(c, insert(session(c), "b".repeat(257), "FAILED", false, null, "[]"), "too long");
      c.rollback();
    }
  }

  @Test
  void theSessionAndScopeHashMustMatchAsAPair() throws SQLException {
    try (Connection c = transaction()) {
      String session = session(c);
      reject(
          c,
          insert(session, "r1", "FAILED", false, null, "[]")
              .replace("'" + SCOPE + "'", "'" + "b".repeat(64) + "'"),
          "foreign key");
      reject(c, insert("missing", "r2", "FAILED", false, null, "[]"), "foreign key");
      c.rollback();
    }
  }

  // ── fixtures ───────────────────────────────────────────────────────────────────────────────

  private static String session(Connection c) throws SQLException {
    String id = "rec-" + UUID.randomUUID();
    exec(
        c,
        "INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,"
            + "expires_at,document) VALUES ('"
            + id
            + "','t','p','"
            + SCOPE
            + "','SUCCEEDED',"
            + "clock_timestamp(),jsonb_build_object('sessionId','"
            + id
            + "','scopeHash','"
            + SCOPE
            + "','state','SUCCEEDED','scope',jsonb_build_object('principalId','p','csiId','C1')))");
    return id;
  }

  /**
   * One statement, recorded_at and expires_at from one clock sample (AR-1 R5 notes[3]). {@code
   * expiry} is appended to that sample; null stores no expiry; "" stores expires_at = recorded_at.
   */
  private static String insert(
      String session,
      String recording,
      String state,
      boolean partial,
      String expiry,
      String timings) {
    String expires = expiry == null ? "NULL" : "t.now " + expiry;
    return "WITH t AS (SELECT clock_timestamp() AS now) INSERT INTO"
        + " studio_guided_session_recordings(session_id,scope_hash,recording_id,worker_id,"
        + "owner_fence,state,partial,video_key,manifest_key,recorded_at,expires_at,timings)"
        + " SELECT '"
        + session
        + "','"
        + SCOPE
        + "','"
        + recording
        + "','worker',1,'"
        + state
        + "',"
        + partial
        + ",'studio/C1/guided/"
        + session
        + ".webm','studio/C1/guided/"
        + session
        + ".manifest.json',t.now,"
        + expires
        + ",'"
        + timings
        + "'::jsonb FROM t";
  }

  private static Connection connect() throws SQLException {
    return DriverManager.getConnection(
        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static Connection transaction() throws SQLException {
    Connection c = connect();
    c.setAutoCommit(false);
    return c;
  }

  private static void exec(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement()) {
      s.execute(sql);
    }
  }

  private static void reject(Connection c, String sql, String message) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      assertThatThrownBy(() -> s.execute(sql))
          .isInstanceOf(SQLException.class)
          .hasMessageContaining(message);
    } finally {
      c.rollback(savepoint);
    }
  }

  private static void rejectAny(Connection c, String sql) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      assertThatThrownBy(() -> s.execute(sql)).isInstanceOf(SQLException.class);
    } finally {
      c.rollback(savepoint);
    }
  }

  private static boolean rejected(Connection c, String sql, String message) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      s.execute(sql);
      return false;
    } catch (SQLException e) {
      assertThat(e.getMessage()).contains(message);
      return true;
    } finally {
      c.rollback(savepoint);
    }
  }

  private static String scalar(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement();
        ResultSet r = s.executeQuery(sql)) {
      r.next();
      return r.getString(1);
    }
  }

  private static List<String> rows(Connection c, String sql) throws SQLException {
    List<String> out = new ArrayList<>();
    try (Statement s = c.createStatement();
        ResultSet r = s.executeQuery(sql)) {
      while (r.next()) {
        out.add(r.getString(1));
      }
    }
    return out;
  }
}
