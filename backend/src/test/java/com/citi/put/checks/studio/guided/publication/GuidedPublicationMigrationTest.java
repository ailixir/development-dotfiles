package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

class GuidedPublicationMigrationTest {
  static final GuidedContracts C = new GuidedContracts();

  static final class Database implements AutoCloseable {
    final PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:15-alpine");
    final JdbcTemplate jdbc;
    final TransactionTemplate tx;
    final GuidedPublicationBaseRepository bases;
    final GuidedPublicationRepository publications;
    final GuidedPublicationEvidenceRepository evidence;
    final GuidedSessionRepository sessions;
    final UUID testId = UUID.randomUUID(), stepId = UUID.randomUUID();
    final ObjectNode session;

    Database() {
      this(false);
    }

    Database(boolean cutover) {
      pg.start();
      var ds = new DriverManagerDataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
      jdbc = new JdbcTemplate(ds);
      tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
      Flyway.configure().dataSource(ds).target("32").load().migrate();
      jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES ('owner','owner','owner@example.test')");
      jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
              + " VALUES ('CSI','test','unit','LOW','owner@example.test','Development')");
      try {
        var a =
            new AuthoringV2Request(
                2,
                null,
                List.of(new AuthoringStep(stepId, "Open https://orders.example.test/start", null)));
        var m = new ObjectMapper().findAndRegisterModules();
        jdbc.update(
            "INSERT INTO"
                + " ui_tests(id,name,csi_id,environment,browser,steps,created_by,authoring,authoring_revision_inputs)"
                + " VALUES"
                + " (?,'test','CSI','Development','chromium',?::jsonb,'owner@example.test',?::jsonb,?::jsonb)",
            testId,
            "[\"Open https://orders.example.test/start\"]",
            m.writeValueAsString(a),
            m.writeValueAsString(AuthoringRevisionIdentity.create(a, Map.of())));
      } catch (Exception e) {
        throw new IllegalStateException(e);
      }
      jdbc.update(
          "INSERT INTO"
              + " ui_test_revisions(id,test_id,csi_id,source_revision,configuratio"
              + "n_revision,source,source_hash,artifact,artifact_hash,artifact_sch"
              + "ema_version,configuration,\"references\",provenance,created_by,re"
              + "ference_policy,intent_derivation_version)"
              + " VALUES"
              + " (?,?,'CSI',1,1,'[]',?,'{}',?,1,'{}','{}','{}','owner@example.test','{}','2')",
          UUID.randomUUID(),
          testId,
          "a".repeat(64),
          "b".repeat(64));
      if (cutover) {
        jdbc.execute("DROP INDEX uq_ui_test_revisions_identity");
        jdbc.execute(
            "CREATE FUNCTION studio_inference_require_request() RETURNS trigger LANGUAGE plpgsql AS"
                + " $$ BEGIN IF NEW.compile_request_id IS NULL THEN RAISE EXCEPTION 'new candidate"
                + " requires immutable compile request after V19'; END IF; RETURN NEW; END $$");
        jdbc.execute(
            "CREATE TRIGGER trg_ui_test_revision_require_request BEFORE INSERT ON ui_test_revisions"
                + " FOR EACH ROW EXECUTE FUNCTION studio_inference_require_request()");
      }
      Flyway.configure().dataSource(ds).load().migrate();
      sessions = new GuidedSessionRepository(jdbc, tx, C);
      bases = new GuidedPublicationBaseRepository(jdbc, C);
      publications = new GuidedPublicationRepository(jdbc, C);
      evidence = new GuidedPublicationEvidenceRepository(jdbc, C);
      session =
          C.object()
              .put("sessionId", "session")
              .put("testId", testId.toString())
              .put("state", "PREPARING")
              .put("expiresAt", Instant.now().plusSeconds(600).toString());
      var scope =
          session
              .putObject("scope")
              .put("principalId", "owner@example.test")
              .put("csiId", "CSI")
              .put("sourceRevision", "1")
              .put("configurationRevision", "1");
      session.put("scopeHash", GuidedContracts.hash(scope));
      session
          .putObject("owner")
          .put("workerId", "unclaimed")
          .put("fence", 0)
          .put("leaseExpiresAt", Instant.now().toString());
      session
          .putObject("runAuthorization")
          .put("authorizationId", UUID.randomUUID().toString())
          .put("kind", "scopedRun")
          .put("principalId", "owner@example.test")
          .put("scopeHash", session.path("scopeHash").asText())
          .put("authorizedAt", Instant.now().toString());
      session
          .putArray("sourceSteps")
          .addObject()
          .put("stepId", stepId.toString())
          .put("requiresAssertion", false);
      tx.executeWithoutResult(
          s -> {
            sessions.insert(session);
            var m =
                C.object()
                    .put("testId", testId.toString())
                    .put("sourceRevision", "1")
                    .put("configurationRevision", "1")
                    .put("policy", "INPUT-POLICY-01-A");
            m.putArray("sourceSteps")
                .addObject()
                .put("stepId", stepId.toString())
                .put("text", "Open https://orders.example.test/start");
            m.putObject("configurationValues").put("private", "saved-value-canary");
            jdbc.update(
                "INSERT INTO"
                    + " studio_guided_source_manifests(session_id,scope_hash,manifest,manifest_hash)"
                    + " VALUES (?,?,?::jsonb,?)",
                "session",
                session.path("scopeHash").asText(),
                m.toString(),
                GuidedContracts.hash(m));
            jdbc.update(
                "INSERT INTO studio_guided_translation_state(session_id) VALUES ('session')");
          });
    }

    PublicationContracts.Base capture() {
      return tx.execute(
          s -> {
            sessions.lock("session");
            var r =
                C.object()
                    .put("csiId", "CSI")
                    .put("environment", "Development")
                    .put("applicationId", "app")
                    .put("accountRef", "account")
                    .put("policyId", "policy")
                    .put("policyVersion", "1")
                    .put("entryPolicyId", "entry");
            r.putArray("allowedOrigins").add("https://orders.example.test");
            r.putArray("capabilities").add("navigate");
            r.putObject("initialContext").put("kind", "initialBlank");
            return bases.capture(session, r, Instant.now());
          });
    }

    void finalizing() {
      tx.executeWithoutResult(
          s -> {
            sessions.lock("session");
            var owner =
                C.object()
                    .put("workerId", "worker")
                    .put("fence", 1)
                    .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
            jdbc.update(
                "UPDATE studio_guided_sessions SET"
                    + " state='FINALIZING',document=jsonb_set(jsonb_set(document,'{state"
                    + "}','\"FINALIZING\"'),'{owner}',?::jsonb)"
                    + " WHERE session_id='session'",
                owner.toString());
            var p = C.object();
            p.putArray("obligations");
            jdbc.update(
                "INSERT INTO"
                    + " studio_guided_translation_plans(session_id,plan_revision,parent_revision,plan,plan_hash)"
                    + " VALUES ('session',1,0,?::jsonb,?)",
                p.toString(),
                GuidedContracts.hash(p));
            jdbc.update(
                "UPDATE studio_guided_translation_state SET plan_revision=1 WHERE"
                    + " session_id='session'");
          });
    }

    PublicationContracts.Snapshot snapshot(PublicationContracts.Base base) {
      var b =
          C.object()
              .put("testId", testId.toString())
              .put("csiId", "CSI")
              .put("sourceRevision", "1")
              .put("configurationRevision", "1");
      b.putArray("sourceSteps").addObject().put("source", "Open https://orders.example.test/start");
      var i = C.object();
      i.set("base", base.document());
      i.put("ownerWorkerId", "worker")
          .put("ownerFence", 1)
          .put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(12)))
          .put(
              "translationHash",
              jdbc.queryForObject(
                  "SELECT plan_hash FROM studio_guided_translation_plans WHERE"
                      + " session_id='session'",
                  String.class))
          .put("basisHash", GuidedContracts.hash(b));
      for (String k :
          List.of(
              "learnedPlanHash",
              "artifactHash",
              "referencePolicyHash",
              "operationEquivalenceHash",
              "publicationEvidenceHash",
              "profileHash",
              "validationBuildHash")) {
        i.put(k, "c".repeat(64));
      }
      return new PublicationContracts.Snapshot(i, b);
    }

    @Override
    public void close() {
      pg.stop();
    }
  }

  @Test
  void installedScheduleCodeConstraintKeepsLegacyVocabularyAndAddsOnlyObservedRefusal() {
    try (var db = new Database()) {
      String installed =
          db.jdbc.queryForObject(
              "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE"
                  + " conrelid='studio_schedule_occurrences'::regclass AND"
                  + " conname='ck_studio_schedule_occurrences_code'",
              String.class);
      // Isolate the actual installed SQL predicate from unrelated activation/execution FKs.
      // The joined real scheduler test separately exercises its complete original table/writers.
      db.jdbc.execute(
          "CREATE TABLE scheduler_code_probe(decision text NOT NULL,code text NOT NULL, "
              + "CONSTRAINT scheduler_code_probe_check "
              + installed
              + ")");
      List<String> legacy =
          List.of(
              "ACCEPTED",
              "COMPILE_REQUIRED",
              "ACTIVATION_REVISION_MISMATCH",
              "RUNTIME_INCOMPATIBLE",
              "STEP_LIMIT_EXCEEDED",
              "TEST_DELETED",
              "TEST_QUARANTINED",
              "BACKGROUND_AUTHORIZATION_DENIED",
              "REFERENCE_UNAVAILABLE",
              "PENDING_QUOTA_EXCEEDED",
              "BACKGROUND_AUTHORIZATION_UNAVAILABLE",
              "VAULT_UNAVAILABLE",
              "OVERLAP",
              "MISFIRE",
              "GRACE_EXPIRED",
              "DISPATCH_DISABLED",
              "UNCERTAIN_EXECUTION",
              "SCHEDULE_PAUSED",
              "SCHEDULE_UPDATED",
              "SCHEDULE_REMOVED");
      assertThat(legacy).hasSize(20);
      for (String code : legacy) {
        assertThat(
                db.jdbc.update(
                    "INSERT INTO scheduler_code_probe VALUES (?,?)",
                    code.equals("ACCEPTED") ? "ACCEPTED" : "REFUSED",
                    code))
            .isEqualTo(1);
        String invalidDecision = code.equals("ACCEPTED") ? "REFUSED" : "ACCEPTED";
        assertThatThrownBy(
                () ->
                    db.jdbc.update(
                        "INSERT INTO scheduler_code_probe VALUES (?,?)", invalidDecision, code))
            .hasMessageContaining("scheduler_code_probe_check");
      }
      assertThat(
              db.jdbc.update(
                  "INSERT INTO scheduler_code_probe VALUES"
                      + " ('REFUSED','OBSERVED_SCHEDULE_AUTH_REQUIRED')"))
          .isEqualTo(1);
      for (String decision : List.of("ACCEPTED", "DEFERRED", "SKIPPED")) {
        assertThatThrownBy(
                () ->
                    db.jdbc.update(
                        "INSERT INTO scheduler_code_probe VALUES"
                            + " (?,'OBSERVED_SCHEDULE_AUTH_REQUIRED')",
                        decision))
            .hasMessageContaining("scheduler_code_probe_check");
      }
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO scheduler_code_probe VALUES ('REFUSED','UNDECLARED_AUTHORITY')"))
          .hasMessageContaining("scheduler_code_probe_check");
      assertThat(db.jdbc.queryForObject("SELECT count(*) FROM scheduler_code_probe", Integer.class))
          .isEqualTo(21);
    }
  }

  @Test
  void upgradeBaseEpochAndImmutableHistory() {
    try (var db = new Database()) {
      var b = db.capture();
      assertThat(b.document().toString()).doesNotContain("saved-value-canary");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM ui_test_revisions WHERE publication_kind IS NULL",
                  Integer.class))
          .isEqualTo(1);
      assertThatThrownBy(
              () ->
                  db.jdbc.update("UPDATE studio_guided_publication_bases SET document='{}'::jsonb"))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () -> db.jdbc.update("UPDATE ui_tests SET publication_epoch=7 WHERE id=?", db.testId))
          .hasMessageContaining("epoch");
      db.jdbc.update(
          "UPDATE ui_tests SET compile_request_id=? WHERE id=?", UUID.randomUUID(), db.testId);
      db.jdbc.update("UPDATE ui_tests SET compile_request_id=NULL WHERE id=?", db.testId);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT publication_epoch FROM ui_tests WHERE id=?", Long.class, db.testId))
          .isEqualTo(2);
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("session");
                        db.bases.requireCurrent(b, db.bases.lockCurrent(db.testId));
                      }))
          .hasMessageContaining("PUBLICATION_CONFLICT");
    }
  }

  @Test
  void bothCutoverOrdersPreserveLegacyRows() {
    try (var db = new Database(true)) {
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM ui_test_revisions WHERE compile_request_id IS NULL",
                  Integer.class))
          .isEqualTo(1);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT to_regclass('uq_ui_test_revisions_identity') IS NULL", Boolean.class))
          .isTrue();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT pg_get_functiondef('studio_inference_require_request()'::regprocedure)",
                  String.class))
          .contains("GUIDED_RUN");
    }
    try (var db = new Database()) {
      db.tx.executeWithoutResult(
          s -> {
            db.jdbc.execute("SET LOCAL checks.inference_publishers_drained='true'");
            try {
              db.jdbc.execute(
                  Files.readString(
                      Path.of("db/cutover/V19__studio_inference_candidate_identity.sql")));
            } catch (java.io.IOException e) {
              throw new IllegalStateException(e);
            }
          });
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT to_regclass('uq_observed_revision_session') IS NOT NULL", Boolean.class))
          .isTrue();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT to_regclass('uq_ui_test_revisions_identity') IS NULL", Boolean.class))
          .isTrue();
    }
  }

  @Test
  void claimIsSingleSendRenewalStableAndSessionBudgetCannotReset() {
    try (var db = new Database()) {
      var b = db.capture();
      db.finalizing();
      var snap = db.snapshot(b);
      var c = new PublicationContracts.Claim("session", "key", "d".repeat(64), snap);
      var a =
          db.tx.execute(
              s -> {
                db.sessions.lock("session");
                return db.publications.reserve(c, Instant.now());
              });
      db.tx.executeWithoutResult(
          s -> {
            db.sessions.lock("session");
            db.publications.claim(
                "session", a.attemptId(), a.claimId(), snap.hash(), Instant.now());
          });
      assertThatThrownBy(
              () ->
                  db.tx.execute(
                      s -> {
                        db.sessions.lock("session");
                        return db.publications.claim(
                            "session", a.attemptId(), a.claimId(), snap.hash(), Instant.now());
                      }))
          .hasMessageContaining("IDEMPOTENCY_CONFLICT");
      db.jdbc.update(
          "UPDATE studio_guided_sessions SET"
              + " document=jsonb_set(document,'{owner,leaseExpiresAt}',to_jsonb(?::text)) WHERE"
              + " session_id='session'",
          Instant.now().plusSeconds(200).toString());
      assertThat(
              db.tx
                  .execute(
                      s -> {
                        db.sessions.lock("session");
                        return db.publications.reserve(c, Instant.now());
                      })
                  .attemptId())
          .isEqualTo(a.attemptId());
      for (int n = 1; n <= 3; n++) {
        var active =
            n == 1
                ? a
                : db.tx.execute(
                    s -> {
                      db.sessions.lock("session");
                      return db.publications.reserve(
                          new PublicationContracts.Claim(
                              "session", UUID.randomUUID().toString(), "d".repeat(64), snap),
                          Instant.now());
                    });
        db.tx.executeWithoutResult(
            s -> {
              db.sessions.lock("session");
              db.publications.finish(
                  "session",
                  active.attemptId(),
                  active.claimId(),
                  snap.hash(),
                  PublicationContracts.AttemptStatus.UNKNOWN,
                  null,
                  "TRANSPORT",
                  Instant.now());
            });
      }
      assertThatThrownBy(
              () ->
                  db.tx.execute(
                      s -> {
                        db.sessions.lock("session");
                        return db.publications.reserve(c, Instant.now());
                      }))
          .hasMessageContaining("BUDGET_EXCEEDED");
    }
  }

  @Test
  void halfRevisionAndMissingObservationCannotCommit() {
    try (var db = new Database()) {
      db.capture();
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "INSERT INTO"
                          + " studio_guided_publication_observations(session_id,observation_ha"
                          + "sh,context_id,owner_fence,document_id,generation,observation,capt"
                          + "ured_at)"
                          + " VALUES ('session',?,'missing',1,'d',0,'{}',now())",
                      "a".repeat(64)))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      s -> {
                        db.sessions.lock("session");
                        db.jdbc.update(
                            "INSERT INTO"
                                + " ui_test_revisions(id,test_id,csi_id,source_revision,configuratio"
                                + "n_revision,source,source_hash,artifact,artifact_hash,artifact_sch"
                                + "ema_version,configuration,\"references\",provenance,created_by,co"
                                + "nfirmed_by,confirmed_at,confirmation_source,reference_policy,inte"
                                + "nt_derivation_version,publication_kind,guided_session_id,"
                                // Final immutable identity columns.
                                + "learned_plan_hash,revision_digest) VALUES"
                                + " (?,?,'CSI',1,1,'[]',?,'{}',?,2,'{}','{}','{}','owner@example.tes"
                                + "t','owner@example.test',now(),'GUIDED_RUN','{}','observed-1','GUI"
                                + "DED_RUN','session',?,?)",
                            UUID.randomUUID(),
                            db.testId,
                            "a".repeat(64),
                            "e".repeat(64),
                            "f".repeat(64),
                            "1".repeat(64));
                        db.jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
                      }))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM ui_test_revisions WHERE publication_kind='GUIDED_RUN'",
                  Integer.class))
          .isZero();
    }
  }

  @Test
  void validatedRelationalCycleCommitsOnceAndKeepsHistoricalReceiptAfterExpiry() {
    try (var db = new Database()) {
      var base = db.capture();
      db.finalizing();
      var raw = db.snapshot(base);
      var basis = raw.basis();
      var learned = C.object().put("schemaVersion", 2);
      var policy = C.object().put("schemaVersion", 3);
      policy.set("scope", base.document().path("replayRequirements"));
      var profile =
          C.parse(
              "{\"catalog\":\"observed-replay-1\",\"playwright\":\"1.63.0\",\"br"
                  + "owserEngine\":\"chromium\",\"contract\":2,\"learnedPlan\":2,\"obs"
                  + "ervation\":2,\"guidedPolicy\":2,\"referencePolicy\":3,\"lowering"
                  + "\":1,\"artifact\":2,\"language\":\"observed-2\",\"executor\":\"ob"
                  + "served-2\",\"publicationEvidence\":1,\"validationBasis\":1,\"vali"
                  + "dator\":\"observed-1\",\"protocol\":2,\"replayAuthorization\":1,"
                  + "\"accountAbi\":1}");
      var build =
          C.object()
              .put("profileHash", GuidedContracts.hash(profile))
              .put("schemaBundleHash", "b".repeat(64))
              .put("referenceBundleHash", "c".repeat(64))
              .put("executableImageDigest", "d".repeat(64))
              .put("chromiumBuild", "chromium-test");
      var artifact = C.object().put("version", 2);
      artifact.set("learnedPlan", learned);
      artifact.set("replayPolicy", policy);
      artifact.set("profile", profile);
      var hashes = C.object();
      for (String key :
          List.of("sourceHash", "configurationHash", "authoringHash", "runAuthorizationHash")) {
        hashes.set(key, base.document().path(key));
      }
      hashes
          .put("artifactHash", GuidedContracts.hash(artifact))
          .put("learnedPlanHash", GuidedContracts.hash(learned))
          .put("referencePolicyHash", GuidedContracts.hash(policy))
          .put("profileHash", GuidedContracts.hash(profile));
      for (String key :
          List.of(
              "operationEquivalenceHash", "admissionProvenanceHash", "publicationEvidenceHash")) {
        hashes.put(key, "e".repeat(64));
      }
      var digest = C.object().put("version", 1);
      for (String key : List.of("testId", "csiId", "sourceRevision", "configurationRevision")) {
        digest.set(key, basis.path(key));
      }
      hashes.fields().forEachRemaining(e -> digest.set(e.getKey(), e.getValue()));
      hashes.put("revisionDigest", GuidedContracts.hash(digest));
      var identity = PublicationContracts.copy(raw.identity());
      for (String key :
          List.of(
              "artifactHash",
              "learnedPlanHash",
              "referencePolicyHash",
              "profileHash",
              "operationEquivalenceHash",
              "publicationEvidenceHash")) {
        identity.set(key, hashes.path(key));
      }
      identity.put("validationBuildHash", GuidedContracts.hash(build));
      var snapshot = new PublicationContracts.Snapshot(identity, basis);
      var attempt =
          db.tx.execute(
              t -> {
                db.sessions.lock("session");
                return db.publications.reserve(
                    new PublicationContracts.Claim("session", "final", "d".repeat(64), snapshot),
                    Instant.now());
              });
      db.tx.executeWithoutResult(
          t -> {
            db.sessions.lock("session");
            db.publications.claim(
                "session", attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
          });
      var verdict =
          C.object()
              .put("ok", true)
              .putNull("errorCode")
              .put("attemptId", attempt.attemptId().toString())
              .put("claimId", attempt.claimId().toString())
              .put("snapshotHash", snapshot.hash())
              .put("basisHash", identity.path("basisHash").asText());
      for (String key :
          List.of(
              "artifactHash",
              "learnedPlanHash",
              "referencePolicyHash",
              "operationEquivalenceHash",
              "publicationEvidenceHash")) {
        verdict.set(key, hashes.path(key));
      }
      verdict.put("schemaVersion", 2);
      verdict.set("admissionProvenanceHash", hashes.path("admissionProvenanceHash"));
      verdict.set("profile", profile);
      verdict.set("build", build);
      db.tx.executeWithoutResult(
          t -> {
            db.sessions.lock("session");
            db.publications.finish(
                "session",
                attempt.attemptId(),
                attempt.claimId(),
                snapshot.hash(),
                PublicationContracts.AttemptStatus.VALIDATED,
                verdict,
                null,
                Instant.now());
          });
      var candidate = new PublicationContracts.Candidate(learned, artifact, policy, hashes);
      var grant =
          new PublicationContracts.Grant(
              "session",
              "owner@example.test",
              "CSI",
              snapshot.hash(),
              attempt.validationDeadline());
      var command =
          new PublicationContracts.Commit(
              "session",
              UUID.randomUUID(),
              attempt.attemptId(),
              attempt.claimId(),
              "final",
              "d".repeat(64),
              snapshot,
              candidate,
              grant);
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      t -> {
                        db.sessions.lock("session");
                        db.publications.commit(command, Instant.now());
                        throw new IllegalStateException("fault-after-write");
                      }))
          .hasMessageContaining("fault-after-write");
      assertThat(db.publications.receipt("session")).isEmpty();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT state FROM studio_guided_sessions WHERE session_id='session'",
                  String.class))
          .isEqualTo("FINALIZING");
      var receipt =
          db.tx.execute(
              t -> {
                db.sessions.lock("session");
                var r = db.publications.commit(command, Instant.now());
                db.jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE");
                return r;
              });
      assertThat(receipt.document().path("revisionId").asText())
          .isEqualTo(command.revisionId().toString());
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT compile_request_id IS NULL AND compile_status='READY' FROM ui_tests WHERE"
                      + " id=?",
                  Boolean.class,
                  db.testId))
          .isTrue();
      db.jdbc.update(
          "UPDATE studio_guided_sessions SET"
              + " document=jsonb_set(document,'{owner,leaseExpiresAt}','\"2000-01-01T00:00:00Z\"')"
              + " WHERE session_id='session'");
      assertThat(db.publications.receipt("session").orElseThrow().document())
          .isEqualTo(receipt.document());
      testObservedBinding(db, command.revisionId(), base, hashes, profile, build);
      assertThatThrownBy(() -> db.jdbc.update("DELETE FROM studio_guided_publications"))
          .hasMessageContaining("immutable");
      assertThat(db.jdbc.queryForObject("SELECT count(*) FROM ui_test_executions", Integer.class))
          .isEqualTo(1);
    }
  }

  @Test
  void directSqlClaimsAndNewPartitionsKeepTheirIndependentGuards() {
    try (var db = new Database()) {
      var base = db.capture();
      db.finalizing();
      var snap = db.snapshot(base);
      var attempt =
          db.tx.execute(
              t -> {
                db.sessions.lock("session");
                return db.publications.reserve(
                    new PublicationContracts.Claim("session", "key", "d".repeat(64), snap),
                    Instant.now());
              });
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_publication_attempts SET snapshot_hash=? WHERE"
                          + " attempt_id=?",
                      "f".repeat(64),
                      attempt.attemptId()))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_publication_attempts SET"
                          + " status='VALIDATED',claimed_at=now(),completed_at=now(),validator_receipt='{}'::jsonb"
                          + " WHERE attempt_id=?",
                      attempt.attemptId()))
          .hasMessageContaining("not claimed");
      assertThatThrownBy(() -> db.jdbc.update("DELETE FROM studio_guided_publication_attempts"))
          .hasMessageContaining("immutable");
      db.jdbc.execute(
          "CREATE TABLE ui_test_executions_publication_future PARTITION OF ui_test_executions FOR"
              + " VALUES FROM ('2099-01-01') TO ('2099-02-01')");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM pg_trigger WHERE"
                      + " tgrelid='ui_test_executions_publication_future'::regclass AND"
                      + " tgname='tr_studio_observed_execution_guard'",
                  Integer.class))
          .isEqualTo(1);
      var execution = UUID.randomUUID();
      db.jdbc.update(
          "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,ended_at,duration_ms)"
              + " VALUES (?,?,'PASSED','2099-01-02','2099-01-02',0)",
          execution,
          db.testId);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE ui_test_executions SET observed_revision_binding='{}'::jsonb WHERE"
                          + " id=?",
                      execution))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE ui_test_executions SET observed_admission_receipt='{}'::jsonb WHERE"
                          + " id=?",
                      execution))
          .hasMessageContaining("needs binding");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_publication_hash('{\"b\":2,\"a\":\"é\"}'::jsonb)", String.class))
          .isEqualTo("06c264c46ad5ada9493abd3aa2383fb205ae99d7d0bad40b03a43bfec8a1b8de");
    }
  }

  static String wire(Instant value) {
    return PublicationContracts.time(value);
  }

  static void testObservedBinding(
      Database db,
      UUID revision,
      PublicationContracts.Base base,
      ObjectNode hashes,
      com.fasterxml.jackson.databind.JsonNode profile,
      ObjectNode build) {
    Instant started = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
    String at = wire(started), expires = wire(started.plusSeconds(25));
    UUID execution = UUID.randomUUID(),
        attempt = UUID.randomUUID(),
        accountId = UUID.randomUUID(),
        grantId = UUID.randomUUID();
    var scope =
        PublicationContracts.copy(base.document().path("replayRequirements"))
            .put("principalId", "owner@example.test");
    String scopeHash = GuidedContracts.hash(scope);
    var account =
        C.object()
            .put("version", 1)
            .put("grantId", accountId.toString())
            .put("providerId", "test-provider")
            .put("executionId", execution.toString())
            .put("attemptId", attempt.toString())
            .put("revisionDigest", hashes.path("revisionDigest").asText())
            .put("scopeHash", scopeHash)
            .put("issuedAt", at)
            .put("expiresAt", expires);
    account.set("scope", scope);
    var grant =
        C.object()
            .put("version", 1)
            .put("grantId", grantId.toString())
            .put("executionId", execution.toString())
            .put("attemptId", attempt.toString())
            .put("revisionId", revision.toString())
            .put("revisionDigest", hashes.path("revisionDigest").asText())
            .put("principalId", "owner@example.test")
            .put("csiId", "CSI")
            .put("scopeHash", scopeHash)
            .put("profileHash", GuidedContracts.hash(profile))
            .put("buildHash", GuidedContracts.hash(build))
            .put("currentPolicyHash", "f".repeat(64))
            .put("accountGrantId", accountId.toString())
            .put("issuedAt", at)
            .put("expiresAt", expires);
    var binding =
        C.object()
            .put("version", 1)
            .put("executionId", execution.toString())
            .put("startedAt", at)
            .put("attemptId", attempt.toString())
            .put("revisionId", revision.toString())
            .put("testId", db.testId.toString())
            .put("csiId", "CSI")
            .put("principalId", "owner@example.test")
            .put("environment", "Development")
            .put("scopeHash", scopeHash)
            .put("currentPolicyHash", "f".repeat(64));
    for (String key :
        List.of(
            "revisionDigest",
            "artifactHash",
            "configurationHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash")) {
      binding.set(key, hashes.path(key));
    }
    binding.set("requiredProfile", profile);
    binding.set("requiredBuild", build);
    binding.set("scope", scope);
    binding.set("replayGrant", grant);
    binding.set("accountAuthorization", account);
    String insert =
        "INSERT INTO"
            + " ui_test_executions(id,ui_test_id,status,started_at,ended_at,dura"
            + "tion_ms,revision_id,csi_id,principal,environment,observed_revisio"
            + "n_binding)"
            + " VALUES (?,?,'PENDING',?,?,0,?,'CSI','owner@example.test','Development',?::jsonb)";
    for (String key :
        List.of(
            "currentPolicyHash", "requiredBuild", "replayGrant", "accountAuthorization", "scope")) {
      var invalid = binding.deepCopy();
      invalid.remove(key);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      insert,
                      execution,
                      db.testId,
                      java.sql.Timestamp.from(started),
                      java.sql.Timestamp.from(started),
                      revision,
                      invalid.toString()))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
      var nulled = binding.deepCopy();
      nulled.putNull(key);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      insert,
                      execution,
                      db.testId,
                      java.sql.Timestamp.from(started),
                      java.sql.Timestamp.from(started),
                      revision,
                      nulled.toString()))
          .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    var extra = binding.deepCopy().put("cookie", "must-not-persist");
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    insert,
                    execution,
                    db.testId,
                    java.sql.Timestamp.from(started),
                    java.sql.Timestamp.from(started),
                    revision,
                    extra.toString()))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    var wrong = binding.deepCopy().put("version", "1");
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    insert,
                    execution,
                    db.testId,
                    java.sql.Timestamp.from(started),
                    java.sql.Timestamp.from(started),
                    revision,
                    wrong.toString()))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    insert,
                    execution,
                    db.testId,
                    java.sql.Timestamp.from(started.plusNanos(123000)),
                    java.sql.Timestamp.from(started),
                    revision,
                    binding.toString()))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    db.jdbc.update(
        insert,
        execution,
        db.testId,
        java.sql.Timestamp.from(started),
        java.sql.Timestamp.from(started),
        revision,
        binding.toString());
    var request =
        C.object()
            .put("schemaVersion", 2)
            .put("kind", "observed")
            .put("runnerInstanceId", "runner")
            .put("admissionId", UUID.randomUUID().toString())
            .put("grantId", grantId.toString())
            .put("accountGrantId", accountId.toString());
    for (String key :
        List.of(
            "executionId",
            "startedAt",
            "attemptId",
            "revisionId",
            "revisionDigest",
            "artifactHash",
            "configurationHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash",
            "scopeHash",
            "currentPolicyHash")) {
      request.set(key, binding.path(key));
    }
    request.set("profile", profile);
    request.set("build", build);
    var receipt =
        C.object()
            .put("schemaVersion", 2)
            .put("kind", "observed")
            .put("admissionId", request.path("admissionId").asText())
            .put("admittedAt", at)
            .put("startDeadlineAt", wire(started.plusSeconds(10)))
            .put("runDeadlineAt", wire(started.plusSeconds(120)));
    receipt.set("request", request);
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    "UPDATE ui_test_executions SET observed_admission_receipt=?::jsonb WHERE id=?",
                    receipt.toString(),
                    execution))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    db.jdbc.update(
        "INSERT INTO"
            + " studio_dispatch_ledger(execution_id,execution_accepted_at,test_i"
            + "d,csi_id,principal,state,attempt_id,admission_id,runner_instance_"
            + "id,start_deadline_at,run_deadline_at)"
            + " VALUES (?,?,?,'CSI','owner@example.test','ADMITTED',?,?,'runner',?,?)",
        execution,
        java.sql.Timestamp.from(started),
        db.testId,
        attempt,
        UUID.fromString(request.path("admissionId").asText()),
        java.sql.Timestamp.from(started.plusSeconds(10)),
        java.sql.Timestamp.from(started.plusSeconds(120)));
    var incorrect = receipt.deepCopy();
    ((ObjectNode) incorrect.path("request")).put("currentPolicyHash", "a".repeat(64));
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    "UPDATE ui_test_executions SET observed_admission_receipt=?::jsonb WHERE id=?",
                    incorrect.toString(),
                    execution))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    db.jdbc.update(
        "UPDATE ui_test_executions SET observed_admission_receipt=?::jsonb WHERE id=?",
        receipt.toString(),
        execution);
    db.jdbc.update(
        "UPDATE ui_test_executions SET observed_admission_receipt=?::jsonb WHERE id=?",
        receipt.toString(),
        execution);
    assertThatThrownBy(
            () ->
                db.jdbc.update(
                    "UPDATE ui_test_executions SET observed_admission_receipt=NULL WHERE id=?",
                    execution))
        .hasMessageContaining("immutable");
  }

  @Test
  void realLegacyChromeUpgradeAndMillisecondNormalization() throws Exception {
    try (var pg = new PostgreSQLContainer<>("postgres:15-alpine")) {
      pg.start();
      var ds = new DriverManagerDataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
      var jdbc = new JdbcTemplate(ds);
      Flyway.configure().dataSource(ds).target("13").load().migrate();
      jdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES ('legacy','legacy','legacy@example.test')");
      jdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
              + " VALUES ('LEGACY','legacy','unit','LOW','legacy@example.test','Development')");
      var id = UUID.randomUUID();
      jdbc.update(
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by) VALUES"
              + " (?,'legacy','LEGACY','Development','chrome','[]','legacy@example.test')",
          id);
      assertThat(jdbc.queryForObject("SELECT browser FROM ui_tests WHERE id=?", String.class, id))
          .isEqualTo("chrome");
      Flyway.configure().dataSource(ds).load().migrate();
      jdbc.update(
          "UPDATE ui_tests SET authoring=?::jsonb WHERE id=?",
          "{\"authoringSchemaVersion\":2,\"steps\":[]}",
          id);
      var tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
      var current = tx.execute(t -> new GuidedPublicationBaseRepository(jdbc, C).lockCurrent(id));
      assertThat(current.document().path("configuration").path("browser").asText())
          .isEqualTo("chromium");
      assertThat(com.citi.put.checks.studio.dto.LegacyStudioAdapter.normalizeBrowser("chrome"))
          .isEqualTo(current.document().path("configuration").path("browser").asText());
    }
    assertThat(PublicationContracts.time(Instant.parse("2026-10-09T00:00:00Z")))
        .isEqualTo("2026-10-09T00:00:00.000Z");
    Instant sub = Instant.parse("2026-10-09T00:00:00.123999999Z");
    assertThat(PublicationContracts.time(sub)).isEqualTo("2026-10-09T00:00:00.123Z");
    assertThat(PublicationContracts.millisecond(sub)).isBefore(sub);
  }

  /** Synthetic relational receipts only: these do not prove a human answer or browser action. */
  static ObjectNode choiceReceipt(String preparation) {
    ObjectNode receipt =
        C.object()
            .put("version", 1)
            .put("sessionId", "session")
            .put("preparationId", preparation)
            .put("clarificationId", "question")
            .put("obligationId", UUID.randomUUID().toString())
            .put("contextIdentityHash", "a".repeat(64))
            .put("meaningsHash", "b".repeat(64))
            .put("questionCaptureHash", "c".repeat(64))
            .put("acceptedChoiceId", "choice");
    ObjectNode answer =
        receipt
            .putObject("answer")
            .put("sessionId", "session")
            .put("scopeHash", "d".repeat(64))
            .put("clarificationId", "question")
            .put("documentId", "document")
            .put("generation", 1)
            .put("choiceId", "choice")
            .put("nodeId", "node")
            .putNull("bindingId")
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("resolvedAt", "2026-10-09T13:00:00.123456789Z");
    answer
        .putObject("coordinate")
        .put("stepId", "00000000-0000-0000-0000-000000000002")
        .put("ordinal", 0);
    return receipt;
  }

  private static void insertReceipt(
      Database db, String id, com.fasterxml.jackson.databind.JsonNode receipt) {
    db.sessions.lock("session");
    db.jdbc.update(
        "INSERT INTO"
            + " studio_guided_preparations(session_id,preparation_id,context_id,owner_fence,"
            + "request_digest,proof,expires_at)"
            + " SELECT"
            + " session_id,?,context_id,owner_fence,request_digest,"
            + "jsonb_set(proof,'{preparationId}',to_jsonb(?::text)),clock_timestamp()+interval"
            + " '60 seconds' FROM studio_guided_publication_preparations WHERE"
            + " observed_choice_receipt IS NULL ORDER BY preparation_id LIMIT 1",
        id,
        id);
    db.jdbc.update(
        "INSERT INTO studio_guided_publication_preparations(session_id,preparation_id,context_id,"
            + "owner_fence,request_digest,evidence_hash,inputs_hash,materialization_revision,"
            + "source_manifest_hash,observation_hash,execution_evidence,proposal,proof,"
            + "captured_at,observed_choice_receipt) SELECT"
            + " session_id,?,context_id,owner_fence,request_digest,evidence_hash,inputs_hash,"
            + "materialization_revision,source_manifest_hash,observation_hash,execution_evidence,"
            + "proposal,jsonb_set(proof,'{preparationId}',to_jsonb(?::text)),clock_timestamp(),?::jsonb"
            + " FROM studio_guided_publication_preparations WHERE observed_choice_receipt IS NULL"
            + " ORDER BY preparation_id LIMIT 1",
        id,
        id,
        receipt == null ? null : receipt.toString());
  }

  @Test
  void observedChoiceReceiptIsOptionalImmutableAndRollsBackWithPreparation() throws Exception {
    try (var db = new Database()) {
      db.capture();
      var flow = GuidedPublicationEvidenceTest.setup(db);
      GuidedPublicationEvidenceTest.capture(db, flow, 0);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT observed_choice_receipt IS NULL FROM"
                      + " studio_guided_publication_preparations",
                  Boolean.class))
          .isTrue();
      ObjectNode valid = choiceReceipt("accepted-prep");
      db.tx.executeWithoutResult(tx -> insertReceipt(db, "accepted-prep", valid));
      assertThat(
              C.parse(
                  db.jdbc.queryForObject(
                      "SELECT observed_choice_receipt::text FROM"
                          + " studio_guided_publication_preparations WHERE"
                          + " preparation_id='accepted-prep'",
                      String.class)))
          .isEqualTo(valid);
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_publication_preparations SET"
                          + " observed_choice_receipt=NULL WHERE preparation_id='accepted-prep'"))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "DELETE FROM studio_guided_publication_preparations WHERE"
                          + " preparation_id='accepted-prep'"))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () ->
                  db.jdbc.update(
                      "UPDATE studio_guided_publication_preparations SET"
                          + " observed_choice_receipt=?::jsonb WHERE observed_choice_receipt IS"
                          + " NULL",
                      valid.toString()))
          .hasMessageContaining("immutable");
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      tx -> {
                        insertReceipt(db, "rollback-prep", choiceReceipt("rollback-prep"));
                        throw new IllegalStateException("injected rollback");
                      }))
          .hasMessage("injected rollback");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_preparations WHERE"
                      + " preparation_id='rollback-prep'",
                  Integer.class))
          .isZero();
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_publication_preparations WHERE"
                      + " preparation_id='rollback-prep'",
                  Integer.class))
          .isZero();
      db.tx.executeWithoutResult(tx -> insertReceipt(db, "legacy-null", null));
    }
  }

  @Test
  void observedChoiceReceiptRejectsMissingExtraNullWrongTypesAndRowIdentity() throws Exception {
    try (var db = new Database()) {
      db.capture();
      var flow = GuidedPublicationEvidenceTest.setup(db);
      GuidedPublicationEvidenceTest.capture(db, flow, 0);
      ObjectNode valid = choiceReceipt("probe");
      db.tx.executeWithoutResult(
          tx -> {
            insertReceipt(db, "probe", valid);
            tx.setRollbackOnly();
          });
      java.util.List<com.fasterxml.jackson.databind.JsonNode> mutations =
          new java.util.ArrayList<>();
      mutations.add(C.parse("null"));
      mutations.add(C.parse("true"));
      mutations.add(C.parse("[]"));
      mutations.add(C.object());
      mutations.add(valid.deepCopy().put("extra", true));
      for (var names = valid.fieldNames(); names.hasNext(); ) {
        String key = names.next();
        ObjectNode missing = valid.deepCopy();
        missing.remove(key);
        mutations.add(missing);
        mutations.add(valid.deepCopy().putNull(key));
        mutations.add(valid.deepCopy().put(key, false));
      }
      for (var names = valid.path("answer").fieldNames(); names.hasNext(); ) {
        String key = names.next();
        ObjectNode missing = valid.deepCopy();
        missing.withObject("/answer").remove(key);
        mutations.add(missing);
        if (!key.equals("bindingId")) {
          ObjectNode nil = valid.deepCopy();
          nil.withObject("/answer").putNull(key);
          mutations.add(nil);
        }
        ObjectNode wrong = valid.deepCopy();
        wrong.withObject("/answer").put(key, false);
        mutations.add(wrong);
      }
      for (String key :
          List.of("sessionId", "preparationId", "clarificationId", "acceptedChoiceId")) {
        mutations.add(valid.deepCopy().put(key, "other"));
      }
      for (String key : List.of("stepId", "ordinal")) {
        ObjectNode missing = valid.deepCopy();
        missing.withObject("/answer/coordinate").remove(key);
        mutations.add(missing);
      }
      ObjectNode extra = valid.deepCopy();
      extra.withObject("/answer/coordinate").put("extra", 0);
      mutations.add(extra);
      for (long generation : new long[] {-1, 2147483648L}) {
        ObjectNode bad = valid.deepCopy();
        bad.withObject("/answer").put("generation", generation);
        mutations.add(bad);
      }
      for (String key : List.of("sourceRevision", "configurationRevision")) {
        for (String revision : List.of("01", "-1", "9223372036854775808")) {
          ObjectNode bad = valid.deepCopy();
          bad.withObject("/answer").put(key, revision);
          mutations.add(bad);
        }
      }
      for (String time :
          List.of(
              "not-time",
              "2026-02-30T00:00:00Z",
              "infinity",
              "2026-10-09T13:00:00+00:00",
              "2026-10-09T13:00:00.1234567890Z",
              "2026-10-09T29:00:00Z",
              "2026-10-09T24:00:00Z",
              "2026-00-09T13:00:00Z")) {
        ObjectNode bad = valid.deepCopy();
        bad.withObject("/answer").put("resolvedAt", time);
        mutations.add(bad);
      }
      ObjectNode answerExtra = valid.deepCopy();
      answerExtra.withObject("/answer").put("extra", true);
      mutations.add(answerExtra);
      for (int ordinal : new int[] {-1, 8}) {
        ObjectNode badOrdinal = valid.deepCopy();
        badOrdinal.withObject("/answer/coordinate").put("ordinal", ordinal);
        mutations.add(badOrdinal);
      }
      for (String key : List.of("stepId", "ordinal")) {
        ObjectNode nil = valid.deepCopy();
        nil.withObject("/answer/coordinate").putNull(key);
        mutations.add(nil);
        ObjectNode wrong = valid.deepCopy();
        wrong.withObject("/answer/coordinate").put(key, false);
        mutations.add(wrong);
      }
      ObjectNode badStep = valid.deepCopy();
      badStep.withObject("/answer/coordinate").put("stepId", "");
      mutations.add(badStep);
      for (String key : List.of("sessionId", "clarificationId", "choiceId")) {
        ObjectNode mismatch = valid.deepCopy();
        mismatch.withObject("/answer").put(key, "other");
        mutations.add(mismatch);
      }
      ObjectNode emptyBinding = valid.deepCopy();
      emptyBinding.withObject("/answer").put("bindingId", "");
      mutations.add(emptyBinding);
      ObjectNode stringGeneration = valid.deepCopy();
      stringGeneration.withObject("/answer").put("generation", "1");
      mutations.add(stringGeneration);
      mutations.add(valid.deepCopy().put("obligationId", "not-a-uuid"));
      mutations.add(valid.deepCopy().put("contextIdentityHash", "A".repeat(64)));
      mutations.add(valid.deepCopy().put("version", "1"));
      mutations.add(valid.deepCopy().put("version", 1.5));
      for (var mutation : mutations) {
        assertThatThrownBy(
                () -> db.tx.executeWithoutResult(tx -> insertReceipt(db, "probe", mutation)))
            .as("malformed synthetic receipt: %s", mutation)
            .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(
                db.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_preparations WHERE preparation_id='probe'",
                    Integer.class))
            .isZero();
      }
      db.tx.executeWithoutResult(tx -> insertReceipt(db, "probe", valid));
    }
  }

  @Test
  void observedChoiceCanonicalBytesAndUnicodeIdsUseIndependentBounds() {
    try (var db = new Database()) {
      ObjectNode valid = choiceReceipt("preparation");
      assertReceiptShape(db, valid, true);
      // Escaped control scalars remain within each ID bound but expand to six
      // canonical bytes. Coordinate.stepId preserves the original generic ID type.
      ObjectNode large = valid.deepCopy();
      for (String key :
          List.of("sessionId", "clarificationId", "acceptedChoiceId", "preparationId")) {
        large.put(key, String.valueOf((char) 1).repeat(256));
      }
      ObjectNode answer = large.withObject("/answer");
      for (String key :
          List.of(
              "sessionId", "clarificationId", "choiceId", "documentId", "nodeId", "bindingId")) {
        answer.put(key, String.valueOf((char) 1).repeat(256));
      }
      answer
          .withObject("/coordinate")
          .put("stepId", String.valueOf((char) 1).repeat(256))
          .put("ordinal", 7);
      answer
          .put("generation", Integer.MAX_VALUE)
          .put("sourceRevision", "9223372036854775807")
          .put("configurationRevision", "9223372036854775807");
      int bytes = canonicalBytes(large);
      assertThat(bytes).isGreaterThan(16384);
      // Replace six-byte escaped scalars with one-byte ASCII, then remove up to
      // four ASCII bytes from preparationId. All IDs remain individually bounded.
      for (String pointer : List.of("/preparationId", "/answer/documentId")) {
        int slash = pointer.lastIndexOf('/');
        ObjectNode parent = (ObjectNode) large.at(pointer.substring(0, slash));
        String field = pointer.substring(slash + 1);
        String value = parent.path(field).asText();
        while (bytes - 16384 >= 5 && value.indexOf((char) 1) >= 0) {
          int index = value.indexOf((char) 1);
          value = value.substring(0, index) + "a" + value.substring(index + 1);
          parent.put(field, value);
          bytes -= 5;
        }
      }
      large.put("preparationId", large.path("preparationId").asText().substring(bytes - 16384));
      assertThat(canonicalBytes(large)).isEqualTo(16384);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT studio_publication_canonical(?::jsonb)", String.class, large.toString()))
          .isEqualTo(GuidedContracts.canonical(large));
      assertReceiptShape(db, large, true);
      ObjectNode over = large.deepCopy();
      over.put("preparationId", "\"" + over.path("preparationId").asText().substring(1));
      assertThat(canonicalBytes(over)).isEqualTo(16385);
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT octet_length(convert_to(studio_publication_canonical(?::jsonb),'UTF8'))",
                  Integer.class,
                  over.toString()))
          .isEqualTo(16385);
      assertReceiptShape(db, over, false);
      ObjectNode unicode = valid.deepCopy();
      for (String value : List.of("😀".repeat(256), "e\u0301".repeat(128), "x".repeat(256))) {
        unicode.withObject("/answer").put("nodeId", value);
        assertReceiptShape(db, unicode, true);
      }
      for (String value : List.of("😀".repeat(257), "e\u0301".repeat(129), "x".repeat(257), "")) {
        unicode.withObject("/answer").put("nodeId", value);
        assertReceiptShape(db, unicode, false);
      }
      ObjectNode zero = valid.deepCopy();
      zero.withObject("/answer")
          .put("generation", 0)
          .put("sourceRevision", "0")
          .put("configurationRevision", "0")
          .put("resolvedAt", "2026-10-09T13:00:00Z")
          .put("bindingId", "binding");
      assertReceiptShape(db, zero, true);
    }
  }

  private static int canonicalBytes(com.fasterxml.jackson.databind.JsonNode receipt) {
    return GuidedContracts.canonical(receipt)
        .getBytes(java.nio.charset.StandardCharsets.UTF_8)
        .length;
  }

  private static void assertReceiptShape(Database db, ObjectNode receipt, boolean expected) {
    assertThat(
            db.jdbc.queryForObject(
                "SELECT studio_publication_observed_choice_receipt(?::jsonb)",
                Boolean.class,
                receipt.toString()))
        .as("synthetic closed receipt shape")
        .isEqualTo(expected);
  }
}
