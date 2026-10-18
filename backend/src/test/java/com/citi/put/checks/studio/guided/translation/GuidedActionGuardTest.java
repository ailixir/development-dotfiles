package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.policy.GuidedPolicyReason;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * STUDIO-OBS-014 AC-4 (grounding), AC-5 (destructive-verb guard), AC-6 (side-effect stance): the
 * pure guard, unit level, including the calibration corpus of authored click/press/check steps the
 * OBS-005/006/007 joined ITs drive through the translation path.
 */
class GuidedActionGuardTest {

  private static final GuidedContracts C = new GuidedContracts();

  // ── AC-4 ─────────────────────────────────────────────────────────────────

  @Test
  void aTargetTheAuthoredStepDoesNotNameIsUngrounded() {
    var decision = evaluate("click", button("Archive", null), "Open reports", "ALLOW", false);
    assertThat(decision.refusal()).isEqualTo(GuidedPolicyReason.UNGROUNDED_TARGET);
  }

  @Test
  void thePlantedDeleteAccountClickForOpenReportsIsRefusedBeforeAnyDispatch() {
    var decision =
        evaluate("click", button("Delete account", null), "Open reports", "ALLOW", false);
    // Destructive guard runs first, so the reason is DESTRUCTIVE_VERB; either way it is refused.
    assertThat(decision.refused()).isTrue();
    assertThat(decision.refusal()).isEqualTo(GuidedPolicyReason.DESTRUCTIVE_VERB);
  }

  @Test
  void groundingAcceptsAWholePhraseOrEveryWordAndASavedInputAndIgnoresCaseAndPunctuation() {
    assertThat(evaluate("click", link("Reports"), "Open Reports.", "ALLOW", true).refused())
        .isFalse();
    assertThat(
            evaluate("click", button("Sign in", null), "click SIGN-IN now", "ALLOW", true)
                .refused())
        .isFalse();
    assertThat(
            GuidedActionGuard.evaluate(
                    "check",
                    checkbox("Remember me"),
                    null,
                    "Tick the box <var CHOICE>",
                    List.of("remember me"),
                    policy("ALLOW"),
                    false)
                .refused())
        .isFalse();
    assertThat(evaluate("check", checkbox("Remember me"), "Tick the box", "ALLOW", false).refusal())
        .isEqualTo(GuidedPolicyReason.UNGROUNDED_TARGET);
  }

  /**
   * SEC-002: an element target whose node is not in the observation fails closed as
   * UNGROUNDED_TARGET for every grounded or side-effecting kind, even when the model's own locator
   * text matches the authored step and the stance is ALLOW.
   */
  @Test
  void anElementTargetMissingFromTheObservationIsRefusedUngrounded() {
    for (String kind : List.of("click", "press", "check")) {
      var decision =
          GuidedActionGuard.evaluate(
              kind,
              null,
              "node-9-404",
              null,
              "Submit",
              "Click Submit",
              List.of(),
              policy("ALLOW"),
              true);
      assertThat(decision.refusal()).as(kind).isEqualTo(GuidedPolicyReason.UNGROUNDED_TARGET);
    }
    // Control: the same proposal with its node observed is eligible.
    assertThat(
            GuidedActionGuard.evaluate(
                    "click",
                    null,
                    "node-9-404",
                    button("Submit", null).put("nodeId", "node-9-404"),
                    "Submit",
                    "Click Submit",
                    List.of(),
                    policy("ALLOW"),
                    true)
                .refused())
        .isFalse();
  }

  @Test
  void fillAndNavigateAreNotSubjectToGrounding() {
    assertThat(
            evaluate("fill", textbox("Anything"), "Type the reference", "ALLOW", false).refused())
        .isFalse();
    assertThat(
            GuidedActionGuard.evaluate(
                    "navigate", null, null, "Open x", List.of(), policy("DENY"), false)
                .refused())
        .isFalse();
  }

  // ── AC-5 ─────────────────────────────────────────────────────────────────

  @Test
  void clickSaveOnAPageWithSaveAndDeleteMakesOnlySaveEligible() {
    assertThat(evaluate("click", button("Save", null), "Click Save", "ALLOW", false).refused())
        .isFalse();
    assertThat(evaluate("click", button("Delete", null), "Click Save", "ALLOW", false).refusal())
        .isEqualTo(GuidedPolicyReason.DESTRUCTIVE_VERB);
  }

  @Test
  void anAuthoredDestructiveVerbAllowsTheControl() {
    assertThat(evaluate("click", button("Delete", null), "Click Delete", "ALLOW", false).refused())
        .isFalse();
    assertThat(
            evaluate("press", textbox("Send money"), "Press Enter to send money", "ALLOW", false)
                .refused())
        .isFalse();
  }

  @Test
  void bareSubmitIsNotDestructiveButSubmitOrderIs() {
    assertThat(evaluate("click", button("Submit", null), "Click Submit", "ALLOW", false).refused())
        .isFalse();
    assertThat(
            evaluate("click", button("Submit order", null), "Click Submit", "ALLOW", false)
                .refusal())
        .isEqualTo(GuidedPolicyReason.DESTRUCTIVE_VERB);
  }

  // ── AC-6 ─────────────────────────────────────────────────────────────────

  @Test
  void aFormSubmitClickUnderDenyIsRefusedAndUnderAllowPasses() {
    var submit = button("Sign in", "login-form");
    assertThat(evaluate("click", submit, "Click Sign in", "DENY", false).refusal())
        .isEqualTo(GuidedPolicyReason.SIDE_EFFECT_DENIED);
    var allowed = evaluate("click", submit, "Click Sign in", "ALLOW", false);
    assertThat(allowed.refused()).isFalse();
    assertThat(allowed.confirmFirst()).isFalse();
  }

  @Test
  void clarifyFirstAsksOnceBeforeTheFirstSideEffectAndNotAfterConfirmation() {
    var link = link("Reports");
    var first = evaluate("click", link, "Open Reports", "CLARIFY_FIRST", false);
    assertThat(first.refused()).isFalse();
    assertThat(first.confirmFirst()).isTrue();
    assertThat(evaluate("click", link, "Open Reports", "CLARIFY_FIRST", true).confirmFirst())
        .isFalse();
    // AR-SEC001-FM oracle U2, a named and justified flip (was isFalse, "a button outside any form
    // is
    // not side-effecting"): a button with formId null cannot be told apart from the submit button
    // of an unlabelled form, so it is side-effecting and asks first.
    assertThat(
            evaluate("click", button("Next", null), "Click Next", "CLARIFY_FIRST", false)
                .confirmFirst())
        .as("a button outside any exported form is side-effecting (AR-SEC001-FM)")
        .isTrue();
  }

  /**
   * SEC-001: the collector exports {@code <input type=submit|reset|button>} as element {@code
   * input}, role {@code button}, control type other (image and file inputs are never exported, so
   * they are refused as unobserved targets; AR-SEC001-FM V7). Inside a form each is a submission
   * under DENY and asks first under CLARIFY_FIRST.
   */
  @Test
  void submitResetAndButtonInputsInsideAFormAreSideEffectingUnderDenyAndClarifyFirst() {
    for (String name : List.of("Sign in", "Search", "Reset")) {
      ObjectNode input = node("button", name, "input").put("formId", "login-form");
      String authored = "Click " + name;
      assertThat(evaluate("click", input, authored, "DENY", false).refusal())
          .as("DENY %s", name)
          .isEqualTo(GuidedPolicyReason.SIDE_EFFECT_DENIED);
      var clarify = evaluate("click", input, authored, "CLARIFY_FIRST", false);
      assertThat(clarify.refused()).isFalse();
      assertThat(clarify.confirmFirst()).as("CLARIFY_FIRST %s", name).isTrue();
      assertThat(evaluate("click", input, authored, "CLARIFY_FIRST", true).confirmFirst())
          .isFalse();
    }
  }

  @Test
  void everySubmitCapableControlInsideAFormIsSideEffecting() {
    // <button> with no type attribute (default submit), a role=button custom control, and an
    // <input> whose role the observation does not name as non-submitting.
    for (ObjectNode control :
        List.of(
            button("Continue", "form"),
            node("button", "Continue", "other").put("formId", "form"),
            node("generic", "Continue", "input").put("formId", "form"))) {
      assertThat(evaluate("click", control, "Click Continue", "DENY", false).refusal())
          .as(control.toString())
          .isEqualTo(GuidedPolicyReason.SIDE_EFFECT_DENIED);
    }
  }

  @Test
  void aRoleLinkCustomControlIsNavigation() {
    var custom = node("link", "Reports", "other");
    assertThat(evaluate("click", custom, "Open Reports", "DENY", false).refusal())
        .isEqualTo(GuidedPolicyReason.SIDE_EFFECT_DENIED);
    assertThat(evaluate("click", custom, "Open Reports", "CLARIFY_FIRST", false).confirmFirst())
        .isTrue();
  }

  /**
   * AR-SEC001-FM oracle U4 (reworked from nonSubmittingInputsInsideAFormStayEligibleUnderDeny: the
   * textbox fixture gains its real control type, and the checkbox/radio click cases moved to U3,
   * where a click on them is now side-effecting). Only the three proven non-activating triples stay
   * eligible on click under DENY, with and without an exported form.
   */
  @Test
  void provenNonActivatingTargetsStayEligibleOnClickUnderDeny() {
    for (String formId : java.util.Arrays.asList(null, "form")) {
      for (ObjectNode target :
          List.of(
              control("input", "textbox", "text"),
              control("input", "searchbox", "search"),
              control("input", "combobox", "email"),
              control("input", "textbox", "password"),
              control("textarea", "textbox", "textarea"),
              control("select", "combobox", "none"),
              control("select", "listbox", "none"))) {
        if (formId != null) {
          target.put("formId", formId);
        }
        var decision = evaluate("click", target, "Click Remember me", "DENY", false);
        assertThat(decision.refused()).as(target.toString()).isFalse();
        assertThat(decision.sideEffecting()).as(target.toString()).isFalse();
      }
    }
  }

  /**
   * AR-SEC001-FM oracle U1: the escalated gap. Submit controls of an unlabelled form (formId null;
   * likewise a withheld form or a {@code form=} association, which also leave formId null): DENY
   * refuses, CLARIFY_FIRST asks once, ALLOW passes.
   */
  @Test
  void submitControlsOfAnUnlabelledFormOrFormAttributeAreSideEffecting() {
    for (ObjectNode submit :
        List.of(
            control("button", "button", "none"),
            control("input", "button", "other"),
            control("other", "button", "none"))) {
      assertThat(evaluate("click", submit, "Click Remember me", "DENY", false).refusal())
          .as(submit.toString())
          .isEqualTo(GuidedPolicyReason.SIDE_EFFECT_DENIED);
      assertThat(
              evaluate("click", submit, "Click Remember me", "CLARIFY_FIRST", false).confirmFirst())
          .isTrue();
      assertThat(
              evaluate("click", submit, "Click Remember me", "CLARIFY_FIRST", true).confirmFirst())
          .isFalse();
      var allowed = evaluate("click", submit, "Click Remember me", "ALLOW", false);
      assertThat(allowed.refused()).isFalse();
      assertThat(allowed.confirmFirst()).isFalse();
    }
  }

  /**
   * AR-SEC001-FM oracle U3: an input whose explicit role names a non-submitting control while its
   * control type is not a text-entry type (for example {@code <input type=submit role=checkbox>})
   * is side-effecting on click, in or out of a form. The same nodes toggled with {@code check} are
   * not side-effecting (the runner verifies a real checkbox or radio natively).
   */
  @Test
  void aSubmitInputGivenANonSubmittingRoleIsSideEffectingOnClick() {
    for (String role : List.of("checkbox", "radio", "spinbutton", "slider", "textbox")) {
      ObjectNode spoof = control("input", role, "other");
      assertThat(evaluate("click", spoof, "Click Remember me", "DENY", false).refusal())
          .as(role)
          .isEqualTo(GuidedPolicyReason.SIDE_EFFECT_DENIED);
      var toggled = evaluate("check", spoof, "Tick Remember me", "DENY", false);
      assertThat(toggled.refused()).as("check %s", role).isFalse();
      assertThat(toggled.sideEffecting()).isFalse();
    }
  }

  /**
   * AR-SEC001-FM oracle U5: a click on a label (fires its control's activation) or on a child of a
   * button or link (runs the ancestor's activation) is side-effecting.
   */
  @Test
  void aClickOnALabelOrAChildOfAButtonIsSideEffecting() {
    for (ObjectNode target :
        List.of(control("other", "generic", "none"), control("other", "heading", "none"))) {
      assertThat(evaluate("click", target, "Click Remember me", "DENY", false).refusal())
          .as(target.toString())
          .isEqualTo(GuidedPolicyReason.SIDE_EFFECT_DENIED);
    }
  }

  /** AR-SEC001-FM oracle U6: Enter is side-effecting on any target; other keys only in a form. */
  @Test
  void anEnterPressIsSideEffectingOnAnyTargetAndOtherKeysOnlyInAForm() {
    assertThat(
            GuidedActionGuard.sideEffecting("press", control("input", "textbox", "text"), "Enter"))
        .isTrue();
    assertThat(GuidedActionGuard.sideEffecting("press", link("Reports"), "Enter")).isTrue();
    assertThat(GuidedActionGuard.sideEffecting("press", control("input", "textbox", "text"), "Tab"))
        .isFalse();
    assertThat(
            GuidedActionGuard.sideEffecting(
                "press", control("input", "textbox", "text").put("formId", "f"), "Tab"))
        .as("monotone with the in-form press rule")
        .isTrue();
    assertThat(
            GuidedActionGuard.evaluate(
                    "press",
                    "Enter",
                    "node-1",
                    control("input", "textbox", "text").put("nodeId", "node-1"),
                    null,
                    "Press Enter in Remember me",
                    List.of(),
                    policy("DENY"),
                    false)
                .refusal())
        .isEqualTo(GuidedPolicyReason.SIDE_EFFECT_DENIED);
  }

  /**
   * AR-SEC001-FM oracle U7, closed world: over every elementType, the collector's supported roles
   * plus generic, every control type, formId null or set, and click / press Enter / press Tab, the
   * clicks classified non-side-effecting are exactly the three proven triples, and every case the
   * pre-ruling rule (frozen below) classified side-effecting is still side-effecting.
   */
  @Test
  void theClosedWorldNonSideEffectingClickSetIsExactlyTheThreeTriples() {
    List<String> elements =
        List.of("button", "input", "textarea", "select", "text", "link", "other");
    List<String> roles =
        List.of(
            "button",
            "link",
            "textbox",
            "searchbox",
            "combobox",
            "listbox",
            "checkbox",
            "radio",
            "spinbutton",
            "slider",
            "heading",
            "main",
            "form",
            "region",
            "navigation",
            "status",
            "dialog",
            "generic");
    List<String> controls =
        List.of(
            "none",
            "text",
            "search",
            "email",
            "tel",
            "url",
            "textarea",
            "password",
            "hidden",
            "other");
    int cases = 0;
    for (String element : elements) {
      for (String role : roles) {
        for (String controlType : controls) {
          for (String formId : java.util.Arrays.asList(null, "f")) {
            ObjectNode node = control(element, role, controlType);
            if (formId != null) {
              node.put("formId", formId);
            }
            boolean triple =
                (element.equals("input")
                        && Set.of("textbox", "searchbox", "combobox").contains(role)
                        && Set.of("text", "search", "email", "tel", "url", "password")
                            .contains(controlType))
                    || (element.equals("textarea")
                        && role.equals("textbox")
                        && controlType.equals("textarea"))
                    || (element.equals("select") && Set.of("combobox", "listbox").contains(role));
            boolean click = GuidedActionGuard.sideEffecting("click", node, null);
            assertThat(click).as("click %s", node).isEqualTo(!triple);
            assertThat(GuidedActionGuard.sideEffecting("press", node, "Enter")).isTrue();
            boolean tab = GuidedActionGuard.sideEffecting("press", node, "Tab");
            assertThat(tab).as("Tab %s", node).isEqualTo(formId != null);
            for (String key : List.of("Enter", "Tab")) {
              if (preRuling("press", node)) {
                assertThat(GuidedActionGuard.sideEffecting("press", node, key))
                    .as("monotone press %s %s", key, node)
                    .isTrue();
              }
            }
            if (preRuling("click", node)) {
              assertThat(click).as("monotone click %s", node).isTrue();
            }
            cases++;
          }
        }
      }
    }
    assertThat(cases).isEqualTo(7 * 18 * 10 * 2);
  }

  /** The pre-ruling (qa-fixes patch 01) classification, frozen for the monotonicity check. */
  private static boolean preRuling(String kind, ObjectNode node) {
    String element = node.path("elementType").asText();
    String role = node.path("role").asText();
    boolean inForm = node.path("formId").isTextual() && !node.path("formId").asText().isEmpty();
    if (kind.equals("press")) {
      return inForm;
    }
    if (element.equals("link") || role.equals("link")) {
      return true;
    }
    return inForm
        && (element.equals("button")
            || role.equals("button")
            || (element.equals("input")
                && !Set.of(
                        "checkbox",
                        "radio",
                        "switch",
                        "textbox",
                        "searchbox",
                        "combobox",
                        "spinbutton",
                        "slider")
                    .contains(role)));
  }

  @Test
  void anOmittedStanceIsClarifyFirst() {
    ObjectNode policy = policy("ALLOW");
    policy.remove("sideEffectStance");
    assertThat(
            GuidedActionGuard.evaluate(
                    "click", link("Reports"), null, "Open Reports", List.of(), policy, false)
                .confirmFirst())
        .isTrue();
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
   * grounded cases (po-qa014-rulings a3). Under the default vocabulary and an ALLOW stance, all
   * must stay eligible (AC-4/AC-5 "no regression in grounded cases, counted"; S-9).
   */
  @Test
  void theJoinedItCorpusStaysEligibleUnderTheDefaultVocabulary() {
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
      if (!evaluate("click", button(item[1], "form"), item[0], "ALLOW", false).refused()) {
        eligible++;
      }
    }
    assertThat(corpus).as("the complete translated click/press/check denominator").hasSize(6);
    assertThat(eligible).as("eligible of %d", corpus.size()).isEqualTo(corpus.size());
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static GuidedActionGuard.Decision evaluate(
      String kind, ObjectNode node, String authored, String stance, boolean confirmed) {
    return GuidedActionGuard.evaluate(
        kind, node, null, authored, List.of(), policy(stance), confirmed);
  }

  private static ObjectNode policy(String stance) {
    ObjectNode policy = C.object().put("sideEffectStance", stance);
    var vocabulary = policy.putArray("destructiveVocabulary");
    ObservedPublicationFixture.DEFAULT_DESTRUCTIVE_VOCABULARY.forEach(vocabulary::add);
    return policy;
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
        .putNull("formId");
  }
}
