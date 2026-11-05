package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.translation.GroundingItHarness.ReachedRunner;
import com.citi.put.checks.studio.guided.translation.GroundingItHarness.Spec;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.citi.put.checks.support.TestPostgresDatabase;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * ADR-SC-008 D2/D3: the planning-to-proposal path of the learning loop, end to end on a real
 * PostgreSQL (real session service, translation service, stores and migrations; the model is
 * scripted, the runner is a stand-in at the dispatch edge). It replaces the typed-operation
 * scenarios this class held before: there is no operation list, no verifier request and no
 * acquisition polling left to prove.
 *
 * <p>Proved here: one STEP_CODE request per step and no other kind besides the one-time
 * SOURCE_PLAN; the stored proposal is the model's code with the hash of that code and nothing the
 * model could add; a step that captures two values is one proposal that declares both bindings; and
 * a second record for a learned step (ordinal 1) is refused at admission with a closed code.
 */
class GuidedPlanningIntegrationTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final TestPostgresDatabase POSTGRES = new TestPostgresDatabase();

  @BeforeAll
  static void start() {
    POSTGRES.start();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  private static ObservationFixtures.Builder page() {
    return ObservationFixtures.observation();
  }

  private static List<ObjectNode> reserved(GroundingItHarness h, String id) {
    return h.repository.transaction(() -> h.store.obligations(id));
  }

  @Test
  void oneStepCodeRequestPerStepAndNoOtherKindAfterThePlan() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    String code = "await page.getByRole('button', { name: 'Save' }).click();";
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, code));

    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);

    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
    assertThat(h.requests.stream().map(GuidedModelRequest::kind).collect(Collectors.toSet()))
        .isEqualTo(Set.of(GuidedModelRequest.Kind.SOURCE_PLAN, GuidedModelRequest.Kind.STEP_CODE));
    assertThat(h.stepCodeAttempts(id)).isEqualTo(java.util.Map.of("APPLIED", 1));
    verify(h.dispatch, times(1)).prepareStep(any(), anyString(), anyLong(), any());

    var rows = reserved(h, id);
    assertThat(rows).hasSize(1);
    JsonNode proposal = rows.getFirst().path("proposal");
    assertThat(proposal.path("operation").path("kind").asText()).isEqualTo("step");
    assertThat(proposal.path("operation").path("code").asText()).isEqualTo(code);
    assertThat(proposal.path("operation").path("sourceHash").asText())
        .isEqualTo(GuidedContracts.hash(TextNode.valueOf(code)));
    assertThat(proposal.path("coordinate").path("ordinal").asInt()).isZero();
    assertThat(proposal.path("operation").path("captures")).isEmpty();
    assertThat(proposal.path("operation").path("uses")).isEmpty();
  }

  @Test
  void aTwoCaptureStepIsOneProposalThatDeclaresBothBindings() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Read the title and the price.", "Compare them.");
    String id =
        h.session(
            List.of(
                Spec.produces(0, "Title", "need-title"),
                Spec.produces(0, "Price", "need-price"),
                Spec.uses(1, "Compare", "need-title", "need-price")));
    h.observe(id, 1, page().element("e1", "heading", "Mug").element("e2", "text", "9.99").build());
    h.stopAtRunner();
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> {
          List<String> bindings = new ArrayList<>();
          for (JsonNode need :
              h.repository.transaction(() -> h.store.state(id)).path("plan").path("needs")) {
            bindings.add(need.path("bindingId").asText());
          }
          assertThat(bindings).hasSize(2);
          return h.code(
              request,
              "vars['" + bindings.get(0) + "'] = 'a'; vars['" + bindings.get(1) + "'] = 'b';",
              bindings.get(1),
              bindings.get(0));
        });

    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);

    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
    var rows = reserved(h, id);
    // One reservation for the step, keyed on its occurrence-0 obligation: one proposal, one action.
    assertThat(rows).hasSize(1);
    JsonNode captures = rows.getFirst().path("proposal").path("operation").path("captures");
    assertThat(captures).hasSize(2);
    assertThat(rows.getFirst().path("proposal").path("coordinate").path("ordinal").asInt())
        .isZero();
  }

  @Test
  void aSecondRecordForALearnedStepIsRefusedAtAdmissionWithBindingOrder() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);

    ObjectNode second = reserved(h, id).getFirst().path("proposal").deepCopy();
    ((ObjectNode) second.path("coordinate")).put("ordinal", 1);

    assertThatThrownBy(
            () -> h.service.admit(h.controller, id, 1, "second-record", second, "stand-in"))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> {
              assertThat(failure.getMessage()).isEqualTo("BINDING_ORDER");
              assertThat(failure.status()).isEqualTo(422);
            });
    assertThat(h.actions(id)).isZero();
  }

  /**
   * ADR-SC-008 D2/D5, AC4: a learned step runs on the real backend path (prepare, reserve, admit,
   * consume, dispatch, owner callback) against a scripted runner, SUCCEEDS, and the session moves
   * on to the next step with one more STEP_CODE request and no verifier request. The receipt the
   * runner reported is the one stored beside the outcome, and the ledger outcome is the one derived
   * from it.
   */
  @Test
  void aLearnedStepRunsToSucceededAndTheSessionMovesOnToTheNextStep() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.", "Click Done.");
    String id = h.session(List.of(Spec.of(0, "Save"), Spec.of(1, "Done")));
    h.observe(
        id, 1, page().element("e1", "button", "Save").element("e2", "button", "Done").build());
    h.runnerSucceeds();
    h.refreshWith(
        generation ->
            page()
                .document("document-1", generation)
                .element("e1", "button", "Save")
                .element("e2", "button", "Done")
                .build());
    String first = "await page.getByRole('button', { name: 'Save' }).click();";
    String second = "await page.getByRole('button', { name: 'Done' }).click();";
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, first));
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, second));

    // One advance learns one step; the coordinator drives the next one.
    h.advance(id);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
    assertThat(h.actionRows(id)).hasSize(1);
    assertThat(h.actionRows(id).getFirst().path("state").asText()).isEqualTo("SUCCEEDED");
    // The next advance finds the step fulfilled (SUCCEEDED, dispatched once, same digest) and
    // completes it without asking the model anything; the one after learns the next step.
    h.advance(id);
    assertThat(h.progress(id).path("stepIndex").asInt()).isEqualTo(1);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
    h.advance(id);

    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(2);
    assertThat(h.requests.stream().map(GuidedModelRequest::kind).collect(Collectors.toSet()))
        .isEqualTo(Set.of(GuidedModelRequest.Kind.SOURCE_PLAN, GuidedModelRequest.Kind.STEP_CODE));
    var actions = h.actionRows(id);
    assertThat(actions).hasSize(2);
    assertThat(actions)
        .allSatisfy(
            action -> {
              assertThat(action.path("state").asText()).isEqualTo("SUCCEEDED");
              assertThat(action.path("outcomeCode").asText()).isEqualTo("OK");
              assertThat(action.path("dispatchCount").asInt()).isEqualTo(1);
              assertThat(action.path("coordinate").path("ordinal").asInt()).isZero();
            });
    assertThat(actions.stream().map(a -> a.path("coordinate").path("stepId").asText()).distinct())
        .hasSize(2);
    // One native run per step, and the receipt of each is the one stored with its outcome.
    verify(h.runner, times(2))
        .send(
            org.mockito.ArgumentMatchers.eq("dispatch"),
            any(),
            anyString(),
            org.mockito.ArgumentMatchers.any(java.time.Instant.class));
    assertThat(h.receipts).hasSize(2);
    var stored = h.storedReceipts(id);
    assertThat(stored).hasSize(2);
    assertThat(stored.values().stream().map(C::parse).toList())
        .containsExactlyInAnyOrderElementsOf(h.receipts);
    assertThat(stored.values()).allSatisfy(receipt -> assertThat(receipt).doesNotContain("value"));
    // The last step is fulfilled too: the next advance completes it without a model request.
    h.advance(id);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(2);
    assertThat(h.state(id)).isEqualTo("FINALIZING");
  }

  /**
   * SC008 FIX-29: a fulfilled last step finalizes without the observation after it. The page is too
   * heavy to observe (the runner's refresh would end the session UNSUPPORTED_SURFACE), but the
   * committed click is the last step and nothing would read that observation: the session reaches
   * FINALIZING and the page is never observed.
   */
  @Test
  void aFulfilledLastStepFinalizesEvenWhenTheObservationAfterItWouldHitItsDeadline()
      throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.runnerSucceeds();
    org.mockito.Mockito.doThrow(new GuidedSessionException("UNSUPPORTED_SURFACE", 422))
        .when(h.dispatch)
        .observe(any(), anyString(), anyLong(), anyString(), any());
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await page.getByRole('button', { name: 'Save' }).click();"));
    h.advance(id);
    assertThat(h.state(id)).isEqualTo("OBSERVING");
    h.advance(id);
    assertThat(h.state(id)).isEqualTo("FINALIZING");
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
    verify(h.dispatch, never()).observe(any(), anyString(), anyLong(), anyString(), any());
  }

  /**
   * SC008 FIX-29: a fulfilled step that is not the last is completed first and leaves the refresh
   * due (continuation REFRESH); the next advance observes the page and learns the next step.
   */
  @Test
  void aFulfilledStepThatIsNotTheLastStillObservesBeforeTheNextStepIsLearned() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.", "Click Done.");
    String id = h.session(List.of(Spec.of(0, "Save"), Spec.of(1, "Done")));
    h.observe(
        id, 1, page().element("e1", "button", "Save").element("e2", "button", "Done").build());
    h.runnerSucceeds();
    h.refreshWith(
        generation ->
            page()
                .document("document-1", generation)
                .element("e1", "button", "Save")
                .element("e2", "button", "Done")
                .build());
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await page.getByRole('button', { name: 'Save' }).click();"));
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await page.getByRole('button', { name: 'Done' }).click();"));
    h.advance(id);
    h.advance(id);
    assertThat(h.progress(id).path("stepIndex").asInt()).isEqualTo(1);
    assertThat(continuation(h, id)).isEqualTo("REFRESH");
    verify(h.dispatch, never()).observe(any(), anyString(), anyLong(), anyString(), any());
    h.advance(id);
    verify(h.dispatch, times(1)).observe(any(), anyString(), anyLong(), anyString(), any());
    assertThat(continuation(h, id)).isEqualTo("NEXT");
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(2);
  }

  /**
   * SC008 FIX-28: the persisted count that bounds a step's STEP_CODE pool across redrives ignores
   * the requests that got no answer (a stall); it counts only the answered one.
   */
  @Test
  void theStepPoolCountIgnoresRequestsThatGotNoAnswer() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.", "Click Done.");
    String id = h.session(List.of(Spec.of(0, "Save"), Spec.of(1, "Done")));
    h.observe(
        id, 1, page().element("e1", "button", "Save").element("e2", "button", "Done").build());
    h.runnerSucceeds();
    h.refreshWith(
        generation ->
            page()
                .document("document-1", generation)
                .element("e1", "button", "Save")
                .element("e2", "button", "Done")
                .build());
    h.translation.useBackoffSleeper(NO_WAIT);
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await page.getByRole('button', { name: 'Save' }).click();"));
    h.failNext(GuidedModelRequest.Kind.STEP_CODE, GuidedModelResponse.Reason.TRANSPORT_STALL);
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await page.getByRole('button', { name: 'Done' }).click();"));
    h.advance(id);
    h.advance(id);
    h.advance(id);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(3);
    assertThat(h.progress(id).path("stepIndex").asInt()).isEqualTo(1);
    assertThat(h.repository.transaction(() -> h.store.stepCodeRequests(id, 1))).isEqualTo(1);
  }

  private static final GuidedTranslationService.BackoffSleeper NO_WAIT = millis -> noWait();

  private static void noWait() {
    // Backoff is not under test: do not wait.
  }

  private static String continuation(GroundingItHarness h, String id) {
    return h.repository.transaction(() -> h.store.state(id).path("continuation").asText());
  }

  /**
   * Ported from the typed suite (bootstrap recovery): the runner refuses the context definitely.
   * The session ends RUNTIME_INCOMPATIBLE on the first receipt, the context is never sent again,
   * and nothing is prepared, admitted or dispatched.
   */
  @Test
  void aDefiniteContextRefusalIsTerminalOnFirstReceiptAndNeverRetried() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.runnerSucceeds();
    var refusal =
        new GuidedSessionException(
            "RUNTIME_INCOMPATIBLE",
            409,
            com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.CONTEXT_REFUSED,
            false,
            null);
    org.mockito.Mockito.reset(h.runner);
    org.mockito.Mockito.doThrow(refusal)
        .when(h.runner)
        .send(org.mockito.ArgumentMatchers.eq("context"), any());
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));

    assertThatThrownBy(() -> h.advance(id))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> assertThat(failure.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE"));

    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("RUNTIME_INCOMPATIBLE");
    verify(h.runner, times(1)).send(org.mockito.ArgumentMatchers.eq("context"), any());
    verify(h.runner, org.mockito.Mockito.never())
        .send(org.mockito.ArgumentMatchers.eq("prepare"), any());
    assertThat(h.actions(id)).isZero();
    assertThat(h.reservations(id)).isZero();
  }

  /**
   * Ported (late-usage accounting): a reply that reports more input tokens than the session may
   * spend is charged in full and durably, stops the session before another model send, and
   * dispatches nothing.
   */
  @Test
  void usageBeyondTheCeilingIsChargedAndStopsTheSessionBeforeAnotherSend() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> {
          h.reportedInputTokens = 2_000_000;
          return h.code(request, "await ok();");
        });
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await again();"));

    try {
      h.advance(id);
    } catch (GuidedSessionException expected) {
      // The overage stops the session while the call is in flight, so the apply sees the
      // authority gone; the stop itself is recorded as BUDGET_EXCEEDED below.
      assertThat(expected.getMessage()).isIn("BUDGET_EXCEEDED", "STALE_GENERATION");
    }
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("BUDGET_EXCEEDED");
    assertThat(
            h.jdbc.queryForObject(
                "SELECT (document->'counters'->>'modelInputTokens')::int FROM studio_guided_sessions"
                    + " WHERE session_id=?",
                Integer.class,
                id))
        .isGreaterThanOrEqualTo(2_000_000);
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(GuidedSessionException.class);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
    assertThat(h.actions(id)).isZero();
  }

  /**
   * Ported (durable source question): the question the model asks is stored before anyone answers
   * it, the public answer is stored once, and the next request carries the accepted choice instead
   * of asking again.
   */
  @Test
  void aQuestionIsDurableBeforeItsAnswerAndTheAnswerResumesTheStep() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(
        id,
        1,
        page().element("e1", "button", "Save draft").element("e2", "button", "Save final").build());
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.clarification(request, "AMBIGUOUS_TARGET", "e1", "e2"));
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));

    h.advance(id);
    assertThat(h.progress(id).path("clarification").path("choices")).hasSize(2);
    assertThat(
            h.jdbc.queryForList(
                "SELECT accepted_choice FROM studio_guided_clarification_contexts WHERE"
                    + " session_id=?",
                String.class,
                id))
        .containsExactly((String) null);

    h.answer(id, 1);
    assertThat(
            h.jdbc.queryForList(
                "SELECT accepted_choice FROM studio_guided_clarification_contexts WHERE"
                    + " session_id=?",
                String.class,
                id))
        .hasSize(1)
        .doesNotContainNull();

    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(2);
    var second =
        h.requests.stream()
            .filter(r -> r.kind() == GuidedModelRequest.Kind.STEP_CODE)
            .toList()
            .get(1);
    assertThat(second.projection().document().toString()).contains("selectedChoice");
  }

  /**
   * Ported (malformed-reply repair): a reply the validator rejects is charged and recorded, the
   * model is asked again with the closed code, and what it got wrong is not echoed back.
   */
  @Test
  void aRejectedReplyIsRepairedThroughAChargedAttemptWithoutEchoingIt() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await ok();", "unplanned-binding-canary"));
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));

    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);

    assertThat(h.stepCodeAttempts(id)).isEqualTo(java.util.Map.of("APPLIED", 1, "REJECTED", 1));
    var repair =
        h.requests.stream()
            .filter(r -> r.kind() == GuidedModelRequest.Kind.STEP_CODE)
            .toList()
            .get(1)
            .projection()
            .document()
            .path("repair");
    assertThat(repair.path("closedCode").asText()).isEqualTo("INVALID_CONTRACT");
    assertThat(repair.toString()).doesNotContain("unplanned-binding-canary");
  }

  /**
   * Ported (bootstrap recovery, retry limit): a context delivery whose outcome stays uncertain is
   * retried three times; the next continuation ends the session RUNTIME_INCOMPATIBLE. No further
   * model request and no step is prepared. The three-deliveries-that-each-time-out case of the
   * typed suite is this rule; the 15 s client deadline that makes a delivery uncertain is
   * HttpRunnerDispatchClient's and is unchanged.
   */
  @Test
  void anUncertainContextDeliveryIsRetriedThreeTimesThenEndsRuntimeIncompatible() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.unplannedSession(List.of(Spec.of(0, "Save")));
    org.mockito.Mockito.doThrow(new GuidedSessionException("UNKNOWN_OUTCOME", 409))
        .when(h.dispatch)
        .pushContext(any(), org.mockito.ArgumentMatchers.eq(id), anyLong());
    for (int attempt = 0; attempt < 3; attempt++) {
      String key = "metadata-failure-" + attempt;
      assertThatThrownBy(() -> h.translation.plan(h.controller, id, 1, key, h.command(id)))
          .hasMessage("UNKNOWN_OUTCOME");
    }
    assertThatThrownBy(
            () -> h.translation.plan(h.controller, id, 1, "metadata-exhausted", h.command(id)))
        .hasMessage("RUNTIME_INCOMPATIBLE");

    verify(h.dispatch, times(3))
        .pushContext(
            any(), org.mockito.ArgumentMatchers.eq(id), org.mockito.ArgumentMatchers.eq(1L));
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.requests(GuidedModelRequest.Kind.SOURCE_PLAN)).isEqualTo(1);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isZero();
    assertThat(h.actions(id)).isZero();
  }

  /**
   * Ported (bootstrap recovery, every committed window): the process stops after the plan was
   * accepted, after the materialization committed, or after the runner took the context but before
   * the answer was recorded. The next continuation completes the bootstrap once: READY on the
   * initial blank document, one materialization, one bootstrap command, no second plan request.
   */
  @ParameterizedTest
  @ValueSource(strings = {"plan", "materialized", "lost-context-response"})
  void aBootstrapStoppedAtAnyCommittedWindowIsCompletedOnceByTheNextContinuation(String point)
      throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.unplannedSession(List.of(Spec.of(0, "Save")));
    var service = org.mockito.Mockito.spy(h.service);
    var bridge = h.dispatch;
    if (point.equals("plan")) {
      org.mockito.Mockito.doThrow(new AssertionError("process-stop"))
          .when(service)
          .materialize(any(), org.mockito.ArgumentMatchers.eq(id), anyLong(), anyString(), any());
    } else if (point.equals("materialized")) {
      org.mockito.Mockito.doAnswer(
              call -> {
                call.callRealMethod();
                throw new AssertionError("process-stop");
              })
          .when(service)
          .materialize(any(), org.mockito.ArgumentMatchers.eq(id), anyLong(), anyString(), any());
    } else {
      org.mockito.Mockito.doAnswer(
              call -> {
                call.callRealMethod();
                throw new AssertionError("process-stop");
              })
          .when(bridge)
          .pushContext(any(), org.mockito.ArgumentMatchers.eq(id), anyLong());
    }
    var interrupted =
        h.translationWith(
            service,
            bridge,
            new com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler(
                C, com.citi.put.checks.studio.support.TestDomains.FIXTURES));
    assertThatThrownBy(
            () -> interrupted.plan(h.controller, id, 1, "interrupted-plan", h.command(id)))
        .hasMessage("process-stop");

    org.mockito.Mockito.doCallRealMethod()
        .when(h.dispatch)
        .pushContext(any(), org.mockito.ArgumentMatchers.eq(id), anyLong());
    h.translation.plan(h.controller, id, 1, "recovered-plan", h.command(id));

    JsonNode progress = h.progress(id);
    assertThat(progress.path("translationBootstrap").path("phase").asText()).isEqualTo("READY");
    assertThat(progress.path("executionEvidence").path("kind").asText()).isEqualTo("initialBlank");
    assertThat(
            h.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                id))
        .isEqualTo(1);
    assertThat(
            h.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND"
                    + " route='bootstrap'",
                Integer.class,
                id))
        .isEqualTo(1);
    assertThat(h.requests(GuidedModelRequest.Kind.SOURCE_PLAN)).isEqualTo(1);
    assertThat(h.actions(id)).isZero();
  }

  /**
   * Ported (bootstrap resume checks the pins): a deployment whose output contract differs from the
   * one the plan was accepted under refuses to resume it (RUNTIME_INCOMPATIBLE, nothing
   * materialized); the original deployment resumes without a new model request, and an ambient
   * transaction is refused.
   */
  @Test
  void aBootstrapResumeUnderChangedPinsIsRefusedAndTheOriginalPinsResumeItWithoutTheModel()
      throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.unplannedSession(List.of(Spec.of(0, "Save")));
    var interruptedSessions = org.mockito.Mockito.spy(h.service);
    org.mockito.Mockito.doThrow(new AssertionError("process-stop"))
        .when(interruptedSessions)
        .materialize(any(), org.mockito.ArgumentMatchers.eq(id), anyLong(), anyString(), any());
    var prompts =
        new com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler(
            C, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    assertThatThrownBy(
            () ->
                h.translationWith(interruptedSessions, h.dispatch, prompts)
                    .plan(h.controller, id, 1, "pin-plan", h.command(id)))
        .hasMessage("process-stop");
    var changedPins = org.mockito.Mockito.spy(prompts);
    ObjectNode newPins = changedPins.schemaProvenance().deepCopy();
    newPins.put("outputContractHash", "f".repeat(64));
    org.mockito.Mockito.doReturn(newPins).when(changedPins).schemaProvenance();
    var incompatible = h.translationWith(h.service, h.dispatch, changedPins);

    assertThatThrownBy(() -> incompatible.plan(h.controller, id, 1, "old-pins", h.command(id)))
        .hasMessage("RUNTIME_INCOMPATIBLE");
    assertThat(
            h.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                id))
        .isZero();

    h.translation.advance(h.controller, id, 1, "direct-bootstrap", h.command(id));
    assertThat(h.progress(id).path("translationBootstrap").path("phase").asText())
        .isEqualTo("READY");
    assertThat(h.requests(GuidedModelRequest.Kind.SOURCE_PLAN)).isEqualTo(1);
    assertThatThrownBy(
            () ->
                h.repository.transaction(
                    () ->
                        h.translation.advance(
                            h.controller, id, 1, "ambient-transaction", h.command(id))))
        .hasMessage("RUNTIME_INCOMPATIBLE");
    assertThat(h.requests(GuidedModelRequest.Kind.SOURCE_PLAN)).isEqualTo(1);
  }

  /**
   * Ported (late accounting after a terminal state): a model reply that lands after the user
   * cancelled the session is still charged, but the cancelled session is not revived and nothing is
   * prepared or dispatched.
   */
  @Test
  void aReplyLandingAfterCancellationIsChargedWithoutRevivingTheSession() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> {
          h.service.cancel(
              h.user,
              id,
              "cancel-" + id,
              C.object().put("schemaVersion", 3).put("reason", "userRequested"));
          h.reportedInputTokens = 777;
          return h.code(request, "await ok();");
        });

    try {
      h.advance(id);
    } catch (GuidedSessionException expected) {
      // The authority is gone when the reply is applied.
      assertThat(expected.getMessage()).isIn("STALE_GENERATION", "BUDGET_EXCEEDED", "CANCELLED");
    }

    assertThat(h.state(id)).isEqualTo("CANCELLED");
    assertThat(
            h.jdbc.queryForObject(
                "SELECT (document->'counters'->>'modelInputTokens')::int FROM"
                    + " studio_guided_sessions WHERE session_id=?",
                Integer.class,
                id))
        .isGreaterThanOrEqualTo(777);
    assertThat(h.actions(id)).isZero();
    assertThat(h.reservations(id)).isZero();
  }
}
