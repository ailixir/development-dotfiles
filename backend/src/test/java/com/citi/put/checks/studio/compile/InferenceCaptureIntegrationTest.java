package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioConflictException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Real database proof of capture atomicity, immutable identity, scope and passing evidence. */
@SpringBootTest
@ActiveProfiles("local")
class InferenceCaptureIntegrationTest {
  private static final String OWNER = "inference-capture@citi.com";
  private static final String CSI = "71024";
  private static final String OTHER_CSI = "71025";
  private static final String FINGERPRINT = "a".repeat(64);
  private static final ObjectMapper JSON = new ObjectMapper();
  @Autowired private CompileStateService states;
  @Autowired private AuthoringLimits limits;
  @Autowired private CredentialPatternScreen screen;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private PlatformTransactionManager manager;
  private UUID testId;

  @BeforeEach
  void seed() {
    jdbc.update(
        """
        INSERT INTO users(id,sso_id,name,email,is_active)
        VALUES(gen_random_uuid(),'inference-capture','Inference',?,true)
        ON CONFLICT(email) DO NOTHING
        """,
        OWNER);
    jdbc.update(
        """
        INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment,status)
        VALUES(?,'Inference','Ops','HIGH',?,'Production','OPERATIONAL') ON CONFLICT(id) DO NOTHING
        """,
        CSI,
        OWNER);
    testId = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by)
        VALUES(?,'Captured',?,'Production','chromium','["Open home","Check saved"]'::jsonb,'[]'::jsonb,?)
        """,
        testId,
        CSI,
        OWNER);
  }

  @Test
  void capturePersistsExactSourceBeforeLaterEditAndRejectsItsLateCandidate() {
    var capture = capture("FULL", false);
    jdbc.update(
        "UPDATE ui_tests SET steps='[\"Changed\"]',source_revision=source_revision+1 WHERE id=?",
        testId);
    assertThat(capture.inputs().orderedSource()).containsExactly("Open home", "Check saved");
    assertThat(
            jdbc.queryForObject(
                "SELECT source::text FROM ui_test_compile_requests WHERE request_id=?",
                String.class,
                capture.request().requestId()))
        .contains("Open home")
        .doesNotContain("Changed");
    assertThat(states.publishCandidate(testId, capture.request(), candidate(capture)))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);
  }

  @Test
  void editorCannotSlipBetweenLockedSourceReadAndRequestRevisionTag() throws Exception {
    CountDownLatch insideCapture = new CountDownLatch(1);
    CountDownLatch releaseCapture = new CountDownLatch(1);
    var blockingScreen =
        new CredentialPatternScreen() {
          @Override
          public void requireNoInlineCredentials(List<String> source) {
            insideCapture.countDown();
            try {
              if (!releaseCapture.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("barrier timeout");
              }
            } catch (InterruptedException e) {
              Thread.currentThread().interrupt();
              throw new IllegalStateException(e);
            }
          }
        };
    try (var pool = Executors.newFixedThreadPool(2)) {
      var compilation =
          pool.submit(
              () ->
                  states.capture(
                      testId,
                      OWNER,
                      limits,
                      blockingScreen,
                      FINGERPRINT,
                      Duration.ofSeconds(30),
                      "FULL",
                      false,
                      null,
                      null,
                      null));
      assertThat(insideCapture.await(5, TimeUnit.SECONDS)).isTrue();
      var edit =
          pool.submit(
              () ->
                  jdbc.update(
                      "UPDATE ui_tests SET steps='[\"New\"]',"
                          + "source_revision=source_revision+1 WHERE id=?",
                      testId));
      assertThat(edit.isDone()).isFalse();
      releaseCapture.countDown();
      var captured = compilation.get(5, TimeUnit.SECONDS);
      edit.get(5, TimeUnit.SECONDS);
      assertThat(captured.request().sourceRevision()).isEqualTo(1);
      assertThat(captured.inputs().orderedSource()).containsExactly("Open home", "Check saved");
      assertThat(states.publishCandidate(testId, captured.request(), candidate(captured)))
          .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);
    } finally {
      releaseCapture.countDown();
    }
  }

  @Test
  void versionedCaptureRequiresCutoverAndDoesNotChangeDraftOnRefusal() {
    assertThatThrownBy(
            () ->
                states.capture(
                    testId,
                    OWNER,
                    limits,
                    screen,
                    FINGERPRINT,
                    Duration.ofSeconds(30),
                    "AUTO",
                    true,
                    1L,
                    1L,
                    null))
        .isInstanceOf(StudioConflictException.class);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_compile_requests WHERE test_id=?",
                Integer.class,
                testId))
        .isZero();
  }

  @Test
  void cutoverSeparatesIdenticalRequestsButSameRequestPublicationIsIdempotent() {
    withCutover(
        () -> {
          var first = capture("FULL", false);
          states.publishCandidate(testId, first.request(), candidate(first));
          UUID firstRevision = revision();
          states.publishCandidate(testId, first.request(), candidate(first));
          assertThat(revision()).isEqualTo(firstRevision);
          var second = capture("FULL", false);
          states.publishCandidate(testId, second.request(), candidate(second));
          assertThat(revision()).isNotEqualTo(firstRevision);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM ui_test_revisions WHERE test_id=?",
                      Integer.class,
                      testId))
              .isEqualTo(2);
        });
  }

  @Test
  void cutoverPublisherPersistsReferencePolicyForContextAwareDraft() {
    // Story 10.23 D3: after V19 the captured writer must carry the V24 reference policy and the V23
    // derivation version, or a V21-authored draft (whose authoring the V21 trigger copies into the
    // revision) violates ck_ui_test_revisions_v2_derivation_version and cannot publish.
    withCutover(
        () -> {
          jdbc.update(
              "UPDATE ui_tests SET authoring='{\"authoringSchemaVersion\":\"2\",\"steps\":[]}'"
                  + " WHERE id=?",
              testId);
          var captured = capture("FULL", false);
          var plain = candidate(captured);
          String policy = "{\"policyVersion\":2,\"steps\":[]}";
          var candidate =
              new CandidateRevision(
                  plain.configurationRevision(),
                  plain.source(),
                  plain.sourceHash(),
                  plain.artifact(),
                  plain.artifactHash(),
                  plain.artifactSchemaVersion(),
                  plain.configuration(),
                  plain.references(),
                  plain.provenance(),
                  plain.createdBy(),
                  policy,
                  VersionedIntentDeriver.CURRENT_VERSION);
          assertThat(states.publishCandidate(testId, captured.request(), candidate))
              .isEqualTo(PublishResult.PUBLISHED);
          var row =
              jdbc.queryForMap(
                  "SELECT reference_policy = CAST(? AS jsonb) AS policy,"
                      + " intent_derivation_version AS version, compile_request_id"
                      + " FROM ui_test_revisions WHERE id=?",
                  policy,
                  revision());
          assertThat(row.get("policy")).isEqualTo(Boolean.TRUE);
          assertThat(row.get("version")).isEqualTo(VersionedIntentDeriver.CURRENT_VERSION);
          assertThat(row.get("compile_request_id")).isEqualTo(captured.request().requestId());
        });
  }

  @Test
  void passingFullEvidencePermitsOnlyChangedSuffixAndMissingRuntimeEvidenceDoesNot() {
    withCutover(
        () -> {
          UUID firstId = UUID.randomUUID();
          UUID lastId = UUID.randomUUID();
          authoring(firstId, lastId, "Check saved", "STEP_SCOPED");
          var first = capture("FULL", true);
          states.publishCandidate(testId, first.request(), candidate(first));
          UUID baseline = revision();
          states.confirm(
              testId,
              baseline,
              candidate(first).artifactHash(),
              first.request().sourceRevision(),
              first.request().configurationRevision(),
              OWNER);
          fullPass(baseline);
          authoring(firstId, lastId, "Check updated", "STEP_SCOPED");
          var incremental = capture("AUTO", true);
          assertThat(incremental.plan().mode().name()).isEqualTo("INCREMENTAL");
          assertThat(incremental.plan().writableIds()).containsExactly(lastId);
          assertThat(incremental.plan().reusedPrefix()).isEqualTo(1);
          jdbc.update(
              "UPDATE ui_test_executions SET runtime_versions=NULL WHERE revision_id=?", baseline);
          assertThat(capture("AUTO", true).plan().mode().name()).isEqualTo("FULL");
        });
  }

  @Test
  void changingOnlyScopeCannotReuseAnIdenticalPassingArtifact() {
    withCutover(
        () -> {
          UUID firstId = UUID.randomUUID();
          UUID lastId = UUID.randomUUID();
          authoring(firstId, lastId, "Check saved", "STEP_SCOPED");
          var first = capture("FULL", true);
          states.publishCandidate(testId, first.request(), candidate(first));
          UUID baseline = revision();
          states.confirm(
              testId,
              baseline,
              candidate(first).artifactHash(),
              first.request().sourceRevision(),
              first.request().configurationRevision(),
              OWNER);
          fullPass(baseline);
          authoring(firstId, lastId, "Check saved", "UNKNOWN");
          var changed = capture("AUTO", true);
          assertThat(changed.plan().mode().name()).isEqualTo("FULL");
          assertThat(changed.plan().reason()).isEqualTo("SCOPE_UNKNOWN");
        });
  }

  @Test
  void flagOffReportsIncrementalDisabledBeforeScopeOrLegacyReasons() {
    // 10.20 gate ISSUE-1 / contract §3: INCREMENTAL_DISABLED ranks second, after EXPLICIT_FULL.
    var legacy = capture("AUTO", false);
    assertThat(legacy.plan().mode().name()).isEqualTo("FULL");
    assertThat(legacy.plan().reason()).isEqualTo("INCREMENTAL_DISABLED");
    withCutover(
        () -> {
          UUID firstId = UUID.randomUUID();
          UUID lastId = UUID.randomUUID();
          authoring(firstId, lastId, "Check saved", "STEP_SCOPED");
          var first = capture("FULL", false);
          states.publishCandidate(testId, first.request(), candidate(first));
          UUID baseline = revision();
          states.confirm(
              testId,
              baseline,
              candidate(first).artifactHash(),
              first.request().sourceRevision(),
              first.request().configurationRevision(),
              OWNER);
          fullPass(baseline);
          authoring(firstId, lastId, "Check saved", "UNKNOWN");
          var changed = capture("AUTO", false);
          assertThat(changed.plan().mode().name()).isEqualTo("FULL");
          assertThat(changed.plan().reason()).isEqualTo("INCREMENTAL_DISABLED");
          assertThat(
                  jdbc.queryForObject(
                      "SELECT compilation_plan->>'reason' FROM ui_test_compile_requests"
                          + " WHERE request_id=?",
                      String.class,
                      changed.request().requestId()))
              .isEqualTo("INCREMENTAL_DISABLED");
        });
  }

  @Test
  void passingEvidenceRecordedUnderAnotherCsiIsNeverABaseline() {
    withCutover(
        () -> {
          seedCsi(OTHER_CSI);
          UUID firstId = UUID.randomUUID();
          UUID lastId = UUID.randomUUID();
          authoring(firstId, lastId, "Check saved", "STEP_SCOPED");
          var first = capture("FULL", true);
          states.publishCandidate(testId, first.request(), candidate(first));
          UUID baseline = revision();
          states.confirm(
              testId,
              baseline,
              candidate(first).artifactHash(),
              first.request().sourceRevision(),
              first.request().configurationRevision(),
              OWNER);
          fullPass(baseline);
          jdbc.update(
              "UPDATE ui_test_executions SET csi_id=? WHERE revision_id=?", OTHER_CSI, baseline);
          authoring(firstId, lastId, "Check updated", "STEP_SCOPED");
          var foreign = capture("AUTO", true);
          assertThat(foreign.plan().mode().name()).isEqualTo("FULL");
          assertThat(foreign.plan().reason()).isEqualTo("NO_ELIGIBLE_BASELINE");
          assertThat(foreign.baseline()).isNull();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT baseline_revision_id FROM ui_test_compile_requests"
                          + " WHERE request_id=?",
                      UUID.class,
                      foreign.request().requestId()))
              .isNull();
          // Control: the same revision with same-CSI passing evidence is eligible.
          fullPass(baseline);
          assertThat(capture("AUTO", true).plan().mode().name()).isEqualTo("INCREMENTAL");
        });
  }

  @Test
  void anIdenticalConfirmedPassingRevisionOfAnotherCsisTestIsNeverABaseline() {
    withCutover(
        () -> {
          seedCsi(OTHER_CSI);
          UUID firstId = UUID.randomUUID();
          UUID lastId = UUID.randomUUID();
          UUID ownTest = testId;
          UUID foreignTest = UUID.randomUUID();
          jdbc.update(
              """
              INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by)
              VALUES(?,'Foreign',?,'Production','chromium','["Open home","Check saved"]'::jsonb,
                '[]'::jsonb,?)
              """,
              foreignTest,
              OTHER_CSI,
              OWNER);
          testId = foreignTest;
          authoring(firstId, lastId, "Check saved", "STEP_SCOPED");
          var foreign = capture("FULL", true);
          states.publishCandidate(testId, foreign.request(), candidate(foreign));
          UUID foreignRevision = revision();
          states.confirm(
              testId,
              foreignRevision,
              candidate(foreign).artifactHash(),
              foreign.request().sourceRevision(),
              foreign.request().configurationRevision(),
              OWNER);
          fullPass(foreignRevision);
          testId = ownTest;
          authoring(firstId, lastId, "Check updated", "STEP_SCOPED");
          var own = capture("AUTO", true);
          assertThat(own.plan().mode().name()).isEqualTo("FULL");
          assertThat(own.plan().reason()).isEqualTo("NO_ELIGIBLE_BASELINE");
          assertThat(own.baseline()).isNull();
        });
  }

  @Test
  void confirmationBindsTheCapturedScopeOnBothConfirmationPaths() {
    withCutover(
        () -> {
          UUID firstId = UUID.randomUUID();
          UUID lastId = UUID.randomUUID();
          authoring(firstId, lastId, "Check saved", "STEP_SCOPED");
          var first = capture("FULL", true);
          states.publishCandidate(testId, first.request(), candidate(first));
          UUID candidate = revision();
          String reviewed =
              jdbc.queryForObject(
                  "SELECT authoring_hash FROM ui_tests WHERE id=?", String.class, testId);
          // The database refuses a scope change that does not move source_revision ...
          var unknown = JSON.createObjectNode().put("version", 2);
          var steps = unknown.putArray("steps");
          steps.addObject().put("id", firstId.toString()).put("text", "Open home");
          steps.addObject().put("id", lastId.toString()).put("text", "Check saved");
          unknown.putObject("scope").put("policyVersion", "1.0.0").put("declaration", "UNKNOWN");
          jdbc.execute("SAVEPOINT scope_without_revision");
          assertThatThrownBy(
                  () ->
                      jdbc.update(
                          "UPDATE ui_tests SET authoring_snapshot=CAST(? AS jsonb),"
                              + "authoring_hash=? WHERE id=?",
                          unknown.toString(),
                          ArtifactCanonicalizer.hash(unknown.toString()),
                          testId))
              .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class)
              .hasMessageContaining("requires a new source_revision");
          jdbc.execute("ROLLBACK TO SAVEPOINT scope_without_revision");
          // ... so a scope change under review stales the candidate on both confirmation paths.
          authoring(firstId, lastId, "Check saved", "UNKNOWN");
          assertThatThrownBy(
                  () ->
                      states.confirmVersioned(
                          testId,
                          first.request().requestId(),
                          candidate,
                          candidate(first).artifactHash(),
                          first.request().sourceRevision(),
                          first.request().configurationRevision(),
                          reviewed,
                          OWNER))
              .isInstanceOf(StudioConflictException.class);
          assertThatThrownBy(
                  () ->
                      states.confirm(
                          testId,
                          candidate,
                          candidate(first).artifactHash(),
                          first.request().sourceRevision(),
                          first.request().configurationRevision(),
                          OWNER))
              .isInstanceOf(StudioConflictException.class);
          // The surrounding test transaction is shared, so the draft row is the observable: in
          // production each refused confirm also rolls back its own revision bookkeeping.
          assertThat(
                  jdbc.queryForObject(
                      "SELECT confirmed_revision_id IS NULL FROM ui_tests WHERE id=?",
                      Boolean.class,
                      testId))
              .isTrue();
        });
  }

  @Test
  void versionedConfirmationAcceptsOnlyTheExactCapturedAuthoringHash() {
    withCutover(
        () -> {
          authoring(UUID.randomUUID(), UUID.randomUUID(), "Check saved", "STEP_SCOPED");
          var first = capture("FULL", true);
          states.publishCandidate(testId, first.request(), candidate(first));
          UUID candidate = revision();
          String reviewed =
              jdbc.queryForObject(
                  "SELECT authoring_hash FROM ui_tests WHERE id=?", String.class, testId);
          assertThatThrownBy(
                  () ->
                      states.confirmVersioned(
                          testId,
                          first.request().requestId(),
                          candidate,
                          candidate(first).artifactHash(),
                          first.request().sourceRevision(),
                          first.request().configurationRevision(),
                          "b".repeat(64),
                          OWNER))
              .isInstanceOf(StudioConflictException.class);
          assertThat(
                  states.confirmVersioned(
                      testId,
                      first.request().requestId(),
                      candidate,
                      candidate(first).artifactHash(),
                      first.request().sourceRevision(),
                      first.request().configurationRevision(),
                      reviewed,
                      OWNER))
              .isEqualTo(candidate);
        });
  }

  @Test
  void configurationOnlyReuseNeedsNoHistoricalPassButTextReversionDoes() {
    withCutover(
        () -> {
          UUID firstId = UUID.randomUUID();
          UUID lastId = UUID.randomUUID();
          authoring(firstId, lastId, "Check saved", "STEP_SCOPED");
          var first = capture("FULL", true);
          states.publishCandidate(testId, first.request(), candidate(first));
          states.confirm(
              testId,
              revision(),
              candidate(first).artifactHash(),
              first.request().sourceRevision(),
              first.request().configurationRevision(),
              OWNER);
          jdbc.update(
              "UPDATE ui_tests SET configuration_revision=configuration_revision+1,"
                  + "timeout_seconds=timeout_seconds+1 WHERE id=?",
              testId);
          var reused = capture("AUTO", false);
          assertThat(reused.plan().mode().name()).isEqualTo("REUSE");
          assertThat(reused.plan().reason()).isEqualTo("CONFIGURATION_ONLY");
          authoring(firstId, lastId, "Intervening edit", "STEP_SCOPED");
          authoring(firstId, lastId, "Check saved", "STEP_SCOPED");
          assertThat(capture("AUTO", true).plan().mode().name()).isEqualTo("FULL");
        });
  }

  @Test
  void expiredCaptureCannotPublishEvenIfWorkerPreviouslyClaimedSettlement() throws Exception {
    var capture =
        states.capture(
            testId,
            OWNER,
            limits,
            screen,
            FINGERPRINT,
            Duration.ofMillis(100),
            "FULL",
            false,
            null,
            null,
            null);
    Thread.sleep(150);
    assertThat(states.publishCandidate(testId, capture.request(), candidate(capture)))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_revisions WHERE test_id=?", Integer.class, testId))
        .isZero();
  }

  @Test
  void draftLockThenDelayedInsertCannotSpendTheDeadlineTwiceOrLeaveAnOrphan() throws Exception {
    String suffix = testId.toString().replace("-", "");
    String function = "delay_candidate_" + suffix;
    String trigger = "trg_" + function;
    jdbc.execute(
        "CREATE FUNCTION "
            + function
            + "() RETURNS trigger AS $$ BEGIN "
            + "IF NEW.test_id = '"
            + testId
            + "'::uuid THEN PERFORM pg_sleep(1.4); END IF; "
            + "RETURN NEW; END $$ LANGUAGE plpgsql");
    jdbc.execute(
        "CREATE TRIGGER "
            + trigger
            + " BEFORE INSERT ON ui_test_revisions "
            + "FOR EACH ROW EXECUTE FUNCTION "
            + function
            + "()");
    CountDownLatch locked = new CountDownLatch(1);
    CountDownLatch unlock = new CountDownLatch(1);
    try (var pool = Executors.newFixedThreadPool(2)) {
      var captured =
          states.capture(
              testId,
              OWNER,
              limits,
              screen,
              FINGERPRINT,
              Duration.ofSeconds(2),
              "FULL",
              false,
              null,
              null,
              null);
      var holder =
          pool.submit(
              () ->
                  new TransactionTemplate(manager)
                      .execute(
                          status -> {
                            jdbc.queryForObject(
                                "SELECT id FROM ui_tests WHERE id=? FOR UPDATE",
                                UUID.class,
                                testId);
                            locked.countDown();
                            try {
                              unlock.await(4, TimeUnit.SECONDS);
                            } catch (InterruptedException e) {
                              Thread.currentThread().interrupt();
                              throw new IllegalStateException(e);
                            }
                            return null;
                          }));
      assertThat(locked.await(2, TimeUnit.SECONDS)).isTrue();
      var publishing =
          pool.submit(
              () -> {
                try {
                  states.publishCandidate(testId, captured.request(), candidate(captured));
                  return null;
                } catch (RuntimeException failure) {
                  return failure;
                }
              });
      Thread.sleep(800);
      unlock.countDown();
      holder.get(3, TimeUnit.SECONDS);
      assertThat(publishing.get(5, TimeUnit.SECONDS)).isNotNull();
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM ui_test_revisions WHERE test_id=?", Integer.class, testId))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?",
                  UUID.class,
                  testId))
          .isNull();
    } finally {
      unlock.countDown();
      jdbc.execute("DROP TRIGGER " + trigger + " ON ui_test_revisions");
      jdbc.execute("DROP FUNCTION " + function + "()");
    }
  }

  private CompileStateService.Capture capture(String mode, boolean incremental) {
    return states.capture(
        testId,
        OWNER,
        limits,
        screen,
        FINGERPRINT,
        Duration.ofSeconds(30),
        mode,
        incremental,
        null,
        null,
        null);
  }

  private CandidateRevision candidate(CompileStateService.Capture capture) {
    var artifact = JSON.createObjectNode().put("version", 1);
    var steps = artifact.putArray("steps");
    for (int i = 0; i < capture.inputs().orderedSource().size(); i++) {
      steps
          .addObject()
          .put("stepIndex", i)
          .put("originalText", capture.inputs().orderedSource().get(i))
          .put("code", "await page.goto('https://example.com');");
    }
    String canonical = ArtifactCanonicalizer.canonicalize(artifact.toString());
    String source = ArtifactCanonicalizer.canonicalSource(capture.inputs().orderedSource());
    return new CandidateRevision(
        capture.request().configurationRevision(),
        source,
        ArtifactCanonicalizer.hash(source),
        canonical,
        ArtifactCanonicalizer.hash(canonical),
        1,
        capture.inputs().configurationJson(),
        capture.inputs().referencesJson(),
        "{\"validatorSchemaVersion\":\"2.0.0\",\"executorVersion\":\"2.0.0\",\"playwrightVersion\":\"1.63.0\"}",
        OWNER);
  }

  private void seedCsi(String csi) {
    jdbc.update(
        """
        INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment,status)
        VALUES(?,'Inference other','Ops','HIGH',?,'Production','OPERATIONAL')
        ON CONFLICT(id) DO NOTHING
        """,
        csi,
        OWNER);
  }

  private UUID revision() {
    return jdbc.queryForObject(
        "SELECT current_candidate_revision_id FROM ui_tests WHERE id=?", UUID.class, testId);
  }

  private void authoring(UUID first, UUID last, String lastText, String scope) {
    var snapshot = JSON.createObjectNode().put("version", 2);
    var steps = snapshot.putArray("steps");
    steps.addObject().put("id", first.toString()).put("text", "Open home");
    steps.addObject().put("id", last.toString()).put("text", lastText);
    snapshot.putObject("scope").put("policyVersion", "1.0.0").put("declaration", scope);
    String source = ArtifactCanonicalizer.canonicalSource(List.of("Open home", lastText));
    jdbc.update(
        """
        UPDATE ui_tests SET authoring_snapshot=CAST(? AS jsonb),authoring_hash=?,
          scope_reviewed_by=?,scope_reviewed_at=NOW(),steps=CAST(? AS jsonb),source_revision=source_revision+1
        WHERE id=?
        """,
        snapshot.toString(),
        ArtifactCanonicalizer.hash(snapshot.toString()),
        OWNER,
        source,
        testId);
  }

  private void fullPass(UUID revision) {
    jdbc.update(
        """
        INSERT INTO ui_test_executions(id,ui_test_id,csi_id,revision_id,status,started_at,ended_at,
          execution_scope,runtime_versions,configuration_snapshot)
        SELECT gen_random_uuid(),test_id,csi_id,id,'PASSED',NOW(),NOW(),'FULL',
          '{"validator":"2.0.0","executor":"2.0.0","playwright":"1.63.0"}'::jsonb,
          jsonb_build_object('sourceRevision',source_revision,'configurationRevision',configuration_revision,
            'artifactHash',artifact_hash,'browser',configuration->>'browser',
            'viewportWidth',configuration->'viewport'->'width','viewportHeight',configuration->'viewport'->'height',
            'timeoutSeconds',configuration->'timeoutSeconds','waitStrategy',configuration->>'waitStrategy',
            'environment',configuration->>'environment')
        FROM ui_test_revisions WHERE id=?
        """,
        revision);
  }

  private void withCutover(Runnable action) {
    new TransactionTemplate(manager)
        .execute(
            status -> {
              status.setRollbackOnly();
              jdbc.execute("SELECT set_config('checks.inference_publishers_drained','true',true)");
              try {
                jdbc.execute(
                    Files.readString(
                        Path.of("db/cutover/V19__studio_inference_candidate_identity.sql")));
              } catch (java.io.IOException e) {
                throw new IllegalStateException(e);
              }
              action.run();
              return null;
            });
  }
}
