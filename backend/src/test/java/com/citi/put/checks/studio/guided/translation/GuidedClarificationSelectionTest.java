package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.translation.GuidedGates.Selection;
import com.citi.put.checks.studio.guided.translation.GuidedRefusalDiagnostics.Gate;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 D-6: an author's earlier choice is re-established against the fresh facts by a count
 * and never by position. One equal fact carries the choice to the model as {role, name, ref}; zero
 * or several make the obligation a re-confirmation, for which no ACTION is admissible. Pure: the
 * real validator, gates and schemas, and a translation service whose collaborators are doubles.
 */
class GuidedClarificationSelectionTest {
  private static final GuidedContracts C = ActionHarness.C;
  private static final String CLARIFICATION = "clarification-1";

  private static ObjectNode click() {
    return C.object().put("kind", "click");
  }

  private static ActionHarness harness(
      ObservationFixtures.Builder observation, String kind, String intent) {
    return new ActionHarness(observation.build(), kind, intent);
  }

  /** The obligation as the model sees it after the author accepted the given semantic choice. */
  private static ObjectNode effective(ActionHarness harness, Selection accepted) {
    GuidedClarificationContextStore questions = mock(GuidedClarificationContextStore.class);
    ObjectNode row = C.object().put("acceptedChoiceId", "choice-1");
    row.putObject("context").put("clarificationId", CLARIFICATION);
    ObjectNode mapping = row.putArray("meanings").addObject().put("choiceId", "choice-1");
    mapping.putObject("meaning").put("obligationId", "obligation-1").put("ref", "e1");
    mapping
        .putObject("selection")
        .put("role", accepted.role())
        .put("name", accepted.name())
        .put("evidence", accepted.evidence());
    when(questions.effectiveObserved(anyString())).thenReturn(List.of(row));
    harness.progress.putObject("resolvedClarifications").putObject(CLARIFICATION);
    GuidedTranslationService service =
        new GuidedTranslationService(
            mock(com.citi.put.checks.studio.guided.session.GuidedSessionService.class),
            mock(GuidedSessionRepository.class),
            mock(GuidedTranslationStore.class),
            questions,
            null,
            null,
            C,
            null,
            null,
            harness.validator,
            null,
            new GuidedTranslationProperties(true, 98304, 4096, 20, "worker"),
            Clock.systemUTC());
    return service.effectiveObligation(
        new GuidedSessionRepository.Session(harness.session, harness.progress), harness.obligation);
  }

  private static Selection save() {
    return new Selection("button", "Save", "Save");
  }

  @Test
  void matchingRefsIsACountOverRoleNameAndEvidenceInFactsOrder() {
    JsonNode facts =
        ObservationFixtures.observation()
            .element("e1", "button", "Save")
            .element("e2", "button", "Save")
            .element("e3", "button", "Save changes")
            .element("e4", "link", "Save")
            .withFact("e5", ObservationFixtures.fact("button", "Save", false, "kept"))
            .build()
            .path("facts");
    assertThat(GuidedGates.matchingRefs(facts, save())).containsExactly("e1", "e2", "e5");
    assertThat(
            GuidedGates.matchingRefs(
                facts, new Selection("button", "Save changes", "Save changes")))
        .containsExactly("e3");
    assertThat(GuidedGates.matchingRefs(facts, new Selection("link", "Save", "Save")))
        .containsExactly("e4");
    assertThat(GuidedGates.matchingRefs(facts, new Selection("button", "Delete", "Delete")))
        .isEmpty();
    // Same name, different evidence is a different element.
    ObjectNode other = ObservationFixtures.fact("button", "Save", false, null);
    other.put("evidence", "Save in the order form");
    JsonNode two =
        ObservationFixtures.observation()
            .element("e1", "button", "Save")
            .withFact("e2", other)
            .build()
            .path("facts");
    assertThat(GuidedGates.matchingRefs(two, save())).containsExactly("e1");
    assertThat(GuidedGates.matchingRefs(null, save())).isEmpty();
    assertThat(GuidedGates.matchingRefs(C.object(), save())).isEmpty();
  }

  @Test
  void oneMatchCarriesTheFreshRefAndOnlyThatFactIsAdmitted() {
    ActionHarness harness =
        harness(
            ObservationFixtures.observation()
                .element("e1", "button", "Cancel")
                .element("e2", "button", "Save")
                .element("e3", "button", "Save changes"),
            "click",
            "Save");
    ObjectNode obligation = effective(harness, save());
    assertThat(obligation.has("reconfirm")).isFalse();
    assertThat(obligation.path("selectedChoice").path("ref").asText()).isEqualTo("e2");
    harness.obligation.setAll(obligation);
    assertThat(harness.refusal(ActionHarness.selection("e2", click()))).isNull();
    assertThat(harness.intentPaths).containsExactly(GuidedGates.IntentPath.SELECTED_CHOICE);
    // "Save changes" would pass the intent words of "Save", but the author chose another element.
    GuidedSessionException refusal = harness.refusal(ActionHarness.selection("e3", click()));
    assertThat(refusal).isNotNull();
    assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
    assertThat(harness.lastGate()).isEqualTo(Gate.NEXT_SELECTED_CHOICE);
    assertThat(harness.refusal(ActionHarness.selection("e1", click()))).isNotNull();
    assertThat(harness.lastGate()).isEqualTo(Gate.NEXT_SELECTED_CHOICE);
  }

  @Test
  void theModelFacingSelectionCarriesRoleBoundedNameAndRefOnly() {
    String longName = "N".repeat(300);
    ActionHarness harness =
        harness(ObservationFixtures.observation().element("e7", "button", longName), "click", "N");
    ObjectNode obligation = effective(harness, new Selection("button", longName, longName));
    JsonNode choice = obligation.path("selectedChoice");
    assertThat(choice.fieldNames()).toIterable().containsExactlyInAnyOrder("role", "name", "ref");
    assertThat(choice.path("name").asText()).hasSize(GuidedGates.OUTLINE_NAME_CHARS);
    assertThat(choice.path("ref").asText()).isEqualTo("e7");
    // The stored triple, evidence included, stays on the internal property.
    assertThat(obligation.path("selection").path("evidence").asText()).isEqualTo(longName);
    assertThat(obligation.path("selection").path("name").asText()).isEqualTo(longName);
  }

  @Test
  void severalIdenticalMatchesNeverTakeTheFirst() {
    ActionHarness harness =
        harness(
            ObservationFixtures.observation()
                .element("e1", "button", "Save")
                .element("e2", "button", "Save"),
            "click",
            "Save");
    ObjectNode obligation = effective(harness, save());
    assertThat(obligation.path("reconfirm").asBoolean()).isTrue();
    assertThat(obligation.has("selectedChoice")).isFalse();
    harness.obligation.setAll(obligation);
    for (String ref : List.of("e1", "e2")) {
      GuidedSessionException refusal = harness.refusal(ActionHarness.selection(ref, click()));
      assertThat(refusal).as(ref).isNotNull();
      assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
      assertThat(refusal.status()).isEqualTo(422);
      assertThat(harness.lastGate()).as(ref).isEqualTo(Gate.NEXT_SELECTED_CHOICE);
    }
  }

  @Test
  void zeroMatchesAskAgainAndRefuseAction() {
    ActionHarness harness =
        harness(
            ObservationFixtures.observation()
                .element("e1", "button", "Cancel")
                .element("e2", "button", "Save order"),
            "click",
            "Save");
    ObjectNode obligation = effective(harness, save());
    assertThat(obligation.path("reconfirm").asBoolean()).isTrue();
    assertThat(obligation.has("selectedChoice")).isFalse();
    harness.obligation.setAll(obligation);
    // "Save order" would satisfy the intent gate on its own; with a re-confirmation pending it
    // is still not admissible, and neither is any other ref.
    for (String ref : List.of("e1", "e2")) {
      assertThat(harness.refusal(ActionHarness.selection(ref, click()))).as(ref).isNotNull();
      assertThat(harness.lastGate()).as(ref).isEqualTo(Gate.NEXT_SELECTED_CHOICE);
    }
    // Without the stored choice the same ref is admitted by the intent gate: the refusal above
    // is the re-confirmation, not the page.
    ActionHarness fresh =
        harness(
            ObservationFixtures.observation().element("e2", "button", "Save order"),
            "click",
            "Save");
    assertThat(fresh.refusal(ActionHarness.selection("e2", click()))).isNull();
    assertThat(fresh.intentPaths).containsExactly(GuidedGates.IntentPath.EVIDENCE_SUBSET);
  }

  @Test
  void aChosenElementIsAdmittedWithoutTheIntentWordsButNotAgainstItsRole() {
    // The author chose "Place order" for the intent "Submit": the selection stands for the intent.
    ActionHarness harness =
        harness(
            ObservationFixtures.observation().element("e1", "button", "Place order"),
            "click",
            "Submit");
    assertThat(harness.refusal(ActionHarness.selection("e1", click()))).isNotNull();
    assertThat(harness.lastGate()).isEqualTo(Gate.NEXT_TARGET_INTENT);
    harness.obligation.setAll(
        effective(harness, new Selection("button", "Place order", "Place order")));
    assertThat(harness.refusal(ActionHarness.selection("e1", click()))).isNull();
    // The operation still has to fit the element: a button cannot be filled.
    harness.obligation.put("operationKind", "fill");
    ObjectNode fill = C.object().put("kind", "fill");
    fill.putObject("value").put("kind", "authoredLiteral").put("sourceInputId", "input-1");
    assertThat(harness.refusal(ActionHarness.selection("e1", fill))).isNotNull();
    assertThat(harness.lastGate()).isEqualTo(Gate.NEXT_OPERATION_TARGET);
  }

  @Test
  void aChoiceThatWasNeverResolvedIsNotAnAuthority() {
    ActionHarness harness =
        harness(ObservationFixtures.observation().element("e1", "button", "Save"), "click", "Save");
    GuidedClarificationContextStore questions = mock(GuidedClarificationContextStore.class);
    ObjectNode row = C.object().put("acceptedChoiceId", "choice-1");
    row.putObject("context").put("clarificationId", CLARIFICATION);
    ObjectNode mapping = row.putArray("meanings").addObject().put("choiceId", "choice-1");
    mapping.putObject("meaning").put("obligationId", "obligation-1").put("ref", "e1");
    mapping
        .putObject("selection")
        .put("role", "button")
        .put("name", "Save")
        .put("evidence", "Save");
    when(questions.effectiveObserved(anyString())).thenReturn(List.of(row));
    harness.progress.putObject("resolvedClarifications");
    GuidedTranslationService service =
        new GuidedTranslationService(
            mock(com.citi.put.checks.studio.guided.session.GuidedSessionService.class),
            mock(GuidedSessionRepository.class),
            mock(GuidedTranslationStore.class),
            questions,
            null,
            null,
            C,
            null,
            null,
            harness.validator,
            null,
            new GuidedTranslationProperties(true, 98304, 4096, 20, "worker"),
            Clock.systemUTC());
    assertThatThrownBy(
            () ->
                service.effectiveObligation(
                    new GuidedSessionRepository.Session(harness.session, harness.progress),
                    harness.obligation))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(refusal.status()).isEqualTo(422);
            });
  }

  @Test
  void theRegionOfAChoiceIsTheGroupSegmentOfItsEvidence() {
    ObjectNode fact = ObservationFixtures.fact("button", "Save", false, null);
    fact.put("evidence", "Save Billing address");
    fact.putArray("evidenceSegments")
        .addObject()
        .put("field", "name")
        .put("start", 0)
        .put("end", 4);
    fact.withArray("evidenceSegments")
        .addObject()
        .put("field", "group")
        .put("start", 5)
        .put("end", 20);
    assertThat(GuidedTranslationService.observedRegionName(fact).asText())
        .isEqualTo("Billing address");
    // No group segment, an empty one, or a missing fact: no region.
    assertThat(
            GuidedTranslationService.observedRegionName(
                    ObservationFixtures.fact("button", "Save", false, null))
                .isNull())
        .isTrue();
    fact.withArray("evidenceSegments").removeAll();
    fact.withArray("evidenceSegments")
        .addObject()
        .put("field", "group")
        .put("start", 4)
        .put("end", 5);
    assertThat(GuidedTranslationService.observedRegionName(fact).isNull()).isTrue();
    assertThat(GuidedTranslationService.observedRegionName(null).isNull()).isTrue();
  }
}
