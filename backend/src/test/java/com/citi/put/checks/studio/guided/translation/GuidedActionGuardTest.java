package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * STUDIO-OBS-014 AC-4 (grounding) and AC-5 (destructive-verb guard): the pure guard, unit level,
 * including the calibration corpus of authored click/press/check steps the OBS-005/006/007 joined
 * ITs drive through the translation path. STUDIO-GOV-001.3: a side-effecting click or Enter is
 * neither refused nor questioned.
 */
class GuidedActionGuardTest {

  private static final GuidedContracts C = new GuidedContracts();

  // ── AC-4 ─────────────────────────────────────────────────────────────────

  @Test
  void aTargetTheAuthoredStepDoesNotNameIsUngrounded() {
    var decision = evaluate("click", button("Archive", null), "Open reports");
    assertThat(decision.refusal()).isEqualTo(GuidedPolicyReason.UNGROUNDED_TARGET);
  }

  @Test
  void thePlantedDeleteAccountClickForOpenReportsIsRefusedBeforeAnyDispatch() {
    var decision = evaluate("click", button("Delete account", null), "Open reports");
    // Destructive guard runs first, so the reason is DESTRUCTIVE_VERB; either way it is refused.
    assertThat(decision.refused()).isTrue();
    assertThat(decision.refusal()).isEqualTo(GuidedPolicyReason.DESTRUCTIVE_VERB);
  }

  @Test
  void groundingAcceptsAWholePhraseOrEveryWordAndASavedInputAndIgnoresCaseAndPunctuation() {
    assertThat(evaluate("click", link("Reports"), "Open Reports.").refused()).isFalse();
    assertThat(evaluate("click", button("Sign in", null), "click SIGN-IN now").refused()).isFalse();
    assertThat(
            GuidedActionGuard.evaluate(
                    "check",
                    "e1",
                    checkbox("Remember me"),
                    "Tick the box <var CHOICE>",
                    List.of("remember me"))
                .refused())
        .isFalse();
    assertThat(evaluate("check", checkbox("Remember me"), "Tick the box").refusal())
        .isEqualTo(GuidedPolicyReason.UNGROUNDED_TARGET);
  }

  /**
   * SEC-002: an element target whose node is not in the observation fails closed as
   * UNGROUNDED_TARGET for every grounded or click/press kind, even when the model's own locator
   * text matches the authored step.
   */
  @Test
  void anElementTargetMissingFromTheObservationIsRefusedUngrounded() {
    for (String kind : List.of("click", "press", "check")) {
      var decision = GuidedActionGuard.evaluate(kind, "e404", null, "Click Submit", List.of());
      assertThat(decision.refusal()).as(kind).isEqualTo(GuidedPolicyReason.UNGROUNDED_TARGET);
    }
    // Control: the same proposal with its node observed is eligible.
    assertThat(
            GuidedActionGuard.evaluate(
                    "click", "e404", button("Submit", null), "Click Submit", List.of())
                .refused())
        .isFalse();
  }

  @Test
  void fillAndNavigateAreNotSubjectToGrounding() {
    assertThat(evaluate("fill", textbox("Anything"), "Type the reference").refused()).isFalse();
    assertThat(GuidedActionGuard.evaluate("navigate", null, null, "Open x", List.of()).refused())
        .isFalse();
  }

  // ── AC-5 ─────────────────────────────────────────────────────────────────

  @Test
  void clickSaveOnAPageWithSaveAndDeleteMakesOnlySaveEligible() {
    assertThat(evaluate("click", button("Save", null), "Click Save").refused()).isFalse();
    assertThat(evaluate("click", button("Delete", null), "Click Save").refusal())
        .isEqualTo(GuidedPolicyReason.DESTRUCTIVE_VERB);
  }

  @Test
  void anAuthoredDestructiveVerbAllowsTheControl() {
    assertThat(evaluate("click", button("Delete", null), "Click Delete").refused()).isFalse();
    assertThat(evaluate("press", textbox("Send money"), "Press Enter to send money").refused())
        .isFalse();
  }

  @Test
  void bareSubmitIsNotDestructiveButSubmitOrderIs() {
    assertThat(evaluate("click", button("Submit", null), "Click Submit").refused()).isFalse();
    assertThat(evaluate("click", button("Submit order", null), "Click Submit").refusal())
        .isEqualTo(GuidedPolicyReason.DESTRUCTIVE_VERB);
  }

  // ── Side effects (STUDIO-GOV-001.3) ──────────────────────────────────────

  /**
   * A click or Enter that submits a form, navigates or toggles a control is not refused and raises
   * no question: only the destructive-verb and grounding guards can refuse a proposal.
   */
  @Test
  void aSideEffectingClickOrEnterIsNeitherRefusedNorQuestioned() {
    assertThat(evaluate("click", button("Sign in", "login-form"), "Click Sign in").refused())
        .isFalse();
    assertThat(evaluate("click", link("Reports"), "Open Reports").refused()).isFalse();
    assertThat(evaluate("click", button("Next", null), "Click Next").refused()).isFalse();
    assertThat(
            GuidedActionGuard.evaluate(
                    "press",
                    "e1",
                    control("input", "textbox", "text"),
                    "Press Enter in Remember me",
                    List.of())
                .refused())
        .isFalse();
  }

  @Test
  void theDestructiveVocabularyIsTheFixedBackendList() {
    assertThat(GuidedActionGuard.DESTRUCTIVE_VOCABULARY)
        .containsExactly(
            "delete",
            "remove",
            "erase",
            "destroy",
            "purge",
            "pay",
            "transfer",
            "send money",
            "submit order",
            "place order",
            "confirm payment",
            "cancel subscription",
            "close account",
            "deactivate",
            "revoke");
  }

  // ── Calibration corpus (counted) ─────────────────────────────────────────

  /**
   * The complete AC-4 unit denominator (po-qa014-rulings a2): every authored click/press/check step
   * the four joined classes send through translation, with the target label their controlled model
   * chooses. Sources, by authored text and controlled model:
   *
   * <ul>
   *   <li>GuidedPlanningIntegrationTest TEXT step 3 / providerResponse and
   *       GuidedPublicationReplayIT TEXT step 3 / model(): Submit (identical text and label; one
   *       corpus entry).
   *   <li>GuidedPublicationReplayIT secret-login step 3 / secretLoginModel(): Sign in, Reports.
   *   <li>GuidedPublicationReplayIT P3 login step 3 / p3Model(): Sign in, Reports.
   *   <li>GuidedPublicationReplayIT P14 CONTROL_VALUE step 3 / p14Model(): Submit.
   * </ul>
   *
   * <p>No controlled model in those classes plans a press or a check. Name-excluded, with reason:
   * GuidedSessionIT and GuidedBridgeIntegrationTest build their proposals directly and never
   * construct a GuidedTranslationService, so the guard is unreachable there (for example
   * GuidedSessionIT's directly built click proposal); GuidedPublicationReplayIT's diagnostic
   * operation-kind enum is not an authored step; the four hostile OBS-005 semanticCases are not
   * grounded cases (po-qa014-rulings a3). Under the destructive vocabulary all must stay eligible
   * (AC-4/AC-5 "no regression in grounded cases, counted"; S-9).
   */
  @Test
  void theJoinedItCorpusStaysEligibleUnderTheDestructiveVocabulary() {
    List<String[]> corpus =
        List.of(
            new String[] {"Click Submit then check Confirmation appears.", "Submit"},
            new String[] {
              "Click Sign in, check Home, open Reports and check Reports appears.", "Sign in"
            },
            new String[] {
              "Click Sign in, check Home, open Reports and check Reports appears.", "Reports"
            },
            new String[] {
              "Click Sign in, click the Reports link and check protected Reports heading.",
              "Sign in"
            },
            new String[] {
              "Click Sign in, click the Reports link and check protected Reports heading.",
              "Reports"
            },
            new String[] {
              "Enter captured Field value in Destination, click Submit and check Confirmation.",
              "Submit"
            });
    int eligible = 0;
    for (String[] item : corpus) {
      if (!evaluate("click", button(item[1], "form"), item[0]).refused()) {
        eligible++;
      }
    }
    assertThat(corpus).as("the complete translated click/press/check denominator").hasSize(6);
    assertThat(eligible).as("eligible of %d", corpus.size()).isEqualTo(corpus.size());
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static GuidedActionGuard.Decision evaluate(
      String kind, ObjectNode node, String authored) {
    return GuidedActionGuard.evaluate(kind, "e1", node, authored, List.of());
  }

  private static ObjectNode button(String name, String formId) {
    ObjectNode node = node("button", name, "button");
    if (formId != null) {
      node.put("formId", formId);
    }
    return node;
  }

  private static ObjectNode link(String name) {
    return node("link", name, "link");
  }

  private static ObjectNode checkbox(String name) {
    return node("checkbox", name, "input");
  }

  private static ObjectNode textbox(String name) {
    return node("textbox", name, "input").put("formId", "form");
  }

  private static ObjectNode control(String elementType, String role, String controlType) {
    return node(role, "Remember me", elementType).put("controlType", controlType);
  }

  private static ObjectNode node(String role, String name, String elementType) {
    return C.object()
        .put("role", role)
        .put("name", name)
        .put("elementType", elementType)
        .put("nameComplete", true)
        .put("ownTextComplete", true)
        .putNull("formId");
  }
}
