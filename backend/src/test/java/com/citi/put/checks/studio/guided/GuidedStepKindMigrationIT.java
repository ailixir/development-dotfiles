package com.citi.put.checks.studio.guided;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * V33 ({@code V33__step_kind.sql}, ADR-SC-008 D2): the SQL rules that encoded the ten typed
 * operation kinds, the runner-reported target, argument slots, press inheritance and the
 * real-source assertion binding are replaced by the one {@code step} kind. The documents inserted
 * here are E5's frozen fixtures, not hand-written ones.
 */
@Testcontainers(disabledWithoutDocker = true)
class GuidedStepKindMigrationIT {
  private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:15-alpine");
  private static final GuidedContracts C = new GuidedContracts();
  private static JsonNode documents;

  @BeforeAll
  static void start() throws Exception {
    PG.start();
    documents =
        C.parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents");
  }

  @AfterAll
  static void stop() {
    PG.stop();
  }

  /** A fresh database migrated to {@code target}; the rest of the migrations are not applied. */
  private static DriverManagerDataSource database(String target) {
    String name = "step_kind_" + UUID.randomUUID().toString().replace("-", "");
    new JdbcTemplate(
            new DriverManagerDataSource(PG.getJdbcUrl(), PG.getUsername(), PG.getPassword()))
        .execute("CREATE DATABASE " + name);
    var source =
        new DriverManagerDataSource(
            PG.getJdbcUrl().replace(PG.getDatabaseName(), name),
            PG.getUsername(),
            PG.getPassword());
    Flyway.configure().dataSource(source).target(target).load().migrate();
    return source;
  }

  private static JdbcTemplate head() {
    return new JdbcTemplate(database("33"));
  }

  /** One connection with user triggers and foreign keys off; CHECK constraints stay enforced. */
  private static JdbcTemplate replica(DriverManagerDataSource source) {
    var single =
        new SingleConnectionDataSource(
            source.getUrl(), source.getUsername(), source.getPassword(), true);
    var jdbc = new JdbcTemplate(single);
    jdbc.execute("SET session_replication_role = replica");
    return jdbc;
  }

  @Test
  void v33AppliesOnAFreshDatabase() {
    var jdbc = head();
    assertThat(
            jdbc.queryForObject(
                "SELECT description FROM flyway_schema_history WHERE version='33' AND success",
                String.class))
        .isEqualTo("step kind");
  }

  @Test
  void aStagedV32DatabaseKeepsItsOldRowsAndTheKeySwapNeedsNoDeletion() {
    var source = database("32");
    var old = replica(source);
    old.update(
        ("INSERT INTO studio_guided_consumer_edges(session_id,consumer_admission_id,argument_slot,"
            + "binding_id,producer_admission_id,document) VALUES ('old','consumer','fill.value',"
            + "'binding','producer',?::jsonb)"),
        "{\"argumentSlot\":\"fill.value\",\"bindingId\":\"binding\","
            + "\"producerAdmissionId\":\"producer\",\"consumerAdmissionId\":\"consumer\"}");
    assertThat(
            old.queryForObject(
                ("SELECT count(*) FROM (SELECT 1 FROM studio_guided_consumer_edges GROUP BY"
                    + " session_id,consumer_admission_id,binding_id HAVING count(*)>1) d"),
                Integer.class))
        .as("an old action had one slot, so no (session, consumer, binding) duplicate exists")
        .isZero();
    Flyway.configure().dataSource(source).target("33").load().migrate();
    var jdbc = new JdbcTemplate(source);
    assertThat(
            jdbc.queryForObject("SELECT count(*) FROM studio_guided_consumer_edges", Integer.class))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForList(
                ("SELECT convalidated FROM pg_constraint WHERE"
                    + " conrelid='studio_guided_model_attempts'::regclass AND"
                    + " conname='ck_step_kind'"),
                Boolean.class))
        .containsExactly(false);
  }

  @Test
  void replayScopeAcceptsExactlyTheStepCapability() {
    var jdbc = head();
    String scope =
        "{\"principalId\":\"u\",\"csiId\":\"CSI-1\",\"environment\":\"Production\","
            + "\"capabilities\":%s,\"initialContext\":{\"kind\":\"initialBlank\"}}";
    assertThat(scope(jdbc, scope.formatted("[\"step\"]"))).isTrue();
    for (String refused :
        List.of(
            "[\"click\"]",
            "[\"navigate\",\"click\"]",
            "[\"step\",\"click\"]",
            "[]",
            "[\"observe\"]")) {
      assertThat(scope(jdbc, scope.formatted(refused))).as(refused).isFalse();
    }
  }

  private static boolean scope(JdbcTemplate jdbc, String document) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject("SELECT studio_publication_scope(?::jsonb)", Boolean.class, document));
  }

  @Test
  void consumerEdgesLoseTheSlotAndProducersAllowSeveralBindingsPerAdmission() {
    var jdbc = head();
    assertThat(
            jdbc.queryForList(
                ("SELECT column_name FROM information_schema.columns WHERE"
                    + " table_name='studio_guided_consumer_edges'"),
                String.class))
        .doesNotContain("argument_slot");
    assertThat(
            jdbc.queryForObject(
                ("SELECT string_agg(a.attname,',' ORDER BY a.attname) FROM pg_index i JOIN"
                    + " pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE"
                    + " i.indrelid='studio_guided_consumer_edges'::regclass AND i.indisprimary"),
                String.class))
        .isEqualTo("binding_id,consumer_admission_id,session_id");
    assertThat(
            jdbc.queryForObject(
                ("SELECT count(*) FROM pg_constraint con WHERE"
                    + " con.conrelid='studio_guided_producers'::regclass AND con.contype='u' AND"
                    + " (SELECT array_agg(att.attname::text ORDER BY att.attname) FROM"
                    + " pg_attribute att WHERE att.attrelid=con.conrelid AND"
                    + " att.attnum=ANY(con.conkey))=ARRAY['admission_id','session_id']"),
                Integer.class))
        .isZero();
  }

  private static String proposalWithCode(String code) {
    ObjectNode proposal = documents.path("action").deepCopy();
    ObjectNode operation = (ObjectNode) proposal.path("operation");
    operation.put("code", code);
    operation.put("sourceHash", GuidedContracts.hash(operation.path("code")));
    return proposal.toString();
  }

  private static void insertPublicationPreparation(
      JdbcTemplate jdbc, String proposal, JsonNode proof) {
    JsonNode action = documents.path("action");
    jdbc.update(
        ("INSERT INTO studio_guided_publication_preparations(session_id,preparation_id,context_id,"
            + "owner_fence,request_digest,evidence_hash,inputs_hash,materialization_revision,"
            + "source_manifest_hash,observation_hash,execution_evidence,proposal,proof,captured_at)"
            + " VALUES (?,?,?,?,?,?,?,1,?,NULL,?::jsonb,?::jsonb,?::jsonb,now())"),
        proof.path("sessionId").asText(),
        proof.path("preparationId").asText(),
        proof.path("contextId").asText(),
        proof.path("ownerFence").asInt(),
        proof.path("requestDigest").asText(),
        proof.path("evidenceHash").asText(),
        proof.path("authoredInputsHash").asText(),
        "a".repeat(64),
        action.path("executionEvidence").toString(),
        proposal,
        proof.toString());
  }

  @Test
  void closedKeyChecksTakeStepDocumentsAndRefuseTheOldTargetAndPressKeys() {
    var jdbc = replica(database("33"));
    JsonNode proof = documents.path("preparation");
    // The fixture proposal and proof insert as they are: no target, no press inheritance.
    insertWith(jdbc, documents.path("action").toString(), proof, "p-ok");
    ObjectNode withTarget = documents.path("action").deepCopy();
    withTarget.putObject("target").put("kind", "page");
    assertThatThrownBy(() -> insertWith(jdbc, withTarget.toString(), proof, "p-target"))
        .hasMessageContaining("ck_publication_preparation_shape");
    ObjectNode withPress = proof.deepCopy();
    withPress.putNull("pressInheritance");
    assertThatThrownBy(
            () -> insertWith(jdbc, documents.path("action").toString(), withPress, "p-press"))
        .hasMessageContaining("ck_publication_preparation_shape");
    ObjectNode withSource = proof.deepCopy();
    withSource.putObject("assertSourceBinding").put("bindingId", "b");
    assertThatThrownBy(
            () -> insertWith(jdbc, documents.path("action").toString(), withSource, "p-src"))
        .hasMessageContaining("ck_publication_preparation_shape");
    // A typed operation is not a step record (the SQL keeps the document closed, the schema the
    // kind).
    ObjectNode typedProposal = documents.path("action").deepCopy();
    typedProposal.putObject("target").put("kind", "node");
    assertThatThrownBy(() -> insertWith(jdbc, typedProposal.toString(), proof, "p-typed"))
        .hasMessageContaining("ck_publication_preparation_shape");
  }

  private static void insertWith(JdbcTemplate jdbc, String proposal, JsonNode proof, String id) {
    ObjectNode mine = proof.deepCopy();
    mine.put("preparationId", id);
    insertPublicationPreparation(jdbc, proposal, mine);
  }

  @Test
  void aSixteenKibCodeOfHardCharactersFitsAndAnOversizeDocumentDoesNot() {
    var jdbc = replica(database("33"));
    JsonNode proof = documents.path("preparation");
    // 16384 bytes of U+0001 are 98304 bytes as jsonb text: over the old 16384 cap, under 131072.
    String hard = "\u0001".repeat(16384);
    insertWith(jdbc, proposalWithCode(hard), proof, "p-hard");
    String mixed = "\n\"\\\t\u0001".repeat(3276) + "ab";
    assertThat(mixed.getBytes(java.nio.charset.StandardCharsets.UTF_8).length)
        .isLessThanOrEqualTo(16384);
    insertWith(jdbc, proposalWithCode(mixed), proof, "p-mixed");
    // The same fixture through the ledger-admission path (obligation admissions cap at 131072).
    jdbc.update(
        ("INSERT INTO"
            + " studio_guided_obligation_admissions(session_id,obligation_id,plan_revision,meaning,"
            + "proposal,proposal_digest,admission_key)"
            + " VALUES ('s','o',1,"
            + "'{\"obligationId\":\"o\",\"stepId\":\"x\",\"occurrence\":0}'::jsonb,?::jsonb,?,'k')"),
        proposalWithCode(hard),
        "b".repeat(64));
    // The cap is a document cap, independent of the schema's code cap: 22000 control characters are
    // 132000 bytes of jsonb text.
    assertThatThrownBy(
            () -> insertWith(jdbc, proposalWithCode("\u0001".repeat(22000)), proof, "p-big"))
        .hasMessageContaining("ck_publication_preparation_shape");
  }

  @Test
  void theStepIdentityHashIsTheSameInJavaAndSqlForHardCharacters() {
    var jdbc = head();
    List<String> codes =
        List.of(
            "plain",
            "line\nbreak",
            "tab\there",
            "quote\"inside",
            "back\\slash",
            "ctrl\u0001char",
            "del\u007fchar",
            "sep arator",
            "astral😀char");
    for (String origin : new String[] {null, "https://a.example"}) {
      for (String code : codes) {
        ObjectNode proposal = C.parse(proposalWithCode(code)).deepCopy();
        ObjectNode identity = C.object();
        identity.set("coordinate", proposal.path("coordinate"));
        if (origin == null) {
          identity.putNull("origin");
        } else {
          identity.put("origin", origin);
        }
        identity.set("operation", proposal.path("operation"));
        String java = GuidedContracts.hash(identity);
        String sql =
            jdbc.queryForObject(
                "SELECT studio_publication_hash(?::jsonb)", String.class, identity.toString());
        assertThat(sql).as("%s / %s", origin, code).isEqualTo(java);
      }
    }
    JsonNode ledger = documents.path("ledger");
    ObjectNode fixture = C.object();
    fixture.set("coordinate", documents.path("action").path("coordinate"));
    fixture.set("origin", documents.path("action").path("executionEvidence").path("origin"));
    fixture.set("operation", documents.path("action").path("operation"));
    assertThat(GuidedContracts.hash(fixture))
        .as("E5's frozen operationHash preimage is exactly {coordinate, origin, operation}")
        .isEqualTo(ledger.path("operationHash").asText());
  }

  @Test
  void aReceiptIsWrittenOnceWithTheOutcome() {
    var jdbc = replica(database("33"));
    jdbc.update(
        ("INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,"
            + "expires_at,document) VALUES ('s','00000000-0000-4000-8000-000000000009','p',?,"
            + "'ACTING',now()+interval '10 minutes','{}'::jsonb)"),
        "a".repeat(64));
    jdbc.update(
        ("INSERT INTO studio_guided_actions(admission_id,session_id,step_id,ordinal,document,"
            + "proposal,attempt_ordinal) VALUES ('a','s','st',0,?::jsonb,'{}'::jsonb,0)"),
        "{\"admission\":{\"admissionId\":\"a\"},\"sessionId\":\"s\",\"coordinate\":"
            + "{\"stepId\":\"st\",\"ordinal\":0},\"state\":\"DISPATCHING\",\"dispatchCount\":1}");
    String receipt =
        "{\"closedCode\":null,\"stepHash\":\""
            + "c".repeat(64)
            + "\",\"fenceCrossed\":true,"
            + "\"effects\":[{\"method\":\"click\",\"completed\":true}],\"effectsTruncated\":false,"
            + "\"offscreen\":false}";
    jdbc.execute("SET session_replication_role = origin");
    assertThat(
            jdbc.queryForObject(
                ("SELECT data_type FROM information_schema.columns WHERE table_name="
                    + "'studio_guided_actions' AND column_name='receipt'"),
                String.class))
        .isEqualTo("jsonb");
    assertThat(
            jdbc.queryForObject(
                ("SELECT is_nullable FROM information_schema.columns WHERE table_name="
                    + "'studio_guided_actions' AND column_name='receipt'"),
                String.class))
        .isEqualTo("YES");
    // Not with a state that has no outcome.
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_guided_actions SET receipt=?::jsonb WHERE admission_id='a'",
                    receipt))
        .hasMessageContaining("ck_guided_action_receipt");
    // With the outcome, once.
    jdbc.update(
        ("UPDATE studio_guided_actions SET receipt=?::jsonb,"
            + " document=jsonb_set(document,'{state}','\"SUCCEEDED\"') WHERE admission_id='a'"),
        receipt);
    assertThatThrownBy(
            () ->
                jdbc.update(
                    ("UPDATE studio_guided_actions SET receipt=?::jsonb WHERE"
                        + " admission_id='a'"),
                    receipt.replace("true", "false")))
        .hasMessageContaining("written once");
    // A malformed receipt is refused whatever the state.
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_guided_actions SET receipt='{\"stepHash\":\"x\"}'::jsonb WHERE"
                        + " admission_id='a'"))
        .isInstanceOf(RuntimeException.class);
  }

  @Test
  void modelAttemptsAcceptStepCodeAndNoLongerTheOldKinds() {
    var jdbc = head();
    String def =
        jdbc.queryForObject(
            ("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE"
                + " conrelid='studio_guided_model_attempts'::regclass AND conname='ck_step_kind'"),
            String.class);
    assertThat(def).contains("SOURCE_PLAN").contains("STEP_CODE").doesNotContain("NEXT_ACTION");
    assertThat(
            jdbc.queryForObject(
                ("SELECT count(*) FROM pg_constraint WHERE"
                    + " conrelid='studio_guided_model_attempts'::regclass AND contype='c' AND"
                    + " pg_get_constraintdef(oid) LIKE '%NEXT_ACTION%' AND"
                    + " pg_get_constraintdef(oid) NOT LIKE '%intent_path%'"),
                Integer.class))
        .isZero();
  }

  @Test
  void observationFactsLoseTheReadFields() {
    var jdbc = head();
    String observation =
        "{\"schemaVersion\":3,\"sessionId\":\"s\",\"documentId\":\"d\",\"generation\":0,"
            + "\"origin\":\"https://a.example\",\"scopeHash\":\""
            + "a".repeat(64)
            + "\",\"observedAt\":\"2026-01-01T00:00:00.000Z\",\"coverage\":{\"withheldRegions\":0,"
            + "\"unsupportedRegions\":0,\"passwordControls\":1},\"projection\":{\"projected\":false,"
            + "\"tier\":null,\"totalNodes\":1,\"shownNodes\":1,\"notShown\":0,\"outlineBytes\":10},"
            + "\"outline\":\"x\",\"facts\":{\"e1\":%s}}";
    String fact =
        "{\"role\":\"button\",\"name\":\"Go\",\"editable\":false,\"evidence\":\"Go\","
            + "\"evidenceSegments\":[],\"nameComplete\":true,\"ownTextComplete\":true%s}";
    assertThat(shape(jdbc, observation.formatted(fact.formatted("")))).isTrue();
    assertThat(shape(jdbc, observation.formatted(fact.formatted(",\"scopeRefs\":[\"e1\"]"))))
        .as("scopeRefs stays but cannot name the fact itself")
        .isFalse();
    assertThat(
            shape(
                jdbc,
                observation.formatted(
                    fact.formatted(
                        ",\"readScope\":{\"relation\":\"SAME_ROW_LABEL\",\"sourceRefs\":[\"e1\"]}"))))
        .isFalse();
    assertThat(shape(jdbc, observation.formatted(fact.formatted(",\"directTextAssertion\":true"))))
        .isFalse();
    assertThat(
            shape(
                jdbc,
                observation
                    .replace("\"outline\"", "\"readRuleId\":null,\"outline\"")
                    .formatted(fact.formatted(""))))
        .as("the shape function does not look at readRuleId; the closed-key check refuses it")
        .isTrue();
    assertThat(
            jdbc.queryForObject(
                ("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE"
                    + " conname='ck_publication_observation_closed'"),
                String.class))
        .doesNotContain("readRuleId")
        .contains("outline");
  }

  private static boolean shape(JdbcTemplate jdbc, String observation) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT studio_publication_observation_shape(?::jsonb)", Boolean.class, observation));
  }

  @Test
  void thePressChildLocatorAndAssertionMachineryIsGone() {
    var jdbc = head();
    assertThat(
            jdbc.queryForList(
                ("SELECT proname FROM pg_proc WHERE proname LIKE 'studio_wi6_%' ORDER BY"
                    + " proname"),
                String.class))
        .containsExactly("studio_wi6_fact_relations");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'tr_wi6_%'", Integer.class))
        .isZero();
  }

  @Test
  void theActionAttemptGuardDoesNotReadAStatementLimit() {
    var jdbc = head();
    assertThat(
            jdbc.queryForObject(
                ("SELECT prosrc FROM pg_proc WHERE proname='studio_015_action_attempt_guard'"),
                String.class))
        .doesNotContain("maxStatementsPerStep");
    assertThat(
            jdbc.queryForObject(
                ("SELECT prosrc FROM pg_proc WHERE proname='studio_guided_immutable_admission'"),
                String.class))
        .doesNotContain("assertionPassed");
  }
}
