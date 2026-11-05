package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

import com.citi.put.checks.scheduling.partitioning.PartitionManager;
import com.citi.put.checks.support.TestPostgresDatabase;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.sql.Statement;
import java.sql.Types;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * STUDIO-OBS-008 T0 ruling A1 (A1.3, A1.5 case 18): {@code V22__execution_replay_failure.sql} on
 * the Flyway head. Four nullable columns on the range-partitioned {@code ui_test_executions} and
 * one CHECK that admits exactly three shapes: all four NULL; {@code LOGIN_REQUIRED} with step ID,
 * step index and the login boolean; {@code TARGET_DRIFT} with step ID and step index and a NULL
 * login boolean.
 *
 * <p>Four databases in one PostgreSQL instance:
 *
 * <ul>
 *   <li><b>head</b>: fresh V1..head. Shape and catalog cases run here, each in a rolled-back
 *       transaction.
 *   <li><b>upgrade</b>: V21 plus history rows in a named partition and in DEFAULT, then head.
 *       Before Flyway applies V22, the file's own text is run once in a transaction that is rolled
 *       back, to measure the locks it takes and which partitions it scans before and after
 *       VALIDATE.
 *   <li><b>future</b>: head, then {@link PartitionManager} creates later months. A row that waited
 *       in DEFAULT is moved into its new month with its replay failure intact.
 * </ul>
 */
class ExecutionReplayFailureMigrationIT {

  private static final String MIGRATIONS = "classpath:db/migration";
  private static final String V22 = "/db/migration/V22__execution_replay_failure.sql";
  private static final String CONSTRAINT = "ck_ui_test_executions_replay_failure";
  private static final String PARENT = "ui_test_executions";
  private static final String CSI_ID = "80008";
  private static final String NAMED_PARTITION_TIME = "2026-06-15 10:00:00+00";
  private static final String DEFAULT_PARTITION_TIME = "2027-03-15 10:00:00+00";

  /** name:data_type:is_nullable:column_default, in ruling order. */
  private static final List<String> RULED_COLUMNS =
      List.of(
          "replay_failure_code:text:YES:null",
          "replay_failure_step_id:text:YES:null",
          "replay_failure_step_index:integer:YES:null",
          "replay_failure_login_steps_present:boolean:YES:null");

  /** The history columns V22 must not touch on an upgraded database. */
  private static final String HISTORY_DIGEST =
      "SELECT md5(string_agg(row(id,ui_test_id,status,started_at,ended_at,duration_ms,error_code,"
          + "snapshot_revision,tableoid::regclass::text)::text, ',' ORDER BY id))"
          + " FROM ui_test_executions";

  private static final TestPostgresDatabase POSTGRES =
      new TestPostgresDatabase().withDatabaseName("replay_failure_head");

  private static String headUrl;
  private static String upgradeUrl;
  private static String futureUrl;
  private static UUID headTestId;
  private static UUID futureTestId;
  private static String upgradeDigestAtV21;
  private static List<String> upgradePartitionsAtV21;

  /** Lock modes V22 held on each relation of the ui_test_executions family before COMMIT. */
  private static Map<String, List<String>> v22LockModes;

  /** Sequential scans per leaf partition inside V22, before and after its VALIDATE statement. */
  private static Map<String, Long> seqScansBeforeValidate;

  private static Map<String, Long> seqScansAfterValidate;

  @BeforeAll
  static void migrate() throws Exception {
    POSTGRES.start();
    headUrl = POSTGRES.getJdbcUrl();
    upgradeUrl = create("replay_failure_upgrade");
    futureUrl = create("replay_failure_future");

    flyway(headUrl, null).migrate();
    headTestId = seedOwners(headUrl);

    flyway(upgradeUrl, "21").migrate();
    UUID upgradeTestId = seedOwners(upgradeUrl);
    for (String at : List.of(NAMED_PARTITION_TIME, DEFAULT_PARTITION_TIME)) {
      execute(upgradeUrl, insertPlain(upgradeTestId, UUID.randomUUID(), "PASSED", at, "NULL"));
      execute(upgradeUrl, insertPlain(upgradeTestId, UUID.randomUUID(), "ERROR", at, "'STALE'"));
    }
    upgradeDigestAtV21 = scalar(upgradeUrl, HISTORY_DIGEST);
    upgradePartitionsAtV21 =
        strings(
            upgradeUrl,
            "SELECT DISTINCT tableoid::regclass::text FROM ui_test_executions ORDER BY 1");
    measureV22(upgradeUrl);
    flyway(upgradeUrl, null).migrate();

    flyway(futureUrl, null).migrate();
    futureTestId = seedOwners(futureUrl);
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  // ── Head ────────────────────────────────────────────────────────────────────

  @Test
  void freshAndUpgradedDatabasesReachV22WithNothingPending() throws SQLException {
    for (String url : List.of(headUrl, upgradeUrl)) {
      assertThat(flyway(url, null).info().pending()).isEmpty();
      var all = flyway(url, null).info().all();
      assertThat(scalar(url, "SELECT max(version::int) FROM flyway_schema_history"))
          .isEqualTo(all[all.length - 1].getVersion().getVersion());
      assertThat(scalar(url, "SELECT description FROM flyway_schema_history WHERE version='22'"))
          .isEqualTo("execution replay failure");
      assertThat(scalar(url, "SELECT count(*) FROM flyway_schema_history WHERE NOT success"))
          .isEqualTo("0");
    }
  }

  @Test
  void theFourColumnsAreNullableWithoutDefaultsOnTheParentAndEveryPartition() throws SQLException {
    List<String> family = family(headUrl);
    assertThat(family)
        .as("V7 bootstrap months and DEFAULT, all present at head")
        .contains(
            PARENT,
            "ui_test_executions_2026_05",
            "ui_test_executions_2026_06",
            "ui_test_executions_2026_07",
            "ui_test_executions_default");
    for (String relation : family) {
      assertThat(replayColumns(headUrl, relation)).as(relation).isEqualTo(RULED_COLUMNS);
    }
  }

  @Test
  void theCheckIsValidatedOnTheParentAndInheritedByEveryPartition() throws SQLException {
    List<String> family = family(headUrl);
    assertThat(constraintRows(headUrl))
        .as("one CHECK per relation, validated; the parent's is local, each partition's inherited")
        .isEqualTo(expectedConstraintRows(family));
    assertThat(
            scalar(
                headUrl,
                "SELECT count(DISTINCT pg_get_constraintdef(oid)) FROM pg_constraint"
                    + " WHERE conname='"
                    + CONSTRAINT
                    + "'"))
        .as("every partition carries the parent's definition, not a variant")
        .isEqualTo("1");
  }

  // ── The three shapes, and nothing else ──────────────────────────────────────

  @Test
  void theCheckAdmitsExactlyTheThreeShapesInANamedPartitionAndInDefault() throws SQLException {
    String[] codes = {null, "LOGIN_REQUIRED", "TARGET_DRIFT", "STEP_FAILED", "", "login_required"};
    String[] stepIds = {
      null, "", "s", "x".repeat(256), "x".repeat(257), "é".repeat(256), "é".repeat(257)
    };
    Integer[] indexes = {null, -1, 0, 7};
    Boolean[] logins = {null, true, false};
    List<String> mismatches = new ArrayList<>();
    Map<String, Integer> acceptedByShape = new TreeMap<>();
    int combinations = 0;
    try (Connection c = transaction(headUrl);
        PreparedStatement insert = c.prepareStatement(INSERT_SHAPE)) {
      for (String at : List.of(NAMED_PARTITION_TIME, DEFAULT_PARTITION_TIME)) {
        for (String code : codes) {
          for (String stepId : stepIds) {
            for (Integer index : indexes) {
              for (Boolean login : logins) {
                combinations++;
                String expected = shape(code, stepId, index, login);
                String outcome = tryInsert(c, insert, at, code, stepId, index, login);
                if (!outcome.equals(expected == null ? "REFUSED" : "ACCEPTED")) {
                  mismatches.add(
                      describe(at, code, stepId, index, login)
                          + " expected "
                          + (expected == null ? "REFUSED" : expected)
                          + " got "
                          + outcome);
                } else if (expected != null) {
                  acceptedByShape.merge(expected, 1, Integer::sum);
                }
              }
            }
          }
        }
      }
      assertThat(
              strings(
                  c, "SELECT DISTINCT tableoid::regclass::text FROM ui_test_executions ORDER BY 1"))
          .containsExactly("ui_test_executions_2026_06", "ui_test_executions_default");
      c.rollback();
    }
    assertThat(mismatches).isEmpty();
    assertThat(combinations).isEqualTo(2 * 6 * 7 * 4 * 3);
    // Per partition: 1 all-NULL; LOGIN_REQUIRED takes 3 step IDs ("s", 256 ASCII, 256 "é") x 2
    // indexes (0, 7) x 2 booleans = 12; TARGET_DRIFT takes 3 step IDs x 2 indexes = 6.
    assertThat(acceptedByShape)
        .containsExactly(
            Map.entry("LOGIN_REQUIRED", 24), Map.entry("NONE", 2), Map.entry("TARGET_DRIFT", 12));
  }

  @Test
  void aNullCodeWithTheOtherColumnsSetIsRefusedRatherThanSlippingThroughAsNull()
      throws SQLException {
    try (Connection c = transaction(headUrl);
        PreparedStatement insert = c.prepareStatement(INSERT_SHAPE)) {
      for (Boolean login : new Boolean[] {null, true}) {
        assertThat(tryInsert(c, insert, NAMED_PARTITION_TIME, null, "step-1", 0, login))
            .as("code NULL, step and index set, login %s", login)
            .isEqualTo("REFUSED");
      }
      c.rollback();
    }
  }

  @Test
  void theFinalUpdateWritesAShapeWithTheStatusAndAMixedShapeIsRefused() throws SQLException {
    try (Connection c = transaction(headUrl)) {
      UUID login = UUID.randomUUID();
      UUID drift = UUID.randomUUID();
      execute(c, insertPlain(headTestId, login, "RUNNING", NAMED_PARTITION_TIME, "NULL"));
      execute(c, insertPlain(headTestId, drift, "RUNNING", DEFAULT_PARTITION_TIME, "NULL"));

      execute(
          c,
          "UPDATE ui_test_executions SET status='FAILED', replay_failure_code='LOGIN_REQUIRED',"
              + " replay_failure_step_id='step-2', replay_failure_step_index=1,"
              + " replay_failure_login_steps_present=false WHERE id='"
              + login
              + "'");
      execute(
          c,
          "UPDATE ui_test_executions SET status='ERROR', replay_failure_code='TARGET_DRIFT',"
              + " replay_failure_step_id='step-3', replay_failure_step_index=2 WHERE id='"
              + drift
              + "'");
      assertThat(
              strings(
                  c,
                  "SELECT status||':'||replay_failure_code||':'||replay_failure_step_id||':'"
                      + "||replay_failure_step_index||':'"
                      + "||coalesce(replay_failure_login_steps_present::text,'null')"
                      + " FROM ui_test_executions ORDER BY replay_failure_code"))
          .containsExactly(
              "FAILED:LOGIN_REQUIRED:step-2:1:false", "ERROR:TARGET_DRIFT:step-3:2:null");

      refuse(
          c,
          "UPDATE ui_test_executions SET replay_failure_login_steps_present=true WHERE id='"
              + drift
              + "'");
      refuse(
          c,
          "UPDATE ui_test_executions SET replay_failure_login_steps_present=NULL WHERE id='"
              + login
              + "'");
      refuse(c, "UPDATE ui_test_executions SET replay_failure_code=NULL WHERE id='" + login + "'");
      refuse(
          c, "UPDATE ui_test_executions SET replay_failure_step_id=NULL WHERE id='" + drift + "'");
      c.rollback();
    }
  }

  // ── Upgrade: existing history, locks and the NOT VALID split ───────────────

  @Test
  void anUpgradedDatabaseKeepsEveryHistoryRowAndNamesNoCause() throws SQLException {
    assertThat(upgradePartitionsAtV21)
        .as("the V21 seed spans a named partition and DEFAULT, or it proves nothing")
        .containsExactly("ui_test_executions_2026_06", "ui_test_executions_default");
    assertThat(scalar(upgradeUrl, HISTORY_DIGEST)).isEqualTo(upgradeDigestAtV21);
    assertThat(scalar(upgradeUrl, "SELECT count(*) FROM ui_test_executions")).isEqualTo("4");
    assertThat(
            scalar(
                upgradeUrl,
                "SELECT count(*) FROM ui_test_executions WHERE replay_failure_code IS NOT NULL"
                    + " OR replay_failure_step_id IS NOT NULL"
                    + " OR replay_failure_step_index IS NOT NULL"
                    + " OR replay_failure_login_steps_present IS NOT NULL"))
        .as("no backfill: the login detail was never stored (ruling F4)")
        .isEqualTo("0");
    assertThat(constraintRows(upgradeUrl)).isEqualTo(expectedConstraintRows(family(upgradeUrl)));
  }

  @Test
  void v22HoldsAccessExclusiveOnEveryRelationAndScansOnlyInValidate() {
    List<String> leaves = new ArrayList<>(v22LockModes.keySet());
    leaves.remove(PARENT);
    assertThat(v22LockModes.keySet())
        .as("the parent, the three bootstrap months and DEFAULT")
        .hasSize(5)
        .contains(PARENT, "ui_test_executions_default");
    v22LockModes.forEach(
        (relation, modes) -> assertThat(modes).as(relation).contains("AccessExclusiveLock"));
    assertThat(seqScansBeforeValidate.keySet()).containsExactlyInAnyOrderElementsOf(leaves);
    seqScansBeforeValidate.forEach(
        (leaf, scans) ->
            assertThat(scans)
                .as("ADD COLUMN and ADD ... NOT VALID scan nothing: %s", leaf)
                .isZero());
    seqScansAfterValidate.forEach(
        (leaf, scans) ->
            assertThat(scans).as("VALIDATE scans each partition once: %s", leaf).isEqualTo(1L));
  }

  // ── A future partition ──────────────────────────────────────────────────────

  @Test
  void aPartitionCreatedLaterInheritsTheColumnsAndTheCheckAndKeepsAMovedRowIntact()
      throws SQLException {
    YearMonth month = YearMonth.now(ZoneOffset.UTC).plusMonths(2);
    String leaf = PARENT + "_" + month.format(DateTimeFormatter.ofPattern("yyyy_MM"));
    String at = month.atDay(10) + " 09:00:00+00";
    assertThat(scalar(futureUrl, "SELECT to_regclass('" + leaf + "') IS NULL"))
        .as("%s must not exist yet, or the case proves nothing", leaf)
        .isEqualTo("t");

    UUID waiting = UUID.randomUUID();
    execute(
        futureUrl,
        insertShapeLiteral(futureTestId, waiting, at, "'LOGIN_REQUIRED'", "'step-9'", "4", "true"));
    assertThat(where(futureUrl, waiting)).isEqualTo("ui_test_executions_default");

    var manager =
        new PartitionManager(
            new JdbcTemplate(
                new DriverManagerDataSource(
                    futureUrl, POSTGRES.getUsername(), POSTGRES.getPassword())),
            PARENT);
    assertThat(manager.ensurePartitions(2)).contains(leaf);

    assertThat(replayColumns(futureUrl, leaf)).isEqualTo(RULED_COLUMNS);
    assertThat(constraintRows(futureUrl)).isEqualTo(expectedConstraintRows(family(futureUrl)));
    assertThat(where(futureUrl, waiting))
        .as("moved out of DEFAULT by PartitionManager")
        .isEqualTo(leaf);
    assertThat(
            scalar(
                futureUrl,
                "SELECT replay_failure_code||':'||replay_failure_step_id||':'"
                    + "||replay_failure_step_index||':'||replay_failure_login_steps_present"
                    + " FROM ui_test_executions WHERE id='"
                    + waiting
                    + "'"))
        .isEqualTo("LOGIN_REQUIRED:step-9:4:true");

    try (Connection c = transaction(futureUrl)) {
      UUID drift = UUID.randomUUID();
      execute(c, insertShapeLiteral(futureTestId, drift, at, "'TARGET_DRIFT'", "'s'", "0", "NULL"));
      assertThat(
              strings(
                  c,
                  "SELECT tableoid::regclass::text FROM ui_test_executions WHERE id='"
                      + drift
                      + "'"))
          .containsExactly(leaf);
      refuse(
          c,
          insertShapeLiteral(
              futureTestId, UUID.randomUUID(), at, "'TARGET_DRIFT'", "'s'", "0", "false"));
      refuse(
          c,
          insertShapeLiteral(
              futureTestId, UUID.randomUUID(), at, "'LOGIN_REQUIRED'", "'s'", "0", "NULL"));
      c.rollback();
    }
  }

  // ── The ruled shapes, stated once ───────────────────────────────────────────

  /** The shape a row is, or {@code null} when the ruling admits none. */
  private static String shape(String code, String stepId, Integer index, Boolean login) {
    if (code == null && stepId == null && index == null && login == null) {
      return "NONE";
    }
    boolean step =
        stepId != null
            && stepId.codePointCount(0, stepId.length()) >= 1
            && stepId.codePointCount(0, stepId.length()) <= 256
            && index != null
            && index >= 0;
    if ("LOGIN_REQUIRED".equals(code) && step && login != null) {
      return "LOGIN_REQUIRED";
    }
    if ("TARGET_DRIFT".equals(code) && step && login == null) {
      return "TARGET_DRIFT";
    }
    return null;
  }

  // ── V22 measured inside one rolled-back transaction ─────────────────────────

  /**
   * Runs V22's own text on a V21 database: everything before the executable VALIDATE statement,
   * then the rest. Records this backend's relation locks and each leaf's sequential scans from
   * {@code pg_stat_xact_user_tables}, then rolls back so Flyway applies the file for real.
   */
  private static void measureV22(String url) throws SQLException, IOException {
    String script;
    try (InputStream in = ExecutionReplayFailureMigrationIT.class.getResourceAsStream(V22)) {
      assertThat(in).as(V22).isNotNull();
      script = new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
    String marker = "\nALTER TABLE ui_test_executions VALIDATE CONSTRAINT " + CONSTRAINT + ";";
    int split = script.indexOf(marker);
    assertThat(split).as("one executable VALIDATE statement").isPositive();
    assertThat(script.indexOf(marker, split + 1)).isNegative();
    try (Connection c = transaction(url)) {
      List<String> leaves = leaves(c);
      try (Statement s = c.createStatement()) {
        s.execute(script.substring(0, split));
        seqScansBeforeValidate = seqScans(c, leaves);
        s.execute(script.substring(split));
        seqScansAfterValidate = seqScans(c, leaves);
      }
      Map<String, List<String>> modes = new TreeMap<>();
      try (Statement s = c.createStatement();
          ResultSet rows =
              s.executeQuery(
                  "SELECT c.relname, l.mode FROM pg_locks l JOIN pg_class c ON c.oid=l.relation"
                      + " WHERE l.pid=pg_backend_pid() AND l.granted AND l.locktype='relation'"
                      + " AND c.relname LIKE 'ui\\_test\\_executions%' AND c.relkind IN ('r','p')"
                      + " ORDER BY 1, 2")) {
        while (rows.next()) {
          modes.computeIfAbsent(rows.getString(1), k -> new ArrayList<>()).add(rows.getString(2));
        }
      }
      v22LockModes = modes;
      c.rollback();
    }
    assertThat(scalar(url, "SELECT max(version::int) FROM flyway_schema_history"))
        .as("the measurement was rolled back")
        .isEqualTo("21");
  }

  private static Map<String, Long> seqScans(Connection c, List<String> leaves) throws SQLException {
    Map<String, Long> scans = new LinkedHashMap<>();
    for (String leaf : leaves) {
      try (Statement s = c.createStatement();
          ResultSet rows =
              s.executeQuery(
                  "SELECT coalesce(seq_scan,0) FROM pg_stat_xact_user_tables WHERE relname='"
                      + leaf
                      + "'")) {
        scans.put(leaf, rows.next() ? rows.getLong(1) : 0L);
      }
    }
    return scans;
  }

  // ── Catalog reads ───────────────────────────────────────────────────────────

  private static List<String> family(String url) throws SQLException {
    List<String> family = new ArrayList<>(List.of(PARENT));
    try (Connection c = open(url)) {
      family.addAll(leaves(c));
    }
    return family;
  }

  private static List<String> leaves(Connection c) throws SQLException {
    return strings(
        c,
        "SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid"
            + " WHERE i.inhparent='ui_test_executions'::regclass ORDER BY 1");
  }

  private static List<String> replayColumns(String url, String relation) throws SQLException {
    return strings(
        url,
        "SELECT column_name||':'||data_type||':'||is_nullable||':'"
            + "||coalesce(column_default,'null') FROM information_schema.columns"
            + " WHERE table_schema='public' AND table_name='"
            + relation
            + "' AND column_name LIKE 'replay\\_failure\\_%' ORDER BY ordinal_position");
  }

  private static List<String> constraintRows(String url) throws SQLException {
    return strings(
        url,
        "SELECT conrelid::regclass::text||':'||convalidated||':'||conislocal||':'||coninhcount"
            + " FROM pg_constraint WHERE conname='"
            + CONSTRAINT
            + "' AND contype='c' ORDER BY 1");
  }

  private static List<String> expectedConstraintRows(List<String> family) {
    return family.stream()
        .sorted()
        .map(relation -> relation + (relation.equals(PARENT) ? ":true:true:0" : ":true:false:1"))
        .toList();
  }

  private static String where(String url, UUID id) throws SQLException {
    return scalar(
        url, "SELECT tableoid::regclass::text FROM ui_test_executions WHERE id='" + id + "'");
  }

  // ── Writes ──────────────────────────────────────────────────────────────────

  private static final String INSERT_SHAPE =
      "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at, duration_ms,"
          + " created_at, replay_failure_code, replay_failure_step_id, replay_failure_step_index,"
          + " replay_failure_login_steps_present) VALUES (?, ?, 'FAILED', ?::timestamptz,"
          + " ?::timestamptz + INTERVAL '4 seconds', 4000, ?::timestamptz, ?, ?, ?, ?)";

  private static String tryInsert(
      Connection c,
      PreparedStatement insert,
      String at,
      String code,
      String stepId,
      Integer index,
      Boolean login)
      throws SQLException {
    insert.setObject(1, UUID.randomUUID());
    insert.setObject(2, headTestId);
    insert.setString(3, at);
    insert.setString(4, at);
    insert.setString(5, at);
    insert.setString(6, code);
    insert.setString(7, stepId);
    if (index == null) {
      insert.setNull(8, Types.INTEGER);
    } else {
      insert.setInt(8, index);
    }
    if (login == null) {
      insert.setNull(9, Types.BOOLEAN);
    } else {
      insert.setBoolean(9, login);
    }
    Savepoint savepoint = c.setSavepoint();
    try {
      insert.executeUpdate();
      c.releaseSavepoint(savepoint);
      return "ACCEPTED";
    } catch (SQLException refused) {
      c.rollback(savepoint);
      // Refused by this CHECK, not by something else that happens to fail.
      if ("23514".equals(refused.getSQLState())
          && String.valueOf(refused.getMessage()).contains(CONSTRAINT)) {
        return "REFUSED";
      }
      return "OTHER_ERROR " + refused.getSQLState() + " " + refused.getMessage();
    }
  }

  private static String describe(
      String at, String code, String stepId, Integer index, Boolean login) {
    String step =
        stepId == null
            ? "null"
            : "len"
                + stepId.codePointCount(0, stepId.length())
                + (stepId.startsWith("é") ? "é" : "");
    return Arrays.asList(at.substring(0, 7), code, step, index, login).toString();
  }

  /** Refused by this CHECK (SQLState 23514 naming it), not by something else that fails. */
  private static void refuse(Connection c, String sql) throws SQLException {
    Savepoint savepoint = c.setSavepoint();
    try {
      execute(c, sql);
      fail("expected %s to refuse: %s", CONSTRAINT, sql);
    } catch (SQLException refused) {
      assertThat(refused.getSQLState()).as(sql).isEqualTo("23514");
      assertThat(refused.getMessage()).as(sql).contains(CONSTRAINT);
    } finally {
      c.rollback(savepoint);
    }
  }

  private static String insertPlain(
      UUID testId, UUID id, String status, String at, String errorCode) {
    return "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at,"
        + " duration_ms, error_code, created_at) VALUES ('"
        + id
        + "', '"
        + testId
        + "', '"
        + status
        + "', '"
        + at
        + "', "
        + ("RUNNING".equals(status) ? "NULL" : "'" + at + "'::timestamptz + INTERVAL '4 seconds'")
        + ", "
        + ("RUNNING".equals(status) ? "NULL" : "4000")
        + ", "
        + errorCode
        + ", '"
        + at
        + "')";
  }

  private static String insertShapeLiteral(
      UUID testId, UUID id, String at, String code, String stepId, String index, String login) {
    return "INSERT INTO ui_test_executions (id, ui_test_id, status, started_at, ended_at,"
        + " duration_ms, created_at, replay_failure_code, replay_failure_step_id,"
        + " replay_failure_step_index, replay_failure_login_steps_present) VALUES ('"
        + id
        + "', '"
        + testId
        + "', 'FAILED', '"
        + at
        + "', '"
        + at
        + "'::timestamptz + INTERVAL '4 seconds', 4000, '"
        + at
        + "', "
        + String.join(", ", code, stepId, index, login)
        + ")";
  }

  private static UUID seedOwners(String url) throws SQLException {
    UUID testId = UUID.randomUUID();
    execute(
        url,
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) VALUES"
            + " (gen_random_uuid(), 'sso-replay-failure', 'Replay Author', 'replay@citi.com',"
            + " NOW(), true)");
    execute(
        url,
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email, environment,"
            + " status, created_at, updated_at) VALUES ('"
            + CSI_ID
            + "', 'Replay CSI', 'Ops', 'HIGH', 'replay@citi.com', 'Production',"
            + " 'OPERATIONAL', NOW(), NOW())");
    execute(
        url,
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES ('"
            + testId
            + "', 'Replay draft', '"
            + CSI_ID
            + "', 'Production', 'chromium', '[\"Go to the home page\"]'::jsonb, '[]'::jsonb,"
            + " 'replay@citi.com', NOW(), NOW())");
    return testId;
  }

  // ── Plumbing ────────────────────────────────────────────────────────────────

  private static String create(String database) throws SQLException {
    try (Connection c = open(POSTGRES.getJdbcUrl());
        Statement s = c.createStatement()) {
      s.execute("CREATE DATABASE " + database);
    }
    return POSTGRES.getJdbcUrl().replace(POSTGRES.getDatabaseName(), database);
  }

  private static Flyway flyway(String url, String target) {
    var config =
        Flyway.configure()
            .dataSource(url, POSTGRES.getUsername(), POSTGRES.getPassword())
            .locations(MIGRATIONS);
    if (target != null) {
      config.target(target);
    }
    return config.load();
  }

  private static Connection open(String url) throws SQLException {
    return DriverManager.getConnection(url, POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static Connection transaction(String url) throws SQLException {
    Connection c = open(url);
    c.setAutoCommit(false);
    return c;
  }

  private static void execute(String url, String sql) throws SQLException {
    try (Connection c = open(url)) {
      execute(c, sql);
    }
  }

  private static void execute(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement()) {
      s.execute(sql);
    }
  }

  private static String scalar(String url, String sql) throws SQLException {
    List<String> values = strings(url, sql);
    return values.isEmpty() ? null : values.get(0);
  }

  private static List<String> strings(String url, String sql) throws SQLException {
    try (Connection c = open(url)) {
      return strings(c, sql);
    }
  }

  private static List<String> strings(Connection c, String sql) throws SQLException {
    List<String> values = new ArrayList<>();
    try (Statement s = c.createStatement();
        ResultSet rows = s.executeQuery(sql)) {
      while (rows.next()) {
        values.add(rows.getString(1));
      }
    }
    return values;
  }
}
