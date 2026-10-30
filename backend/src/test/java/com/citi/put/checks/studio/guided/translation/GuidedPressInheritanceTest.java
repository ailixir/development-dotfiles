package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedOperationIdentity;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;

public class GuidedPressInheritanceTest {
  static final GuidedContracts C = new GuidedContracts();

  @Test
  void completeNameOrOwnTextAndCurrentDestructiveUnion() {
    ObjectNode fact = ObservationFixtures.fact("button", "Pay", false, null);
    fact.put("evidence", "Pay Remove account");
    fact.withArray("evidenceSegments")
        .addObject()
        .put("field", "ownText")
        .put("start", 4)
        .put("end", 18);
    assertThat(GuidedActionGuard.evaluate("click", "e1", fact, "Pay", List.of()).refusal())
        .isEqualTo(GuidedPolicyReason.DESTRUCTIVE_VERB);
    assertThat(
            GuidedActionGuard.evaluate("click", "e1", fact, "Pay and Remove account", List.of())
                .refused())
        .isFalse();
    fact.put("ownTextComplete", false);
    assertThat(
            GuidedActionGuard.evaluate("click", "e1", fact, "Pay and Remove account", List.of())
                .refused())
        .isTrue();
    fact.put("ownTextComplete", true);
    ((ObjectNode) fact.path("evidenceSegments").get(1)).put("end", 500);
    assertThat(
            GuidedActionGuard.evaluate("click", "e1", fact, "Pay and Remove account", List.of())
                .refused())
        .isTrue();
    ((ObjectNode) fact.path("evidenceSegments").get(1))
        .put("end", 18)
        .put("purpose", "READ_ASSERT_ONLY");
    assertThat(
            GuidedActionGuard.evaluate("click", "e1", fact, "Pay and Remove account", List.of())
                .refused())
        .isTrue();
    fact.put("name", "").put("evidence", "Submit report").put("ownTextComplete", true);
    fact.putArray("evidenceSegments")
        .addObject()
        .put("field", "ownText")
        .put("start", 0)
        .put("end", 13);
    assertThat(
            GuidedActionGuard.evaluate("check", "e1", fact, "Submit report", List.of()).refused())
        .isFalse();
    fact.put("ownTextComplete", false);
    assertThat(
            GuidedActionGuard.evaluate("check", "e1", fact, "Submit report", List.of()).refused())
        .isTrue();
  }

  @Test
  void savedInputOnlyPredecessorAndReceivingIntentRemainAuthorized() {
    ObjectNode world = sourceWorld();
    ObjectNode manifest = (ObjectNode) world.path("manifest"),
        plan = (ObjectNode) world.path("plan"),
        press = (ObjectNode) world.path("proposal"),
        freshObservation = (ObjectNode) world.path("observation"),
        context = (ObjectNode) world.path("context");
    var history = (com.fasterxml.jackson.databind.node.ArrayNode) world.path("history");
    ObjectNode oldFact = (ObjectNode) history.get(0).path("observation").path("facts").path("e1");
    assertThat(
            GuidedActionGuard.grounding(
                oldFact,
                List.of(
                    GuidedPressInheritance.authored(
                        manifest, "00000000-0000-4000-8000-000000000001"))))
        .isNull();
    JsonNode inherited =
        GuidedPressInheritance.derive(C, manifest, plan, press, freshObservation, context, history);
    assertThat(inherited.path("predecessorAdmissionId").asText()).isEqualTo("successful-fill");
    plan.withArray("obligations").get(1).withObject("").put("targetIntent", "Enter");
    assertThat(
            GuidedPressInheritance.derive(
                    C, manifest, plan, press, freshObservation, context, history)
                .isNull())
        .isTrue();
    plan.withArray("obligations").get(1).withObject("").put("targetIntent", "account");
    manifest.withArray("configurationValues").get(0).withObject("").put("kind", "secretRef");
    assertThat(
            GuidedPressInheritance.derive(
                    C, manifest, plan, press, freshObservation, context, history)
                .isNull())
        .isTrue();
  }

  @Test
  void scriptUpgradedSearchComboboxStillInheritsTheFilledField() {
    ObjectNode world = sourceWorld();
    var history = (com.fasterxml.jackson.databind.node.ArrayNode) world.path("history");
    ObjectNode fresh = (ObjectNode) world.path("observation");
    ObjectNode freshFact = fresh.withObject("/facts/e1");
    freshFact.put("role", "combobox");
    JsonNode inherited =
        GuidedPressInheritance.derive(
            C,
            (ObjectNode) world.path("manifest"),
            (ObjectNode) world.path("plan"),
            (ObjectNode) world.path("proposal"),
            fresh,
            (ObjectNode) world.path("context"),
            history);
    assertThat(inherited.path("predecessorAdmissionId").asText()).isEqualTo("successful-fill");
    // A role outside the text-entry family is a different element, not the filled field.
    freshFact.put("role", "button");
    assertThat(
            GuidedPressInheritance.derive(
                    C,
                    (ObjectNode) world.path("manifest"),
                    (ObjectNode) world.path("plan"),
                    (ObjectNode) world.path("proposal"),
                    fresh,
                    (ObjectNode) world.path("context"),
                    history)
                .isNull())
        .isTrue();
    // A combobox whose own text is not complete (a hidden value) is still refused.
    freshFact.put("role", "combobox").put("ownTextComplete", false);
    assertThat(
            GuidedPressInheritance.derive(
                    C,
                    (ObjectNode) world.path("manifest"),
                    (ObjectNode) world.path("plan"),
                    (ObjectNode) world.path("proposal"),
                    fresh,
                    (ObjectNode) world.path("context"),
                    history)
                .isNull())
        .isTrue();
  }

  public static ObjectNode sourceWorld() {
    ObjectNode manifest = C.object();
    manifest
        .putArray("sourceSteps")
        .addObject()
        .put("stepId", "00000000-0000-4000-8000-000000000001")
        .put("text", "Type <var destination-source> in account field");
    manifest
        .withArray("sourceSteps")
        .addObject()
        .put("stepId", "00000000-0000-4000-8000-000000000002")
        .put("text", "Press Enter");
    manifest
        .putArray("configurationValues")
        .addObject()
        .put("stepId", "00000000-0000-4000-8000-000000000001")
        .put("kind", "destination")
        .put("referenceName", "destination-source")
        .put("value", "the Search receiving area");
    ObjectNode plan = C.object();
    plan.putArray("obligations")
        .addObject()
        .put("stepId", "00000000-0000-4000-8000-000000000001")
        .put("operationKind", "fill")
        .put("targetIntent", "account")
        .putNull("scopeIntent");
    plan.withArray("obligations")
        .addObject()
        .put("stepId", "00000000-0000-4000-8000-000000000002")
        .put("operationKind", "press")
        .put("targetIntent", "account")
        .putNull("scopeIntent");
    ObjectNode oldObservation =
        ObservationFixtures.observation()
            .editable("e1", "textbox", "Search")
            .document("doc", 1)
            .build()
            .put("generation", 1);
    ObjectNode oldFact = oldObservation.withObject("/facts/e1");
    oldFact.put("evidence", "Search account");
    oldFact
        .withArray("evidenceSegments")
        .addObject()
        .put("field", "group")
        .put("start", 7)
        .put("end", 14);
    ObjectNode freshObservation = oldObservation.deepCopy().put("generation", 2);
    ObjectNode prior = C.object();
    prior
        .putObject("coordinate")
        .put("stepId", "00000000-0000-4000-8000-000000000001")
        .put("ordinal", 0);
    prior
        .putObject("target")
        .put("kind", "node")
        .put("ref", "e1")
        .put("documentId", "doc")
        .put("generation", 1);
    prior
        .putObject("operation")
        .put("kind", "fill")
        .putObject("value")
        .put("kind", "authoredLiteral")
        .put("sourceInputId", "query");
    prior.putObject("executionEvidence").put("origin", ObservationFixtures.ORIGIN);
    ObjectNode context =
        C.object()
            .put("contextId", "context")
            .put("contextRevision", 1)
            .put("authoredInputsHash", "a".repeat(64))
            .put("workerId", "worker")
            .put("ownerFence", 1)
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("scopeHash", ObservationFixtures.SCOPE_HASH);
    ObjectNode proof =
        context
            .deepCopy()
            .putNull("pressInheritance")
            .put("requestDigest", GuidedContracts.hash(prior));
    proof.set("target", ObservationFixtures.resolvedTarget("search", "textbox", "Search"));
    ObjectNode ledger =
        C.object()
            .put("state", "SUCCEEDED")
            .put("dispatchCount", 1)
            .put("outcomeCode", "OK")
            .put("attemptOrdinal", 0)
            .put("requestDigest", GuidedContracts.hash(prior))
            .put("operationHash", GuidedOperationIdentity.of(prior, proof.path("target")));
    ledger.set("coordinate", prior.path("coordinate"));
    ledger.putObject("admission").put("admissionId", "successful-fill");
    var history = C.object().putArray("rows");
    var row = history.addObject();
    row.set("ledger", ledger);
    row.set("proposal", prior);
    row.set("proof", proof);
    row.set("observation", oldObservation);
    ObjectNode press = C.object();
    press
        .putObject("coordinate")
        .put("stepId", "00000000-0000-4000-8000-000000000002")
        .put("ordinal", 0);
    press
        .putObject("target")
        .put("kind", "node")
        .put("ref", "e1")
        .put("documentId", "doc")
        .put("generation", 2);
    press.putObject("operation").put("kind", "press").put("key", "Enter");
    press.set("executionEvidence", prior.path("executionEvidence"));
    ObjectNode authoring = C.object().put("authoringSchemaVersion", 2);
    authoring.putObject("globalContext").putArray("entries");
    authoring.withObject("/globalContext").putArray("evidenceReferences");
    var authoredSteps = authoring.putArray("steps");
    for (JsonNode step : manifest.path("sourceSteps")) {
      var authored =
          authoredSteps
              .addObject()
              .put("id", step.path("stepId").asText())
              .put("text", step.path("text").asText());
      authored.putObject("context").putArray("entries");
      authored.withObject("/context").putArray("evidenceReferences");
    }
    manifest.set("authoringSnapshot", authoring);
    manifest
        .putArray("authoredDeclarations")
        .addObject()
        .put("referenceId", "destination-source")
        .put("kind", "plain")
        .put(
            "valueHash",
            GuidedContracts.hash(manifest.path("configurationValues").get(0).path("value")));
    ObjectNode result = C.object();
    result.set("manifest", manifest);
    result.set("plan", plan);
    result.set("proposal", press);
    result.set("observation", freshObservation);
    result.set("context", context);
    result.set("history", history);
    return result;
  }
}
