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
import com.citi.put.checks.studio.guided.translation.GroundingItHarness.Spec;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * ADR-SC-007 AC1/AC5/AC7/AC10: the grounding gates, end to end on a real PostgreSQL. The real
 * session service, translation service, stores and migrations run; the model is scripted and the
 * runner is a stand-in at the dispatch edge, which refuses prepare the way {@code
 * HttpRunnerDispatchClient} maps the runner's closed refusals.
 *
 * <p>What is proved is what the service persisted, read back with SQL after the run: the gate that
 * refused each rejected attempt ({@code rejection_gate}), how the intent gate admitted each applied
 * action ({@code intent_path}, {@code intent_fields}), and the runner-time gate that ended a run
 * ({@code progress.refusalGate}).
 */
class GuidedGateAuditIT {
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine");
  private static final String READ_GRANT = "observed-read-v1-" + "a".repeat(64);

  @BeforeAll
  static void start() {
    POSTGRES.start();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  private static ObservationFixtures.Builder page() {
    return ObservationFixtures.observation().readRuleId(READ_GRANT);
  }

  private static GuidedSessionException refusal(Throwable thrown) {
    assertThat(thrown).isInstanceOf(GuidedSessionException.class);
    return (GuidedSessionException) thrown;
  }

  private static void noDispatch(GroundingItHarness h) {
    verify(h.dispatch, never()).prepareAndAdmit(any(), anyString(), anyLong(), anyString(), any());
  }

  // ---- AC1: the gate that refused is persisted ----

  /**
   * The model offers two elements that look alike to the backend (the same role, name and evidence)
   * as the choice between them. They can never be told apart by what the backend keeps, so the
   * question is refused every time; three refusals end the run as a surface Studio cannot work
   * with, and nothing was clicked.
   */
  @Test
  void duplicateNameClarificationEndsUnsupportedSurface() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.click(0, "Save")));
    h.observe(
        id, 1, page().element("e1", "button", "Save").element("e2", "button", "Save").build());
    for (int attempt = 0; attempt < 3; attempt++) {
      h.reply(GuidedModelRequest.Kind.NEXT_ACTION, request -> h.clarification(request, "e1", "e2"));
    }
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> {
              assertThat(refusal(failure).getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(refusal(failure).status()).isEqualTo(422);
            });
    assertThat(h.requests(GuidedModelRequest.Kind.NEXT_ACTION)).isEqualTo(3);
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("UNSUPPORTED_SURFACE");
    assertThat(h.rejectionGates(id)).isEqualTo(Map.of("NEXT_SELECTED_CHOICE", 3));
    assertThat(h.actions(id)).isZero();
    assertThat(h.progress(id).has("clarification")).isFalse();
    noDispatch(h);
  }

  /**
   * Three rejected replies for one obligation, each failing a different gate in the order the
   * validator runs them: the ref is not on the page, the element does not match the intent, the
   * operation does not fit the element's role. Each attempt row carries its own gate; the run ends
   * UNSUPPORTED_SURFACE because the last refusal was a grounding gate.
   */
  @Test
  void rejectionGateIsPersistedForEachApplyGateAndReadBack() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Tick the terms.");
    String id = h.session(List.of(Spec.check(0, "Terms")));
    h.observe(
        id, 1, page().element("e1", "button", "Terms").element("e2", "button", "Cancel").build());
    ObjectNode check = h.contracts.object().put("kind", "check");
    for (String ref : List.of("e99", "e2", "e1")) {
      h.reply(
          GuidedModelRequest.Kind.NEXT_ACTION,
          request -> h.action(request, ObservationFixtures.nodeRef(ref), check.deepCopy()));
    }
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> assertThat(refusal(failure).getMessage()).isEqualTo("INVALID_CONTRACT"));
    assertThat(h.rejectionGates(id))
        .isEqualTo(
            Map.of(
                "NEXT_TARGET_REF", 1,
                "NEXT_TARGET_INTENT", 1,
                "NEXT_OPERATION_TARGET", 1));
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("UNSUPPORTED_SURFACE");
    assertThat(h.actions(id)).isZero();
    noDispatch(h);

    // A gate that is not a grounding gate keeps its own terminal code: an operation that is not
    // the obligation's is a malformed reply, not a surface Studio cannot work with.
    String other = h.session(List.of(Spec.click(0, "Save")));
    h.observe(other, 1, page().element("e1", "button", "Save").build());
    ObjectNode hover = h.contracts.object().put("kind", "hover");
    for (int attempt = 0; attempt < 3; attempt++) {
      h.reply(
          GuidedModelRequest.Kind.NEXT_ACTION,
          request -> h.action(request, ObservationFixtures.nodeRef("e1"), hover.deepCopy()));
    }
    assertThatThrownBy(() -> h.advance(other))
        .satisfies(
            failure -> assertThat(refusal(failure).getMessage()).isEqualTo("INVALID_CONTRACT"));
    assertThat(h.rejectionGates(other)).isEqualTo(Map.of("NEXT_ACTION_MEANING", 3));
    assertThat(h.errorCode(other)).isEqualTo("INVALID_CONTRACT");
  }

  // ---- AC5: how an admitted action passed the intent gate ----

  /**
   * An action admitted by an exact name and one admitted by a word subset of the element's evidence
   * (the words came from its name and from the text near it): the audit says which path and which
   * evidence fields supplied the intent words. Read back after the run, per applied attempt.
   */
  @Test
  void intentPathAndFieldsArePersistedForAdmittedActionsAndReadBack() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    // The action guard grounds the clicked element's name in the authored step text.
    var searching = new GroundingItHarness(POSTGRES, "Click Search docs.");

    String exact = h.session(List.of(Spec.click(0, "Save")));
    h.observe(exact, 1, page().element("e1", "button", "Save").build());
    h.reply(GuidedModelRequest.Kind.NEXT_ACTION, request -> h.click(request, "e1"));
    assertThatThrownBy(() -> h.advance(exact)).isInstanceOf(GroundingItHarness.ReachedRunner.class);
    assertThat(h.intentRows(exact)).isEqualTo(List.of(List.of("EXACT_NAME", "name")));
    assertThat(h.rejectionGates(exact)).isEmpty();

    String subset = searching.session(List.of(Spec.click(0, "Search docs")));
    ObjectNode search = ObservationFixtures.fact("button", "Search", false, null);
    search.put("evidence", "Search docs");
    search
        .putArray("evidenceSegments")
        .addObject()
        .put("field", "name")
        .put("start", 0)
        .put("end", 6);
    search
        .withArray("evidenceSegments")
        .addObject()
        .put("field", "near")
        .put("start", 7)
        .put("end", 11);
    searching.observe(subset, 1, page().withFact("e1", search).build());
    searching.reply(GuidedModelRequest.Kind.NEXT_ACTION, request -> searching.click(request, "e1"));
    assertThatThrownBy(() -> searching.advance(subset))
        .isInstanceOf(GroundingItHarness.ReachedRunner.class);
    assertThat(searching.intentRows(subset))
        .isEqualTo(List.of(List.of("EVIDENCE_SUBSET", "name,near")));
    assertThat(searching.rejectionGates(subset)).isEmpty();
  }

  // ---- AC7: a read needs a grant and text ----

  /**
   * A page the runner reported with no read grant admits no read, so the run ends before a model is
   * asked: three refused replies would only have spent the budget.
   */
  @Test
  void readOnPageWithoutReadGrantFailsBeforeTheModelCall() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Read the reference.", "Check the reference.");
    String id = h.session(readPlan());
    h.observe(
        id,
        1,
        ObservationFixtures.observation().readable("e1", "text", "Order number", "ORD-1").build());
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> {
              assertThat(refusal(failure).getMessage()).isEqualTo("UNSUPPORTED_SURFACE");
              assertThat(refusal(failure).status()).isEqualTo(422);
            });
    assertThat(h.requests(GuidedModelRequest.Kind.NEXT_ACTION)).isZero();
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("UNSUPPORTED_SURFACE");
    assertThat(h.actions(id)).isZero();
    noDispatch(h);
  }

  // ---- AC10: the runner's report must agree, and its closed refusals end the run ----

  /**
   * The runner reports a target that disagrees with the element the gates admitted, so the
   * preparation is refused before it can be stored. The same proposal is asked and refused again;
   * after two unadmitted proposals the run ends as a surface Studio cannot work with.
   */
  @Test
  void evidenceMismatchedPreparationEndsUnsupportedSurfaceAfterTwoUnadmittedProposals()
      throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.click(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.prepareFails("EVIDENCE_MISMATCH", 422);
    for (int proposal = 0; proposal < 2; proposal++) {
      h.reply(GuidedModelRequest.Kind.NEXT_ACTION, request -> h.click(request, "e1"));
    }
    for (int proposal = 0; proposal < 2; proposal++) {
      assertThatThrownBy(() -> h.advance(id))
          .satisfies(
              failure -> assertThat(refusal(failure).getMessage()).isEqualTo("EVIDENCE_MISMATCH"));
      assertThat(h.state(id)).isEqualTo("PROPOSING");
    }
    h.advance(id);
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("UNSUPPORTED_SURFACE");
    assertThat(h.requests(GuidedModelRequest.Kind.NEXT_ACTION)).isEqualTo(2);
    verify(h.dispatch, times(2)).prepareAndAdmit(any(), anyString(), anyLong(), anyString(), any());
    assertThat(h.actions(id)).isZero();
  }

  /**
   * The runner cannot find the authored option among the live ones. The run ends TARGET_MISMATCH
   * with the runner-time gate recorded, and the model is not asked again.
   */
  @Test
  void runnerOptionNotPresentEndsTargetMismatchWithoutReask() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.click(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.reply(GuidedModelRequest.Kind.NEXT_ACTION, request -> h.click(request, "e1"));
    h.runnerRefusesPrepare("TARGET_MISMATCH", 422, "OPTION_NOT_PRESENT");
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> {
              assertThat(refusal(failure).getMessage()).isEqualTo("TARGET_MISMATCH");
              assertThat(refusal(failure).messageCode()).isEqualTo("OPTION_NOT_PRESENT");
            });
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("TARGET_MISMATCH");
    assertThat(h.refusalGate(id)).isEqualTo("RUNNER_OPTION_NOT_PRESENT");
    assertThatThrownBy(() -> h.advance(id)).isInstanceOf(GuidedSessionException.class);
    assertThat(h.requests(GuidedModelRequest.Kind.NEXT_ACTION)).isEqualTo(1);
    verify(h.dispatch, times(1)).prepareAndAdmit(any(), anyString(), anyLong(), anyString(), any());
  }

  /** The runner cannot give the element a locator that survives a reload: not a state to learn. */
  @Test
  void runnerNoDurableLocatorEndsUnsupportedSurface() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.click(0, "Save")));
    h.observe(id, 1, page().element("e1", "button", "Save").build());
    h.reply(GuidedModelRequest.Kind.NEXT_ACTION, request -> h.click(request, "e1"));
    h.runnerRefusesPrepare("UNSUPPORTED_SURFACE", 422, "NO_DURABLE_LOCATOR");
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> {
              assertThat(refusal(failure).getMessage()).isEqualTo("UNSUPPORTED_SURFACE");
              assertThat(refusal(failure).messageCode()).isEqualTo("NO_DURABLE_LOCATOR");
            });
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("UNSUPPORTED_SURFACE");
    assertThat(h.refusalGate(id)).isEqualTo("RUNNER_NO_DURABLE_LOCATOR");
    assertThat(h.requests(GuidedModelRequest.Kind.NEXT_ACTION)).isEqualTo(1);
  }

  /** The runner's kept read profile does not allow the read the backend's gates admitted. */
  @Test
  void runnerReadNotAllowedEndsUnsupportedSurface() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Read the reference.", "Check the reference.");
    String id = h.session(readPlan());
    h.observe(id, 1, page().readable("e1", "text", "Order number", "ORD-1").build());
    h.reply(
        GuidedModelRequest.Kind.NEXT_ACTION,
        request -> {
          JsonNode needs = request.projection().document().path("needs");
          ObjectNode read =
              h.contracts
                  .object()
                  .put("kind", "read")
                  .put("bindingId", needs.get(0).path("bindingId").asText());
          return h.action(request, ObservationFixtures.nodeRef("e1"), read);
        });
    h.runnerRefusesPrepare("UNSUPPORTED_SURFACE", 422, "READ_NOT_ALLOWED");
    assertThatThrownBy(() -> h.advance(id))
        .satisfies(
            failure -> {
              assertThat(refusal(failure).getMessage()).isEqualTo("UNSUPPORTED_SURFACE");
              assertThat(refusal(failure).messageCode()).isEqualTo("READ_NOT_ALLOWED");
            });
    assertThat(h.state(id)).isEqualTo("FAILED");
    assertThat(h.errorCode(id)).isEqualTo("UNSUPPORTED_SURFACE");
    assertThat(h.refusalGate(id)).isEqualTo("RUNNER_READ_NOT_ALLOWED");
    assertThat(h.requests(GuidedModelRequest.Kind.NEXT_ACTION)).isEqualTo(1);
  }

  /** A read of the order reference, then a check that the page shows the value that was read. */
  private static List<Spec> readPlan() {
    return List.of(
        Spec.read(0, "Order number", "need-a"), Spec.assertContains(1, "Order number", "need-a"));
  }
}
