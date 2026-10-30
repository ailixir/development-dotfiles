package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.secrets.SecretAuditLifecycle;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Real guarded PostgreSQL lineage and terminal Java call sites; no Vault/browser proof claimed. */
class SecretAuditLifecycleIT {
  private record Owner(
      GuidedSecretLoginMigrationTest.RetryFixture fixture,
      SecretAuditLifecycle lifecycle,
      SecretUseAuditRecorder recorder,
      StudioDispatchLedgerStatements ledger,
      UUID attempt)
      implements AutoCloseable {
    @Override
    public void close() {
      fixture.close();
    }
  }

  private Owner owner(boolean resolved) throws Exception {
    var fixture = GuidedSecretLoginMigrationTest.publishedRetry();
    var recorder = new SecretUseAuditRecorder(fixture.db().jdbc);
    var lifecycle = new SecretAuditLifecycle(fixture.db().jdbc, recorder);
    var ledger = new StudioDispatchLedgerStatements(fixture.db().jdbc);
    ledger.installSecretAudit(lifecycle);
    UUID attempt = UUID.fromString(fixture.original().path("attemptId").asText());
    fixture
        .db()
        .tx
        .executeWithoutResult(
            status -> {
              assertThat(
                      ledger.claim(
                          fixture.id(), "worker", Instant.now().plusSeconds(60), Instant.now()))
                  .isEqualTo(1);
              if (resolved) {
                assertThat(ledger.beginObservedDispatch(fixture.id(), "worker", attempt))
                    .isEqualTo(1);
              }
              lifecycle.replayRelease(
                  fixture.original(),
                  List.of("PASS"),
                  resolved ? Map.of("PASS", "opaque-version-1") : Map.of(),
                  resolved
                      ? SecretUseAuditRecorder.ResolutionOutcome.RESOLVED
                      : SecretUseAuditRecorder.ResolutionOutcome.VAULT_UNAVAILABLE);
            });
    return new Owner(fixture, lifecycle, recorder, ledger, attempt);
  }

  private String usage(Owner owner) {
    return owner
        .fixture()
        .db()
        .jdbc
        .queryForObject(
            "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='USAGE'",
            String.class,
            owner.fixture().id());
  }

  @Test
  void actualReaperCloseWritesOneUnknownSummaryWithoutInventingChildEffects() throws Exception {
    try (var owner = owner(true)) {
      owner
          .fixture()
          .transaction()
          .executeWithoutResult(
              status -> {
                assertThat(
                        owner
                            .ledger()
                            .closeByReaper(
                                owner.fixture().id(),
                                ExecutionErrorCode.START_TIMEOUT,
                                Instant.now()))
                    .isEqualTo(1);
                assertThat(
                        owner
                            .ledger()
                            .closeByReaper(
                                owner.fixture().id(),
                                ExecutionErrorCode.START_TIMEOUT,
                                Instant.now()))
                    .isZero();
              });
      assertThat(usage(owner)).isEqualTo("UNKNOWN_OUTCOME");
      assertThat(
              owner
                  .fixture()
                  .db()
                  .jdbc
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='USAGE'",
                      Integer.class,
                      owner.fixture().id()))
          .isEqualTo(1);
    }
  }

  @Test
  void existingPositiveUsageSurvivesLaterTerminalOwnerUncertainty() throws Exception {
    try (var owner = owner(true)) {
      owner
          .fixture()
          .transaction()
          .executeWithoutResult(
              status ->
                  owner
                      .lifecycle()
                      .replayTerminal(
                          owner.fixture().id(), owner.attempt(), Map.of("PASS", "USED")));
      owner
          .fixture()
          .transaction()
          .executeWithoutResult(
              status ->
                  assertThat(
                          owner
                              .ledger()
                              .closeWithError(
                                  owner.fixture().id(),
                                  ExecutionErrorCode.DISPATCH_FAILED,
                                  Instant.now()))
                      .isEqualTo(1));
      assertThat(usage(owner)).isEqualTo("USED");
    }
  }

  @Test
  void terminalHistoryLedgerAndUnknownAuditRollbackTogether() throws Exception {
    try (var owner = owner(true)) {
      assertThatThrownBy(
              () ->
                  owner
                      .fixture()
                      .transaction()
                      .executeWithoutResult(
                          status -> {
                            assertThat(
                                    owner
                                        .ledger()
                                        .closeByReaper(
                                            owner.fixture().id(),
                                            ExecutionErrorCode.DISPATCH_UNKNOWN,
                                            Instant.now()))
                                .isEqualTo(1);
                            throw new IllegalStateException("controlled terminal rollback");
                          }))
          .hasMessage("controlled terminal rollback");
      assertThat(
              owner
                  .fixture()
                  .db()
                  .jdbc
                  .queryForObject(
                      "SELECT state FROM studio_dispatch_ledger WHERE execution_id=?",
                      String.class,
                      owner.fixture().id()))
          .isEqualTo("DISPATCHING");
      assertThat(
              owner
                  .fixture()
                  .db()
                  .jdbc
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND row_kind='USAGE'",
                      Integer.class,
                      owner.fixture().id()))
          .isZero();
      owner
          .fixture()
          .transaction()
          .executeWithoutResult(
              status ->
                  assertThat(
                          owner
                              .ledger()
                              .closeByReaper(
                                  owner.fixture().id(),
                                  ExecutionErrorCode.DISPATCH_UNKNOWN,
                                  Instant.now()))
                      .isEqualTo(1));
      assertThat(usage(owner)).isEqualTo("UNKNOWN_OUTCOME");
    }
  }

  @Test
  void authoritativeNoAdmissionRefusalSettlesExactAttemptBeforeRetry() throws Exception {
    try (var owner = owner(true)) {
      owner
          .fixture()
          .transaction()
          .executeWithoutResult(
              status -> {
                assertThat(
                        owner
                            .ledger()
                            .lockUnadmittedDispatch(owner.fixture().id(), UUID.randomUUID()))
                    .isFalse();
                assertThat(
                        owner
                            .ledger()
                            .lockUnadmittedDispatch(owner.fixture().id(), owner.attempt()))
                    .isTrue();
                owner.lifecycle().replayNoSend(owner.fixture().id(), owner.attempt());
                assertThat(
                        owner
                            .ledger()
                            .returnAfterDefiniteRefusal(owner.fixture().id(), owner.attempt()))
                    .isEqualTo(1);
              });
      assertThat(usage(owner)).isEqualTo("REFUSED");
      assertThat(
              owner
                  .fixture()
                  .db()
                  .jdbc
                  .queryForObject(
                      "SELECT definite_refusal_attempt_id FROM studio_dispatch_ledger WHERE execution_id=?",
                      UUID.class,
                      owner.fixture().id()))
          .isEqualTo(owner.attempt());
    }
  }

  @Test
  void actualZeroSendOutageDecisionRetainsDistinctRetryAuthorityAndRefusedUsage() throws Exception {
    try (var owner = owner(false)) {
      owner
          .fixture()
          .transaction()
          .executeWithoutResult(
              status -> {
                owner.lifecycle().replayNoSend(owner.fixture().id(), owner.attempt());
                assertThat(
                        owner
                            .ledger()
                            .releaseObservedOutageClaim(
                                owner.fixture().id(), "worker", owner.attempt()))
                    .isEqualTo(1);
              });
      assertThat(usage(owner)).isEqualTo("REFUSED");
      assertThat(
              owner
                  .fixture()
                  .db()
                  .jdbc
                  .queryForObject(
                      "SELECT zero_send_decision_attempt_id FROM studio_dispatch_ledger WHERE execution_id=?",
                      UUID.class,
                      owner.fixture().id()))
          .isEqualTo(owner.attempt());
      assertThat(
              owner
                  .fixture()
                  .db()
                  .jdbc
                  .queryForObject(
                      ("SELECT definite_refusal_attempt_id IS NULL AND attempt_id IS NULL AND admission_id IS"
                          + " NULL FROM studio_dispatch_ledger WHERE execution_id=?"),
                      Boolean.class,
                      owner.fixture().id()))
          .isTrue();
    }
  }

  @ParameterizedTest
  @ValueSource(booleans = {false, true})
  void sameReferenceEarlierUsedCannotHideAnotherConsumedAdmissionAndTerminalRollback(
      boolean rollback) throws Exception {
    try (var fixture = GuidedSecretLoginMigrationTest.publishedRetry()) {
      var jdbc = fixture.jdbc();
      var tx = fixture.transaction();
      var contracts = new com.citi.put.checks.studio.guided.session.GuidedContracts();
      String sessionId = "multi-admission-session",
          step = fixture.db().stepId.toString(),
          reference = "ref-PASS";
      var scope =
          contracts
              .object()
              .put("principalId", "owner@example.test")
              .put("csiId", "CSI")
              .put("environmentId", "Development")
              .put("sourceRevision", "1")
              .put("configurationRevision", "1");
      String scopeHash = com.citi.put.checks.studio.guided.session.GuidedContracts.hash(scope);
      var session =
          contracts
              .object()
              .put("sessionId", sessionId)
              .put("testId", fixture.testId().toString())
              .put("state", "ACTING");
      session.set("scope", scope);
      session.put("scopeHash", scopeHash);
      session.putObject("owner").put("workerId", "worker").put("fence", 1);
      session.putArray("sourceSteps").addObject().put("stepId", step);
      jdbc.update(
          ("INSERT INTO studio_guided_sessions(session_id,test_id,principal_id,scope_hash,state,e"
              + "xpires_at,document) VALUES (?,?,'owner@example.test',?,'ACTING',now()+interval '10 mi"
              + "nutes',?::jsonb)"),
          sessionId,
          fixture.testId().toString(),
          scopeHash,
          session.toString());
      var manifest =
          contracts
              .object()
              .put("testId", fixture.testId().toString())
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("policy", "INPUT-POLICY-01-A");
      manifest
          .putArray("sourceSteps")
          .addObject()
          .put("stepId", step)
          .put("text", fixture.db().sourceText);
      manifest
          .putArray("configurationReferences")
          .addObject()
          .put("referenceId", reference)
          .put("referenceName", "PASS")
          .put("kind", "secretRef")
          .put("stepId", step)
          .put("intendedSlot", "fill.value");
      jdbc.update(
          ("INSERT INTO studio_guided_source_manifests(session_id,scope_hash,manifest,manifest_ha"
              + "sh) VALUES (?,?,?::jsonb,?)"),
          sessionId,
          scopeHash,
          manifest.toString(),
          com.citi.put.checks.studio.guided.session.GuidedContracts.hash(manifest));
      var assignment =
          contracts
              .object()
              .put("sessionId", sessionId)
              .put("assignmentId", "multi-assignment")
              .put("workerId", "worker")
              .put("scopeHash", scopeHash)
              .put("expectedFence", 0);
      jdbc.update(
          ("INSERT INTO studio_guided_assignments(session_id,assignment_id,scope_hash,worker_id,e"
              + "xpected_fence,intent) VALUES (?,'multi-assignment',?,'worker',0,?::jsonb)"),
          sessionId,
          scopeHash,
          assignment.toString());
      var inputs = contracts.object().put("sessionId", sessionId).put("scopeHash", scopeHash);
      var input =
          inputs
              .putArray("inputs")
              .addObject()
              .put("inputId", "input-PASS")
              .put("sourceStepId", step)
              .put("kind", "secretRef")
              .put("secretId", "PASS")
              .put("intendedSlot", "fill.value");
      input
          .putObject("provenance")
          .put("referenceKind", "configuration")
          .put("configurationRevision", "1")
          .put("referenceId", reference)
          .put("referenceName", "PASS")
          .put("kind", "secretRef")
          .put("stepId", step)
          .put("intendedSlot", "fill.value");
      // V21: closed identity and canonical hash; live because the ledger rows below are admitted
      // only against the live head.
      var closedInputs =
          com.citi.put.checks.studio.support.GuidedLedgerSeed.closedInputs(inputs, "1", "1");
      String inputsHash =
          com.citi.put.checks.studio.guided.session.GuidedContracts.hash(closedInputs);
      jdbc.update(
          ("INSERT INTO studio_guided_materializations(session_id,scope_hash,context_id,context_r"
              + "evision,materialization_revision,worker_id,owner_fence,source_revision,configuration_"
              + "revision,authored_inputs_hash,authored_inputs,live) VALUES (?,?,'multi-context',1,1,'"
              + "worker',1,'1','1',?,?::jsonb,true)"),
          sessionId,
          scopeHash,
          inputsHash,
          closedInputs.toString());
      var seed =
          new com.citi.put.checks.studio.support.GuidedLedgerSeed(
              jdbc, sessionId, "multi-context", 1, inputsHash);
      var actions = new java.util.ArrayList<com.fasterxml.jackson.databind.node.ObjectNode>();
      for (int ordinal = 0; ordinal < 2; ordinal++) {
        String admission = "multi-admission-" + ordinal;
        var action =
            contracts
                .object()
                .put("sessionId", sessionId)
                .put("ownerFence", 1)
                .put("dispatchCount", 1)
                .put("state", ordinal == 0 ? "SUCCEEDED" : "DISPATCHING")
                .put("outcomeCode", ordinal == 0 ? "OK" : "PENDING");
        action.putObject("coordinate").put("stepId", step).put("ordinal", ordinal);
        action.putObject("admission").put("admissionId", admission);
        var proposal = contracts.object();
        proposal
            .putObject("operation")
            .put("kind", "fill")
            .putObject("value")
            .put("kind", "secretRef")
            .put("sourceInputId", "input-PASS");
        seed.action(admission, step, ordinal, action, proposal);
        actions.add(action);
      }
      // Controlled consumed ledger/materialization provenance, all SQL guards enabled; no live
      // IPC/browser claim.
      var vault = new com.citi.put.checks.studio.secrets.FakeStudioVaultProvider(Map.of());
      var vaultScope =
          com.citi.put.checks.studio.secrets.VaultScope.of("CSI", "Development", fixture.testId());
      vault.rotate(
          com.citi.put.checks.studio.secrets.StudioVaultProvider.ReferenceKind.SECRET,
          vaultScope,
          "PASS",
          "GUIDED-MULTI-" + UUID.randomUUID());
      var resolver = new com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver(vault);
      var lifecycle = new SecretAuditLifecycle(jdbc, new SecretUseAuditRecorder(jdbc));
      try (var resolved =
          resolver.resolve(
              "CSI",
              "Development",
              fixture.testId(),
              "owner@example.test",
              new com.citi.put.checks.studio.dispatch.ReferenceDeclarations(
                  List.of(), List.of("PASS")))) {
        tx.executeWithoutResult(
            t -> {
              lifecycle.guidedRelease(
                  session,
                  actions.getFirst(),
                  "PASS",
                  resolved.secretVersions().get("PASS"),
                  SecretUseAuditRecorder.ResolutionOutcome.RESOLVED);
              lifecycle.guidedOutcome(session, actions.getFirst());
            });
      }
      var terminal = session.deepCopy().put("state", "FAILED");
      Runnable finalize =
          () ->
              tx.executeWithoutResult(
                  t -> {
                    jdbc.update(
                        "UPDATE studio_guided_sessions SET state='FAILED',document=?::jsonb WHERE session_id=?",
                        terminal.toString(),
                        sessionId);
                    lifecycle.guidedTerminal(terminal);
                    assertThat(
                            jdbc.queryForObject(
                                "SELECT count(*) FROM studio_secret_use_audit WHERE session_id=? AND row_kind='USAGE'",
                                Integer.class,
                                sessionId))
                        .isEqualTo(2);
                  });
      if (rollback) {
        assertThatThrownBy(
                () ->
                    tx.executeWithoutResult(
                        t -> {
                          finalize.run();
                          throw new IllegalStateException("controlled multi-admission rollback");
                        }))
            .hasMessage("controlled multi-admission rollback");
        assertThat(
                jdbc.queryForObject(
                    "SELECT state FROM studio_guided_sessions WHERE session_id=?",
                    String.class,
                    sessionId))
            .isEqualTo("ACTING");
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM studio_secret_use_audit WHERE session_id=? AND row_kind='USAGE'",
                    Integer.class,
                    sessionId))
            .isEqualTo(1);
      }
      finalize.run();
      tx.executeWithoutResult(t -> lifecycle.guidedTerminal(terminal));
      assertThat(
              jdbc.queryForList(
                  ("SELECT usage_outcome FROM studio_secret_use_audit WHERE session_id=? AND row_kind='US"
                      + "AGE' ORDER BY coordinate_ordinal"),
                  String.class,
                  sessionId))
          .containsExactly("USED", "UNKNOWN_OUTCOME");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_secret_use_audit WHERE session_id=? AND usage_outcome='NOT_USED'",
                  Integer.class,
                  sessionId))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  ("SELECT admission_id='multi-admission-1' AND coordinate_ordinal=1 AND source_reference"
                      + "_id='ref-PASS' AND release_seq IS NULL AND release_id IS NULL AND vault_version IS NU"
                      + "LL AND outcome IS NULL FROM studio_secret_use_audit WHERE session_id=? AND usage_outc"
                      + "ome='UNKNOWN_OUTCOME'"),
                  Boolean.class,
                  sessionId))
          .isTrue();
      assertThat(vault.readCount()).isEqualTo(1);
    }
  }
}
