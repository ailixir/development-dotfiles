package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.translation.GroundingItHarness.ReachedRunner;
import com.citi.put.checks.studio.guided.translation.GroundingItHarness.Spec;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * ADR-SC-008 D3.3/D6: the learning loop of one step, end to end on a real PostgreSQL. The real
 * session service, translation service, stores and migrations run; the model is scripted and the
 * runner is a stand-in at the dispatch edge, which accepts or refuses prepare the way {@code
 * HttpRunnerDispatchClient} maps the runner's closed refusals.
 *
 * <p>What is proved is what the service persisted, read back with SQL after the run: the gate that
 * refused each rejected attempt ({@code rejection_gate}), the prepare gate that ended a run ({@code
 * progress.refusalGate}), the reservations and the model requests that were spent.
 */
class GuidedGateAuditIT {
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine");

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

  private static final GuidedTranslationService.BackoffSleeper NO_WAIT = millis -> noWait();

  private static void noWait() {
    // Backoff is not under test: do not wait.
  }

  private static GuidedSessionException refusal(Throwable thrown) {
    assertThat(thrown).isInstanceOf(GuidedSessionException.class);
    return (GuidedSessionException) thrown;
  }

  private static void noPrepare(GroundingItHarness h) {
    verify(h.dispatch, never()).prepareStep(any(), anyString(), anyLong(), any());
  }

  private static JsonNode repairOf(GroundingItHarness h, int request) {
    return h.requests.stream()
        .filter(r -> r.kind() == GuidedModelRequest.Kind.STEP_CODE)
        .toList()
        .get(request)
        .projection()
        .document()
        .path("repair");
  }

  // ---- the gate that refused is persisted ----

  /** A clarification must offer at least two refs; fewer is a repairable reply, three end it. */
  @Test
  void aClarificationWithTooFewChoicesIsRepairedThenEndsInvalidContract() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    for (int attempt = 0; attempt < 3; attempt++) {
      h.reply(
          GuidedModelRequest.Kind.STEP_CODE,
          request -> h.clarification(request, "AMBIGUOUS_TARGET", "e1"));
    }
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> {
              assertThat(refusal(failure).getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(refusal(failure).status()).isEqualTo(422);
            });
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(3);
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("INVALID_CONTRACT");
    assertThat(h.rejectionGates(id)).isEqualTo(Map.of("STEP_CHOICES", 3));
    assertThat(h.reservations(id)).isZero();
    assertThat(h.actions(id)).isZero();
    assertThat(h.progress(id).has("clarification")).isFalse();
    assertThat(repairOf(h, 1).path("closedCode").asText()).isEqualTo("INVALID_CONTRACT");
    noPrepare(h);
  }

  /**
   * Three rejected replies for one step, each failing a different check in the order the validator
   * runs them: blank code, a capture nobody planned, a choice whose ref is not on the page. Each
   * attempt row carries its own gate.
   */
  @Test
  void rejectionGateIsPersistedForEachApplyGateAndReadBack() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(
        id, 1, page().element("e1", "button", "Save").element("e2", "button", "Cancel").build());
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "   "));
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await x();", "unplanned"));
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.clarification(request, "AMBIGUOUS_TARGET", "e99", "e2"));
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> assertThat(refusal(failure).getMessage()).isEqualTo("INVALID_CONTRACT"));
    assertThat(h.rejectionGates(id))
        .isEqualTo(Map.of("STEP_CODE_SHAPE", 1, "STEP_CAPTURES", 1, "STEP_TARGET_REF", 1));
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("INVALID_CONTRACT");
    assertThat(h.actions(id)).isZero();
    noPrepare(h);
  }

  // ---- the runner's prepare is the syntax admission, and it shares the pool ----

  /**
   * The runner cannot parse the first code. The next request carries the repair: the closed code,
   * the position and the code that failed. The second code is accepted and its obligation reserved.
   */
  @Test
  void aSyntaxRefusalIsRepairedWithItsPositionAndNothingIsReservedForTheRefusedCode()
      throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.prepareSequence(GroundingItHarness.syntax(1, 18), null);
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await page.click(("));
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await page.getByRole('button').click();"));
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(2);
    assertThat(repairOf(h, 0).isNull()).isTrue();
    JsonNode repair = repairOf(h, 1);
    assertThat(repair.path("closedCode").asText()).isEqualTo("STEP_SYNTAX");
    assertThat(repair.path("stage").asText()).isEqualTo("SYNTAX");
    assertThat(repair.path("line").asInt()).isEqualTo(1);
    assertThat(repair.path("column").asInt()).isEqualTo(18);
    assertThat(repair.path("previousCode").asText()).isEqualTo("await page.click((");
    assertThat(repair.path("facts").asText().length()).isLessThanOrEqualTo(256);
    assertThat(h.reservations(id)).isEqualTo(1);
    // A syntax refusal ran no code: the page is not observed again.
    verify(h.dispatch, never()).observe(any(), anyString(), anyLong(), anyString(), any());
    assertThat(h.stepCodeAttempts(id)).isEqualTo(Map.of("APPLIED", 2));
  }

  /** A miss before the first action ran the code, so the page is observed again first. */
  @Test
  void aPreFenceRefusalRefreshesTheObservationBeforeTheNextRequest() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.refreshWith(
        generation ->
            page().document("document-1", generation).element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.prepareSequence(GroundingItHarness.preFence(0), null);
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await a();"));
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await b();"));
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);
    JsonNode repair = repairOf(h, 1);
    assertThat(repair.path("closedCode").asText()).isEqualTo("TARGET_DRIFT");
    assertThat(repair.path("stage").asText()).isEqualTo("PRE_FENCE");
    assertThat(repair.path("line").isNull()).isTrue();
    assertThat(repair.path("facts").asText()).contains("0 elements");
    verify(h.dispatch, times(1)).observe(any(), anyString(), anyLong(), anyString(), any());
  }

  /** Two rejected replies and one prepare refusal spend the one pool of three and end the step. */
  @Test
  void rejectionsAndPrepareRefusalsShareOnePoolOfThree() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.prepareSequence(GroundingItHarness.syntax(2, 3));
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "   "));
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "x", "unplanned"));
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await broken("));
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> assertThat(refusal(failure).getMessage()).isEqualTo("INVALID_CONTRACT"));
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(3);
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("INVALID_CONTRACT");
    assertThat(h.refusalGate(id)).isEqualTo("STEP_SYNTAX");
    assertThat(h.reservations(id)).isZero();
    assertThat(h.actions(id)).isZero();
  }

  /**
   * SC008 FIX-28: two provider failures that gave no answer (a stall, a 429) are retried from the
   * transient allowance. All three tries of the pool stay for the step: two rejected replies, then
   * the accepted one.
   */
  @Test
  void transientNoAnswerFailuresSpendNoTryOfTheStepPool() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.translation.useBackoffSleeper(NO_WAIT);
    h.failNext(GuidedModelRequest.Kind.STEP_CODE, GuidedModelResponse.Reason.TRANSPORT_STALL);
    h.failNext(GuidedModelRequest.Kind.STEP_CODE, GuidedModelResponse.Reason.TRANSPORT_HTTP_429);
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "   "));
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "x", "unplanned"));
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await page.getByRole('button').click();"));
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(5);
    assertThat(h.stepCodeAttempts(id)).isEqualTo(Map.of("APPLIED", 1, "REJECTED", 4));
    assertThat(h.reservations(id)).isEqualTo(1);
  }

  /** Three transient failures in one call exceed the allowance and end the step as before. */
  @Test
  void anExhaustedTransientAllowanceEndsTheStepModelUnavailable() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.translation.useBackoffSleeper(NO_WAIT);
    for (int stall = 0; stall < 3; stall++) {
      h.failNext(GuidedModelRequest.Kind.STEP_CODE, GuidedModelResponse.Reason.TRANSPORT_STALL);
    }
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> assertThat(refusal(failure).getMessage()).isEqualTo("MODEL_UNAVAILABLE"));
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(3);
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("MODEL_UNAVAILABLE");
  }

  /** The pool also holds across a redrive: a fourth request is never made for the step. */
  @Test
  void aSpentPoolStaysSpentWhenTheStepIsDrivenAgain() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.prepareSequence(GroundingItHarness.syntax(1, 1));
    for (int attempt = 0; attempt < 3; attempt++) {
      h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await broken("));
    }
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(GuidedSessionException.class);
    int spent = h.requests(GuidedModelRequest.Kind.STEP_CODE);
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(GuidedSessionException.class);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(spent);
  }

  // ---- a reservation that outlived its admission ----

  /**
   * The run died between the reservation and the admission. The next advance resumes that
   * reservation from its stored proposal: no new model request and no IDEMPOTENCY_CONFLICT.
   */
  @Test
  void aReservationThatWasNeverAdmittedIsResumedFromItsStoredProposal() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);
    assertThat(h.reservations(id)).isEqualTo(1);
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
    verify(h.dispatch, times(1)).prepareAndAdmit(any(), anyString(), anyLong(), anyString(), any());
    assertThat(h.reservations(id)).isEqualTo(1);
  }

  /** The resumed proposal is refused at prepare: the run ends, and the gate is recorded. */
  @Test
  void aResumedProposalThatPrepareRefusesEndsTheRunWithItsGate() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);
    org.mockito.Mockito.doThrow(GroundingItHarness.syntax(4, 2))
        .when(h.dispatch)
        .prepareAndAdmit(any(), anyString(), anyLong(), anyString(), any());
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(failure -> assertThat(refusal(failure).messageCode()).isEqualTo("STEP_SYNTAX"));
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("INVALID_CONTRACT");
    assertThat(h.refusalGate(id)).isEqualTo("STEP_SYNTAX");
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
  }

  // ---- an absent target ----

  /**
   * The model finds nothing to choose from on a page that has settled: the step ends MISSING_SOURCE
   * (never BUDGET_EXCEEDED), with nothing prepared, reserved or dispatched.
   */
  @Test
  void anAbsentTargetOnAStablePageReachesTheModelAndEndsMissingSource() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Delete.");
    String id = h.session(List.of(Spec.of(0, "Delete")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.clarification(request, "INSUFFICIENT_EVIDENCE"));
    h.advance(id);
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("MISSING_SOURCE");
    assertThat(h.reservations(id)).isZero();
    assertThat(h.actions(id)).isZero();
    noPrepare(h);
  }

  /** Zero choices with an ambiguity reason is a malformed reply, not an absent target. */
  @Test
  void zeroChoicesWithAnAmbiguityReasonIsRepairable() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.stopAtRunner();
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE, request -> h.clarification(request, "AMBIGUOUS_TARGET"));
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(ReachedRunner.class);
    assertThat(h.rejectionGates(id)).isEqualTo(Map.of("STEP_CHOICES", 1));
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(2);
  }

  /**
   * SC008-FIX-9: a stand-alone "Copy ..." step (a needId nothing uses) is planned, not refused. The
   * plan keeps the step, drops the unused need, and the step is an ordinary one: its STEP_CODE
   * request carries needId null and no needs, and it is dispatched with no capture.
   */
  @Test
  void aStandAloneCopyStepIsPlannedAsAnOrdinaryStepWithNoNeed() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Copy the price.");
    String id = h.session(List.of(Spec.produces(0, "Price", "need-price")));
    h.observe(id, 1, page().element("e1", "text", "9.99").build());
    h.runnerSucceeds();
    h.refreshWith(
        generation ->
            page().document("document-1", generation).element("e1", "text", "9.99").build());
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await expect(page.getByText('9.99')).toBeVisible();"));

    h.advance(id);

    JsonNode context =
        h.requests.stream()
            .filter(r -> r.kind() == GuidedModelRequest.Kind.STEP_CODE)
            .findFirst()
            .orElseThrow()
            .projection()
            .document();
    assertThat(context.path("needs")).isEmpty();
    assertThat(context.path("obligations").get(0).path("needId").isNull()).isTrue();
    var actions = h.actionRows(id);
    assertThat(actions).hasSize(1);
    assertThat(actions.getFirst().path("state").asText()).isEqualTo("SUCCEEDED");
    assertThat(h.reservations(id)).isEqualTo(1);
    assertThat(
            h.repository
                .transaction(() -> h.store.obligations(id))
                .getFirst()
                .path("proposal")
                .path("operation")
                .path("captures"))
        .isEmpty();
  }
}
