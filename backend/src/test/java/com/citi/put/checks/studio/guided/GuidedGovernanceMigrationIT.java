package com.citi.put.checks.studio.guided;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.support.TestPostgresDatabase;
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

/**
 * STUDIO-OBS-014 V19 ({@code V19__guided_governance.sql}) on the Flyway head, per architect ruling
 * AR-2 (docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-2-3-obs014.json) and PO X6.
 *
 * <p>Covers the replaced guards column by column (AR-2 d attempt guard, AR-2 e publication guard),
 * the session prune guard and {@code studio_guided_prune_session} (AR-2 b), the per-CSI counters
 * (AR-2 c), and a V18 → head upgrade over populated rows.
 *
 * <p>Seeding note: a prunable session needs {@code expires_at} at least one hour in the past, while
 * V15 capture refuses any copy once {@code expires_at <= clock_timestamp()}. The two can never hold
 * in one timeline, so the publication base, copy, attempt and publication rows are seeded with
 * {@code session_replication_role = replica} (user triggers and FK triggers off, CHECK constraints
 * on). Every assertion runs with the role back at {@code origin}, so every guard under test is
 * live. The seeded rows are FK-consistent with each other so that the FK-ordered deletes are real.
 * Every case runs in a transaction that is rolled back.
 */
class GuidedGovernanceMigrationIT {

  private static final TestPostgresDatabase POSTGRES =
      new TestPostgresDatabase().withDatabaseName("guided_governance");
  private static final String UPGRADED_DB = "guided_governance_upgraded";
  private static final String TERMINAL =
      "('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')";
  private static final List<String> RETAINED =
      List.of(
          "stepIndex",
          "errorCode",
          "detail",
          "teardownStatus",
          "publicationRevisionId",
          "publicationRevisionDigest",
          "evidenceRef",
          // ADR-SC-007 (V29): the runner-time gate that ended a run is a closed token like
          // errorCode.
          "refusalGate");
  private static final String FULL_PROGRESS =
      "{\"stepIndex\":2,\"errorCode\":\"LOGIN_REQUIRED\",\"detail\":{\"stepId\":\"s\","
          + "\"loginStepsPresent\":true},\"teardownStatus\":\"DONE\",\"evidenceRef\":\"e\","
          + "\"refusalGate\":\"RUNNER_OPTION_NOT_PRESENT\","
          + "\"publicationRevisionId\":\"r\",\"publicationRevisionDigest\":\"d\","
          + "\"observation\":{\"nodes\":[{\"name\":\"Customer balance\"}]},"
          + "\"executionEvidence\":{\"kind\":\"page\"},\"clarification\":{\"q\":1},"
          + "\"modelReservations\":[1],\"origin\":\"https://a.test\",\"futureKey\":true}";
  private static final String HASH = "a".repeat(64);

  @BeforeAll
  static void migrate() throws SQLException {
    POSTGRES.start();
    flyway(POSTGRES.getJdbcUrl(), null).migrate();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  // ── AR-2 b: retained keys, session prune guard, prune function ─────────────────────────────

  @Test
  void retainedKeysAreTheEightKeyAllowlist() throws SQLException {
    try (Connection c = connect()) {
      assertThat(rows(c, "SELECT unnest(studio_guided_progress_retained_keys())"))
          .containsExactlyElementsOf(RETAINED);
      assertThat(
              scalar(
                  c,
                  "SELECT provolatile FROM pg_proc WHERE proname="
                      + "'studio_guided_progress_retained_keys'"))
          .isEqualTo("i");
    }
  }

  @Test
  void pruneRemovesEveryUnlistedKeyNullsTerminalResultsAndKeepsAttemptTimestamps()
      throws SQLException {
    try (Connection c = transaction()) {
      String id = session(c, "FAILED", "31 days", FULL_PROGRESS);
      attempt(c, id, "a1", "APPLIED", "'{\"proposal\":\"Customer balance\"}'");
      attempt(c, id, "a2", "REJECTED", "'{\"rejected\":true}'");
      attempt(c, id, "a3", "SUPERSEDED", "NULL");
      String before = attemptsWithoutSafeResult(c, id);

      assertThat(scalar(c, "SELECT studio_guided_prune_session('" + id + "','30 days')"))
          .isEqualTo("t");

      assertThat(
              rows(
                  c,
                  "SELECT k FROM studio_guided_sessions, jsonb_object_keys(progress) k"
                      + " WHERE session_id='"
                      + id
                      + "' ORDER BY k"))
          .containsExactlyInAnyOrderElementsOf(RETAINED);
      assertThat(
              scalar(
                  c,
                  "SELECT pruned_at IS NOT NULL FROM studio_guided_sessions"
                      + " WHERE session_id='"
                      + id
                      + "'"))
          .isEqualTo("t");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id='"
                      + id
                      + "' AND safe_result IS NOT NULL"))
          .isEqualTo("0");
      assertThat(attemptsWithoutSafeResult(c, id)).as("updated_at untouched").isEqualTo(before);
      assertThat(scalar(c, "SELECT studio_guided_prune_session('" + id + "','30 days')"))
          .as("a second prune")
          .isEqualTo("f");
      c.rollback();
    }
  }

  @Test
  void pruneLeavesSessionsThatAreNotEligibleUntouched() throws SQLException {
    try (Connection c = transaction()) {
      String finalizing = session(c, "FINALIZING", "60 days", FULL_PROGRESS);
      String inside = session(c, "SUCCEEDED", "29 days", FULL_PROGRESS);
      String edge = session(c, "CANCELLED", "30 days", FULL_PROGRESS);
      for (String state :
          List.of("PREPARING", "OBSERVING", "PROPOSING", "ACTING", "AWAITING_CLARIFICATION")) {
        String live = session(c, state, "60 days", FULL_PROGRESS);
        assertThat(prune(c, live, "1 hour")).as(state).isEqualTo("f");
      }
      assertThat(prune(c, finalizing, "1 hour")).as("FINALIZING is never terminal").isEqualTo("f");
      assertThat(prune(c, inside, "30 days")).as("inside the window (DB clock)").isEqualTo("f");
      assertThat(prune(c, "missing", "30 days")).isEqualTo("f");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM studio_guided_sessions WHERE pruned_at IS NOT NULL"
                      + " OR NOT progress ? 'observation'"))
          .isEqualTo("0");
      // expires_at + window <= clock_timestamp(): 30 days old plus a 30-day window is eligible.
      assertThat(prune(c, edge, "30 days")).isEqualTo("t");
      c.rollback();
    }
  }

  @Test
  void pruneWindowHasADatabaseFloorOfOneHour() throws SQLException {
    try (Connection c = transaction()) {
      String id = session(c, "FAILED", "31 days", FULL_PROGRESS);
      reject(c, "SELECT studio_guided_prune_session('" + id + "','59 minutes')", "window invalid");
      reject(c, "SELECT studio_guided_prune_session('" + id + "',NULL)", "window invalid");
      assertThat(prune(c, id, "1 hour")).isEqualTo("t");
      c.rollback();
    }
  }

  @Test
  void prunedSessionIsWriteOnceAndCannotRegainContent() throws SQLException {
    try (Connection c = transaction()) {
      String id = session(c, "FAILED", "31 days", FULL_PROGRESS);
      prune(c, id, "30 days");
      String where = " WHERE session_id='" + id + "'";
      reject(c, "UPDATE studio_guided_sessions SET pruned_at=NULL" + where, "write-once");
      reject(
          c,
          "UPDATE studio_guided_sessions SET pruned_at=pruned_at+interval '1 second'" + where,
          "write-once");
      reject(
          c,
          "UPDATE studio_guided_sessions SET progress=progress||'{\"observation\":{}}'" + where,
          "cannot regain content");
      // Post-terminal writers only touch retained keys, and keep working after a prune.
      exec(
          c,
          "UPDATE studio_guided_sessions SET progress=progress||'{\"teardownStatus\":\"X\","
              + "\"evidenceRef\":\"y\"}'"
              + where);
      c.rollback();
    }
  }

  @Test
  void prunedAtCanOnlyBeSetOnATerminalSessionWithPrunedProgress() throws SQLException {
    try (Connection c = transaction()) {
      String live = session(c, "ACTING", "60 days", "{\"stepIndex\":1}");
      reject(
          c,
          "UPDATE studio_guided_sessions SET pruned_at=clock_timestamp() WHERE session_id='"
              + live
              + "'",
          "requires a terminal session");
      String full = session(c, "FAILED", "60 days", FULL_PROGRESS);
      reject(
          c,
          "UPDATE studio_guided_sessions SET pruned_at=clock_timestamp() WHERE session_id='"
              + full
              + "'",
          "requires a terminal session");
      String finalizing = session(c, "FINALIZING", "60 days", "{\"stepIndex\":1}");
      reject(
          c,
          "UPDATE studio_guided_sessions SET pruned_at=clock_timestamp() WHERE session_id='"
              + finalizing
              + "'",
          "requires a terminal session");
      c.rollback();
    }
  }

  // ── AR-2 d: the replaced attempt guard ─────────────────────────────────────────────────────

  /** The 20 columns other than safe_result, read from the head schema (never a kept list). */
  @Test
  void onAPrunedSessionEveryOtherAttemptColumnStaysImmutable() throws SQLException {
    try (Connection c = transaction()) {
      String id = prunedKeepingResults(c);
      attempt(c, id, "a1", "APPLIED", "'{\"m\":1}'");
      List<String> columns =
          rows(
              c,
              "SELECT column_name||':'||data_type FROM information_schema.columns"
                  + " WHERE table_schema=current_schema() AND table_name='studio_guided_model_attempts'"
                  + " AND column_name<>'safe_result' ORDER BY ordinal_position");
      assertThat(columns.stream().map(col -> col.substring(0, col.indexOf(':'))))
          .containsExactlyInAnyOrder(
              "session_id",
              "attempt_id",
              "request_id",
              "attempt_number",
              "kind",
              "identity",
              "request_digest",
              "translator_id",
              "lease_until",
              "reservation_key",
              "settlement_key",
              "status",
              "input_tokens",
              "output_tokens",
              "rejection_reason",
              // ADR-SC-007 (V29): the gate audit is as immutable as the rest.
              "rejection_gate",
              "intent_path",
              "intent_fields",
              "created_at",
              "updated_at");
      List<String> accepted = new ArrayList<>();
      for (String column : columns) {
        String name = column.substring(0, column.indexOf(':'));
        String value = tamper(name, column.substring(column.indexOf(':') + 1));
        String sql =
            "UPDATE studio_guided_model_attempts SET safe_result=NULL,\""
                + name
                + "\"="
                + value
                + " WHERE session_id='"
                + id
                + "' AND attempt_id='a1'";
        if (!rejected(c, sql, "guided attempt is pruned")) {
          accepted.add(sql);
        }
      }
      assertThat(accepted).as("attempt columns writable on a pruned session").isEmpty();
      c.rollback();
    }
  }

  @Test
  void onAPrunedSessionOnlyNonNullToNullIsAccepted() throws SQLException {
    try (Connection c = transaction()) {
      String id = prunedKeepingResults(c);
      attempt(c, id, "a1", "APPLIED", "'{\"m\":1}'");
      attempt(c, id, "a2", "REJECTED", "NULL");
      String a1 = " WHERE session_id='" + id + "' AND attempt_id='a1'";
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET safe_result='{\"m\":2}'" + a1,
          "guided attempt is pruned");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET safe_result='{\"m\":1}'"
              + " WHERE session_id='"
              + id
              + "' AND attempt_id='a2'",
          "guided attempt is pruned");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET safe_result=NULL"
              + " WHERE session_id='"
              + id
              + "' AND attempt_id='a2'",
          "guided attempt is pruned");
      String before =
          scalar(
              c,
              "SELECT (to_jsonb(a)-'safe_result')::text FROM"
                  + " studio_guided_model_attempts a"
                  + a1);
      exec(c, "UPDATE studio_guided_model_attempts SET safe_result=NULL" + a1);
      assertThat(
              scalar(
                  c,
                  "SELECT (to_jsonb(a)-'safe_result')::text FROM"
                      + " studio_guided_model_attempts a"
                      + a1))
          .isEqualTo(before);
      assertThat(scalar(c, "SELECT safe_result IS NULL FROM studio_guided_model_attempts" + a1))
          .isEqualTo("t");
      c.rollback();
    }
  }

  @Test
  void liveAttemptsOnAPrunedSessionCannotSettle() throws SQLException {
    try (Connection c = transaction()) {
      String reserved = prunedKeepingResults(c);
      attempt(c, reserved, "r", "RESERVED", "NULL");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET status='APPLIED',safe_result='{\"m\":1}',"
              + "updated_at=clock_timestamp() WHERE session_id='"
              + reserved
              + "'",
          "guided attempt is pruned");
      String calling = prunedKeepingResults(c);
      attempt(c, calling, "c", "CALLING", "NULL");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET status='APPLIED',safe_result='{\"m\":1}'"
              + " WHERE session_id='"
              + calling
              + "'",
          "guided attempt is pruned");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET input_tokens=5"
              + " WHERE session_id='"
              + calling
              + "'",
          "guided attempt is pruned");
      c.rollback();
    }
  }

  @Test
  void unprunedSessionsKeepTheV14AttemptGuardVerbatim() throws SQLException {
    try (Connection c = transaction()) {
      String terminal = session(c, "FAILED", "60 days", FULL_PROGRESS);
      attempt(c, terminal, "a1", "APPLIED", "'{\"m\":1}'");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET safe_result=NULL WHERE session_id='"
              + terminal
              + "'",
          "guided attempt transition refused");

      String live = session(c, "ACTING", "60 days", "{}");
      attempt(c, live, "r", "RESERVED", "NULL");
      String where = " WHERE session_id='" + live + "'";
      exec(
          c,
          "UPDATE studio_guided_model_attempts SET status='CALLING',updated_at=clock_timestamp()"
              + where);
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET status='RESERVED'" + where,
          "guided attempt transition refused");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET translator_id='other'" + where,
          "guided attempt transition refused");
      exec(
          c,
          "UPDATE studio_guided_model_attempts SET status='APPLIED',safe_result='{\"m\":1}',"
              + "input_tokens=1,output_tokens=1,updated_at=clock_timestamp()"
              + where);
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET safe_result=NULL" + where,
          "guided attempt transition refused");
      c.rollback();
    }
  }

  /**
   * Round 053 (a), V23: the one UPDATE that finishes an attempt as REJECTED may set the closed
   * reason; the terminal row then refuses any change of it, and the reason cannot ride along with a
   * change to any other guarded column.
   */
  @Test
  void rejectionReasonIsSetOnlyByTheTerminalTransitionAndNeverChangesAfterwards()
      throws SQLException {
    try (Connection c = transaction()) {
      String live = session(c, "ACTING", "60 days", "{}");
      attempt(c, live, "r", "CALLING", "NULL");
      String where = " WHERE session_id='" + live + "'";
      assertThat(
              scalar(
                  c, "SELECT rejection_reason IS NULL FROM studio_guided_model_attempts" + where))
          .isEqualTo("t");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET status='REJECTED',rejection_reason='TIMEOUT',"
              + "translator_id='other',updated_at=clock_timestamp()"
              + where,
          "guided attempt transition refused");
      exec(
          c,
          "UPDATE studio_guided_model_attempts SET status='REJECTED',"
              + "rejection_reason='TRANSPORT_HTTP_503',input_tokens=1,output_tokens=2,"
              + "updated_at=clock_timestamp()"
              + where);
      assertThat(scalar(c, "SELECT rejection_reason FROM studio_guided_model_attempts" + where))
          .isEqualTo("TRANSPORT_HTTP_503");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET rejection_reason='TIMEOUT'" + where,
          "guided attempt transition refused");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET rejection_reason=NULL" + where,
          "guided attempt transition refused");
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET input_tokens=5" + where,
          "guided attempt transition refused");
      c.rollback();
    }
  }

  @Test
  void rejectionReasonCheckRefusesANonRejectedRowAndAMalformedToken() throws SQLException {
    try (Connection c = transaction()) {
      String live = session(c, "ACTING", "60 days", "{}");
      attempt(c, live, "r", "CALLING", "NULL");
      String where = " WHERE session_id='" + live + "'";
      reject(
          c,
          "UPDATE studio_guided_model_attempts SET status='APPLIED',safe_result='{\"m\":1}',"
              + "rejection_reason='TIMEOUT',updated_at=clock_timestamp()"
              + where,
          "violates check constraint");
      for (String malformed : List.of("timeout", "BAD TOKEN", "", "A".repeat(41))) {
        reject(
            c,
            "UPDATE studio_guided_model_attempts SET status='REJECTED',rejection_reason='"
                + malformed
                + "',updated_at=clock_timestamp()"
                + where,
            malformed.length() > 40 ? "value too long" : "violates check constraint");
      }
      c.rollback();
    }
  }

  @Test
  void attemptDeleteIsRefusedForEveryStatusPrunedOrNot() throws SQLException {
    try (Connection c = transaction()) {
      for (String status :
          List.of("RESERVED", "CALLING", "APPLIED", "REJECTED", "SUPERSEDED", "UNKNOWN_CALL")) {
        for (boolean pruned : List.of(false, true)) {
          String id = pruned ? prunedKeepingResults(c) : session(c, "FAILED", "60 days", "{}");
          attempt(c, id, "x", status, "NULL");
          reject(
              c,
              "DELETE FROM studio_guided_model_attempts WHERE session_id='" + id + "'",
              "guided attempt is immutable");
        }
      }
      c.rollback();
    }
  }

  // ── AR-2 e / PO X6: the replaced publication guard ─────────────────────────────────────────

  @Test
  void pruneDeletesNeverPublishedCopiesAndKeepsBasesAndAttempts() throws SQLException {
    try (Connection c = transaction()) {
      String id = session(c, "FAILED", "31 days", FULL_PROGRESS);
      publicationRows(c, id, false);
      String base =
          scalar(
              c,
              "SELECT to_jsonb(b)::text FROM studio_guided_publication_bases b"
                  + " WHERE session_id='"
                  + id
                  + "'");
      assertThat(copies(c, id)).isEqualTo("1:1:1");

      assertThat(prune(c, id, "30 days")).isEqualTo("t");

      assertThat(copies(c, id)).isEqualTo("0:0:0");
      assertThat(
              scalar(
                  c,
                  "SELECT to_jsonb(b)::text FROM studio_guided_publication_bases b"
                      + " WHERE session_id='"
                      + id
                      + "'"))
          .isEqualTo(base);
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM studio_guided_publication_attempts"
                      + " WHERE session_id='"
                      + id
                      + "'"))
          .isEqualTo("1");
      c.rollback();
    }
  }

  @Test
  void pruneKeepsEveryPublicationRowOfAPublishedSessionByteIdentical() throws SQLException {
    try (Connection c = transaction()) {
      String id = session(c, "SUCCEEDED", "31 days", FULL_PROGRESS);
      publicationRows(c, id, true);
      String before = publicationSnapshot(c, id);

      assertThat(prune(c, id, "30 days")).isEqualTo("t");

      assertThat(publicationSnapshot(c, id)).isEqualTo(before);
      assertThat(copies(c, id)).isEqualTo("1:1:1");
      for (String table : List.of("admissions", "preparations", "observations")) {
        reject(
            c,
            "DELETE FROM studio_guided_publication_" + table + " WHERE session_id='" + id + "'",
            "publication evidence immutable");
      }
      c.rollback();
    }
  }

  @Test
  void copyDeleteIsRefusedUnlessPrunedTerminalAndNeverPublished() throws SQLException {
    try (Connection c = transaction()) {
      String live = session(c, "ACTING", "60 days", FULL_PROGRESS);
      publicationRows(c, live, false);
      String unpruned = session(c, "FAILED", "60 days", FULL_PROGRESS);
      publicationRows(c, unpruned, false);
      for (String id : List.of(live, unpruned)) {
        for (String table : List.of("admissions", "preparations", "observations")) {
          reject(
              c,
              "DELETE FROM studio_guided_publication_" + table + " WHERE session_id='" + id + "'",
              "publication evidence immutable");
        }
      }
      c.rollback();
    }
  }

  @Test
  void basesAttemptsAndPublicationsStayUndeletableAndNoPublicationRowIsUpdatable()
      throws SQLException {
    try (Connection c = transaction()) {
      String unpublished = session(c, "FAILED", "31 days", FULL_PROGRESS);
      publicationRows(c, unpublished, false);
      String published = session(c, "SUCCEEDED", "31 days", FULL_PROGRESS);
      publicationRows(c, published, true);
      prune(c, published, "30 days");
      // Pruned but the copies are kept on purpose: the delete path is exercised table by table.
      exec(
          c,
          "UPDATE studio_guided_sessions SET progress='{}',pruned_at=clock_timestamp()"
              + " WHERE session_id='"
              + unpublished
              + "'");
      for (String id : List.of(unpublished, published)) {
        reject(
            c,
            "DELETE FROM studio_guided_publication_bases WHERE session_id='" + id + "'",
            "publication evidence immutable");
        reject(
            c,
            "DELETE FROM studio_guided_publication_attempts WHERE session_id='" + id + "'",
            "publication evidence immutable");
      }
      reject(
          c,
          "DELETE FROM studio_guided_publications WHERE session_id='" + published + "'",
          "publication evidence immutable");
      List<String> accepted = new ArrayList<>();
      for (String table : List.of("bases", "observations", "preparations", "admissions")) {
        for (String id : List.of(unpublished, published)) {
          accepted.addAll(updatesAccepted(c, "studio_guided_publication_" + table, id));
        }
      }
      accepted.addAll(updatesAccepted(c, "studio_guided_publications", published));
      assertThat(accepted).as("publication columns writable").isEmpty();
      // The one permitted path, in FK order.
      for (String table : List.of("admissions", "preparations", "observations")) {
        exec(
            c,
            "DELETE FROM studio_guided_publication_"
                + table
                + " WHERE session_id='"
                + unpublished
                + "'");
      }
      assertThat(copies(c, unpublished)).isEqualTo("0:0:0");
      c.rollback();
    }
  }

  // ── AR-2 c: per-CSI counters ───────────────────────────────────────────────────────────────

  @Test
  void tokenDaysAreMonotoneAndUndeletableAndTheConditionalChargeIsTheVerdict() throws SQLException {
    try (Connection c = transaction()) {
      String today = "(clock_timestamp() AT TIME ZONE 'UTC')::date";
      exec(
          c,
          "INSERT INTO studio_guided_csi_token_days(csi_id,budget_day) VALUES ('C1',"
              + today
              + ") ON CONFLICT DO NOTHING");
      assertThat(
              scalar(
                  c,
                  "SELECT budget_day=(now() AT TIME ZONE 'UTC')::date FROM"
                      + " studio_guided_csi_token_days WHERE csi_id='C1'"))
          .isEqualTo("t");
      String charge =
          "UPDATE studio_guided_csi_token_days SET input_tokens=input_tokens+60,"
              + "output_tokens=output_tokens+6 WHERE csi_id='C1' AND budget_day="
              + today
              + " AND input_tokens+60<=100 AND output_tokens+6<=10";
      assertThat(count(c, charge)).isEqualTo(1);
      assertThat(count(c, charge)).as("the second charge exceeds the limit").isZero();
      reject(c, "UPDATE studio_guided_csi_token_days SET input_tokens=input_tokens-1", "monotone");
      reject(c, "UPDATE studio_guided_csi_token_days SET output_tokens=0", "monotone");
      reject(c, "UPDATE studio_guided_csi_token_days SET budget_day=budget_day-1", "monotone");
      reject(c, "UPDATE studio_guided_csi_token_days SET csi_id='C2'", "monotone");
      reject(c, "DELETE FROM studio_guided_csi_token_days", "append-only");
      reject(
          c, "INSERT INTO studio_guided_csi_token_days VALUES ('C3'," + today + ",-1,0)", "check");
      c.rollback();
    }
  }

  @Test
  void theCsiGuardRowSerializesConcurrentStarts() throws SQLException {
    String csi = "L" + UUID.randomUUID().toString().substring(0, 8);
    String upsert =
        "INSERT INTO studio_guided_csi_guards(csi_id) VALUES ('"
            + csi
            + "') ON CONFLICT DO NOTHING";
    try (Connection setup = connect()) {
      exec(setup, upsert);
    }
    try (Connection first = transaction();
        Connection second = transaction()) {
      String lock =
          upsert
              + "; SELECT csi_id FROM studio_guided_csi_guards WHERE csi_id='"
              + csi
              + "' FOR UPDATE";
      exec(first, lock);
      exec(second, "SET LOCAL lock_timeout='300ms'");
      assertThatThrownBy(() -> exec(second, lock))
          .isInstanceOf(SQLException.class)
          .satisfies(e -> assertThat(((SQLException) e).getSQLState()).isEqualTo("55P03"));
      first.rollback();
      second.rollback();
    }
  }

  @Test
  void liveSessionsPerCsiHaveAPartialExpressionIndex() throws SQLException {
    try (Connection c = connect()) {
      assertThat(
              scalar(
                  c,
                  "SELECT indexdef FROM pg_indexes WHERE indexname="
                      + "'ix_guided_session_live_csi'"))
          .contains("((document -> 'scope'::text) ->> 'csiId'::text)")
          .contains("<> ALL")
          .contains(
              "'SUCCEEDED'",
              "'PUBLICATION_CONFLICT'",
              "'FAILED'",
              "'UNKNOWN_OUTCOME'",
              "'CANCELLED'",
              "'EXPIRED'")
          .doesNotContain("FINALIZING");
      assertThat(
              scalar(
                  c,
                  "SELECT indexdef FROM pg_indexes WHERE indexname=" + "'ix_guided_session_prune'"))
          .contains("(expires_at)")
          .contains("pruned_at IS NULL");
    }
  }

  // ── Out of scope by ruling (S-1) and the V18 → head upgrade ────────────────────────────────

  @Test
  void v19LeavesTheExecutionErrorVocabularyToV13() throws Exception {
    String v19 =
        new String(
            getClass()
                .getResourceAsStream("/db/migration/V19__guided_governance.sql")
                .readAllBytes(),
            java.nio.charset.StandardCharsets.UTF_8);
    assertThat(v19)
        .doesNotContain("ck_ui_test_executions_error_code")
        .doesNotContain("ui_test_executions");
  }

  @Test
  void upgradeFromV18KeepsExistingGuidedRowsUnchanged() throws SQLException {
    try (Connection admin = connect();
        Statement s = admin.createStatement()) {
      s.execute("CREATE DATABASE " + UPGRADED_DB);
    }
    String url = POSTGRES.getJdbcUrl().replace("guided_governance", UPGRADED_DB);
    flyway(url, "18").migrate();
    String id;
    String before;
    try (Connection c = connect(url)) {
      id = session(c, "FAILED", "31 days", FULL_PROGRESS);
      attempt(c, id, "a1", "APPLIED", "'{\"m\":1}'");
      before =
          scalar(
              c,
              "SELECT to_jsonb(s)::text||to_jsonb(a)::text FROM studio_guided_sessions s"
                  + " JOIN studio_guided_model_attempts a USING(session_id) WHERE session_id='"
                  + id
                  + "'");
    }
    flyway(url, null).migrate();
    flyway(url, null).validate();
    try (Connection c = connect(url)) {
      assertThat(
              scalar(
                  c, "SELECT count(*) FROM flyway_schema_history WHERE version='33' AND success"))
          .isEqualTo("1");
      assertThat(
              scalar(
                  c,
                  "SELECT (to_jsonb(s)-'pruned_at')::text||(to_jsonb(a)-'rejection_reason'"
                      + "-'rejection_gate'-'intent_path'-'intent_fields')::text FROM"
                      + " studio_guided_sessions s JOIN studio_guided_model_attempts a USING(session_id)"
                      + " WHERE session_id='"
                      + id
                      + "'"))
          .isEqualTo(before);
      // V23 adds one nullable column and backfills nothing: the upgraded attempt has no reason.
      assertThat(
              scalar(
                  c,
                  "SELECT rejection_reason IS NULL FROM studio_guided_model_attempts WHERE"
                      + " session_id='"
                      + id
                      + "'"))
          .isEqualTo("t");
      assertThat(
              scalar(
                  c,
                  "SELECT pruned_at IS NULL FROM studio_guided_sessions WHERE session_id='"
                      + id
                      + "'"))
          .isEqualTo("t");
      // The upgraded row becomes prunable once the code ships; nothing pruned it during migration.
      assertThat(prune(c, id, "30 days")).isEqualTo("t");
    }
  }

  // ── fixtures ───────────────────────────────────────────────────────────────────────────────

  private static String session(Connection c, String state, String age, String progress)
      throws SQLException {
    String id = "g-" + UUID.randomUUID();
    String scopeHash = HASH;
    exec(
        c,
        "INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,"
            + "expires_at,document,progress) VALUES ('"
            + id
            + "','t','p','"
            + scopeHash
            + "','"
            + state
            + "',clock_timestamp()-interval '"
            + age
            + "',jsonb_build_object('sessionId','"
            + id
            + "','scopeHash','"
            + scopeHash
            + "','state','"
            + state
            + "','scope',"
            + "jsonb_build_object('principalId','p','csiId','C1')),'"
            + progress
            + "')");
    exec(
        c,
        "INSERT INTO studio_guided_source_manifests(session_id,scope_hash,manifest,"
            + "manifest_hash) VALUES ('"
            + id
            + "','"
            + scopeHash
            + "','{\"sourceRevision\":\"1\","
            + "\"configurationRevision\":\"1\",\"testId\":\"t\",\"policy\":\"x\","
            + "\"sourceSteps\":[{\"stepId\":\"s\"}]}','"
            + "b".repeat(64)
            + "')");
    exec(c, "INSERT INTO studio_guided_translation_state(session_id) VALUES ('" + id + "')");
    return id;
  }

  /** A terminal session pruned by its own row (the function's step 3) with results still set. */
  private static String prunedKeepingResults(Connection c) throws SQLException {
    String id = session(c, "FAILED", "31 days", "{\"stepIndex\":1}");
    exec(
        c,
        "UPDATE studio_guided_sessions SET pruned_at=clock_timestamp() WHERE session_id='"
            + id
            + "'");
    return id;
  }

  private static void attempt(
      Connection c, String session, String id, String status, String safeResult)
      throws SQLException {
    exec(
        c,
        "INSERT INTO studio_guided_model_attempts(session_id,attempt_id,request_id,"
            + "attempt_number,kind,identity,request_digest,translator_id,lease_until,reservation_key,"
            + "settlement_key,status,safe_result,created_at,updated_at) VALUES ('"
            + session
            + "','"
            + id
            + "','req-"
            + id
            + "',1,'SOURCE_PLAN',jsonb_build_object('sessionId','"
            + session
            + "','attemptId','"
            + id
            + "','requestId','req-"
            + id
            + "','kind','SOURCE_PLAN',"
            + "'planRevision',0,'owner','{}'::jsonb,'inputCeiling',10,'outputCeiling',10,"
            + "'scopeHash','x'),'"
            + "c".repeat(64)
            + "','translator',clock_timestamp(),'rk-"
            + id
            + "','sk-"
            + id
            + "','"
            + status
            + "',"
            + safeResult
            + ",clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day')");
  }

  private static String tamper(String column, String type) {
    return switch (column) {
      case "kind" -> "'NEXT_ACTION'";
      case "status" -> "'REJECTED'";
      case "attempt_number" -> "2";
      case "identity" -> "identity||'{\"inputCeiling\":11}'";
      case "request_digest" -> "'" + "d".repeat(64) + "'";
      case "session_id" -> "'g-other'";
      default -> tamperByType(column, type);
    };
  }

  private static String tamperByType(String column, String type) {
    return switch (type) {
      case "character varying", "character", "text" -> "'tampered'";
      case "integer", "bigint" -> "COALESCE(\"" + column + "\",0)+1";
      case "timestamp with time zone" -> "\"" + column + "\"+interval '1 second'";
      default -> throw new IllegalStateException("Add a tamper value for " + type);
    };
  }

  /**
   * Base, one observation, one preparation and one admission (FK-consistent), one rejected
   * publication attempt and, when {@code published}, the publication row. Seeded with user and FK
   * triggers off; CHECK constraints still apply.
   */
  private static void publicationRows(Connection c, String id, boolean published)
      throws SQLException {
    UUID test = UUID.randomUUID();
    UUID attempt = UUID.randomUUID();
    UUID claim = UUID.randomUUID();
    UUID revision = UUID.randomUUID();
    String h = HASH;
    exec(c, "SET LOCAL session_replication_role='replica'");
    // The seeded preparation is minimal; its closed-key shape is covered by
    // GuidedStepKindMigrationIT, and this test's subject is pruning and immutability.
    exec(
        c,
        "ALTER TABLE studio_guided_publication_preparations DROP CONSTRAINT IF EXISTS"
            + " ck_publication_preparation_shape");
    StringBuilder base =
        new StringBuilder(
            "jsonb_build_object('sessionId','"
                + id
                + "','testId','"
                + test
                + "','csiId','C1','resultContractVersion','3','sourceRevision','1',"
                + "'configurationRevision','1','publicationEpoch','0','confirmedRevisionId','',"
                + "'originalPrincipalId','p','runAuthorization','{}'::jsonb,'initialContext',"
                + "'{\"kind\":\"initialBlank\"}'::jsonb,'replayRequirements','{}'::jsonb,'createdAt','t'");
    for (String key :
        List.of(
            "sourceHash",
            "configurationHash",
            "authoringHash",
            "scopeHash",
            "runAuthorizationHash",
            "sourceManifestHash")) {
      base.append(",'").append(key).append("','").append(h).append("'");
    }
    base.append(")");
    exec(
        c,
        "INSERT INTO studio_guided_publication_bases(session_id,test_id,csi_id,scope_hash,"
            + "document,created_at) VALUES ('"
            + id
            + "','"
            + test
            + "','C1','"
            + h
            + "',"
            + base
            + ",clock_timestamp())");
    String observationHash = "e".repeat(64);
    exec(
        c,
        "INSERT INTO studio_guided_publication_observations(session_id,observation_hash,"
            + "context_id,owner_fence,document_id,generation,observation,captured_at) VALUES ('"
            + id
            + "','"
            + observationHash
            + "','ctx',1,'doc',0,jsonb_build_object('schemaVersion',3,"
            + "'sessionId','"
            + id
            + "','documentId','doc','generation',0,'origin','https://a.test',"
            + "'scopeHash','"
            + h
            + "','observedAt','t','coverage',jsonb_build_object('withheldRegions',0,"
            + "'unsupportedRegions',0,'passwordControls',0),'projection',"
            + "jsonb_build_object('projected',false,'tier',NULL::text,'totalNodes',1,"
            + "'shownNodes',1,'notShown',0,'outlineBytes',10),"
            + "'outline','- document','facts','{}'::jsonb),clock_timestamp())");
    String evidence = "jsonb_build_object('kind','page','documentId','doc','generation',0)";
    String proposal =
        "jsonb_build_object('schemaVersion',3,'sessionId','"
            + id
            + "','coordinate',"
            + "'{\"stepId\":\"s\",\"ordinal\":0}'::jsonb,'scopeHash','"
            + h
            + "','generation',0,"
            + "'target','{\"kind\":\"element\",\"name\":\"Customer balance\"}'::jsonb,'operation',"
            + "'{\"kind\":\"click\"}'::jsonb,'executionEvidence',"
            + evidence
            + ",'evidenceHash','"
            + h
            + "','authoredInputsHash','"
            + h
            + "','contextRevision',1)";
    String proof =
        "jsonb_build_object('schemaVersion',3,'sessionId','"
            + id
            + "','workerId','w',"
            + "'ownerFence',1,'scopeHash','"
            + h
            + "','contextId','ctx','contextRevision',1,"
            + "'sourceRevision','1','configurationRevision','1','versions','{}'::jsonb,"
            + "'preparationId','prep','requestDigest','"
            + h
            + "','evidenceHash','"
            + h
            + "',"
            + "'authoredInputsHash','"
            + h
            + "','expiresAt','t','target','null'::jsonb)";
    exec(
        c,
        "INSERT INTO studio_guided_publication_preparations(session_id,preparation_id,"
            + "context_id,owner_fence,request_digest,evidence_hash,inputs_hash,materialization_revision,"
            + "source_manifest_hash,observation_hash,execution_evidence,proposal,proof,captured_at)"
            + " VALUES ('"
            + id
            + "','prep','ctx',1,'"
            + h
            + "','"
            + h
            + "','"
            + h
            + "',1,'"
            + h
            + "','"
            + observationHash
            + "',"
            + evidence
            + ","
            + proposal
            + ","
            + proof
            + ",clock_timestamp())");
    exec(
        c,
        "INSERT INTO studio_guided_publication_admissions(session_id,admission_id,"
            + "preparation_id,obligation_id,proposal_hash,captured_at) VALUES ('"
            + id
            + "','adm',"
            + "'prep','obl','"
            + h
            + "',clock_timestamp())");
    StringBuilder identity =
        new StringBuilder(
            "jsonb_build_object('base','{}'::jsonb,"
                + "'ownerWorkerId','w','ownerFence',1,'validationDeadline','2026-01-01T00:00:00Z',"
                + "'finalizeKey','final','finalizeDigest','"
                + h
                + "'");
    for (String key :
        List.of(
            "translationHash",
            "basisHash",
            "learnedPlanHash",
            "artifactHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash",
            "profileHash",
            "validationBuildHash",
            "snapshotHash")) {
      identity.append(",'").append(key).append("','").append(h).append("'");
    }
    identity.append(")");
    exec(
        c,
        "INSERT INTO studio_guided_publication_attempts(session_id,attempt_id,attempt_number,"
            + "claim_id,finalize_key,finalize_digest,snapshot_hash,basis_hash,identity,"
            + "validation_deadline,status,created_at,completed_at,failure_code) VALUES ('"
            + id
            + "','"
            + attempt
            + "',1,'"
            + claim
            + "','final','"
            + h
            + "','"
            + h
            + "','"
            + h
            + "',"
            + identity
            + ",'2026-01-01T00:00:00Z','REJECTED',clock_timestamp(),clock_timestamp(),'INVALID')");
    if (published) {
      StringBuilder doc =
          new StringBuilder(
              "jsonb_build_object('sessionId','"
                  + id
                  + "','revisionId','"
                  + revision
                  + "','testId','"
                  + test
                  + "','csiId','C1',"
                  + "'originalPrincipalId','p','finalizeKey','final','finalizeDigest','"
                  + h
                  + "',"
                  + "'attemptId','"
                  + attempt
                  + "','claimId','"
                  + claim
                  + "','publishedAt','t',"
                  + "'publicReceipt','{}'::jsonb");
      for (String key :
          List.of(
              "snapshotHash",
              "basisHash",
              "learnedPlanHash",
              "artifactHash",
              "referencePolicyHash",
              "operationEquivalenceHash",
              "admissionProvenanceHash",
              "publicationEvidenceHash",
              "revisionDigest",
              "profileHash")) {
        doc.append(",'").append(key).append("','").append(h).append("'");
      }
      doc.append(")");
      exec(
          c,
          "INSERT INTO studio_guided_publications(session_id,revision_id,test_id,csi_id,"
              + "attempt_id,claim_id,snapshot_hash,basis_hash,document,learned_plan,published_at)"
              + " VALUES ('"
              + id
              + "','"
              + revision
              + "','"
              + test
              + "','C1','"
              + attempt
              + "','"
              + claim
              + "','"
              + h
              + "','"
              + h
              + "',"
              + doc
              + ",'{}',clock_timestamp())");
    }
    exec(c, "SET LOCAL session_replication_role='origin'");
  }

  private static String copies(Connection c, String id) throws SQLException {
    return scalar(
        c,
        "SELECT (SELECT count(*) FROM studio_guided_publication_observations WHERE"
            + " session_id='"
            + id
            + "')||':'||(SELECT count(*) FROM"
            + " studio_guided_publication_preparations WHERE session_id='"
            + id
            + "')||':'||(SELECT"
            + " count(*) FROM studio_guided_publication_admissions WHERE session_id='"
            + id
            + "')");
  }

  private static String publicationSnapshot(Connection c, String id) throws SQLException {
    StringBuilder out = new StringBuilder();
    for (String table :
        List.of(
            "studio_guided_publication_bases",
            "studio_guided_publication_observations",
            "studio_guided_publication_preparations",
            "studio_guided_publication_admissions",
            "studio_guided_publication_attempts",
            "studio_guided_publications")) {
      out.append(table)
          .append('=')
          .append(
              scalar(
                  c,
                  "SELECT string_agg(to_jsonb(t)::text,','"
                      + " ORDER BY to_jsonb(t)::text) FROM "
                      + table
                      + " t WHERE session_id='"
                      + id
                      + "'"))
          .append('\n');
    }
    return out.toString();
  }

  /** Every column of {@code table} updated alone (to itself) for {@code id}; the accepted ones. */
  private static List<String> updatesAccepted(Connection c, String table, String id)
      throws SQLException {
    List<String> accepted = new ArrayList<>();
    for (String column :
        rows(
            c,
            "SELECT column_name FROM information_schema.columns WHERE"
                + " table_schema=current_schema() AND table_name='"
                + table
                + "'")) {
      String sql =
          "UPDATE "
              + table
              + " SET \""
              + column
              + "\"=\""
              + column
              + "\" WHERE session_id='"
              + id
              + "'";
      if (count(c, "SELECT 1 FROM " + table + " WHERE session_id='" + id + "'") == 0) {
        continue;
      }
      if (!rejected(c, sql, "publication evidence immutable")) {
        accepted.add(sql);
      }
    }
    return accepted;
  }

  private static String prune(Connection c, String id, String window) throws SQLException {
    return scalar(c, "SELECT studio_guided_prune_session('" + id + "','" + window + "')");
  }

  private static String attemptsWithoutSafeResult(Connection c, String id) throws SQLException {
    return scalar(
        c,
        "SELECT string_agg((to_jsonb(a)-'safe_result')::text,',' ORDER BY attempt_id)"
            + " FROM studio_guided_model_attempts a WHERE session_id='"
            + id
            + "'");
  }

  private static Flyway flyway(String url, String target) {
    var config =
        Flyway.configure()
            .dataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword())
            .locations("classpath:db/migration");
    if (target != null) {
      config.target(target);
    }
    return config.load();
  }

  private static Connection connect() throws SQLException {
    return connect(POSTGRES.getJdbcUrl());
  }

  private static Connection connect(String url) throws SQLException {
    return DriverManager.getConnection(url, POSTGRES.getUsername(), POSTGRES.getPassword());
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

  /** Affected rows of an UPDATE, or the row count of a SELECT. */
  private static int count(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement()) {
      if (s.execute(sql)) {
        int n = 0;
        try (ResultSet r = s.getResultSet()) {
          while (r.next()) {
            n++;
          }
        }
        return n;
      }
      return s.getUpdateCount();
    }
  }

  private static void reject(Connection c, String sql, String message) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      assertThatThrownBy(() -> s.execute(sql))
          .as(sql)
          .isInstanceOf(SQLException.class)
          .hasMessageContaining(message);
    } finally {
      c.rollback(savepoint);
    }
  }

  /** True when the statement fails with the message; false when it succeeds (then undone). */
  private static boolean rejected(Connection c, String sql, String message) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      s.execute(sql);
      return false;
    } catch (SQLException e) {
      assertThat(e.getMessage()).as(sql).contains(message);
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
