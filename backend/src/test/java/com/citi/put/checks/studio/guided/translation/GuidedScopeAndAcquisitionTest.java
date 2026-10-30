package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class GuidedScopeAndAcquisitionTest {
  static final GuidedContracts C = new GuidedContracts();

  @BeforeAll
  static void start() {
    GuidedTranslationTest.startDelayedDatabase();
  }

  @AfterAll
  static void stop() {
    GuidedTranslationTest.stopDelayedDatabase();
  }

  private ObjectNode observation(int generation, String ref, String label) {
    return ObservationFixtures.observation()
        .element(ref, "button", label)
        .document("same-document", generation)
        .build()
        .put("generation", generation);
  }

  private JsonNode callback(GuidedTranslationTest.DelayedFixture fixture, ObjectNode observation) {
    fixture.mutate(
        current -> {
          current.progress().set("observation", observation);
          current.progress().set("generation", observation.path("generation"));
          current.progress().put("observationHash", GuidedContracts.hash(observation));
        });
    return C.object().set("observation", observation);
  }

  private GuidedTranslationTest.DelayedFixture stable() throws Exception {
    var fixture = new GuidedTranslationTest().new DelayedFixture(true);
    ObjectNode baseline = observation(0, "e1", "Other");
    callback(fixture, baseline);
    assertThat(fixture.acquire(false).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.WAIT);
    Thread.sleep(130);
    var first = fixture.acquire(false);
    assertThat(first.disposition()).isEqualTo(GuidedTranslationStore.AcquisitionDisposition.POLL);
    JsonNode response = callback(fixture, observation(1, "e9", "Other"));
    assertThat(fixture.settle(first, response, false).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.WAIT);
    assertThatThrownBy(() -> fixture.settle(first, response, false)).hasMessage("STALE_GENERATION");
    assertThat(fixture.active().path("unchangedRefreshes").asInt()).isEqualTo(1);
    Thread.sleep(270);
    var second = fixture.acquire(false);
    assertThat(second.disposition()).isEqualTo(GuidedTranslationStore.AcquisitionDisposition.POLL);
    assertThat(
            fixture
                .settle(second, callback(fixture, observation(2, "e12", "Other")), false)
                .disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    return fixture;
  }

  @Test
  void semanticFingerprintStasisRetainsProtocolHashAndAllGates() throws Exception {
    ObjectNode a = observation(0, "e1", "Other"), b = observation(1, "e9", "Other");
    assertThat(GuidedContracts.hash(a)).isNotEqualTo(GuidedContracts.hash(b));
    assertThat(GuidedAcquisitionFingerprint.hash(a))
        .isEqualTo(GuidedAcquisitionFingerprint.hash(b));
    ObjectNode literalA =
        a.deepCopy().put("outline", a.path("outline").asText() + " {placeholder=\"Literal [e7]\"}");
    ObjectNode literalB =
        a.deepCopy().put("outline", a.path("outline").asText() + " {placeholder=\"Literal [e8]\"}");
    assertThat(GuidedAcquisitionFingerprint.hash(literalA))
        .isNotEqualTo(GuidedAcquisitionFingerprint.hash(literalB));
    var fixture = stable();
    assertThat(fixture.active().path("unchangedRefreshes").asInt()).isEqualTo(2);
    assertThat(fixture.acquire(false).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    var sameTargetRepair =
        fixture.obligation.deepCopy().put("obligationId", java.util.UUID.randomUUID().toString());
    assertThat(fixture.acquire(false, sameTargetRepair).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    var changedTarget = fixture.obligation.deepCopy().put("targetIntent", "A different target");
    assertThat(fixture.acquire(false, changedTarget).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.WAIT);
    assertThat(fixture.active().path("stableSemanticHash").isNull()).isTrue();
    assertThat(
            GuidedGates.intent("click", "Confirmation", GuidedGates.of(a.path("facts").path("e1")))
                .passed())
        .isFalse();
    assertThat(
            GuidedActionGuard.evaluate(
                    "click",
                    "e1",
                    a.path("facts").path("e1"),
                    "Click Confirmation",
                    java.util.List.of())
                .refused())
        .isTrue();
  }

  @Test
  void delayedReadyAfterStasisRetainsNormalInferenceAndMeaningfulChangeInvalidation()
      throws Exception {
    var fixture = stable();
    ObjectNode ready = observation(3, "e15", "Confirmation");
    callback(fixture, ready);
    assertThat(
            GuidedGates.intent(
                    "click", "Confirmation", GuidedGates.of(ready.path("facts").path("e15")))
                .passed())
        .isTrue();
    assertThat(fixture.acquire(true).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.READY);
    assertThat(fixture.active().path("stableSemanticHash").isNull()).isTrue();
    assertThat(fixture.active().path("unchangedRefreshes").asInt()).isZero();
    ObjectNode changed = observation(4, "e15", "Still loading");
    callback(fixture, changed);
    assertThat(fixture.acquire(false).disposition())
        .isEqualTo(GuidedTranslationStore.AcquisitionDisposition.WAIT);
  }

  @Test
  void scopeReadRequiresOneCompleteContiguousAuthoredLabelSegment() {
    ObjectNode source = ObservationFixtures.fact("heading", "About this project", false, null);
    ObjectNode target = ObservationFixtures.fact("paragraph", "", false, "Public description");
    target
        .putObject("readScope")
        .put("relation", "IMMEDIATE_HEADING_SAME_PARENT")
        .putArray("sourceRefs")
        .add("e1");
    ObjectNode facts = C.object();
    facts.set("e1", source);
    facts.set("e2", target);
    ObjectNode obligation =
        C.object().put("operationKind", "read").put("scopeIntent", "About this project");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isTrue();
    obligation.put("scopeIntent", "About project");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
    obligation.put("scopeIntent", "About this project").put("operationKind", "hover");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
    obligation.put("operationKind", "read");
    source.put("nameComplete", false);
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
    source.put("nameComplete", true).put("name", "a".repeat(80));
    obligation.put("scopeIntent", "a".repeat(80));
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isTrue();
    source.put("name", "a".repeat(81));
    obligation.put("scopeIntent", "a".repeat(81));
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
    assertThat(GuidedGates.readFallbackEligible(target)).isTrue();
    target.remove("text");
    assertThat(GuidedGates.readFallbackEligible(target)).isFalse();
  }
}
