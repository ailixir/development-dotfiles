package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.support.GuidedLedgerSeed;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class GuidedTranslationTest {
  private final GuidedContracts c = new GuidedContracts();

  private static GuidedTranslationMigrationTest.Database delayedDb;

  @org.junit.jupiter.api.BeforeAll
  static void startDelayedDatabase() {
    delayedDb = new GuidedTranslationMigrationTest.Database();
  }

  @org.junit.jupiter.api.AfterAll
  static void stopDelayedDatabase() {
    delayedDb.close();
  }

  /**
   * Real source rows and production store; callback checkpoints below are synthetic, not browser
   * evidence.
   */
  private final class DelayedFixture {
    final String id = java.util.UUID.randomUUID().toString();
    final java.util.UUID testId;
    final ObjectNode obligation;
    final ObjectNode second;

    DelayedFixture(boolean strict) throws Exception {
      this(strict, List.of());
    }

    DelayedFixture(boolean strict, List<String> referenceNames) throws Exception {
      var fixtures = new com.citi.put.checks.studio.StudioExecutionFixtures(delayedDb.jdbc);
      fixtures.seedUser("delayed-owner@citi.com");
      fixtures.seedCsi("60457", "delayed-owner@citi.com");
      testId =
          fixtures.seedTest(
              "Delayed source",
              "60457",
              "delayed-owner@citi.com",
              List.of("Click Confirmation", "Click Done"));
      delayedDb.jdbc.update("UPDATE ui_tests SET timeout_seconds=2 WHERE id=?", testId);
      ObjectNode document =
          (ObjectNode)
              c.parse(
                      Files.readString(
                          Path.of(
                              "../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
                  .path("documents")
                  .path("session")
                  .deepCopy();
      document
          .put("sessionId", id)
          .put("testId", testId.toString())
          .put("state", "PROPOSING")
          .put("expiresAt", Instant.now().plusSeconds(600).toString());
      document
          .withObject("/scope")
          .put("principalId", "delayed-owner@citi.com")
          .put("csiId", "60457")
          .put("environmentId", "Production")
          .put("sourceRevision", "1")
          .put("configurationRevision", "1");
      document.put("scopeHash", GuidedContracts.hash(document.path("scope")));
      document
          .withObject("/runAuthorization")
          .put("principalId", "delayed-owner@citi.com")
          .set("scopeHash", document.path("scopeHash"));
      document
          .withObject("/owner")
          .put("leaseExpiresAt", Instant.now().plusSeconds(300).toString());
      obligation =
          c.object()
              .put("obligationId", java.util.UUID.randomUUID().toString())
              .put("stepId", java.util.UUID.randomUUID().toString())
              .put("occurrence", 0)
              .put("operationKind", "click")
              .put("targetIntent", "Confirmation")
              .putNull("referenceIndex")
              .putNull("needId")
              .putNull("predicate");
      second =
          obligation
              .deepCopy()
              .put("obligationId", java.util.UUID.randomUUID().toString())
              .put("stepId", java.util.UUID.randomUUID().toString())
              .put("targetIntent", "Done");
      document
          .putArray("sourceSteps")
          .addObject()
          .put("stepId", obligation.path("stepId").asText())
          .put("requiresAssertion", false);
      document
          .withArray("sourceSteps")
          .addObject()
          .put("stepId", second.path("stepId").asText())
          .put("requiresAssertion", false);
      var manifest =
          c.object()
              .put("testId", testId.toString())
              .put("sourceRevision", "1")
              .put("configurationRevision", "1")
              .put("policy", "INPUT-POLICY-01-A");
      manifest
          .putArray("sourceSteps")
          .addObject()
          .put("stepId", obligation.path("stepId").asText())
          .put("text", "Click Confirmation");
      manifest
          .withArray("sourceSteps")
          .addObject()
          .put("stepId", second.path("stepId").asText())
          .put("text", "Click Done");
      if (!referenceNames.isEmpty()) {
        var references = manifest.putArray("configurationReferences");
        int ordinal = 0;
        for (String name : referenceNames) {
          int index = ordinal++;
          references
              .addObject()
              .put("referenceId", "cfg-controlled-" + index)
              .put("stepId", (index < 2 ? obligation : second).path("stepId").asText())
              .put("referenceName", name)
              .put("kind", "secretRef")
              .put("intendedSlot", "fill.value");
        }
      }
      delayedDb.tx.executeWithoutResult(
          tx -> {
            delayedDb.sessions.insert(document);
            delayedDb.sessions.lock(id);
            delayedDb.store.initialize(document, manifest, strict);
            ObjectNode plan = c.object();
            plan.putArray("sourceReferences");
            plan.putArray("obligations").add(obligation).add(second);
            plan.putArray("needs");
            delayedDb.store.acceptPlan(id, 0, plan);
            mutate(current -> current.progress().put("generation", 0).put("stepIndex", 0));
          });
    }

    void mutate(
        java.util.function.Consumer<
                com.citi.put.checks.studio.guided.session.GuidedSessionRepository.Session>
            action) {
      delayedDb.tx.executeWithoutResult(
          tx -> {
            var current = delayedDb.sessions.lock(id);
            action.accept(current);
            delayedDb.jdbc.update(
                "UPDATE studio_guided_sessions SET document=?::jsonb,progress=?::jsonb WHERE"
                    + " session_id=?",
                current.document().toString(),
                current.progress().toString(),
                id);
          });
    }

    /**
     * V21: the session's live revision-1 materialization, which every ledger action is admitted
     * against. It authors no plan, obligation or allocation.
     */
    GuidedLedgerSeed materialize() {
      ObjectNode document =
          delayedDb.tx.execute(tx -> delayedDb.sessions.lock(id).document().deepCopy());
      String scopeHash = document.path("scopeHash").asText();
      String worker = document.path("owner").path("workerId").asText();
      int fence = document.path("owner").path("fence").asInt();
      String contextId = id + "-context";
      ObjectNode intent =
          c.object()
              .put("sessionId", id)
              .put("assignmentId", id + "-assignment")
              .put("workerId", worker)
              .put("scopeHash", scopeHash)
              .put("expectedFence", 0);
      ObjectNode inputs =
          GuidedLedgerSeed.closedInputs(
              c.object().put("sessionId", id).put("scopeHash", scopeHash), "1", "1");
      String inputsHash = GuidedContracts.hash(inputs);
      delayedDb.jdbc.update(
          "INSERT INTO studio_guided_assignments(session_id,assignment_id,scope_hash,worker_id,"
              + "expected_fence,intent) VALUES (?,?,?,?,0,?::jsonb)",
          id,
          id + "-assignment",
          scopeHash,
          worker,
          intent.toString());
      delayedDb.jdbc.update(
          "INSERT INTO studio_guided_materializations(session_id,scope_hash,context_id,"
              + "context_revision,materialization_revision,worker_id,owner_fence,source_revision,"
              + "configuration_revision,authored_inputs_hash,authored_inputs) VALUES "
              + "(?,?,?,1,1,?,?,'1','1',?,?::jsonb)",
          id,
          scopeHash,
          contextId,
          worker,
          fence,
          inputsHash,
          inputs.toString());
      return new GuidedLedgerSeed(delayedDb.jdbc, id, contextId, fence, inputsHash);
    }

    JsonNode progress() {
      return delayedDb.tx.execute(tx -> delayedDb.sessions.lock(id).progress().deepCopy());
    }

    JsonNode active() {
      return progress().path("translationAcquisition").path("active");
    }

    GuidedTranslationStore.AcquisitionClaim acquire(boolean ready) {
      return acquire(ready, obligation);
    }

    GuidedTranslationStore.AcquisitionClaim acquire(boolean ready, JsonNode required) {
      return delayedDb.tx.execute(
          tx -> {
            var current = delayedDb.sessions.lock(id);
            var request =
                c.object()
                    .put("schemaVersion", 3)
                    .put("sessionId", id)
                    .put("contextId", "context-1")
                    .put("contextRevision", 1);
            for (String field : List.of("scopeHash", "versions")) {
              request.set(field, current.document().path(field));
            }
            request.set("workerId", current.document().path("owner").path("workerId"));
            request.set("ownerFence", current.document().path("owner").path("fence"));
            for (String field : List.of("sourceRevision", "configurationRevision")) {
              request.set(field, current.document().path("scope").path(field));
            }
            request.set("expectedGeneration", current.progress().path("generation"));
            return delayedDb.store.acquire(
                current, delayedDb.store.state(id), required, ready, request);
          });
    }

    GuidedTranslationStore.AcquisitionClaim poll() throws Exception {
      assertThat(acquire(false).disposition())
          .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.WAIT);
      Thread.sleep(120); // Outside every database transaction; exercises the real first cadence.
      var claim = acquire(false);
      assertThat(claim.disposition()).isEqualTo(GuidedTranslationStore.AcquisitionDisposition.POLL);
      return claim;
    }

    JsonNode callback(int generation) {
      ObjectNode observation =
          c.object().put("generation", generation).put("documentId", "synthetic-checkpoint");
      mutate(
          current ->
              current
                  .progress()
                  .put("generation", generation)
                  .put("observationHash", GuidedContracts.hash(observation)));
      return c.object().set("observation", observation);
    }

    GuidedTranslationStore.AcquisitionClaim settle(
        GuidedTranslationStore.AcquisitionClaim claim, JsonNode response, boolean ready) {
      return delayedDb.tx.execute(
          tx ->
              delayedDb.store.settleAcquisition(
                  delayedDb.sessions.lock(id),
                  delayedDb.store.state(id),
                  obligation,
                  claim,
                  response,
                  ready));
    }
  }

  @Test
  void knownAcquisitionSettlesCumulativelyAndRefundsOnlyOnce() throws Exception {
    var f = new DelayedFixture(true);
    assertThat(f.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    assertThat(f.active().path("usedMs").asLong()).isZero();
    var claim = f.poll();
    assertThat(f.active().path("usedMs").asLong()).isEqualTo(2000);
    var response = f.callback(1);
    assertThat(f.settle(claim, response, true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    long used = f.active().path("usedMs").asLong();
    assertThat(used).isBetween(100L, 1999L);
    assertThatThrownBy(() -> f.settle(claim, response, true)).hasMessage("STALE_GENERATION");
    assertThat(f.active().path("usedMs").asLong()).isEqualTo(used);
    assertThat(f.acquire(false).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.WAIT);
    assertThat(f.active().path("window").path("reservedMs").asLong()).isEqualTo(2000 - used);
    assertThat(f.active().path("usedMs").asLong()).isEqualTo(2000);
  }

  @Test
  void committedCallbackRecoveryKeepsExactOriginalRequestAndChargesUnknownWindow()
      throws Exception {
    var f = new DelayedFixture(true);
    var claim = f.poll();
    var response = f.callback(1);
    var recovered = f.acquire(false);
    assertThat(recovered.request()).isEqualTo(claim.request());
    assertThat(recovered.key()).isEqualTo(claim.key());
    assertThat(recovered.deadline()).isEqualTo(claim.deadline());
    assertThat(recovered.request().path("expectedGeneration").asInt()).isZero();
    assertThat(f.active().path("window").path("uncertain").asBoolean()).isTrue();
    assertThat(f.settle(recovered, response, true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    assertThat(f.active().path("usedMs").asLong()).isEqualTo(2000);
    assertThat(f.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    assertThat(f.acquire(false).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.REFUSED);
    assertThat(f.active().path("usedMs").asLong()).isEqualTo(2000);
  }

  @Test
  void settledPollRestartAndLeaseRenewalKeepDeadlineAndCheckpoint() throws Exception {
    var f = new DelayedFixture(true);
    var claim = f.poll();
    assertThat(f.settle(claim, f.callback(1), false).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.WAIT);
    JsonNode before = f.active();
    f.mutate(
        current ->
            current
                .document()
                .withObject("/owner")
                .put("leaseExpiresAt", Instant.now().plusSeconds(500).toString()));
    Thread.sleep(30);
    assertThat(f.acquire(false).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.WAIT);
    JsonNode after = f.active();
    assertThat(after.path("window").path("deadline"))
        .isEqualTo(before.path("window").path("deadline"));
    assertThat(after.path("window").path("uncertain").asBoolean()).isFalse();
    assertThat(after.path("extraPolls")).isEqualTo(before.path("extraPolls"));
    assertThat(Instant.parse(after.path("window").path("lastCheckedAt").asText()))
        .isAfter(Instant.parse(before.path("window").path("lastCheckedAt").asText()));
  }

  @Test
  void concurrentScannersShareOnePendingReservationAndOriginalKey() throws Exception {
    var f = new DelayedFixture(true);
    var claim = f.poll();
    try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
      var a = pool.submit(() -> f.acquire(false));
      var b = pool.submit(() -> f.acquire(false));
      for (var next : List.of(a.get(), b.get())) {
        assertThat(next.key()).isEqualTo(claim.key());
        assertThat(next.request()).isEqualTo(claim.request());
      }
    }
    assertThat(f.active().path("extraPolls").asInt()).isEqualTo(1);
    assertThat(f.progress().path("translationAcquisition").path("totalExtraPolls").asInt())
        .isEqualTo(1);
    assertThat(f.active().path("usedMs").asLong()).isEqualTo(2000);
  }

  @Test
  void sourcePlanObligationAndFenceMismatchCannotRefundOrRestampPendingWork() throws Exception {
    for (String variant :
        List.of("source", "configuration", "worker", "fence", "plan", "obligation", "target")) {
      var f = new DelayedFixture(true);
      var claim = f.poll();
      JsonNode before = f.active();
      if (variant.equals("source") || variant.equals("configuration")) {
        delayedDb.jdbc.update(
            "UPDATE ui_tests SET "
                + (variant.equals("source") ? "source_revision" : "configuration_revision")
                + "=2 WHERE id=?",
            f.testId);
      } else if (variant.equals("worker") || variant.equals("fence")) {
        f.mutate(
            current -> {
              if (variant.equals("worker")) {
                current.document().withObject("/owner").put("workerId", "other");
              } else {
                current.document().withObject("/owner").put("fence", 2);
              }
            });
      } else if (variant.equals("plan")) {
        delayedDb.tx.executeWithoutResult(
            tx -> {
              delayedDb.sessions.lock(f.id);
              var plan = (ObjectNode) delayedDb.store.state(f.id).path("plan");
              // A real new immutable head preserves all old meanings and has the accepted
              // closed shape; the acquisition still pins the previous head and must refuse it.
              // V21 sourceCoordinates: obligations stay in source order, so the new occurrence of
              // the first step sits directly after its predecessor, ahead of the second step.
              plan.withArray("obligations")
                  .insert(
                      1,
                      f.obligation
                          .deepCopy()
                          .put("obligationId", java.util.UUID.randomUUID().toString())
                          .put("occurrence", 1)
                          .put("targetIntent", "Confirmation"));
              delayedDb.store.acceptPlan(f.id, 1, plan);
            });
      }
      ObjectNode obligation = f.obligation.deepCopy();
      if (variant.equals("obligation")) {
        obligation.put("obligationId", java.util.UUID.randomUUID().toString());
      }
      if (variant.equals("target")) {
        obligation.put("targetIntent", "Other");
      }
      assertThatThrownBy(() -> f.acquire(false, obligation))
          .as(variant)
          .hasMessage(
              variant.equals("source") || variant.equals("configuration")
                  ? "REVISION_CONFLICT"
                  : "STALE_GENERATION");
      assertThat(f.active()).isEqualTo(before);
      assertThat(f.active().path("pending").path("request")).isEqualTo(claim.request());
    }
  }

  @Test
  void exactPendingHashAndClosedProgressAreValidatedBeforeRecovery() throws Exception {
    for (String variant : List.of("extra", "hash", "generation", "request")) {
      var f = new DelayedFixture(true);
      f.poll();
      f.mutate(
          current -> {
            var active = current.progress().withObject("/translationAcquisition/active");
            switch (variant) {
              case "extra" -> active.put("unknown", true);
              case "hash" -> active.withObject("/pending").put("requestHash", "f".repeat(64));
              case "generation" -> active.withObject("/pending").put("expectedGeneration", 100);
              default -> active.withObject("/pending/request").put("contextId", "different");
            }
          });
      JsonNode before = f.active();
      assertThatThrownBy(() -> f.acquire(false)).hasMessage("INVALID_CONTRACT");
      assertThat(f.active()).isEqualTo(before);
    }
  }

  @Test
  void lateSettlementAndClockRegressionRetainFullReservation() throws Exception {
    for (boolean backwards : List.of(false, true)) {
      var f = new DelayedFixture(true);
      var claim = f.poll();
      var response = f.callback(1);
      f.mutate(
          current -> {
            var window = current.progress().withObject("/translationAcquisition/active/window");
            Instant opened = backwards ? Instant.now() : Instant.now().minusSeconds(3);
            window
                .put("openedAt", opened.toString())
                .put("deadline", opened.plusSeconds(2).toString())
                .put(
                    "lastCheckedAt",
                    backwards ? Instant.now().plusSeconds(1).toString() : opened.toString());
          });
      var result = f.settle(claim, response, true);
      assertThat(result.disposition())
          .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.REFUSED);
      assertThat(result.errorCode()).isEqualTo("BUDGET_EXCEEDED");
      assertThat(f.active().path("usedMs").asLong()).isEqualTo(2000);
      assertThat(f.active().path("pending").isObject()).isTrue();
    }
  }

  @Test
  void stepAndSessionPollCapsAndActualObservationByteCapsRetainCharges() throws Exception {
    for (String limit : List.of("step", "session", "observations", "bytes")) {
      var f = new DelayedFixture(true);
      var claim = f.poll();
      f.settle(claim, f.callback(1), false);
      f.mutate(
          current -> {
            var marker = current.progress().withObject("/translationAcquisition");
            var active = marker.withObject("/active");
            active.put("nextPollAt", Instant.EPOCH.toString());
            switch (limit) {
              case "step" -> active.put("extraPolls", 32);
              case "session" -> marker.put("totalExtraPolls", 200);
              case "observations" ->
                  current.document().withObject("/counters").put("observations", 400);
              default ->
                  current
                      .document()
                      .withObject("/counters")
                      .put("sanitizedEvidenceBytes", 1048576 - 32768 + 1);
            }
          });
      assertThat(f.acquire(false).disposition())
          .as(limit)
          .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.REFUSED);
      assertThat(f.active().path("usedMs").asLong()).isEqualTo(2000);
      assertThat(Instant.parse(f.active().path("window").path("deadline").asText()))
          .isEqualTo(claim.deadline());
    }
  }

  @Test
  void immediateReadyAndClosedWindowsDoNotChargeIndependentModelOrHumanTime() throws Exception {
    var f = new DelayedFixture(true);
    assertThat(f.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    f.mutate(
        current ->
            current
                .progress()
                .withObject("/translationAcquisition/active")
                .put("nextPollAt", Instant.now().minusSeconds(10).toString()));
    assertThat(f.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    assertThat(f.active().path("usedMs").asLong()).isZero();
    var claim = f.poll();
    f.settle(claim, f.callback(1), true);
    long used = f.active().path("usedMs").asLong();
    Thread.sleep(2100); // Outside locks: longer than the real two-second browser allowance.
    assertThat(f.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    assertThat(f.active().path("usedMs").asLong()).isEqualTo(used);
    f.mutate(current -> current.progress().put("stepIndex", 1));
    assertThat(f.acquire(true, f.second).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    assertThat(f.active().path("usedMs").asLong()).isZero();
    assertThat(f.progress().path("translationAcquisition").path("totalExtraPolls").asInt())
        .isEqualTo(1);
  }

  @Test
  void oldPostEffectSessionCannotBackfillAllowanceButImmediateReadyRemainsCompatible()
      throws Exception {
    var f = new DelayedFixture(false);
    assertThat(f.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    assertThat(f.progress().has("translationAcquisition")).isFalse();
    // Synthetic original ledger checkpoint: a prior effect exists; no browser equivalence claimed.
    var action =
        c.object().put("sessionId", f.id).put("state", "SUCCEEDED").put("dispatchCount", 1);
    action.putObject("admission").put("admissionId", f.id + "-action");
    action
        .putObject("coordinate")
        .put("stepId", f.obligation.path("stepId").asText())
        .put("ordinal", 0);
    f.materialize()
        .action(f.id + "-action", f.obligation.path("stepId").asText(), 0, action, c.object());
    assertThatThrownBy(() -> f.acquire(false)).hasMessage("RUNTIME_INCOMPATIBLE");
    assertThat(f.progress().has("translationAcquisition")).isFalse();
    assertThat(f.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
  }

  @Test
  void strictInitializationRequiresExistingSourceAndExactConfigurationWithoutPartialManifest()
      throws Exception {
    var baseline = new DelayedFixture(true);
    assertThat(baseline.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    ObjectNode unrelated = delayedDb.seed(java.util.UUID.randomUUID().toString());
    ObjectNode manifest =
        c.object()
            .put("testId", unrelated.path("testId").asText())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("policy", "INPUT-POLICY-01-A");
    manifest.putArray("sourceSteps").addObject().put("stepId", "step").put("text", "Submit");
    assertThatThrownBy(
            () ->
                delayedDb.tx.executeWithoutResult(
                    tx -> {
                      delayedDb.sessions.lock(unrelated.path("sessionId").asText());
                      delayedDb.store.initialize(unrelated, manifest, true);
                    }))
        .hasMessage("MISSING_SOURCE");
    boolean retainedManifest =
        delayedDb.tx.execute(tx -> delayedDb.store.exists(unrelated.path("sessionId").asText()));
    assertThat(retainedManifest).isFalse();
    delayedDb.jdbc.update(
        "UPDATE ui_tests SET configuration_revision=2 WHERE id=?", baseline.testId);
    assertThatThrownBy(() -> baseline.acquire(false)).hasMessage("REVISION_CONFLICT");
  }

  @Test
  void committedLateUsageSurvivesAcquisitionRefusalWithoutRevivingAttempt() throws Exception {
    var f = new DelayedFixture(true);
    assertThat(f.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    var attempt =
        delayedDb.tx.execute(
            tx -> {
              var current = delayedDb.sessions.lock(f.id);
              return delayedDb.store.reserveAttempt(
                  current.document(),
                  "late-request",
                  1,
                  "NEXT_ACTION",
                  "b".repeat(64),
                  1,
                  50,
                  10,
                  "translator",
                  Instant.now().plusSeconds(60));
            });
    delayedDb.tx.executeWithoutResult(
        tx -> {
          delayedDb.sessions.lock(f.id);
          assertThat(
                  delayedDb.store.claimSend(f.id, attempt.attemptId(), "translator", Instant.now()))
              .isTrue();
          delayedDb.store.finishAttempt(
              f.id, attempt.attemptId(), "UNKNOWN_CALL", null, null, null);
          delayedDb.store.recordLateUsage(f.id, attempt.attemptId(), 75, 8);
        });
    f.poll();
    f.mutate(current -> current.document().withObject("/owner").put("fence", 9));
    assertThatThrownBy(() -> f.acquire(false)).hasMessage("STALE_GENERATION");
    assertThat(
            delayedDb.jdbc.queryForObject(
                "SELECT status FROM studio_guided_model_attempts WHERE session_id=? AND"
                    + " attempt_id=?",
                String.class,
                f.id,
                attempt.attemptId()))
        .isEqualTo("UNKNOWN_CALL");
    var usage =
        delayedDb.tx.execute(
            tx -> {
              delayedDb.sessions.lock(f.id);
              return delayedDb.store.lateUsageAdjustments(f.id);
            });
    assertThat(usage).hasSize(1);
    assertThat(f.active().path("usedMs").asLong()).isEqualTo(2000);
  }

  @Test
  void privateAcquisitionVersionRequiresNumericLiteralRatherThanCoercion() throws Exception {
    var f = new DelayedFixture(true);
    assertThat(f.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    f.mutate(
        current -> current.progress().withObject("/translationAcquisition").put("version", "1"));
    JsonNode before = f.progress();
    assertThatThrownBy(() -> f.acquire(false))
        .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class);
    assertThat(f.progress()).isEqualTo(before);
  }

  @Test
  void compoundObligationsShareAllowanceAndOpenWindowCannotAdvanceSourceStep() throws Exception {
    var f = new DelayedFixture(true);
    var first = f.poll();
    f.mutate(current -> current.progress().put("stepIndex", 1));
    assertThatThrownBy(() -> f.acquire(false, f.second)).hasMessage("BINDING_ORDER");
    assertThat(f.active().path("usedMs").asLong()).isEqualTo(2000);
    f.mutate(current -> current.progress().put("stepIndex", 0));
    f.settle(first, f.callback(1), true);
    long used = f.active().path("usedMs").asLong();
    ObjectNode next =
        f.obligation
            .deepCopy()
            .put("obligationId", java.util.UUID.randomUUID().toString())
            .put("occurrence", 1)
            .put("targetIntent", "Another control");
    delayedDb.tx.executeWithoutResult(
        tx -> {
          delayedDb.sessions.lock(f.id);
          ObjectNode plan = (ObjectNode) delayedDb.store.state(f.id).path("plan");
          // V21 sourceCoordinates: source order, so occurrence 1 of step one precedes step two.
          plan.withArray("obligations").insert(1, next);
          delayedDb.store.acceptPlan(f.id, 1, plan);
        });
    assertThat(f.acquire(false, next).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.WAIT);
    assertThat(f.active().path("window").path("reservedMs").asLong()).isEqualTo(2000 - used);
    assertThat(f.active().path("extraPolls").asInt()).isEqualTo(1);
    assertThat(f.active().path("obligationId")).isEqualTo(next.path("obligationId"));
  }

  @Test
  void coverageRefusesMatchingNodesAndSelectedLocatorCannotUseAnotherNamedCandidate() {
    ObjectNode obligation =
        c.object().put("operationKind", "click").put("targetIntent", "Confirmation");
    ObjectNode progress = c.object();
    var observation = progress.putObject("observation");
    observation.putObject("coverage").put("truncated", false).put("reason", "complete");
    var node = observation.putArray("nodes").addObject().put("name", "Confirmation");
    var locator = c.object().put("kind", "testId").put("value", "confirmation-1");
    node.putArray("locatorHints").add(locator);
    assertThat(GuidedTranslationService.acquisitionAvailable(progress, obligation)).isTrue();
    for (String condition : List.of("truncated", "unsupportedSurface")) {
      ObjectNode changed = progress.deepCopy();
      if (condition.equals("truncated")) {
        changed.withObject("/observation/coverage").put("truncated", true);
      } else {
        changed.withObject("/observation/coverage").put("reason", condition);
      }
      assertThatThrownBy(() -> GuidedTranslationService.acquisitionAvailable(changed, obligation))
          .hasMessage("UNSUPPORTED_SURFACE");
    }
    obligation.set("selectedLocator", locator.deepCopy().put("value", "other"));
    assertThat(GuidedTranslationService.acquisitionAvailable(progress, obligation)).isFalse();
    obligation.set("selectedLocator", locator);
    assertThat(GuidedTranslationService.acquisitionAvailable(progress, obligation)).isTrue();
  }

  @Test
  void nodeFreeSecretCountOneEnablesInferenceOnlyForTheAcceptedPlan() {
    var fixture = secretAcquisitionFixture(1);
    assertThat(
            GuidedTranslationService.acquisitionAvailable(
                fixture.progress(), fixture.obligation(), fixture.plan()))
        .isTrue();
    assertThat(
            GuidedTranslationService.acquisitionAvailable(fixture.progress(), fixture.obligation()))
        .isFalse();
    assertThat(fixture.progress().path("observation").path("nodes")).isEmpty();
  }

  @Test
  void passwordCountCannotBorrowAnotherStepSlotKindReferenceOrOperation() {
    var fixture = secretAcquisitionFixture(1);
    for (String mismatch : List.of("step", "slot", "kind", "referenceKind")) {
      ObjectNode plan = fixture.plan().deepCopy();
      ObjectNode reference = (ObjectNode) plan.path("sourceReferences").get(0);
      switch (mismatch) {
        case "step":
          reference.put("stepId", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
          break;
        case "slot":
          reference.put("intendedSlot", "assert.expected");
          break;
        case "kind":
          reference.put("kind", "nonsecretText");
          reference.remove("referenceName");
          break;
        default:
          reference.put("referenceKind", "sourceSpan");
          break;
      }
      assertThat(
              GuidedTranslationService.acquisitionAvailable(
                  fixture.progress(), fixture.obligation(), plan))
          .as("mismatched %s", mismatch)
          .isFalse();
    }
    for (int index : List.of(-1, 1, Integer.MAX_VALUE)) {
      ObjectNode obligation = fixture.obligation().deepCopy().put("referenceIndex", index);
      assertThat(
              GuidedTranslationService.acquisitionAvailable(
                  fixture.progress(), obligation, fixture.plan()))
          .isFalse();
    }
    ObjectNode nonFill = fixture.obligation().deepCopy().put("operationKind", "click");
    assertThat(
            GuidedTranslationService.acquisitionAvailable(
                fixture.progress(), nonFill, fixture.plan()))
        .isFalse();
    ObjectNode otherObligation =
        fixture.obligation().deepCopy().put("obligationId", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    assertThat(
            GuidedTranslationService.acquisitionAvailable(
                fixture.progress(), otherObligation, fixture.plan()))
        .isFalse();
    ObjectNode noAcceptedObligation = fixture.plan().deepCopy();
    noAcceptedObligation.putArray("obligations");
    assertThat(
            GuidedTranslationService.acquisitionAvailable(
                fixture.progress(), fixture.obligation(), noAcceptedObligation))
        .isFalse();
  }

  @Test
  void missingOrAmbiguousPasswordCountsRemainUnavailable() {
    for (int count : List.of(0, 2, 500)) {
      var fixture = secretAcquisitionFixture(count);
      assertThat(
              GuidedTranslationService.acquisitionAvailable(
                  fixture.progress(), fixture.obligation(), fixture.plan()))
          .isFalse();
    }
    var fixture = secretAcquisitionFixture(1);
    fixture.progress().withObject("/observation/coverage").remove("passwordControls");
    assertThat(
            GuidedTranslationService.acquisitionAvailable(
                fixture.progress(), fixture.obligation(), fixture.plan()))
        .isFalse();
    fixture.progress().withObject("/observation/coverage").put("passwordControls", "1");
    assertThat(
            GuidedTranslationService.acquisitionAvailable(
                fixture.progress(), fixture.obligation(), fixture.plan()))
        .isFalse();
  }

  @Test
  void passwordHintPreservesObservationCoverageAndShapeRefusals() {
    for (String condition : List.of("truncated", "unsupportedSurface", "missingNodes")) {
      var fixture = secretAcquisitionFixture(1);
      if (condition.equals("truncated")) {
        fixture.progress().withObject("/observation/coverage").put("truncated", true);
      } else if (condition.equals("unsupportedSurface")) {
        fixture.progress().withObject("/observation/coverage").put("reason", condition);
      } else {
        fixture.progress().withObject("/observation").remove("nodes");
      }
      assertThatThrownBy(
              () ->
                  GuidedTranslationService.acquisitionAvailable(
                      fixture.progress(), fixture.obligation(), fixture.plan()))
          .as("existing guard before hint: %s", condition)
          .hasMessage("UNSUPPORTED_SURFACE");
    }
  }

  private record SecretAcquisitionFixture(
      ObjectNode progress, ObjectNode obligation, ObjectNode plan) {}

  private SecretAcquisitionFixture secretAcquisitionFixture(int count) {
    String step = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    ObjectNode obligation =
        c.object()
            .put("stepId", step)
            .put("occurrence", 0)
            .put("obligationId", "cccccccc-cccc-4ccc-8ccc-cccccccccccc")
            .put("operationKind", "fill")
            .put("referenceIndex", 0)
            .put("targetIntent", "password")
            .putNull("needId")
            .putNull("predicate");
    ObjectNode plan = c.object();
    plan.putArray("sourceReferences")
        .addObject()
        .put("referenceKind", "configuration")
        .put("kind", "secretRef")
        .put("stepId", step)
        .put("intendedSlot", "fill.value")
        .put("configurationRevision", "1")
        .put("referenceId", "cfg-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        .put("referenceName", "PASS");
    plan.putArray("obligations").add(obligation.deepCopy());
    plan.putArray("needs");
    ObjectNode progress = c.object();
    ObjectNode observation = progress.putObject("observation");
    observation.putArray("nodes");
    observation
        .putObject("coverage")
        .put("truncated", false)
        .put("reason", "complete")
        .put("passwordControls", count);
    return new SecretAcquisitionFixture(progress, obligation, plan);
  }

  @Test
  void projectionValidatesMalformedAfterValidAndKeepsBothCopiesIsolated() throws Exception {
    var fixtures =
        c.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/planning-fixtures.json")));
    ObjectNode context = (ObjectNode) fixtures.path("cases").get(1).path("value").deepCopy();
    ObjectNode expected = context.deepCopy();
    var projection = new GuidedModelProjection(context);

    context.put("unexpectedProjectionField", true);
    assertThat(context).isNotEqualTo(expected);
    assertThat(projection.document()).isEqualTo(expected);
    assertThatThrownBy(() -> new GuidedModelProjection(context)).hasMessage("INVALID_CONTRACT");

    ObjectNode returned = projection.document();
    returned.put("schemaVersion", 2);
    assertThat(returned).isNotEqualTo(expected);
    assertThat(projection.document()).isEqualTo(expected);
    assertThat(new GuidedModelProjection(expected.deepCopy()).document()).isEqualTo(expected);
  }

  @Test
  void strictProviderBoundaryRefusesDuplicateTrailingProseAndIdentitySubstitution()
      throws Exception {
    var fixtures =
        c.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v3/planning-fixtures.json")));
    JsonNode answer = fixtures.path("cases").get(15).path("value");
    ObjectNode context = (ObjectNode) fixtures.path("cases").get(1).path("value");
    var assembler = new GuidedPromptAssembler(c);
    var request =
        new GuidedModelRequest(
            "request-1",
            1,
            GuidedModelRequest.Kind.VERIFY_STEP,
            new GuidedModelProjection(context),
            "static contract",
            assembler.providerSchema(GuidedModelRequest.Kind.VERIFY_STEP),
            4096);
    var parser = new GuidedResponseParser(c);
    assertThat(parser.parse(request, answer.toString().getBytes(StandardCharsets.UTF_8)))
        .isEqualTo(answer);
    String actualVersionField = "\"schemaVersion\":" + answer.path("schemaVersion").asInt();
    String duplicateVersion =
        answer
            .toString()
            .replace(actualVersionField, actualVersionField + "," + actualVersionField);
    assertThat(
            java.util.Arrays.equals(
                duplicateVersion.getBytes(StandardCharsets.UTF_8),
                answer.toString().getBytes(StandardCharsets.UTF_8)))
        .as("duplicate-key negative control must change the actual fixture bytes")
        .isFalse();
    for (String invalid :
        List.of(
            answer + " {}",
            "```json\n" + answer + "\n```",
            duplicateVersion,
            answer.toString().replace("request-1", "other-request"))) {
      assertThatThrownBy(() -> parser.parse(request, invalid.getBytes(StandardCharsets.UTF_8)))
          .hasMessage("INVALID_CONTRACT");
    }
  }

  @Test
  void providerSchemaIsSelfContainedSupportedAndBothIdentitiesArePinned() {
    var assembler = new GuidedPromptAssembler(c);
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      JsonNode schema = assembler.providerSchema(kind);
      assertThat(schema.toString())
          .doesNotContain(
              "https://",
              "\"const\"",
              "\"pattern\"",
              "\"minLength\"",
              "\"maxLength\"",
              "\"if\"",
              "\"then\"",
              "\"not\"");
      verifyLocalReferences(schema, schema);
      assertThat(
              assembler.schemaProvenance().path("providerSchemaHashes").path(kind.name()).asText())
          .isEqualTo(GuidedContracts.hash(schema));
    }
    assertThat(assembler.schemaProvenance().path("strictSchemaHash").asText()).hasSize(64);
    assertThat(assembler.schemaProvenance().path("sourceSelectionSchemaHash").asText()).hasSize(64);
  }

  @Test
  void startupSchemaEpochReturnsDefensiveCopiesWithoutRebuildingMetadata() {
    GuidedContracts parsing = org.mockito.Mockito.spy(new GuidedContracts());
    var assembler = new GuidedPromptAssembler(parsing);
    ObjectNode baselinePins = assembler.schemaProvenance();
    String pinsCanonical = GuidedContracts.canonical(baselinePins);
    var canonicalSchemas =
        new java.util.EnumMap<GuidedModelRequest.Kind, String>(GuidedModelRequest.Kind.class);
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      canonicalSchemas.put(kind, GuidedContracts.canonical(assembler.providerSchema(kind)));
    }
    org.mockito.Mockito.clearInvocations(parsing);

    ObjectNode returnedPins = assembler.schemaProvenance();
    returnedPins.withObject("/providerSchemaHashes").put("SOURCE_PLAN", "f".repeat(64));
    returnedPins.removeAll();
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      ObjectNode returnedSchema = (ObjectNode) assembler.providerSchema(kind);
      for (JsonNode typed : returnedSchema.findParents("type")) {
        ((ObjectNode) typed).put("type", "changed-returned-copy");
      }
      returnedSchema.removeAll();
      JsonNode freshSchema = assembler.providerSchema(kind);
      assertThat(freshSchema).isNotSameAs(returnedSchema);
      assertThat(GuidedContracts.canonical(freshSchema)).isEqualTo(canonicalSchemas.get(kind));
      assertThat(
              assembler.schemaProvenance().path("providerSchemaHashes").path(kind.name()).asText())
          .isEqualTo(GuidedContracts.hash(freshSchema));
    }
    ObjectNode freshPins = assembler.schemaProvenance();
    assertThat(freshPins).isNotSameAs(returnedPins);
    assertThat(GuidedContracts.canonical(freshPins)).isEqualTo(pinsCanonical);
    org.mockito.Mockito.verifyNoInteractions(parsing);
  }

  @Test
  void failedStaticSchemaConstructionPublishesNoEpoch() {
    GuidedContracts parsing = org.mockito.Mockito.spy(new GuidedContracts());
    var parsed = new AtomicInteger();
    org.mockito.Mockito.doAnswer(
            invocation -> {
              if (parsed.incrementAndGet() == 2) {
                throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                    "INVALID_CONTRACT", 422);
              }
              return invocation.callRealMethod();
            })
        .when(parsing)
        .parse(org.mockito.ArgumentMatchers.anyString());
    var published = new java.util.concurrent.atomic.AtomicReference<GuidedPromptAssembler>();
    assertThatThrownBy(() -> published.set(new GuidedPromptAssembler(parsing)))
        .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    assertThat(parsed.get()).isEqualTo(2);
    assertThat(published.get()).isNull();
  }

  private final class PreparationFixture {
    final ObjectNode session = c.object(), progress = c.object(), state = c.object();
    final JsonNode safeInputs, remaining, selections;
    final List<String> repairs = List.of();
    final GuidedModelRequest.Kind kind = GuidedModelRequest.Kind.NEXT_ACTION;

    PreparationFixture() throws Exception {
      JsonNode context =
          c.parse(
                  Files.readString(
                      Path.of(
                          "../docs/specs/studio-observed-authoring/contracts/v3/planning-fixtures.json")))
              .path("cases")
              .get(1)
              .path("value")
              .deepCopy();
      session.set("sessionId", context.path("sessionId"));
      session.set("scopeHash", context.path("scopeHash"));
      session.set("sourceSteps", context.path("sourceSteps"));
      session
          .putObject("scope")
          .setAll(
              java.util.Map.of(
                  "sourceRevision",
                  context.path("sourceRevision"),
                  "configurationRevision",
                  context.path("configurationRevision")));
      progress
          .put("stepIndex", 0)
          .put("translationOrdinal", context.path("coordinate").path("ordinal").asInt());
      for (String key :
          List.of("observation", "executionEvidence", "authoredInputsHash", "contextRevision")) {
        progress.set(key, context.path(key));
      }
      ObjectNode manifest = state.putObject("manifest");
      for (String key : List.of("sourceSteps", "configurationReferences", "authoringContext")) {
        manifest.set(key, context.path(key));
      }
      state.putObject("plan").set("needs", context.path("needs"));
      safeInputs = context.path("inputs");
      remaining = context.path("obligations");
      selections = context.path("clarificationSelections");
    }

    ObjectNode context(GuidedPromptAssembler assembler) {
      return assembler.buildPositiveContext(
          kind, session, progress, state, safeInputs, remaining, selections, repairs);
    }

    GuidedModelRequest complete(
        GuidedPromptAssembler assembler,
        GuidedPromptAssembler.PreparedProjection prepared,
        String key,
        int cap) {
      return assembler.completePreparedOrOriginal(
          assembler.preparationCapability(),
          prepared,
          key,
          1,
          kind,
          session,
          progress,
          state,
          safeInputs,
          remaining,
          selections,
          repairs,
          cap);
    }
  }

  @Test
  void projectionPreparationIsPrivateFactoryAndSameOwnerOnly() throws Exception {
    var fixture = new PreparationFixture();
    var manual = new GuidedPromptAssembler(c);
    var first = GuidedPromptAssembler.createForProductionFactory(c);
    var other = GuidedPromptAssembler.createForProductionFactory(c);
    ObjectNode context = fixture.context(first);
    assertThat(manual.preparationCapability()).isNull();
    assertThat(
            manual.preparePure(
                first.preparationCapability(), context, "prepare", 1, fixture.kind, 2048))
        .isNull();
    assertThat(
            other.preparePure(
                first.preparationCapability(), context, "prepare", 1, fixture.kind, 2048))
        .isNull();
    var prepared =
        first.preparePure(first.preparationCapability(), context, "prepare", 1, fixture.kind, 2048);
    assertThat(prepared).isNotNull();
    GuidedModelRequest foreign = fixture.complete(other, prepared, "prepare", 2048);
    assertThat(prepared.bytesFor(foreign)).isNull();
    assertThat(foreign.projection().document()).isEqualTo(context);
  }

  @Test
  void projectionPreparationRequiresFreshCutKeyAndOutputMetadata() throws Exception {
    var fixture = new PreparationFixture();
    var assembler = GuidedPromptAssembler.createForProductionFactory(c);
    ObjectNode original = fixture.context(assembler);
    var prepared =
        assembler.preparePure(
            assembler.preparationCapability(), original, "prepare", 1, fixture.kind, 2048);
    GuidedModelRequest exact = fixture.complete(assembler, prepared, "prepare", 2048);
    assertThat(prepared.bytesFor(exact)).isPositive();
    GuidedModelRequest recovered = fixture.complete(assembler, prepared, "prepare-recovery", 2048);
    assertThat(prepared.bytesFor(recovered)).isNull();
    assertThat(recovered.requestId()).isEqualTo("prepare-recovery");
    GuidedModelRequest newCap = fixture.complete(assembler, prepared, "prepare", 2049);
    assertThat(prepared.bytesFor(newCap)).isNull();
    assertThat(newCap.maxOutputTokens()).isEqualTo(2049);
    ((ObjectNode) fixture.state.path("manifest").path("sourceSteps").get(0))
        .put("text", "Fresh changed source");
    GuidedModelRequest changed = fixture.complete(assembler, prepared, "prepare", 2048);
    assertThat(prepared.bytesFor(changed)).isNull();
    assertThat(changed.projection().document().path("sourceSteps").get(0).path("text").asText())
        .isEqualTo("Fresh changed source");
    assertThat(exact.projection().document()).isEqualTo(original);
  }

  @Test
  void typedPreparationFailureRequiresSameFreshValidationInput() throws Exception {
    var fixture = new PreparationFixture();
    var assembler = GuidedPromptAssembler.createForProductionFactory(c);
    JsonNode validHash = fixture.session.path("scopeHash").deepCopy();
    fixture.session.put("scopeHash", "invalid");
    var prepared =
        assembler.preparePure(
            assembler.preparationCapability(),
            fixture.context(assembler),
            "prepare",
            1,
            fixture.kind,
            2048);
    assertThat(prepared).isNotNull();
    assertThatThrownBy(() -> fixture.complete(assembler, prepared, "prepare", 2048))
        .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    fixture.session.set("scopeHash", validHash);
    GuidedModelRequest current = fixture.complete(assembler, prepared, "prepare", 2048);
    assertThat(prepared.bytesFor(current)).isNull();
    assertThat(current.projection().document().path("scopeHash")).isEqualTo(validHash);
  }

  @Test
  void nonfatalPreparationIsUnavailableAndFatalErrorPropagates() throws Exception {
    var fixture = new PreparationFixture();
    GuidedContracts controlled = org.mockito.Mockito.spy(new GuidedContracts());
    var assembler = GuidedPromptAssembler.createForProductionFactory(controlled);
    ObjectNode context = fixture.context(assembler);
    org.mockito.Mockito.doThrow(new IllegalStateException("controlled preparation failure"))
        .when(controlled)
        .object();
    assertThat(
            assembler.preparePure(
                assembler.preparationCapability(), context, "prepare", 1, fixture.kind, 2048))
        .isNull();
    org.mockito.Mockito.doCallRealMethod().when(controlled).object();
    assertThat(fixture.complete(assembler, null, "prepare", 2048).projection().document())
        .isEqualTo(context);
    AssertionError fatal = new AssertionError("controlled fatal preparation");
    org.mockito.Mockito.doThrow(fatal).when(controlled).object();
    assertThatThrownBy(
            () ->
                assembler.preparePure(
                    assembler.preparationCapability(), context, "prepare", 1, fixture.kind, 2048))
        .isSameAs(fatal);
  }

  private static void verifyLocalReferences(JsonNode node, JsonNode root) {
    if (node.has("$ref")) {
      String reference = node.path("$ref").asText();
      assertThat(reference).startsWith("#/$defs/");
      assertThat(root.at(reference.substring(1)).isMissingNode()).isFalse();
    }
    node.elements().forEachRemaining(child -> verifyLocalReferences(child, root));
  }

  @Test
  void wrongAuthoredInputAndReversedAssertionAreRejectedIndependentlyOfModelConfidence()
      throws Exception {
    JsonNode docs =
        c.parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents");
    ObjectNode action = (ObjectNode) docs.path("action").deepCopy();
    ObjectNode plan = c.object();
    plan.putArray("sourceReferences")
        .add(docs.path("context").path("authoredInputs").path("inputs").get(0).path("provenance"));
    plan.putArray("needs");
    ObjectNode obligation =
        c.object()
            .put("stepId", docs.path("action").path("coordinate").path("stepId").asText())
            .put("occurrence", 0)
            .put("operationKind", "navigate")
            .put("targetIntent", "page")
            .put("referenceIndex", 0)
            .putNull("needId")
            .putNull("predicate");
    var validator = new GuidedProposalValidator(c);
    validator.action(docs.path("session"), action, plan, obligation, action, docs.path("context"));
    ObjectNode wrong = action.deepCopy();
    wrong.withObject("/operation").put("destinationInputId", "input-another-valid-destination");
    assertThatThrownBy(
            () ->
                validator.action(
                    docs.path("session"), action, plan, obligation, wrong, docs.path("context")))
        .hasMessage("INVALID_CONTRACT");
    ObjectNode swapped = action.deepCopy();
    swapped
        .withObject("/operation")
        .removeAll()
        .put("kind", "assert")
        .put("predicate", "visible")
        .putNull("expected");
    assertThatThrownBy(
            () ->
                validator.action(
                    docs.path("session"), action, plan, obligation, swapped, docs.path("context")))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void sourceChoiceConstrainsItsExactOccurrenceSlotOperationAndReferenceUse() throws Exception {
    JsonNode docs =
        c.parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents");
    ObjectNode selected = c.object();
    ObjectNode need =
        selected
            .putObject("need")
            .put(
                "stepId",
                docs.path("context")
                    .path("authoredInputs")
                    .path("inputs")
                    .get(1)
                    .path("sourceStepId")
                    .asText())
            .put("occurrence", 1)
            .put("operationKind", "fill")
            .put("argumentSlot", "fill.value");
    selected.set(
        "reference",
        docs.path("context").path("authoredInputs").path("inputs").get(1).path("provenance"));
    ObjectNode plan = c.object();
    plan.putArray("sourceReferences")
        .add(selected.path("reference"))
        .add(docs.path("context").path("authoredInputs").path("inputs").get(2).path("provenance"));
    plan.putArray("obligations")
        .addObject()
        .put(
            "stepId",
            docs.path("context")
                .path("authoredInputs")
                .path("inputs")
                .get(1)
                .path("sourceStepId")
                .asText())
        .put("occurrence", 1)
        .put("operationKind", "fill")
        .put("referenceIndex", 0)
        .putNull("needId");
    JsonNode choices = c.object().putArray("items").add(selected);
    var validator = new GuidedProposalValidator(c);
    validator.sourceSelections(docs.path("session"), plan, choices);
    for (String field :
        List.of("referenceIndex", "occurrence", "operationKind", "stepId", "needId")) {
      ObjectNode changed = plan.deepCopy();
      ObjectNode obligation = (ObjectNode) changed.path("obligations").get(0);
      switch (field) {
        case "referenceIndex" -> obligation.put(field, 1);
        case "occurrence" -> obligation.put(field, 0);
        case "operationKind" -> obligation.put(field, "selectOption");
        case "stepId" ->
            obligation.set(field, docs.path("session").path("sourceSteps").get(1).path("stepId"));
        default -> obligation.put(field, "runtime-substitution").putNull("referenceIndex");
      }
      assertThatThrownBy(() -> validator.sourceSelections(docs.path("session"), changed, choices))
          .as(field)
          .hasMessage("INVALID_CONTRACT");
    }
    ObjectNode wrongSlot = selected.deepCopy();
    wrongSlot.withObject("/need").put("argumentSlot", "selectOption.value");
    assertThatThrownBy(() -> validator.sourceMeaning(docs.path("session"), wrongSlot))
        .hasMessage("INVALID_CONTRACT");
    ObjectNode changedOperation =
        need.deepCopy()
            .put("operationKind", "selectOption")
            .put("argumentSlot", "selectOption.value");
    assertThat(GuidedProposalValidator.sameOccurrence(need, changedOperation)).isTrue();
  }

  @Test
  void replanningCannotRenameRemoveOrAppendRepeatedEffectsButInitialDistinctOccurrencesRemainValid()
      throws Exception {
    JsonNode docs =
        c.parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents");
    ObjectNode proposed = c.object();
    proposed.putArray("sourceReferences");
    proposed.putArray("needs");
    var list = proposed.putArray("obligations");
    for (JsonNode step : docs.path("session").path("sourceSteps")) {
      list.addObject()
          .put("stepId", step.path("stepId").asText())
          .put("occurrence", 0)
          .put("operationKind", "click")
          .put("targetIntent", "Submit")
          .putNull("referenceIndex")
          .putNull("needId")
          .putNull("predicate");
    }
    var validator = new GuidedProposalValidator(c);
    ObjectNode admitted = validator.admitPlan(docs.path("session"), proposed);
    ObjectNode refined =
        validator.refinePlan(
            docs.path("session"), c.object().put("stepIndex", 0), admitted, proposed);
    assertThat(refined).isEqualTo(admitted);
    ObjectNode repeated = proposed.deepCopy();
    repeated
        .withArray("obligations")
        .insert(1, ((ObjectNode) list.get(0)).deepCopy().put("occurrence", 1));
    assertThat(validator.admitPlan(docs.path("session"), repeated).path("obligations").size())
        .isEqualTo(4);
    assertThatThrownBy(
            () ->
                validator.refinePlan(
                    docs.path("session"), c.object().put("stepIndex", 0), admitted, repeated))
        .hasMessage("BINDING_ORDER");
    ObjectNode renamed = proposed.deepCopy();
    ((ObjectNode) renamed.path("obligations").get(0)).put("targetIntent", "Cancel");
    assertThatThrownBy(
            () ->
                validator.refinePlan(
                    docs.path("session"), c.object().put("stepIndex", 0), admitted, renamed))
        .hasMessage("IDEMPOTENCY_CONFLICT");
  }

  @Test
  void compactSelectionCannotRestampStaleSourcePlanFenceObservationOrMaterialization()
      throws Exception {
    JsonNode docs =
        c.parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents");
    ObjectNode session = (ObjectNode) docs.path("session").deepCopy();
    ObjectNode action = (ObjectNode) docs.path("action").deepCopy();
    ObjectNode progress = c.object().put("stepIndex", 0);
    for (String key : List.of("generation", "executionEvidence", "evidenceHash")) {
      progress.set(key, action.path(key));
    }
    progress.set("documentId", action.path("target").path("documentId"));
    ObjectNode original = c.object().put("planRevision", 2);
    for (String key : List.of("scope", "scopeHash", "owner")) {
      original.set(key, session.path(key).deepCopy());
    }
    for (String key : List.of("documentId", "generation", "executionEvidence", "stepIndex")) {
      original.set(key, progress.path(key).deepCopy());
    }
    original.set("expectedContextRevision", docs.path("context").path("contextRevision"));
    original.set("expectedAuthoredInputsHash", docs.path("context").path("authoredInputsHash"));
    ObjectNode selection = c.object();
    selection.putObject("target").put("kind", "page");
    selection.set("operation", action.path("operation"));
    ObjectNode obligation =
        c.object()
            .put("stepId", docs.path("action").path("coordinate").path("stepId").asText())
            .put("occurrence", 0);
    var validator = new GuidedProposalValidator(c);
    assertThat(
            validator.materializeAction(
                session, progress, obligation, selection, docs.path("context"), original, 2))
        .isEqualTo(action);
    ObjectNode source = session.deepCopy();
    source.withObject("/scope").put("sourceRevision", "changed");
    assertThatThrownBy(
            () ->
                validator.materializeAction(
                    source, progress, obligation, selection, docs.path("context"), original, 2))
        .hasMessage("STALE_FENCE");
    ObjectNode fence = session.deepCopy();
    fence.withObject("/owner").put("fence", 100);
    assertThatThrownBy(
            () ->
                validator.materializeAction(
                    fence, progress, obligation, selection, docs.path("context"), original, 2))
        .hasMessage("STALE_FENCE");
    assertThatThrownBy(
            () ->
                validator.materializeAction(
                    session,
                    progress.deepCopy().put("generation", 100),
                    obligation,
                    selection,
                    docs.path("context"),
                    original,
                    2))
        .hasMessage("STALE_GENERATION");
    assertThatThrownBy(
            () ->
                validator.materializeAction(
                    session, progress, obligation, selection, docs.path("context"), original, 3))
        .hasMessage("REVISION_CONFLICT");
    ObjectNode context = (ObjectNode) docs.path("context").deepCopy();
    context.put("contextRevision", 100);
    assertThatThrownBy(
            () ->
                validator.materializeAction(
                    session, progress, obligation, selection, context, original, 2))
        .hasMessage("REVISION_CONFLICT");
    ObjectNode forged = selection.deepCopy();
    forged.put("scopeHash", "attacker");
    assertThatThrownBy(
            () ->
                validator.materializeAction(
                    session, progress, obligation, forged, docs.path("context"), original, 2))
        .hasMessage("INVALID_CONTRACT");
  }

  private GuidedProductionSessionAccess currentAccess(
      com.citi.put.checks.studio.secrets.StudioSecretUseAuthorization authorization) {
    var properties =
        new GuidedTranslationProperties(
            true, true, List.of("orders"), List.of("Production"), 65536, 4096, 60, "worker-1");
    var classifier = new GuidedSourceClassifier(c, properties, new CredentialPatternScreen());
    // Only checkCurrent is exercised: its real classifier/store and controlled authorization port.
    return new GuidedProductionSessionAccess(
        null, classifier, null, delayedDb.store, null, null, null, null, authorization);
  }

  @Test
  void currentManifestMatchesFullStateAndReturnsFreshPersistedProvenance() throws Exception {
    var fixture = new DelayedFixture(false, List.of("PASS", "SECOND", "PASS"));
    delayedDb.tx.executeWithoutResult(
        tx -> {
          JsonNode manifest = delayedDb.store.currentManifest(fixture.id);
          assertThat(manifest).isEqualTo(delayedDb.store.state(fixture.id).path("manifest"));
          ((ObjectNode) manifest).put("policy", "caller-mutated-copy");
          assertThat(delayedDb.store.currentManifest(fixture.id).path("policy").asText())
              .isEqualTo("INPUT-POLICY-01-A");
        });
  }

  @Test
  void currentAuthorizationWithoutTranslationStateSkipsReferencesButStillChecksPolicy() {
    ObjectNode document = delayedDb.seed(java.util.UUID.randomUUID().toString());
    document.withObject("/scope").put("applicationId", "orders").put("environmentId", "Production");
    AtomicInteger calls = new AtomicInteger();
    var access =
        currentAccess(
            (principal, csi, environment, secret) -> {
              calls.incrementAndGet();
              return false;
            });
    delayedDb.tx.executeWithoutResult(
        tx -> {
          assertThat(delayedDb.store.exists(document.path("sessionId").asText())).isFalse();
          access.checkCurrent(document);
        });
    assertThat(calls.get()).isZero();
    document.withObject("/scope").put("environmentId", "unapproved");
    assertThatThrownBy(() -> delayedDb.tx.executeWithoutResult(tx -> access.checkCurrent(document)))
        .hasMessage("FORBIDDEN_SCOPE");
    assertThat(calls.get()).isZero();
  }

  @Test
  void currentManifestWithoutJoinedStateRefusesAndRequiresCallerTransaction() {
    ObjectNode document = delayedDb.seed(java.util.UUID.randomUUID().toString());
    String id = document.path("sessionId").asText();
    assertThatThrownBy(() -> delayedDb.tx.execute(tx -> delayedDb.store.currentManifest(id)))
        .hasMessage("MISSING_SOURCE");
    assertThatThrownBy(() -> delayedDb.tx.execute(tx -> delayedDb.store.state(id)))
        .hasMessage("MISSING_SOURCE");
    assertThatThrownBy(() -> delayedDb.store.currentManifest(id))
        .hasMessage("RUNTIME_INCOMPATIBLE");
  }

  @Test
  void currentAuthorizationPreservesScopedReferenceOrderDuplicatesAndRevocation() throws Exception {
    var fixture = new DelayedFixture(false, List.of("PASS", "SECOND", "PASS"));
    var calls = new java.util.ArrayList<List<String>>();
    var revoked = new java.util.concurrent.atomic.AtomicBoolean();
    var access =
        currentAccess(
            (principal, csi, environment, secret) -> {
              calls.add(List.of(principal, csi, environment, secret));
              return !revoked.get()
                  && principal.equals("delayed-owner@citi.com")
                  && csi.equals("60457")
                  && environment.equals("Production");
            });
    delayedDb.tx.executeWithoutResult(
        tx -> access.checkCurrent(delayedDb.sessions.lock(fixture.id).document()));
    assertThat(calls)
        .containsExactly(
            List.of("delayed-owner@citi.com", "60457", "Production", "PASS"),
            List.of("delayed-owner@citi.com", "60457", "Production", "SECOND"),
            List.of("delayed-owner@citi.com", "60457", "Production", "PASS"));
    calls.clear();
    revoked.set(true);
    assertThatThrownBy(
            () ->
                delayedDb.tx.executeWithoutResult(
                    tx -> access.checkCurrent(delayedDb.sessions.lock(fixture.id).document())))
        .hasMessage("SECRET_USE_REVOKED");
    assertThat(calls)
        .containsExactly(List.of("delayed-owner@citi.com", "60457", "Production", "PASS"));
    calls.clear();
    revoked.set(false);
    delayedDb.tx.executeWithoutResult(
        tx -> {
          ObjectNode wrongScope = delayedDb.sessions.lock(fixture.id).document().deepCopy();
          wrongScope.withObject("/scope").put("csiId", "OTHER-CSI");
          assertThatThrownBy(() -> access.checkCurrent(wrongScope))
              .hasMessage("SECRET_USE_REVOKED");
        });
    assertThat(calls)
        .containsExactly(List.of("delayed-owner@citi.com", "OTHER-CSI", "Production", "PASS"));
  }

  @Test
  void cancellationAndAbsoluteDeadlineNeverRenewAProviderCall() throws Exception {
    Instant now = Instant.parse("2026-10-08T00:00:00Z");
    var budget = new GuidedCallBudget(now.plusSeconds(5), Clock.fixed(now, ZoneOffset.UTC));
    AtomicInteger cancelled = new AtomicInteger();
    var registration = budget.onCancel(cancelled::incrementAndGet);
    assertThat(budget.remaining()).isEqualTo(Duration.ofSeconds(5));
    budget.cancel();
    budget.cancel();
    assertThat(cancelled.get()).isEqualTo(1);
    assertThatThrownBy(budget::remaining)
        .isInstanceOf(java.util.concurrent.CancellationException.class);
    registration.close();
    assertThatThrownBy(
            () -> new GuidedCallBudget(now, Clock.fixed(now, ZoneOffset.UTC)).remaining())
        .isInstanceOf(java.util.concurrent.CancellationException.class);
  }
}

/** Actual application configuration: no copied service/source/gateway bean constructors. */
@org.springframework.boot.test.context.SpringBootTest(
    classes = com.citi.put.checks.ChecksApplication.class,
    properties = {
      "studio.guided-authoring.translation.enabled=true",
      "studio.guided-authoring.translation.allow-authored-nonsecret=true",
      "studio.guided-authoring.translation.applications=orders",
      "studio.guided-authoring.translation.environments=fixture",
      "studio.guided-authoring.runner-origin=https://localhost:1",
      "studio.guided-authoring.translation.controller-origin=https://localhost:1",
      "studio.guided-authoring.controller-token-file=/tmp/obs005-unused-wiring-token",
      "studio.gateway.provider=vertex",
      "studio.gateway.endpoint=http://127.0.0.1:1",
      "studio.gateway.project=synthetic-project",
      "studio.gateway.location=global",
      "studio.gateway.model=synthetic-model",
      "studio.gateway.credentials.mode=none"
    })
@org.springframework.test.context.ActiveProfiles("local")
class GuidedProductionWiringTest {
  @org.springframework.beans.factory.annotation.Autowired
  org.springframework.context.ApplicationContext context;

  @org.junit.jupiter.api.Test
  void enabledConfigurationInstallsConcreteSourceVerifierProviderAndCoordinator() {
    Object access =
        context.getBean(com.citi.put.checks.studio.guided.session.GuidedSessionAccess.class);
    org.assertj.core.api.Assertions.assertThat(access)
        .isInstanceOf(GuidedProductionSessionAccess.class)
        .isInstanceOf(
            com.citi.put.checks.studio.guided.session.GuidedSessionService.StepVerifier.class);
    org.assertj.core.api.Assertions.assertThat(context.getBean(GuidedLlmGatewayClient.class))
        .isInstanceOf(GenAiGuidedLlmGatewayClient.class);
    org.assertj.core.api.Assertions.assertThat(context.getBean(GuidedTranslationService.class))
        .isNotNull();
    org.assertj.core.api.Assertions.assertThat(context.getBean(GuidedTranslationCoordinator.class))
        .isNotNull();
    org.assertj.core.api.Assertions.assertThat(context.getBean(GuidedPlanningController.class))
        .isNotNull();
  }
}

@org.springframework.boot.test.context.SpringBootTest(
    classes = com.citi.put.checks.ChecksApplication.class,
    properties = {
      "studio.guided-authoring.translation.enabled=false",
      "studio.gateway.provider=disabled"
    })
@org.springframework.test.context.ActiveProfiles("local")
class GuidedDisabledWiringTest {
  @org.springframework.beans.factory.annotation.Autowired
  org.springframework.context.ApplicationContext context;

  @org.junit.jupiter.api.Test
  void disabledConfigurationHasNoCoordinatorOrImplicitGuidedExecution() {
    org.assertj.core.api.Assertions.assertThat(
            context.getBeansOfType(GuidedTranslationService.class))
        .isEmpty();
    org.assertj.core.api.Assertions.assertThat(
            context.getBeansOfType(GuidedTranslationCoordinator.class))
        .isEmpty();
    org.assertj.core.api.Assertions.assertThat(
            context.getBean(GuidedLlmGatewayClient.class).propose(null, null).code())
        .isEqualTo(GuidedModelResponse.Code.DISABLED);
  }
}
