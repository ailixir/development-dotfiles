package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 D20: a prefix preparation is checked against the verified learned program by the
 * single operation identity over the target the runner reported for this preparation. Pure, so no
 * database: the five cases of the plan.
 */
class GuidedIncrementalVerifyPreparedTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String DIGEST = "d".repeat(64);
  private static final String EVIDENCE = "e".repeat(64);

  private static ObjectNode resolvedTarget(String testId) {
    ObjectNode target = C.object();
    target.putArray("locator").addObject().put("by", "testId").put("value", testId);
    target.put("tier", "testId");
    target.putObject("identity").put("role", "button").put("name", "Save");
    return target;
  }

  private static ObjectNode coordinate(int ordinal) {
    return C.object().put("stepId", "step-1").put("ordinal", ordinal);
  }

  private static ObjectNode learned(int ordinal, JsonNode target, ObjectNode operation) {
    ObjectNode action = C.object();
    action.set("coordinate", coordinate(ordinal));
    action.put("origin", "https://orders.example.test");
    action.set("target", target);
    action.set("operation", operation);
    action.put("admissionId", "admission-" + ordinal);
    action.put(
        "operationHash",
        GuidedOperationIdentity.hash(
            coordinate(ordinal), action.path("origin"), target, operation));
    return action;
  }

  private static ObjectNode program(ObjectNode... actions) {
    ObjectNode program = C.object();
    var list = program.putArray("actions");
    for (ObjectNode action : actions) {
      list.add(action);
    }
    return program;
  }

  private static ObjectNode request(int ordinal) {
    ObjectNode request = C.object().put("requestDigest", DIGEST);
    request
        .putObject("request")
        .put("evidenceHash", EVIDENCE)
        .putNull("pressInheritance")
        .set("coordinate", coordinate(ordinal));
    return request;
  }

  private static ObjectNode prepared(
      int ordinal, ObjectNode operation, String ref, int generation, JsonNode reportedTarget) {
    ObjectNode response = C.object().put("kind", "PREPARED").put("requestDigest", DIGEST);
    ObjectNode proposal = response.putObject("proposal");
    proposal.set("coordinate", coordinate(ordinal));
    proposal.set("operation", operation);
    proposal.putObject("executionEvidence").put("origin", "https://orders.example.test");
    ObjectNode target = proposal.putObject("target").put("kind", ref == null ? "page" : "node");
    if (ref != null) {
      target.put("ref", ref);
    }
    target.put("documentId", "doc-1").put("generation", generation);
    ObjectNode preparation = response.putObject("preparation").put("evidenceHash", EVIDENCE);
    preparation.putNull("pressInheritance");
    preparation.set("target", reportedTarget);
    return response;
  }

  private static void assertOperationMismatch(Runnable check) {
    assertThatThrownBy(check::run)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo("OPERATION_MISMATCH");
              assertThat(refusal.status()).isEqualTo(409);
            });
  }

  private static void assertEvidenceMismatch(Runnable check) {
    assertThatThrownBy(check::run)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo("EVIDENCE_MISMATCH");
              assertThat(refusal.status()).isEqualTo(409);
            });
  }

  private record PrefixCase(ObjectNode program, ObjectNode request, ObjectNode response) {}

  private static ObjectNode sourceBinding() {
    return C.object()
        .put("bindingId", "binding-source")
        .put("producerAdmissionId", "read-admission")
        .put("producerPreparationId", "read-preparation");
  }

  private static PrefixCase bindingCase() {
    var operation = C.object().put("kind", "assert").put("predicate", "containsText");
    operation.putObject("expected").put("kind", "binding").put("bindingId", "binding-source");
    var target = resolvedTarget("read-source").put("assertTextMode", "READ_BINDING_SOURCE");
    target.withObject("/identity").put("role", "text").put("name", "Source");
    var request = request(0);
    request.withObject("/request").set("assertSourceBinding", sourceBinding());
    var response = prepared(0, operation, "e4", 3, target);
    response.withObject("/preparation").set("assertSourceBinding", sourceBinding());
    return new PrefixCase(program(learned(0, target, operation)), request, response);
  }

  /** Complete wire envelopes for the ordinary initial-blank prefix navigation. */
  private static PrefixCase navigationWireCase() {
    var identity =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", "session-nav")
            .put("workerId", "worker-nav")
            .put("ownerFence", 1)
            .put("scopeHash", "a".repeat(64))
            .put("contextId", "context-nav")
            .put("contextRevision", 1)
            .put("sourceRevision", "1")
            .put("configurationRevision", "1");
    identity.putObject("versions").put("contract", 3);
    var operation =
        C.object().put("kind", "navigate").put("destinationInputId", "input-destination");
    var response = prepared(0, operation, null, 0, NullNode.instance);
    var proposal = response.withObject("/proposal");
    proposal
        .put("schemaVersion", 3)
        .put("sessionId", "session-nav")
        .put("scopeHash", "a".repeat(64))
        .put("generation", 0)
        .put("authoredInputsHash", "b".repeat(64))
        .put("contextRevision", 1);
    var evidence =
        proposal
            .putObject("executionEvidence")
            .put("kind", "initialBlank")
            .put("sessionId", "session-nav")
            .put("contextId", "context-nav")
            .put("creationId", "creation-nav")
            .put("documentId", "doc-1")
            .put("bootstrapId", "bootstrap-nav")
            .put("url", "about:blank")
            .putNull("origin")
            .put("generation", 0);
    proposal.put("evidenceHash", GuidedContracts.hash(evidence));
    var proof = response.withObject("/preparation");
    proof.setAll(identity);
    proof
        .put("preparationId", "preparation-nav")
        .put("requestDigest", GuidedContracts.hash(proposal))
        .put("evidenceHash", proposal.path("evidenceHash").asText())
        .put("authoredInputsHash", "b".repeat(64))
        .put("expiresAt", "2030-01-01T00:00:00Z");
    var issued = identity.deepCopy();
    issued.remove("versions");
    issued
        .put("authoredInputsHash", "b".repeat(64))
        .put("prefixProgramHash", "c".repeat(64))
        .put("evidenceHash", proposal.path("evidenceHash").asText())
        .putNull("pressInheritance");
    issued.set("coordinate", coordinate(0));
    var request = C.object().put("kind", "prefix");
    request.set("request", issued);
    request.put("requestDigest", GuidedContracts.hash(issued));
    response.set("requestDigest", request.path("requestDigest"));
    var action = learned(0, NullNode.instance, operation);
    action.putNull("origin");
    action.put("operationHash", GuidedOperationIdentity.of(proposal, NullNode.instance));
    return new PrefixCase(program(action), request, response);
  }

  @Test
  void ordinaryNavigationOmitsOptionalBindingAndPassesWireAndPreparedIdentity() {
    var c = navigationWireCase();
    assertThat(c.request().path("request").has("assertSourceBinding")).isFalse();
    assertThat(c.response().path("preparation").has("assertSourceBinding")).isFalse();
    C.validate("v3/bridge#/definitions/PrefixPrepare", c.request());
    C.validate("v3/bridge#/definitions/PrefixPrepareResult", c.response());
    assertThatCode(
            () -> GuidedIncrementalStore.verifyPrepared(c.program(), c.request(), c.response()))
        .doesNotThrowAnyException();
  }

  @Test
  void bindingSourceAcceptsEqualCanonicalObjectsAndRefusesChangedProducerIdentity() {
    var c = bindingCase();
    var reordered =
        C.object()
            .put("producerPreparationId", "read-preparation")
            .put("producerAdmissionId", "read-admission")
            .put("bindingId", "binding-source");
    C.validate("v3/bridge#/definitions/AssertSourceBinding", reordered);
    c.response().withObject("/preparation").set("assertSourceBinding", reordered);
    assertThatCode(
            () -> GuidedIncrementalStore.verifyPrepared(c.program(), c.request(), c.response()))
        .doesNotThrowAnyException();
    for (String field : List.of("bindingId", "producerAdmissionId", "producerPreparationId")) {
      var changed = c.response().deepCopy();
      changed.withObject("/preparation/assertSourceBinding").put(field, "foreign-identity");
      assertEvidenceMismatch(
          () -> GuidedIncrementalStore.verifyPrepared(c.program(), c.request(), changed));
    }
  }

  @Test
  void optionalSourceBindingCannotBeInventedStrippedNullOrNonObject() {
    var ordinary = navigationWireCase();
    ordinary.response().withObject("/preparation").set("assertSourceBinding", sourceBinding());
    assertEvidenceMismatch(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                ordinary.program(), ordinary.request(), ordinary.response()));
    var source = bindingCase();
    var stripped = source.response().deepCopy();
    stripped.withObject("/preparation").remove("assertSourceBinding");
    assertEvidenceMismatch(
        () -> GuidedIncrementalStore.verifyPrepared(source.program(), source.request(), stripped));
    for (JsonNode invalid :
        List.of(
            NullNode.instance,
            C.parse("false"),
            C.parse("1"),
            C.parse("[]"),
            C.parse("\"text\""))) {
      var request = source.request().deepCopy();
      var response = source.response().deepCopy();
      request.withObject("/request").set("assertSourceBinding", invalid);
      response.withObject("/preparation").set("assertSourceBinding", invalid);
      assertEvidenceMismatch(
          () -> GuidedIncrementalStore.verifyPrepared(source.program(), request, response));
    }
  }

  @Test
  void sourceBindingWireShapeRemainsClosedAndFrozenModeCannotDowngrade() {
    var mutations =
        List.<Consumer<ObjectNode>>of(
            b -> b.remove("bindingId"),
            b -> b.putNull("producerAdmissionId"),
            b -> b.put("producerPreparationId", ""),
            b -> b.put("producerPreparationId", "x".repeat(257)),
            b -> b.put("unexpected", true));
    for (Consumer<ObjectNode> mutation : mutations) {
      var binding = sourceBinding();
      mutation.accept(binding);
      assertThatThrownBy(() -> C.validate("v3/bridge#/definitions/AssertSourceBinding", binding))
          .hasMessage("INVALID_CONTRACT");
    }
    var c = bindingCase();
    c.response().withObject("/preparation/target").put("assertTextMode", "DIRECT_PUBLIC");
    assertOperationMismatch(
        () -> GuidedIncrementalStore.verifyPrepared(c.program(), c.request(), c.response()));
    assertThatThrownBy(() -> GuidedContracts.canonical(C.object().path("absent")))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void theHashOfThePreparedTargetEqualsTheLearnedOperationHash() {
    ObjectNode click = C.object().put("kind", "click");
    ObjectNode program = program(learned(0, resolvedTarget("save"), click));
    assertThatCode(
            () ->
                GuidedIncrementalStore.verifyPrepared(
                    program, request(0), prepared(0, click, "e4", 3, resolvedTarget("save"))))
        .doesNotThrowAnyException();
  }

  @Test
  void aPageActionHasANullTargetOnBothSides() {
    ObjectNode navigate =
        C.object().put("kind", "navigate").put("destinationInputId", "input-destination");
    ObjectNode program = program(learned(0, NullNode.instance, navigate));
    assertThatCode(
            () ->
                GuidedIncrementalStore.verifyPrepared(
                    program, request(0), prepared(0, navigate, null, 0, NullNode.instance)))
        .doesNotThrowAnyException();
    assertOperationMismatch(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                program, request(0), prepared(0, navigate, null, 0, resolvedTarget("save"))));
  }

  @Test
  void aDifferentLocatorInThePreparationTargetIsAnOperationMismatch() {
    ObjectNode click = C.object().put("kind", "click");
    ObjectNode program = program(learned(0, resolvedTarget("save"), click));
    assertOperationMismatch(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                program, request(0), prepared(0, click, "e4", 3, resolvedTarget("cancel"))));
  }

  @Test
  void aDifferentRefOrGenerationWithTheSamePreparationTargetIsAccepted() {
    ObjectNode click = C.object().put("kind", "click");
    ObjectNode program = program(learned(0, resolvedTarget("save"), click));
    for (var response :
        new ObjectNode[] {
          prepared(0, click, "e4", 3, resolvedTarget("save")),
          prepared(0, click, "e91", 17, resolvedTarget("save"))
        }) {
      assertThatCode(() -> GuidedIncrementalStore.verifyPrepared(program, request(0), response))
          .doesNotThrowAnyException();
    }
  }

  @Test
  void anOperationOrCoordinateMismatchIsAnOperationMismatch() {
    ObjectNode click = C.object().put("kind", "click");
    ObjectNode hover = C.object().put("kind", "hover");
    ObjectNode program = program(learned(0, resolvedTarget("save"), click));
    assertOperationMismatch(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                program, request(0), prepared(0, hover, "e4", 3, resolvedTarget("save"))));
    assertOperationMismatch(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                program, request(0), prepared(1, click, "e4", 3, resolvedTarget("save"))));
    // A WAIT is not a preparation: nothing to verify.
    ObjectNode wait = C.object().put("kind", "WAIT").put("requestDigest", DIGEST);
    assertThatCode(() -> GuidedIncrementalStore.verifyPrepared(program, request(0), wait))
        .doesNotThrowAnyException();
  }
}
