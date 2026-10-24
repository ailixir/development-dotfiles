package com.citi.put.checks.studio.guided.secret;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.Path;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.Scope;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.UsageOutcome;
import com.citi.put.checks.studio.support.GuidedLedgerSeed;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * STUDIO-OBS-009 AC-4 TF-5 b: the privilege delta a non-owner runtime role needs for every object
 * that V19 through the Flyway head created or altered, and the prepared grant statement for it.
 *
 * <p>The repository runs Flyway with the application datasource, so today the runtime user owns
 * every Studio object and needs no grant. This class answers the other case (U14 unconfirmed): a
 * role that a DBA granted table by table up to V18 and that does not own the objects. Real
 * PostgreSQL, real Flyway, no trigger disabled. Triggers and functions run with the invoker's
 * rights (no SECURITY DEFINER), foreign-key checks and views run with their owner's rights.
 *
 * <p>Evidence copy of {@link #PREPARED_GRANT} and {@link #PREPARED_COLUMN_GRANT}: {@code
 * docs/qa/evidence/STUDIO-OBS-009/execution-20261018/de/runtime-role-grants-v19-v23.sql}.
 */
class GuidedRuntimeRolePrivilegeIT {
  private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:15-alpine");
  private static final String PRINCIPAL = "owner@example.test";
  private static final String HASH = "a".repeat(64);
  private static final GuidedContracts CONTRACTS = new GuidedContracts();
  private static final String ROLE_PLACEHOLDER = ":\"runtime_role\"";
  private static final List<String> TABLE_PRIVILEGES =
      List.of("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER");
  private static final List<String> COLUMN_PRIVILEGES =
      List.of("SELECT", "INSERT", "UPDATE", "REFERENCES");

  /**
   * The delta grant for a non-owner runtime role (API and worker pods). Apply after V23 with {@code
   * psql -v runtime_role=<role>}. Least privilege: exactly what the application SQL and the
   * invoker-rights trigger/function bodies use; no DELETE or TRUNCATE on any V19–V23 relation.
   */
  static final String PREPARED_GRANT =
      """
      -- New relations, V19 (governance).
      GRANT SELECT, INSERT, UPDATE ON studio_guided_policies TO :"runtime_role";
      GRANT SELECT, INSERT ON studio_guided_policy_versions TO :"runtime_role";
      GRANT SELECT, INSERT ON studio_guided_policy_approvals TO :"runtime_role";
      GRANT INSERT ON studio_guided_policy_audit TO :"runtime_role";
      GRANT SELECT, INSERT ON studio_guided_session_policies TO :"runtime_role";
      GRANT SELECT, INSERT, UPDATE ON studio_guided_csi_guards TO :"runtime_role";
      GRANT SELECT, INSERT, UPDATE ON studio_guided_csi_token_days TO :"runtime_role";
      -- New relations, V20 (recording).
      GRANT SELECT, INSERT ON studio_guided_session_recordings TO :"runtime_role";
      -- New relations, V21 (replaying prefix). The view runs with its owner's rights, so SELECT on
      -- the view alone serves the secret-audit guard; the base-table grants serve the V21 capture
      -- trigger and the evidence readers.
      GRANT SELECT, INSERT ON studio_guided_relearn_plans TO :"runtime_role";
      GRANT SELECT, INSERT ON studio_guided_relearn_switches TO :"runtime_role";
      GRANT SELECT, INSERT ON studio_guided_materialization_versions TO :"runtime_role";
      GRANT SELECT, INSERT ON studio_guided_materialization_inputs TO :"runtime_role";
      GRANT SELECT ON studio_guided_materialization_snapshots TO :"runtime_role";
      GRANT SELECT, INSERT, UPDATE ON studio_guided_materialization_deliveries TO :"runtime_role";
      GRANT SELECT, INSERT, UPDATE ON studio_guided_prefix_requests TO :"runtime_role";
      GRANT SELECT, INSERT ON studio_guided_no_invocation_receipts TO :"runtime_role";
      GRANT SELECT, INSERT ON studio_guided_suffix_acceptances TO :"runtime_role";
      -- Pre-V19 relations: what V19..V22 function and trigger bodies newly need on them. A no-op
      -- where the V18 baseline already grants it.
      -- V21 version-history trigger locks the materialization row (FOR UPDATE).
      GRANT UPDATE ON studio_guided_materializations TO :"runtime_role";
      -- V19 studio_guided_prune_session (GuidedObservationPruner, runtime).
      GRANT UPDATE ON studio_guided_model_attempts TO :"runtime_role";
      GRANT DELETE ON studio_guided_publication_admissions, studio_guided_publication_preparations,
       studio_guided_publication_observations TO :"runtime_role";
      -- V21 guards read the translation plan and state.
      GRANT SELECT ON studio_guided_translation_plans, studio_guided_translation_state
       TO :"runtime_role";
      """;

  /**
   * Only for a baseline that grants the altered pre-V19 tables column by column: the columns V19
   * through the head added. A table-level grant already covers them.
   */
  static final String PREPARED_COLUMN_GRANT =
      """
      GRANT SELECT (pruned_at), UPDATE (pruned_at) ON studio_guided_sessions TO :"runtime_role";
      GRANT SELECT (attempt_ordinal), INSERT (attempt_ordinal)
       ON studio_guided_actions TO :"runtime_role";
      GRANT SELECT (attempt_ordinal), INSERT (attempt_ordinal)
       ON studio_guided_obligation_admissions TO :"runtime_role";
      GRANT SELECT (replay_failure_code, replay_failure_step_id, replay_failure_step_index,
       replay_failure_login_steps_present), UPDATE (replay_failure_code, replay_failure_step_id,
       replay_failure_step_index, replay_failure_login_steps_present)
       ON ui_test_executions TO :"runtime_role";
      GRANT SELECT (rejection_reason), UPDATE (rejection_reason)
       ON studio_guided_model_attempts TO :"runtime_role";
      """;

  /** Relations V19 through the head create: name to "version kind". */
  private static final Map<String, String> CREATED_RELATIONS =
      Map.ofEntries(
          Map.entry("studio_guided_policies", "19 r"),
          Map.entry("studio_guided_policy_versions", "19 r"),
          Map.entry("studio_guided_policy_approvals", "19 r"),
          Map.entry("studio_guided_policy_audit", "19 r"),
          Map.entry("studio_guided_policy_audit_audit_id_seq", "19 S"),
          Map.entry("studio_guided_session_policies", "19 r"),
          Map.entry("studio_guided_csi_guards", "19 r"),
          Map.entry("studio_guided_csi_token_days", "19 r"),
          Map.entry("studio_guided_session_recordings", "20 r"),
          Map.entry("studio_guided_relearn_plans", "21 r"),
          Map.entry("studio_guided_relearn_switches", "21 r"),
          Map.entry("studio_guided_materialization_versions", "21 r"),
          Map.entry("studio_guided_materialization_inputs", "21 r"),
          Map.entry("studio_guided_materialization_snapshots", "21 v"),
          Map.entry("studio_guided_materialization_deliveries", "21 r"),
          Map.entry("studio_guided_prefix_requests", "21 r"),
          Map.entry("studio_guided_no_invocation_receipts", "21 r"),
          Map.entry("studio_guided_suffix_acceptances", "21 r"));

  /**
   * What application SQL (backend/src/main/java, grep in the DE receipt) does to each new relation.
   * SELECT ... FOR UPDATE counts as UPDATE (PostgreSQL requires it for a row lock).
   */
  private static final Map<String, Set<String>> APPLICATION_ACCESS =
      Map.ofEntries(
          Map.entry("studio_guided_policies", Set.of("SELECT", "INSERT", "UPDATE")),
          Map.entry("studio_guided_policy_versions", Set.of("SELECT", "INSERT")),
          Map.entry("studio_guided_policy_approvals", Set.of("SELECT", "INSERT")),
          Map.entry("studio_guided_policy_audit", Set.of()),
          Map.entry("studio_guided_session_policies", Set.of("SELECT", "INSERT")),
          Map.entry("studio_guided_csi_guards", Set.of("SELECT", "INSERT", "UPDATE")),
          Map.entry("studio_guided_csi_token_days", Set.of("SELECT", "INSERT", "UPDATE")),
          Map.entry("studio_guided_session_recordings", Set.of("SELECT", "INSERT")),
          Map.entry("studio_guided_relearn_plans", Set.of("SELECT", "INSERT")),
          Map.entry("studio_guided_relearn_switches", Set.of("SELECT", "INSERT")),
          Map.entry("studio_guided_materialization_versions", Set.of("SELECT")),
          Map.entry("studio_guided_materialization_inputs", Set.of("SELECT")),
          Map.entry("studio_guided_materialization_snapshots", Set.of("SELECT")),
          Map.entry("studio_guided_materialization_deliveries", Set.of("SELECT", "UPDATE")),
          Map.entry("studio_guided_prefix_requests", Set.of("SELECT", "INSERT", "UPDATE")),
          Map.entry("studio_guided_no_invocation_receipts", Set.of("SELECT", "INSERT")),
          Map.entry("studio_guided_suffix_acceptances", Set.of("SELECT", "INSERT")));

  /** Columns V19 through the head add to pre-V19 relations, with what the runtime does to them. */
  private static final Map<String, Set<String>> ADDED_COLUMNS =
      Map.ofEntries(
          Map.entry("studio_guided_sessions.pruned_at", Set.of("SELECT", "UPDATE")),
          Map.entry("studio_guided_actions.attempt_ordinal", Set.of("SELECT", "INSERT")),
          Map.entry(
              "studio_guided_obligation_admissions.attempt_ordinal", Set.of("SELECT", "INSERT")),
          Map.entry("ui_test_executions.replay_failure_code", Set.of("SELECT", "UPDATE")),
          Map.entry("ui_test_executions.replay_failure_step_id", Set.of("SELECT", "UPDATE")),
          Map.entry("ui_test_executions.replay_failure_step_index", Set.of("SELECT", "UPDATE")),
          Map.entry(
              "ui_test_executions.replay_failure_login_steps_present", Set.of("SELECT", "UPDATE")),
          // V23 (round 053): the closed rejection reason, read and written by finishAttempt.
          Map.entry("studio_guided_model_attempts.rejection_reason", Set.of("SELECT", "UPDATE")));

  private final List<String> databases = new ArrayList<>();
  private final List<String> roles = new ArrayList<>();

  @BeforeAll
  static void start() {
    PG.start();
  }

  @AfterAll
  static void stop() {
    PG.stop();
  }

  @AfterEach
  void cleanup() {
    JdbcTemplate admin = new JdbcTemplate(admin());
    for (String database : databases) {
      admin.execute("DROP DATABASE IF EXISTS " + database + " WITH (FORCE)");
    }
    for (String role : roles) {
      admin.execute("DROP ROLE IF EXISTS " + role);
    }
  }

  @Test
  void everyObjectV19ThroughHeadIsRuledAndThePreparedGrantIsExactlyTheDelta() {
    JdbcTemplate owner = new JdbcTemplate(database());
    DriverManagerDataSource source = (DriverManagerDataSource) owner.getDataSource();
    Flyway.configure().dataSource(source).target("18").load().migrate();
    Snapshot base = snapshot(owner);
    Map<String, Snapshot> steps = new LinkedHashMap<>();
    for (MigrationInfo pending : Flyway.configure().dataSource(source).load().info().pending()) {
      String version = pending.getVersion().getVersion();
      Flyway.configure().dataSource(source).target(version).load().migrate();
      steps.put(version, snapshot(owner));
    }
    assertThat(steps).as("V19 and later must exist").isNotEmpty();
    Snapshot head = steps.values().stream().reduce((a, b) -> b).orElseThrow();

    Map<String, String> created = new TreeMap<>();
    Map<String, String> addedColumns = new TreeMap<>();
    Map<String, List<String>> functions = new TreeMap<>();
    Map<String, List<String>> triggers = new TreeMap<>();
    Map<String, List<String>> constraints = new TreeMap<>();
    Snapshot previous = base;
    for (var step : steps.entrySet()) {
      Snapshot now = step.getValue();
      String v = step.getKey();
      for (var relation : now.relations().entrySet()) {
        if (!previous.relations().containsKey(relation.getKey())) {
          created.put(relation.getKey(), v + " " + relation.getValue());
        }
      }
      for (String column : now.columns()) {
        String table = column.substring(0, column.indexOf('.'));
        if (!previous.columns().contains(column) && base.relations().containsKey(table)) {
          addedColumns.put(column, v);
        }
      }
      for (var function : now.functions().entrySet()) {
        String before = previous.functions().get(function.getKey());
        if (!function.getValue().equals(before)) {
          functions
              .computeIfAbsent(function.getKey(), k -> new ArrayList<>())
              .add("V" + v + (before == null ? " created" : " replaced"));
        }
      }
      diff(previous.triggers(), now.triggers(), v, triggers);
      diff(previous.constraints(), now.constraints(), v, constraints);
      previous = now;
    }
    assertThat(created)
        .as("every relation V19..head creates is ruled; a new one needs a grant ruling")
        .isEqualTo(new TreeMap<>(CREATED_RELATIONS));
    assertThat(addedColumns.keySet())
        .as("every column V19..head adds to a pre-V19 relation is ruled")
        .isEqualTo(new TreeSet<>(ADDED_COLUMNS.keySet()));
    Set<String> ruledRelations = new TreeSet<>(APPLICATION_ACCESS.keySet());
    Set<String> createdNonSequence = new TreeSet<>();
    created.forEach((name, kind) -> createdNonSequence.add(name));
    createdNonSequence.removeIf(name -> created.get(name).endsWith(" S"));
    assertThat(ruledRelations).isEqualTo(createdNonSequence);

    List<String> unclassified = new ArrayList<>();
    Map<String, Set<String>> functionBase = functionAccess(base, unclassified);
    Map<String, Set<String>> functionHead = functionAccess(head, unclassified);
    assertThat(unclassified).as("every function-body reference is classified").isEmpty();

    Map<String, Set<String>> required = new TreeMap<>();
    for (String relation : createdNonSequence) {
      Set<String> needs = new TreeSet<>(APPLICATION_ACCESS.get(relation));
      needs.addAll(functionHead.getOrDefault(relation, Set.of()));
      if (!needs.isEmpty()) {
        required.put(relation, needs);
      }
    }
    for (String relation : base.relations().keySet()) {
      Set<String> grown = new TreeSet<>(functionHead.getOrDefault(relation, Set.of()));
      grown.removeAll(functionBase.getOrDefault(relation, Set.of()));
      if (!grown.isEmpty()) {
        required.put(relation, grown);
      }
    }

    String role = role(false);
    owner.execute(grantFor(PREPARED_GRANT, role));
    Map<String, Set<String>> granted = tablePrivileges(owner, role, head);
    printDeltaTable(
        created,
        addedColumns,
        functions,
        triggers,
        constraints,
        functionBase,
        functionHead,
        required,
        granted);
    assertThat(granted)
        .as("prepared grant == required delta (least privilege, nothing missing, nothing extra)")
        .isEqualTo(required);
    for (String sequence : created.keySet()) {
      if (created.get(sequence).endsWith(" S")) {
        for (String privilege : List.of("USAGE", "SELECT", "UPDATE")) {
          assertThat(
                  owner.queryForObject(
                      "SELECT has_sequence_privilege(?::name,?::text,?::text)",
                      Boolean.class,
                      role,
                      sequence,
                      privilege))
              .as("identity sequence %s needs no %s grant", sequence, privilege)
              .isFalse();
        }
      }
    }
  }

  @Test
  void migrationsGrantNothingRunNoDefinerRightsAndTheViewKeepsOwnerRights() {
    JdbcTemplate owner = new JdbcTemplate(database());
    Flyway.configure().dataSource(owner.getDataSource()).load().migrate();
    String role = role(false);
    assertThat(
            owner.queryForList(
                "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"
                    + " WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')"
                    + " AND pg_get_userbyid(c.relowner)<>current_user",
                String.class))
        .as("the migrating user owns every relation (repo role model)")
        .isEmpty();
    assertThat(
            owner.queryForList(
                "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"
                    + " WHERE n.nspname='public' AND c.relname LIKE 'studio_guided_%'"
                    + " AND c.relacl IS NOT NULL",
                String.class))
        .as("no migration grants anything on a guided relation")
        .isEmpty();
    assertThat(
            owner.queryForList(
                "SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n"
                    + " ON n.oid=p.pronamespace WHERE n.nspname='public'"
                    + " AND (p.prosecdef OR NOT has_function_privilege(?::name,p.oid,'EXECUTE'))",
                String.class,
                role))
        .as("no SECURITY DEFINER; every function executable by a role with no grant")
        .isEmpty();
    assertThat(
            owner.queryForObject(
                "SELECT COALESCE(array_to_string(reloptions,','),'') FROM pg_class"
                    + " WHERE oid='studio_guided_materialization_snapshots'::regclass",
                String.class))
        .as("the view runs with its owner's rights (no security_invoker)")
        .doesNotContain("security_invoker");
  }

  /**
   * Triage A §3.1: the V21 audit guard reads the materialization view. A role granted everything up
   * to V18 cannot write a guided secret-audit row at the head until it gets SELECT on the view, and
   * the view alone is enough: the base tables stay ungranted.
   */
  @Test
  void viewOnlyVariantWritesTheGuidedSecretAuditOnceTheViewAloneIsGranted() {
    Fixture f = runtimeFixture();
    seedSession(f.owner(), f.testId());
    GuidedLedgerSeed ledger = materialization(f.owner(), f.owner());
    seedAdmissionAndManifest(f.owner(), ledger, f.testId());
    consumedSecret(ledger);
    var audit = new SecretUseAuditRecorder(f.runtime(), Clock.systemUTC());
    assertThat(f.runtime().queryForObject("SELECT current_user", String.class)).isEqualTo(f.role());
    for (String table :
        List.of(
            "studio_guided_materialization_snapshots",
            "studio_guided_materialization_versions",
            "studio_guided_materialization_inputs")) {
      assertThat(privilege(f.owner(), f.role(), table, "SELECT")).isFalse();
    }

    assertThatThrownBy(
            () ->
                f.transaction()
                    .execute(
                        status ->
                            audit.recordRelease(
                                guided(f.testId()), "version1", ResolutionOutcome.RESOLVED)))
        .rootCause()
        .hasMessageContaining("permission denied for view studio_guided_materialization_snapshots");
    assertThat(count(f.owner())).isZero();

    f.owner()
        .execute("GRANT SELECT ON studio_guided_materialization_snapshots TO " + quoted(f.role()));
    var release =
        f.transaction()
            .execute(
                status ->
                    audit.recordRelease(
                        guided(f.testId()), "version1", ResolutionOutcome.RESOLVED));
    f.transaction().executeWithoutResult(status -> audit.recordUsage(release, UsageOutcome.USED));
    assertThat(count(f.owner())).isEqualTo(2);
    assertThat(privilege(f.owner(), f.role(), "studio_guided_materialization_versions", "SELECT"))
        .isFalse();
    assertThat(privilege(f.owner(), f.role(), "studio_guided_materialization_inputs", "SELECT"))
        .isFalse();
  }

  /**
   * The delta is not only the view: a V18-granted role cannot write a materialization at the head,
   * because the V21 capture trigger (invoker rights) inserts the version history. With the prepared
   * grant the same role writes the materialization, its history, the ledger rows and both guided
   * secret-audit rows. (A delivery row is written only from context revision 2; its INSERT need is
   * covered by the catalog derivation, not exercised here.)
   */
  @Test
  void preparedGrantLetsTheRuntimeRoleWriteMaterializationHistoryAndTheGuidedSecretAudit() {
    Fixture f = runtimeFixture();
    seedSession(f.owner(), f.testId());
    assignment(f.runtime());
    assertThatThrownBy(() -> materializationRow(f.runtime()))
        .rootCause()
        .hasMessageContaining("permission denied for table studio_guided_materialization_versions");

    f.owner().execute(grantFor(PREPARED_GRANT, f.role()));
    String inputsHash = materializationRow(f.runtime());
    GuidedLedgerSeed ledger =
        new GuidedLedgerSeed(f.runtime(), "session", "context", 1, inputsHash);
    seedAdmissionAndManifest(f.runtime(), ledger, f.testId());
    consumedSecret(ledger);
    var audit = new SecretUseAuditRecorder(f.runtime(), Clock.systemUTC());
    var release =
        f.transaction()
            .execute(
                status ->
                    audit.recordRelease(
                        guided(f.testId()), "version1", ResolutionOutcome.RESOLVED));
    f.transaction().executeWithoutResult(status -> audit.recordUsage(release, UsageOutcome.USED));

    assertThat(count(f.owner())).isEqualTo(2);
    for (String table :
        List.of("studio_guided_materialization_versions", "studio_guided_materialization_inputs")) {
      assertThat(f.owner().queryForObject("SELECT count(*) FROM " + table, Integer.class))
          .as(table)
          .isEqualTo(1);
    }
  }

  /**
   * The policy audit is written only by an AFTER trigger with the invoker's rights: the runtime
   * role needs INSERT on it, and nothing on its identity sequence.
   */
  @Test
  void triggerOnlyPolicyAuditNeedsInsertButNoSequenceGrant() {
    Fixture f = runtimeFixture();
    f.owner().execute(grantFor(PREPARED_GRANT, f.role()));
    f.owner().execute("REVOKE INSERT ON studio_guided_policy_audit FROM " + quoted(f.role()));
    UUID first = UUID.randomUUID();
    assertThatThrownBy(() -> policy(f.runtime(), first, "app-1"))
        .rootCause()
        .hasMessageContaining("permission denied for table studio_guided_policy_audit");

    f.owner().execute("GRANT INSERT ON studio_guided_policy_audit TO " + quoted(f.role()));
    UUID second = UUID.randomUUID();
    policy(f.runtime(), second, "app-2");
    assertThat(
            f.owner()
                .queryForList(
                    "SELECT event FROM studio_guided_policy_audit WHERE policy_id=?",
                    String.class,
                    second))
        .containsExactly("POLICY_CREATED");
    assertThat(
            f.owner()
                .queryForObject(
                    "SELECT"
                        + " has_sequence_privilege(?::name,'studio_guided_policy_audit_audit_id_seq',"
                        + "'USAGE')",
                    Boolean.class,
                    f.role()))
        .isFalse();
  }

  /** Column-by-column baselines: the conditional block covers exactly the added columns. */
  @Test
  void columnLevelVariantCoversExactlyTheColumnsV19ThroughHeadAdded() {
    JdbcTemplate owner = new JdbcTemplate(database());
    Flyway.configure().dataSource(owner.getDataSource()).load().migrate();
    String role = role(false);
    owner.execute(grantFor(PREPARED_COLUMN_GRANT, role));
    Map<String, Set<String>> granted = new TreeMap<>();
    for (Map<String, Object> row :
        owner.queryForList(
            "SELECT c.relname, a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid"
                + " JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'"
                + " AND c.relkind IN ('r','p','v') AND NOT c.relispartition AND a.attnum>0"
                + " AND NOT a.attisdropped")) {
      String table = (String) row.get("relname");
      String column = (String) row.get("attname");
      Set<String> privileges = new TreeSet<>();
      for (String privilege : COLUMN_PRIVILEGES) {
        if (Boolean.TRUE.equals(
            owner.queryForObject(
                "SELECT has_column_privilege(?::name,?::regclass,?::text,?::text)",
                Boolean.class,
                role,
                table,
                column,
                privilege))) {
          privileges.add(privilege);
        }
      }
      if (!privileges.isEmpty()) {
        granted.put(table + "." + column, privileges);
      }
    }
    Map<String, Set<String>> expected = new TreeMap<>();
    ADDED_COLUMNS.forEach((column, privileges) -> expected.put(column, new TreeSet<>(privileges)));
    assertThat(granted).isEqualTo(expected);
    assertThat(tablePrivileges(owner, role, snapshot(owner))).isEmpty();
  }

  // ---------------------------------------------------------------------------------------------
  // Catalog snapshot and the function-body privilege derivation.

  private record Snapshot(
      Map<String, String> relations,
      Set<String> columns,
      Map<String, String> functions,
      Set<String> triggers,
      Set<String> constraints) {}

  private static Snapshot snapshot(JdbcTemplate jdbc) {
    Map<String, String> relations = new TreeMap<>();
    for (Map<String, Object> row :
        jdbc.queryForList(
            "SELECT c.relname, c.relkind::text AS kind FROM pg_class c JOIN pg_namespace n"
                + " ON n.oid=c.relnamespace WHERE n.nspname='public'"
                + " AND c.relkind IN ('r','p','v','m','f','S') AND NOT c.relispartition"
                + " AND c.relname<>'flyway_schema_history'")) {
      relations.put((String) row.get("relname"), (String) row.get("kind"));
    }
    Set<String> columns =
        new TreeSet<>(
            jdbc.queryForList(
                "SELECT c.relname||'.'||a.attname FROM pg_attribute a JOIN pg_class c"
                    + " ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace"
                    + " WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')"
                    + " AND NOT c.relispartition AND a.attnum>0 AND NOT a.attisdropped"
                    + " AND c.relname<>'flyway_schema_history'",
                String.class));
    Map<String, String> functions = new TreeMap<>();
    for (Map<String, Object> row :
        jdbc.queryForList(
            "SELECT p.oid::regprocedure::text AS signature, p.prosrc FROM pg_proc p"
                + " JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'")) {
      functions.put((String) row.get("signature"), (String) row.get("prosrc"));
    }
    Set<String> triggers =
        new TreeSet<>(
            jdbc.queryForList(
                "SELECT c.relname||'.'||t.tgname FROM pg_trigger t JOIN pg_class c"
                    + " ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace"
                    + " WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgparentid=0",
                String.class));
    Set<String> constraints =
        new TreeSet<>(
            jdbc.queryForList(
                "SELECT c.relname||'.'||k.conname FROM pg_constraint k JOIN pg_class c"
                    + " ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace"
                    + " WHERE n.nspname='public' AND k.conparentid=0 AND NOT c.relispartition",
                String.class));
    return new Snapshot(relations, columns, functions, triggers, constraints);
  }

  private static void diff(
      Set<String> before, Set<String> after, String version, Map<String, List<String>> out) {
    for (String item : after) {
      if (!before.contains(item)) {
        out.computeIfAbsent(item, k -> new ArrayList<>()).add("V" + version + " created");
      }
    }
    for (String item : before) {
      if (!after.contains(item)) {
        out.computeIfAbsent(item, k -> new ArrayList<>()).add("V" + version + " dropped");
      }
    }
  }

  private static final Pattern LOCK =
      Pattern.compile("\\bfor\\s+(update|no\\s+key\\s+update|share|key\\s+share)\\b");
  private static final Pattern WHERE = Pattern.compile("\\bwhere\\b");

  /**
   * Privileges each function or trigger body needs on each relation (all run with the invoker's
   * rights): INSERT INTO, UPDATE, DELETE FROM targets; FROM/JOIN/USING reads; a row lock (FOR
   * UPDATE/SHARE) also needs UPDATE. Row-type declarations need nothing. Literals and comments are
   * removed first; any other reference is reported as unclassified.
   */
  private static Map<String, Set<String>> functionAccess(Snapshot s, List<String> unclassified) {
    Map<String, Set<String>> access = new TreeMap<>();
    List<String> names =
        s.relations().entrySet().stream()
            .filter(e -> !e.getValue().equals("S"))
            .map(Map.Entry::getKey)
            .toList();
    for (var function : s.functions().entrySet()) {
      String body = clean(function.getValue());
      for (String statement : body.split(";")) {
        for (String relation : names) {
          Matcher m = Pattern.compile("\\b" + relation + "\\b").matcher(statement);
          while (m.find()) {
            String before = statement.substring(0, m.start());
            boolean where = WHERE.matcher(statement).find();
            Set<String> needs = new TreeSet<>();
            if (endsWith(before, "insert\\s+into")) {
              needs.add("INSERT");
            } else if (endsWith(before, "update")) {
              needs.add("UPDATE");
              if (where) {
                needs.add("SELECT");
              }
            } else if (endsWith(before, "delete\\s+from")) {
              needs.add("DELETE");
              if (where) {
                needs.add("SELECT");
              }
            } else if (endsWith(before, "from|join|using") || before.matches("(?s).*,\\s*$")) {
              needs.add("SELECT");
              if (LOCK.matcher(statement).find()) {
                needs.add("UPDATE");
              }
            } else if (statement
                .strip()
                .matches("(declare\\s+)?[a-z_][a-z0-9_]*\\s+" + relation + "(%rowtype)?")) {
              continue;
            } else {
              String tail = statement.substring(Math.max(0, m.start() - 40), m.end());
              unclassified.add(function.getKey() + ": ..." + tail.replaceAll("\\s+", " "));
              continue;
            }
            access.computeIfAbsent(relation, k -> new TreeSet<>()).addAll(needs);
          }
        }
      }
    }
    return access;
  }

  private static boolean endsWith(String before, String keywords) {
    return Pattern.compile("(?s).*\\b(" + keywords + ")\\s+$").matcher(before).matches();
  }

  /** Lower-cased body without string literals and comments. */
  private static String clean(String body) {
    StringBuilder out = new StringBuilder(body.length());
    int i = 0;
    int n = body.length();
    while (i < n) {
      char c = body.charAt(i);
      if (c == '\'') {
        out.append("''");
        i++;
        while (i < n) {
          if (body.charAt(i) == '\'') {
            if (i + 1 < n && body.charAt(i + 1) == '\'') {
              i += 2;
              continue;
            }
            i++;
            break;
          }
          i++;
        }
      } else if (c == '-' && i + 1 < n && body.charAt(i + 1) == '-') {
        while (i < n && body.charAt(i) != '\n') {
          i++;
        }
        out.append(' ');
      } else if (c == '/' && i + 1 < n && body.charAt(i + 1) == '*') {
        int end = body.indexOf("*/", i + 2);
        i = end < 0 ? n : end + 2;
        out.append(' ');
      } else {
        out.append(c);
        i++;
      }
    }
    return out.toString().toLowerCase(Locale.ROOT);
  }

  private static Map<String, Set<String>> tablePrivileges(
      JdbcTemplate jdbc, String role, Snapshot s) {
    Map<String, Set<String>> granted = new TreeMap<>();
    for (var relation : s.relations().entrySet()) {
      if (relation.getValue().equals("S")) {
        continue;
      }
      Set<String> privileges = new TreeSet<>();
      for (String privilege : TABLE_PRIVILEGES) {
        if (privilege(jdbc, role, relation.getKey(), privilege)) {
          privileges.add(privilege);
        }
      }
      if (!privileges.isEmpty()) {
        granted.put(relation.getKey(), privileges);
      }
    }
    return granted;
  }

  private static boolean privilege(JdbcTemplate jdbc, String role, String table, String privilege) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT has_table_privilege(?::name,?::regclass,?::text)",
            Boolean.class,
            role,
            table,
            privilege));
  }

  private static void printDeltaTable(
      Map<String, String> created,
      Map<String, String> addedColumns,
      Map<String, List<String>> functions,
      Map<String, List<String>> triggers,
      Map<String, List<String>> constraints,
      Map<String, Set<String>> functionBase,
      Map<String, Set<String>> functionHead,
      Map<String, Set<String>> required,
      Map<String, Set<String>> granted) {
    StringBuilder out = new StringBuilder("\n=== TF-5 b privilege delta (V19..head) ===\n");
    out.append("| relation | introduced | application | functions@V18 | functions@head |")
        .append(" required delta | prepared grant |\n|---|---|---|---|---|---|---|\n");
    Set<String> rows = new TreeSet<>(created.keySet());
    rows.addAll(required.keySet());
    for (String relation : rows) {
      out.append("| ")
          .append(relation)
          .append(" | ")
          .append(created.getOrDefault(relation, "pre-V19 (altered)"))
          .append(" | ")
          .append(APPLICATION_ACCESS.getOrDefault(relation, Set.of()).stream().sorted().toList())
          .append(" | ")
          .append(functionBase.getOrDefault(relation, Set.of()))
          .append(" | ")
          .append(functionHead.getOrDefault(relation, Set.of()))
          .append(" | ")
          .append(required.getOrDefault(relation, Set.of()))
          .append(" | ")
          .append(granted.getOrDefault(relation, Set.of()))
          .append(" |\n");
    }
    out.append("\n--- columns added to pre-V19 relations ---\n");
    addedColumns.forEach((column, v) -> out.append(column).append(" V").append(v).append('\n'));
    out.append("\n--- functions created or replaced ---\n");
    functions.forEach((name, how) -> out.append(name).append(' ').append(how).append('\n'));
    out.append("\n--- triggers ---\n");
    triggers.forEach((name, how) -> out.append(name).append(' ').append(how).append('\n'));
    out.append("\n--- constraints ---\n");
    constraints.forEach((name, how) -> out.append(name).append(' ').append(how).append('\n'));
    out.append("=== end TF-5 b ===\n");
    System.out.println(out);
  }

  // ---------------------------------------------------------------------------------------------
  // Databases, roles and the guided secret-audit fixture (as in SecretUseAuditIT).

  private record Fixture(
      String role,
      UUID testId,
      JdbcTemplate owner,
      JdbcTemplate runtime,
      TransactionTemplate transaction) {}

  private DriverManagerDataSource database() {
    String database = "privilege_" + UUID.randomUUID().toString().replace("-", "");
    new JdbcTemplate(admin()).execute("CREATE DATABASE " + database);
    databases.add(database);
    return new DriverManagerDataSource(url(database), PG.getUsername(), PG.getPassword());
  }

  private String role(boolean login) {
    String role = "runtime_" + UUID.randomUUID().toString().replace("-", "");
    roles.add(role);
    new JdbcTemplate(admin()).execute("CREATE ROLE " + role + (login ? " LOGIN" : " NOLOGIN"));
    return role;
  }

  /**
   * A database at the head whose runtime role (a separate login, not the owner) was granted every
   * table and sequence privilege at V18, the most a table-by-table DBA baseline could hold, and
   * nothing after: what fails below is exactly the V19..head delta.
   */
  private Fixture runtimeFixture() {
    DriverManagerDataSource source = database();
    JdbcTemplate owner = new JdbcTemplate(source);
    Flyway.configure().dataSource(source).target("18").load().migrate();
    String role = role(true);
    String password = UUID.randomUUID().toString();
    owner.execute("ALTER ROLE " + role + " PASSWORD '" + password + "'");
    owner.execute("GRANT USAGE ON SCHEMA public TO " + role);
    owner.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO " + role);
    owner.execute("GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO " + role);
    Flyway.configure().dataSource(source).load().migrate();
    String database = source.getUrl().substring(source.getUrl().lastIndexOf('/') + 1);
    DriverManagerDataSource runtimeSource =
        new DriverManagerDataSource(url(database), role, password);
    return new Fixture(
        role,
        UUID.randomUUID(),
        owner,
        new JdbcTemplate(runtimeSource),
        new TransactionTemplate(new DataSourceTransactionManager(runtimeSource)));
  }

  private static String url(String database) {
    return PG.getJdbcUrl().replace(PG.getDatabaseName(), database);
  }

  private static DriverManagerDataSource admin() {
    return new DriverManagerDataSource(PG.getJdbcUrl(), PG.getUsername(), PG.getPassword());
  }

  private static String grantFor(String statement, String role) {
    return statement.replace(ROLE_PLACEHOLDER, quoted(role));
  }

  private static String quoted(String role) {
    return "\"" + role + "\"";
  }

  private static int count(JdbcTemplate jdbc) {
    return jdbc.queryForObject("SELECT count(*) FROM studio_secret_use_audit", Integer.class);
  }

  private static void policy(JdbcTemplate jdbc, UUID id, String application) {
    jdbc.update(
        "INSERT INTO studio_guided_policies(policy_id,csi_id,application_id,environment_id,"
            + "created_by) VALUES (?,'CSI',?,'Development',?)",
        id,
        application,
        PRINCIPAL);
  }

  private static void seedSession(JdbcTemplate jdbc, UUID testId) {
    jdbc.update("INSERT INTO users(sso_id,name,email) VALUES ('owner','owner',?)", PRINCIPAL);
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
            + " VALUES ('CSI','test','unit','LOW',?,'Development')",
        PRINCIPAL);
    jdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by)"
            + " VALUES (?,'test','CSI','Development','chromium','[]',?)",
        testId,
        PRINCIPAL);
    jdbc.update(
        "INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,"
            + "expires_at,document) VALUES ('session',?,?,?,'ACTING',now()+interval '10 minutes',"
            + "jsonb_build_object('owner',jsonb_build_object('fence',1),'scope',"
            + "jsonb_build_object('principalId',?,'csiId','CSI','environmentId','Development'),"
            + "'sourceSteps',jsonb_build_array(jsonb_build_object('stepId','password-step'))))",
        testId.toString(),
        PRINCIPAL,
        HASH,
        PRINCIPAL);
  }

  private static GuidedLedgerSeed materialization(JdbcTemplate assignments, JdbcTemplate rows) {
    assignment(assignments);
    String inputsHash = materializationRow(rows);
    return new GuidedLedgerSeed(rows, "session", "context", 1, inputsHash);
  }

  private static void assignment(JdbcTemplate jdbc) {
    String intent =
        "{\"sessionId\":\"session\",\"assignmentId\":\"assignment\",\"workerId\":\"worker\","
            + "\"scopeHash\":\""
            + HASH
            + "\",\"expectedFence\":0}";
    jdbc.update(
        "INSERT INTO studio_guided_assignments(session_id,assignment_id,scope_hash,worker_id,"
            + "expected_fence,intent) VALUES ('session','assignment',?,'worker',0,?::jsonb)",
        HASH,
        intent);
  }

  /** The session's one live materialization, carrying the declared secret input. */
  private static String materializationRow(JdbcTemplate jdbc) {
    ObjectNode inputs =
        (ObjectNode)
            CONTRACTS.parse(
                "{\"sessionId\":\"session\",\"scopeHash\":\""
                    + HASH
                    + "\",\"inputs\":[{\"inputId\":\"input-PASS\",\"sourceStepId\":"
                    + "\"password-step\",\"kind\":\"secretRef\",\"secretId\":\"PASS\","
                    + "\"intendedSlot\":\"fill.value\"}]}");
    for (var raw : inputs.path("inputs")) {
      ((ObjectNode) raw)
          .putObject("provenance")
          .put("referenceKind", "configuration")
          .put("configurationRevision", "1")
          .put("referenceId", "ref-PASS")
          .put("referenceName", "PASS")
          .put("kind", "secretRef")
          .put("stepId", "password-step")
          .put("intendedSlot", "fill.value");
    }
    ObjectNode closed = GuidedLedgerSeed.closedInputs(inputs, "1", "1");
    String inputsHash = GuidedContracts.hash(closed);
    jdbc.update(
        "INSERT INTO studio_guided_materializations(session_id,scope_hash,context_id,"
            + "context_revision,materialization_revision,worker_id,owner_fence,source_revision,"
            + "configuration_revision,authored_inputs_hash,authored_inputs,live) VALUES"
            + " ('session',?,'context',1,1,'worker',1,'1','1',?,?::jsonb,true)",
        HASH,
        inputsHash,
        closed.toString());
    return inputsHash;
  }

  private static void seedAdmissionAndManifest(
      JdbcTemplate jdbc, GuidedLedgerSeed ledger, UUID testId) {
    ledger.action(
        "admission", "password-step", 0, ledgerDocument("ADMITTED", 0), CONTRACTS.object());
    String manifest =
        "{\"testId\":\""
            + testId
            + "\",\"sourceRevision\":\"1\",\"configurationRevision\":\"1\","
            + "\"policy\":\"INPUT-POLICY-01-A\",\"sourceSteps\":[{\"stepId\":\"password-step\","
            + "\"text\":\"Enter <secret PASS> as password\"}],\"configurationReferences\":"
            + "[{\"referenceId\":\"ref-PASS\",\"referenceName\":\"PASS\",\"kind\":\"secretRef\","
            + "\"stepId\":\"password-step\",\"intendedSlot\":\"fill.value\"}]}";
    jdbc.update(
        "INSERT INTO studio_guided_source_manifests(session_id,scope_hash,manifest,manifest_hash)"
            + " VALUES ('session',?,?::jsonb,studio_publication_hash(?::jsonb))",
        HASH,
        manifest,
        manifest);
  }

  /** The admission as dispatched, holding the consumed secret reference (not terminal). */
  private static void consumedSecret(GuidedLedgerSeed ledger) {
    ledger.retire("admission");
    ObjectNode proposal = CONTRACTS.object();
    proposal
        .putObject("operation")
        .put("kind", "fill")
        .putObject("value")
        .put("kind", "secretRef")
        .put("sourceInputId", "input-PASS");
    ledger.action(
        "admission",
        "password-step",
        0,
        ledgerDocument("DISPATCHING", 1).put("ownerFence", 1).put("outcomeCode", "PENDING"),
        proposal);
  }

  private static ObjectNode ledgerDocument(String state, int dispatchCount) {
    ObjectNode document =
        CONTRACTS
            .object()
            .put("sessionId", "session")
            .put("state", state)
            .put("dispatchCount", dispatchCount);
    document.putObject("coordinate").put("stepId", "password-step").put("ordinal", 0);
    document.putObject("admission").put("admissionId", "admission");
    return document;
  }

  private static Scope guided(UUID testId) {
    return new Scope(
        Path.GUIDED,
        null,
        "session",
        "admission",
        PRINCIPAL,
        "CSI",
        "Development",
        testId,
        "PASS",
        "session:1",
        1L,
        "password-step",
        0);
  }
}
