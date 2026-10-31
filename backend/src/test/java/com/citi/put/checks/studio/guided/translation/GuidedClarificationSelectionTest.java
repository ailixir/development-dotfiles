package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.translation.GuidedObservationFacts.Selection;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 D-6: an author's earlier choice is re-established against the fresh facts by a count
 * and never by position. One equal fact carries the choice to the model as {role, name, ref}; zero
 * or several make the obligation a re-confirmation, so the model must ask again. Pure: the real
 * validator and schemas, and a translation service whose collaborators are doubles.
 */
class GuidedClarificationSelectionTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String CLARIFICATION = "clarification-1";

  /** One session, one step, one observation and the step's occurrence-0 obligation. */
  private static final class World {
    final ObjectNode session = C.object().put("sessionId", ObservationFixtures.SESSION_ID);
    final ObjectNode progress = C.object();
    final ObjectNode obligation = C.object();

    World(ObservationFixtures.Builder observation, String intent) {
      session.putArray("sourceSteps").addObject().put("stepId", "step-1");
      progress.put("stepIndex", 0);
      progress.set("observation", numbered(observation.build()));
      obligation
          .put("obligationId", "obligation-1")
          .put("stepId", "step-1")
          .put("occurrence", 0)
          .put("targetIntent", intent)
          .putNull("scopeIntent")
          .putNull("referenceIndex")
          .putNull("needId")
          .putArray("uses");
    }
  }

  /** The runner numbers elements that look alike; the fixtures do it the same way. */
  private static ObjectNode numbered(ObjectNode observation) {
    java.util.Map<String, List<ObjectNode>> groups = new java.util.LinkedHashMap<>();
    observation
        .path("facts")
        .forEach(
            fact ->
                groups
                    .computeIfAbsent(
                        fact.path("role").asText()
                            + "\u0000"
                            + fact.path("name").asText()
                            + "\u0000"
                            + fact.path("evidence").asText(),
                        key -> new java.util.ArrayList<>())
                    .add((ObjectNode) fact));
    for (List<ObjectNode> group : groups.values()) {
      if (group.size() > 1) {
        for (int at = 0; at < group.size(); at++) {
          group.get(at).putObject("ordinal").put("index", at + 1).put("count", group.size());
        }
      }
    }
    return observation;
  }

  private static World harness(ObservationFixtures.Builder observation, String intent) {
    return new World(observation, intent);
  }

  /** The obligation as the model sees it after the author accepted the given semantic choice. */
  private static ObjectNode effective(World harness, Selection accepted) {
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
            new GuidedProposalValidator(C),
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
  void oneMatchCarriesTheFreshRefOfThatFactOnly() {
    World harness =
        harness(
            ObservationFixtures.observation()
                .element("e1", "button", "Cancel")
                .element("e2", "button", "Save")
                .element("e3", "button", "Save changes"),
            "Save");
    ObjectNode obligation = effective(harness, save());
    assertThat(obligation.has("reconfirm")).isFalse();
    assertThat(obligation.path("selectedChoice").path("ref").asText()).isEqualTo("e2");
    assertThat(obligation.path("selectedChoice").path("role").asText()).isEqualTo("button");
  }

  @Test
  void theModelFacingSelectionCarriesRoleBoundedNameAndRefOnly() {
    String longName = "N".repeat(300);
    World harness =
        harness(ObservationFixtures.observation().element("e7", "button", longName), "N");
    ObjectNode obligation = effective(harness, new Selection("button", longName, longName));
    JsonNode choice = obligation.path("selectedChoice");
    assertThat(choice.fieldNames()).toIterable().containsExactlyInAnyOrder("role", "name", "ref");
    assertThat(choice.path("name").asText()).hasSize(GuidedObservationFacts.OUTLINE_NAME_CHARS);
    assertThat(choice.path("ref").asText()).isEqualTo("e7");
    // The stored triple, evidence included, stays on the internal property.
    assertThat(obligation.path("selection").path("evidence").asText()).isEqualTo(longName);
    assertThat(obligation.path("selection").path("name").asText()).isEqualTo(longName);
  }

  @Test
  void severalIdenticalMatchesNeverTakeTheFirst() {
    World harness =
        harness(
            ObservationFixtures.observation()
                .element("e1", "button", "Save")
                .element("e2", "button", "Save"),
            "Save");
    ObjectNode obligation = effective(harness, save());
    assertThat(obligation.path("reconfirm").asBoolean()).isTrue();
    assertThat(obligation.has("selectedChoice")).isFalse();
  }

  @Test
  void zeroMatchesAskAgain() {
    World harness =
        harness(
            ObservationFixtures.observation()
                .element("e1", "button", "Cancel")
                .element("e2", "button", "Save order"),
            "Save");
    ObjectNode obligation = effective(harness, save());
    assertThat(obligation.path("reconfirm").asBoolean()).isTrue();
    assertThat(obligation.has("selectedChoice")).isFalse();
  }

  @Test
  void aChoiceThatWasNeverResolvedIsNotAnAuthority() {
    World harness =
        harness(ObservationFixtures.observation().element("e1", "button", "Save"), "Save");
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
            new GuidedProposalValidator(C),
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
