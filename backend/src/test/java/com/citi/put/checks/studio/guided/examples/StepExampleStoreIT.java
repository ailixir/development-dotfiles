package com.citi.put.checks.studio.guided.examples;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.examples.StepExampleSnapshots.SnapshotContaminatedException;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.support.TestPostgresDatabase;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * V35 on the Flyway head: the insert guard (AC1), derived eligibility (AC3), the recorder (AC8) and
 * the frozen gate snapshot (AC7).
 *
 * <p>Parents (tests, revisions, receipts) are seeded with the replica role, which skips foreign-key
 * and constraint triggers, and with the CHECK constraints of the two parent tables dropped in this
 * throwaway database. The V35 triggers are switched to ENABLE ALWAYS so they still fire; they are
 * the thing under test.
 */
class StepExampleStoreIT {
  private static final TestPostgresDatabase POSTGRES =
      new TestPostgresDatabase().withDatabaseName("step_examples");
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String CSI = "100";

  private static JdbcTemplate jdbc;
  private static DriverManagerDataSource dataSource;
  private static StepExampleStore store;

  @BeforeAll
  static void migrate() {
    POSTGRES.start();
    Flyway.configure()
        .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
        .locations("classpath:db/migration")
        .load()
        .migrate();
    dataSource =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl() + "&options=-c%20session_replication_role=replica",
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    jdbc = new JdbcTemplate(dataSource);
    for (String table : List.of("ui_test_revisions", "ui_tests")) {
      for (String name :
          jdbc.queryForList(
              "SELECT conname FROM pg_constraint WHERE conrelid = ?::regclass AND contype = 'c'",
              String.class,
              table)) {
        jdbc.execute("ALTER TABLE " + table + " DROP CONSTRAINT \"" + name + "\"");
      }
    }
    jdbc.execute(
        "ALTER TABLE studio_step_examples ENABLE ALWAYS TRIGGER tr_studio_step_example_guard");
    jdbc.execute(
        "ALTER TABLE studio_step_example_snapshots ENABLE ALWAYS TRIGGER"
            + " tr_studio_step_example_snapshot_immutable");
    store = new StepExampleStore(jdbc);
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  @BeforeEach
  void clean() {
    jdbc.execute(
        "TRUNCATE studio_step_examples, studio_step_example_snapshots, studio_step_receipts,"
            + " ui_test_revisions, ui_tests CASCADE");
  }

  // ---- AC1 -------------------------------------------------------------------------------

  @Test
  void v35IsForwardOnlyAndTheGuardAcceptsOnlyAProvenStep() {
    assertThat(
            jdbc.queryForObject(
                "SELECT description FROM flyway_schema_history WHERE version = '35'", String.class))
        .isEqualTo("step examples");
    Seed s = seed("Open the page", "await page.goto(inputs['u']);", Map.of());

    assertThat(insertRaw(s, s.proof, s.stepHash, s.sourceHash, CSI)).isEqualTo(1);
  }

  @Test
  void theGuardRejectsEveryMismatchWithTheReceiptOrTheArtifact() {
    Seed s = seed("Open the page", "await page.goto(inputs['u']);", Map.of());
    String other = "f".repeat(64);

    assertGuardRejects(() -> insertRaw(s, s.proof, s.stepHash, s.sourceHash, "999"));
    assertGuardRejects(() -> insertRaw(s, UUID.randomUUID(), s.stepHash, s.sourceHash, CSI));
    assertGuardRejects(() -> insertRaw(s, s.proof, other, s.sourceHash, CSI));
    assertGuardRejects(() -> insertRaw(s, s.proof, s.stepHash, other, CSI));

    jdbc.update(
        "UPDATE studio_step_receipts SET status = 'FAILED' WHERE revision_id = ?", s.revision);
    assertGuardRejects(() -> insertRaw(s, s.proof, s.stepHash, s.sourceHash, CSI));
    jdbc.update(
        "UPDATE studio_step_receipts SET status = 'NOT_RUN' WHERE revision_id = ?", s.revision);
    assertGuardRejects(() -> insertRaw(s, s.proof, s.stepHash, s.sourceHash, CSI));
    jdbc.update("DELETE FROM studio_step_receipts WHERE revision_id = ?", s.revision);
    assertGuardRejects(() -> insertRaw(s, s.proof, s.stepHash, s.sourceHash, CSI));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_step_examples", Integer.class))
        .isZero();
  }

  @Test
  void anExampleCannotBeUpdated() {
    Seed s = seed("Open the page", "await page.goto(inputs['u']);", Map.of());
    insertRaw(s, s.proof, s.stepHash, s.sourceHash, CSI);
    assertThatThrownBy(() -> jdbc.update("UPDATE studio_step_examples SET code = 'x'"))
        .hasMessageContaining("immutable");
  }

  // ---- AC3 -------------------------------------------------------------------------------

  @Test
  void eligibilityIsDerivedFromTheLiveReceiptsTheHeadAndTheCsi() {
    Seed s = seed("Open the page", "await page.goto(inputs['u']);", Map.of());
    insertRaw(s, s.proof, s.stepHash, s.sourceHash, CSI);
    assertThat(store.eligibleAll()).hasSize(1);

    // a later FAILED receipt
    jdbc.update(
        "UPDATE studio_step_receipts SET status = 'FAILED' WHERE revision_id = ?", s.revision);
    assertThat(store.eligibleAll()).isEmpty();
    jdbc.update(
        "UPDATE studio_step_receipts SET status = 'PASSED' WHERE revision_id = ?", s.revision);
    assertThat(store.eligibleAll()).hasSize(1);

    // a replaced step hash
    jdbc.update(
        "UPDATE studio_step_receipts SET step_hash = ? WHERE revision_id = ?",
        "e".repeat(64),
        s.revision);
    assertThat(store.eligibleAll()).isEmpty();
    jdbc.update(
        "UPDATE studio_step_receipts SET step_hash = ? WHERE revision_id = ?",
        s.stepHash,
        s.revision);

    // a candidate revision is still the head; a superseded one is not
    UUID next = UUID.randomUUID();
    jdbc.update(
        "UPDATE ui_tests SET confirmed_revision_id = NULL, candidate_revision_id = ? WHERE id = ?",
        next,
        s.test);
    assertThat(store.eligibleAll()).isEmpty();
    jdbc.update(
        "UPDATE ui_tests SET candidate_revision_id = ?, confirmed_revision_id = NULL WHERE id = ?",
        s.revision,
        s.test);
    assertThat(store.eligibleAll()).hasSize(1);
    jdbc.update(
        "UPDATE ui_tests SET candidate_revision_id = ?, confirmed_revision_id = ? WHERE id = ?",
        next,
        s.revision,
        s.test);
    assertThat(store.eligibleAll()).hasSize(1);

    // a deleted test
    jdbc.update("UPDATE ui_tests SET deleted_at = now() WHERE id = ?", s.test);
    assertThat(store.eligibleAll()).isEmpty();
  }

  // ---- AC8 -------------------------------------------------------------------------------

  @Test
  void theRecorderStoresOnePassedStepAndSkipsFailedAndTamperedOnes() {
    Seed first =
        seed(
            "Open the \"Orders\" page",
            "await page.getByRole('link', {name: 'Orders'}).click();",
            Map.of());
    UUID revision = first.revision;
    addStep(
        first,
        1,
        "Click Save",
        "await page.getByRole('button', {name: 'Save'}).click();",
        "FAILED",
        true);
    addStep(
        first,
        2,
        "Click Next",
        "await page.getByRole('button', {name: 'Next'}).click();",
        "PASSED",
        false);
    addStep(
        first,
        3,
        "Click Done",
        "await page.getByRole('button', {name: 'Done'}).click();",
        "PASSED",
        true);

    int stored = recorder().recordProven(revision);

    assertThat(stored).isEqualTo(2);
    assertThat(
            jdbc.queryForList(
                "SELECT step_ordinal FROM studio_step_examples ORDER BY 1", Integer.class))
        .containsExactly(0, 3);
    var row =
        jdbc.queryForMap(
            "SELECT step_text, origin_host, csi_id FROM studio_step_examples WHERE step_ordinal = 0");
    assertThat(row.get("step_text")).isEqualTo("Open the <value1> page");
    assertThat(row.get("origin_host")).isEqualTo("orders.example.test");
    assertThat(row.get("csi_id")).isEqualTo(CSI);
    assertThat(recorder().recordProven(revision)).isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_step_examples", Integer.class))
        .isEqualTo(2);
  }

  @Test
  void aCanaryInEveryAuthoredPlaceIsAbsentFromEveryStoredColumn() {
    String canary = StepExampleSanitizerTest.CANARY;
    String variables =
        "[{\"name\":\"pw\",\"kind\":\"plain\",\"value\":\""
            + canary
            + "\"},"
            + "{\"name\":\"vault\",\"kind\":\"secretRef\",\"secretId\":\"LOGIN_PW\"}]";
    Seed s =
        seed(
            "Log in with <secret LOGIN_PW> and note \"" + canary + "\" for " + canary,
            "await page.getByLabel('Password').fill(secrets['LOGIN_PW']);\n"
                + "await page.getByLabel('Note').fill('"
                + canary
                + "');",
            Map.of("variables", variables));

    assertThat(recorder().recordProven(s.revision)).isEqualTo(1);

    String everything =
        jdbc.queryForObject(
            "SELECT row_to_json(e)::text FROM studio_step_examples e", String.class);
    for (String variant : StepExampleSanitizerTest.VARIANTS) {
      assertThat(everything).doesNotContain(variant);
    }
    assertThat(everything).contains("secrets[").contains("LOGIN_PW");
  }

  @Test
  void anUnsafeStepIsSkippedWithoutFailing() {
    Seed s = seed("Open it", "const k = 'AKIA" + "ABCDEFGHIJKLMNOP';", Map.of());
    assertThat(recorder().recordProven(s.revision)).isZero();
  }

  @Test
  void afterCommitRecordsOnlyOnCommitAndNeverThrows() {
    Seed s = seed("Open the page", "await page.goto(inputs['u']);", Map.of());
    var tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    var recorder = recorder();

    tx.executeWithoutResult(
        status -> {
          recorder.recordProvenAfterCommit(s.revision);
          status.setRollbackOnly();
        });
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_step_examples", Integer.class))
        .isZero();

    tx.executeWithoutResult(status -> recorder.recordProvenAfterCommit(s.revision));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_step_examples", Integer.class))
        .isEqualTo(1);

    var failing =
        new StepExampleRecorder(
            jdbc,
            new StepExampleStore(jdbc) {
              @Override
              public boolean insert(NewExample e) {
                throw new IllegalStateException("boom");
              }
            },
            MAPPER,
            new DataSourceTransactionManager(dataSource));
    jdbc.update("DELETE FROM studio_step_examples");
    failing.recordProvenAfterCommit(s.revision);
  }

  // ---- AC7 -------------------------------------------------------------------------------

  @Test
  void theGateSnapshotExcludesEveryGateStepAndSmokeStepAndIsFrozen() throws Exception {
    JsonNode table =
        MAPPER.readTree(
            Files.readString(Path.of("..", "frontend", "e2e", "realsite-gate", "gate-table.json")));
    List<String> gateTexts = new ArrayList<>();
    int positives = 0;
    int controls = 0;
    for (JsonNode test : table.path("tests")) {
      positives += test.path("kind").asText().equals("positive") ? 1 : 0;
      controls += test.path("kind").asText().equals("control") ? 1 : 0;
      test.path("steps").forEach(step -> gateTexts.add(step.asText()));
    }
    assertThat(positives).isEqualTo(14);
    assertThat(controls).isEqualTo(3);
    List<String> smoke =
        List.of("Open the navigation wording page", "Check that the footer lists \"About\"");
    List<String> excluded = new ArrayList<>(gateTexts);
    excluded.addAll(smoke);

    List<UUID> excludedExamples = new ArrayList<>();
    int n = 0;
    for (String text : excluded) {
      n++;
      var cleaned =
          StepExampleSanitizer.forStore(
              text, "await page.locator('#g" + n + "').click();", Map.of());
      if (cleaned.isPresent()) {
        excludedExamples.add(seedAndInsert(text, "await page.locator('#g" + n + "').click();"));
      }
    }
    assertThat(excludedExamples).hasSizeGreaterThan(40);
    UUID keepA =
        seedAndInsert(
            "Scroll to the invoices table", "await page.locator('#inv').scrollIntoViewIfNeeded();");
    UUID keepB = seedAndInsert("Open the billing settings", "await page.locator('#bill').click();");

    var snapshots = new StepExampleSnapshots(store);
    var frozen = snapshots.freeze(excluded);

    assertThat(frozen.size()).isEqualTo(2);
    List<UUID> members =
        jdbc.queryForList(
            "SELECT unnest(example_ids) FROM studio_step_example_snapshots", UUID.class);
    assertThat(members).containsExactlyInAnyOrder(keepA, keepB);
    List<UUID> sorted = members.stream().sorted().toList();
    assertThat(frozen.hash()).isEqualTo(StepExampleSnapshots.hash(sorted));
    snapshots.verify(frozen.id(), excluded);

    // frozen: later inserts and later receipt changes do not move a snapshot's members
    seedAndInsert("Scroll to the billing table", "await page.locator('#late').click();");
    jdbc.update(
        "UPDATE studio_step_receipts SET status = 'FAILED' WHERE revision_id ="
            + " (SELECT revision_id FROM studio_step_examples WHERE id = ?)",
        keepA);
    assertThat(store.allSnapshotMembers(frozen.id()).orElseThrow())
        .extracting(StepExampleStore.Candidate::id)
        .containsExactlyInAnyOrder(keepA, keepB);

    // immutable
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_step_example_snapshots SET snapshot_hash = ?", "a".repeat(64)))
        .hasMessageContaining("immutable");
    assertThatThrownBy(() -> jdbc.update("DELETE FROM studio_step_example_snapshots"))
        .hasMessageContaining("immutable");

    // verify refuses a snapshot that holds a gate step
    UUID contaminated =
        store.insertSnapshot(
            "b".repeat(64), List.of(excludedExamples.get(0), keepB).stream().sorted().toList());
    assertThatThrownBy(() -> snapshots.verify(contaminated, excluded))
        .isInstanceOf(SnapshotContaminatedException.class)
        .satisfies(
            e ->
                assertThat(((SnapshotContaminatedException) e).exampleIds())
                    .containsExactly(excludedExamples.get(0)));

    assertThatThrownBy(() -> snapshots.freeze(List.of()))
        .isInstanceOf(IllegalArgumentException.class);
  }

  // ---- helpers ---------------------------------------------------------------------------

  private static void assertGuardRejects(
      org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
    assertThatThrownBy(call).hasMessageContaining("needs a PASSED proof receipt");
  }

  private static StepExampleRecorder recorder() {
    return new StepExampleRecorder(
        jdbc, store, MAPPER, new DataSourceTransactionManager(dataSource));
  }

  /** One test, one revision with step 0, one PASSED receipt for it. */
  record Seed(
      UUID test,
      UUID revision,
      UUID proof,
      String stepHash,
      String sourceHash,
      String stepId,
      ObjectNode artifact,
      ArrayNode authoringSteps) {}

  private static Seed seed(String stepText, String code, Map<String, Object> testOverrides) {
    UUID test = UUID.randomUUID();
    UUID revision = UUID.randomUUID();
    ObjectNode artifact = MAPPER.createObjectNode();
    artifact.putArray("steps");
    ArrayNode guards = artifact.putArray("guards");
    guards.addObject().put("guardId", "g0").putNull("origin");
    guards.addObject().put("guardId", "g1").put("origin", "https://Orders.Example.test");
    ArrayNode authoringSteps = MAPPER.createArrayNode();
    Map<String, Object> testRow = new HashMap<>(testOverrides);
    testRow.putIfAbsent("id", test);
    testRow.putIfAbsent("csi_id", CSI);
    testRow.putIfAbsent("name", "t");
    testRow.putIfAbsent("environment", "dev");
    testRow.putIfAbsent("browser", "chrome");
    testRow.putIfAbsent("steps", "[]");
    testRow.put("confirmed_revision_id", revision);
    insertRow("ui_tests", testRow);
    Seed s = new Seed(test, revision, UUID.randomUUID(), "", "", "", artifact, authoringSteps);
    Seed withStep = addStepTo(s, 0, stepText, code, "PASSED", true, "g1");
    insertRow(
        "ui_test_revisions",
        Map.of(
            "id",
            revision,
            "test_id",
            test,
            "csi_id",
            CSI,
            "artifact",
            artifact.toString(),
            "authoring",
            authoring(authoringSteps)));
    insertReceipt(withStep, 0, "PASSED", withStep.stepHash);
    return withStep;
  }

  private static String authoring(ArrayNode steps) {
    ObjectNode authoring = MAPPER.createObjectNode().put("authoringSchemaVersion", "2");
    authoring.set("steps", steps);
    return authoring.toString();
  }

  private static Seed addStepTo(
      Seed s,
      int ordinal,
      String text,
      String code,
      String status,
      boolean honestHash,
      String guard) {
    ObjectNode operation = MAPPER.createObjectNode().put("kind", "step").put("code", code);
    operation.putArray("captures");
    operation.putArray("uses");
    String sourceHash = GuidedContracts.hash(TextNode.valueOf(code));
    operation.put("sourceHash", sourceHash);
    String stepId = UUID.randomUUID().toString();
    ObjectNode step = ((ArrayNode) s.artifact.get("steps")).addObject();
    step.put("stepIndex", ordinal).put("stepId", stepId);
    step.putArray("operations").addObject().put("guardId", guard).set("operation", operation);
    s.authoringSteps.addObject().put("id", stepId).put("text", text);
    return new Seed(
        s.test,
        s.revision,
        s.proof,
        GuidedContracts.hash(operation),
        sourceHash,
        stepId,
        s.artifact,
        s.authoringSteps);
  }

  /** Adds a later step to an already inserted revision (the artifact is rewritten in place). */
  private static void addStep(
      Seed s, int ordinal, String text, String code, String status, boolean honestReceiptHash) {
    Seed added = addStepTo(s, ordinal, text, code, status, honestReceiptHash, "g0");
    jdbc.update(
        "UPDATE ui_test_revisions SET artifact = ?::jsonb, authoring = ?::jsonb WHERE id = ?",
        s.artifact.toString(),
        authoring(s.authoringSteps),
        s.revision);
    insertReceipt(added, ordinal, status, honestReceiptHash ? added.stepHash : "d".repeat(64));
  }

  private static void insertReceipt(Seed s, int ordinal, String status, String stepHash) {
    jdbc.update(
        "INSERT INTO studio_step_receipts"
            + " (revision_id, step_ordinal, proof_execution_id, status, step_hash)"
            + " VALUES (?, ?, ?, ?, ?)",
        s.revision,
        ordinal,
        s.proof,
        status,
        stepHash);
  }

  private static int insertRaw(Seed s, UUID proof, String stepHash, String sourceHash, String csi) {
    return jdbc.update(
        "INSERT INTO studio_step_examples (csi_id, revision_id, step_ordinal, proof_execution_id,"
            + " step_hash, source_hash, step_text, code) VALUES (?, ?, 0, ?, ?, ?, 'Open', 'await x();')",
        csi,
        s.revision,
        proof,
        stepHash,
        sourceHash);
  }

  private static UUID seedAndInsert(String text, String code) {
    Seed s = seed(text, code, Map.of());
    var cleaned = StepExampleSanitizer.forStore(text, code, Map.of()).orElseThrow();
    jdbc.update(
        "INSERT INTO studio_step_examples (csi_id, revision_id, step_ordinal, proof_execution_id,"
            + " step_hash, source_hash, step_text, code) VALUES (?, ?, 0, ?, ?, ?, ?, ?)",
        CSI,
        s.revision,
        s.proof,
        s.stepHash,
        s.sourceHash,
        cleaned.stepText(),
        cleaned.code());
    return jdbc.queryForObject(
        "SELECT id FROM studio_step_examples WHERE revision_id = ?", UUID.class, s.revision);
  }

  /** Inserts a row, filling every other NOT NULL column that has no default with a typed filler. */
  private static void insertRow(String table, Map<String, Object> values) {
    List<String> columns = new ArrayList<>(values.keySet());
    List<String> marks = new ArrayList<>();
    List<Object> args = new ArrayList<>();
    for (String column : columns) {
      String type =
          jdbc.queryForObject(
              "SELECT data_type FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
              String.class,
              table,
              column);
      marks.add(type.equals("jsonb") ? "?::jsonb" : "?");
      args.add(values.get(column));
    }
    for (Map<String, Object> c :
        jdbc.queryForList(
            "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns"
                + " WHERE table_name = ? AND is_nullable = 'NO' AND column_default IS NULL",
            table)) {
      String name = (String) c.get("column_name");
      if (values.containsKey(name)) {
        continue;
      }
      columns.add(name);
      marks.add(
          switch ((String) c.get("data_type")) {
            case "uuid" -> "gen_random_uuid()";
            case "jsonb" -> "'{}'::jsonb";
            case "ARRAY" -> "'{}'";
            case "integer", "bigint", "smallint", "numeric" -> "0";
            case "boolean" -> "false";
            case "timestamp with time zone", "timestamp without time zone" -> "now()";
            default ->
                c.get("character_maximum_length") instanceof Integer length && length >= 20
                    ? "left(gen_random_uuid()::text, 20)"
                    : "'x'";
          });
    }
    jdbc.update(
        "INSERT INTO "
            + table
            + " (\""
            + String.join("\", \"", columns)
            + "\") VALUES ("
            + String.join(", ", marks)
            + ")",
        args.toArray());
  }
}
