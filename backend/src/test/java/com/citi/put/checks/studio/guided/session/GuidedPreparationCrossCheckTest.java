package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 D15 / AC10: a preparation is stored and admitted only when the target the runner
 * reports agrees with the fact the gates judged. Eight pure cases.
 */
class GuidedPreparationCrossCheckTest {
  private static final GuidedContracts C = new GuidedContracts();

  private static ObjectNode observation() {
    ObjectNode observation = C.object().put("documentId", "doc-1").put("generation", 2);
    observation
        .putObject("facts")
        .putObject("e1")
        .put("role", "button")
        .put("name", "Save")
        .put("editable", false)
        .put("evidence", "Save");
    return observation;
  }

  private static ObjectNode nodeProposal(String ref) {
    ObjectNode proposal = C.object();
    proposal
        .putObject("target")
        .put("kind", "node")
        .put("ref", ref)
        .put("documentId", "doc-1")
        .put("generation", 2);
    return proposal;
  }

  private static ObjectNode proof(String role, Object name) {
    ObjectNode proof = C.object();
    ObjectNode target = proof.putObject("target");
    target.putArray("locator").addObject().put("by", "testId").put("value", "save");
    target.put("tier", "testId");
    ObjectNode identity = target.putObject("identity").put("role", role);
    if (name == null) {
      identity.putNull("name");
    } else {
      identity.put("name", name.toString());
    }
    return proof;
  }

  private static void assertEvidenceMismatch(Runnable check) {
    assertThatThrownBy(check::run)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo("EVIDENCE_MISMATCH");
              assertThat(refusal.status()).isEqualTo(422);
            });
  }

  @Test
  void aNodeRefWithANullTargetIsRefused() {
    ObjectNode proof = C.object();
    proof.putNull("target");
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.verify(nodeProposal("e1"), proof, observation()));
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.verify(nodeProposal("e1"), C.object(), observation()));
  }

  @Test
  void aRoleThatDiffersFromTheFactIsRefused() {
    assertEvidenceMismatch(
        () ->
            GuidedPreparationCrossCheck.verify(
                nodeProposal("e1"), proof("link", "Save"), observation()));
  }

  @Test
  void aNameThatDiffersFromTheFactIsRefused() {
    assertEvidenceMismatch(
        () ->
            GuidedPreparationCrossCheck.verify(
                nodeProposal("e1"), proof("button", "Cancel"), observation()));
  }

  @Test
  void aRefAbsentFromTheFactsIsRefused() {
    assertEvidenceMismatch(
        () ->
            GuidedPreparationCrossCheck.verify(
                nodeProposal("e9"), proof("button", "Save"), observation()));
  }

  @Test
  void aPageTargetWithAReportedTargetIsRefused() {
    ObjectNode page = C.object();
    page.putObject("target").put("kind", "page").put("documentId", "doc-1").put("generation", 2);
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.verify(page, proof("button", "Save"), observation()));
    ObjectNode none = C.object();
    none.putNull("target");
    assertThatCode(() -> GuidedPreparationCrossCheck.verify(page, none, null))
        .doesNotThrowAnyException();
  }

  @Test
  void aPasswordControlTargetWithAReportedTargetIsRefused() {
    ObjectNode password = C.object();
    password
        .putObject("target")
        .put("kind", "passwordControl")
        .put("documentId", "doc-1")
        .put("generation", 2);
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.verify(password, proof("textbox", null), observation()));
    ObjectNode none = C.object();
    none.set("target", NullNode.instance);
    assertThatCode(() -> GuidedPreparationCrossCheck.verify(password, none, observation()))
        .doesNotThrowAnyException();
  }

  @Test
  void aNullIdentityNameIsAccepted() {
    assertThatCode(
            () ->
                GuidedPreparationCrossCheck.verify(
                    nodeProposal("e1"), proof("button", null), observation()))
        .doesNotThrowAnyException();
  }

  @Test
  void anEqualNameIsAcceptedAndAnObservationOfAnotherGenerationIsNot() {
    assertThatCode(
            () ->
                GuidedPreparationCrossCheck.verify(
                    nodeProposal("e1"), proof("button", "Save"), observation()))
        .doesNotThrowAnyException();
    ObjectNode stale = observation();
    stale.put("generation", 3);
    assertEvidenceMismatch(
        () ->
            GuidedPreparationCrossCheck.verify(nodeProposal("e1"), proof("button", "Save"), stale));
  }

  @Test
  void directPublicComparatorCannotBeOmittedDowngradedOrUsedForRead() {
    var obs = observation();
    obs.withObject("/facts/e1")
        .put("role", "paragraph")
        .put("name", "")
        .put("text", "domain examples")
        .put("directTextAssertion", true);
    var proposal = nodeProposal("e1");
    var op = proposal.putObject("operation").put("kind", "assert").put("predicate", "containsText");
    op.putObject("expected").put("kind", "authoredLiteral").put("sourceInputId", "literal");
    var proof = proof("paragraph", "");
    proof.withObject("/target").put("assertTextMode", "DIRECT_PUBLIC");
    assertThatCode(() -> GuidedPreparationCrossCheck.verify(proposal, proof, obs))
        .doesNotThrowAnyException();
    proof.withObject("/target").remove("assertTextMode");
    assertEvidenceMismatch(() -> GuidedPreparationCrossCheck.verify(proposal, proof, obs));
    proof.withObject("/target").put("assertTextMode", "READ_BINDING_SOURCE");
    assertEvidenceMismatch(() -> GuidedPreparationCrossCheck.verify(proposal, proof, obs));
    proof.withObject("/target").put("assertTextMode", "DIRECT_PUBLIC");
    op.put("kind", "read");
    assertEvidenceMismatch(() -> GuidedPreparationCrossCheck.verify(proposal, proof, obs));
  }

  @Test
  void sourceBindingObjectIsClosedAndOptionalOmissionDiffersFromNull() {
    var schema = "v3/bridge#/definitions/AssertSourceBinding";
    var source =
        C.object()
            .put("bindingId", "b")
            .put("producerAdmissionId", "read")
            .put("producerPreparationId", "prep");
    assertThatCode(() -> C.validate(schema, source)).doesNotThrowAnyException();
    for (String key :
        java.util.List.of("bindingId", "producerAdmissionId", "producerPreparationId")) {
      var bad = source.deepCopy();
      bad.putNull(key);
      assertThatThrownBy(() -> C.validate(schema, bad)).hasMessage("INVALID_CONTRACT");
      var oversized = source.deepCopy();
      oversized.put(key, "x".repeat(257));
      assertThatThrownBy(() -> C.validate(schema, oversized)).hasMessage("INVALID_CONTRACT");
    }
    source.put("backendNodeId", "forged");
    assertThatThrownBy(() -> C.validate(schema, source)).hasMessage("INVALID_CONTRACT");
  }

  @Test
  void successfulReadSourceJoinRejectsProducerPreparationNeedAndOutcomeMutations() {
    var proposal = nodeProposal("e1");
    proposal.putObject("coordinate").put("stepId", "assert").put("ordinal", 0);
    proposal.putObject("executionEvidence").put("origin", "https://example.test");
    proposal
        .putObject("operation")
        .put("kind", "assert")
        .put("predicate", "containsText")
        .putObject("expected")
        .put("kind", "binding")
        .put("bindingId", "b");
    var original = proposal.deepCopy();
    original.withObject("/coordinate").put("stepId", "read");
    original.putObject("operation").put("kind", "read").put("bindingId", "b");
    original
        .withObject("/operation")
        .putObject("recipe")
        .put("kind", "visibleText")
        .put("classification", "permittedBusinessData")
        .put("policyRuleId", "business");
    var context =
        C.object()
            .put("sessionId", "session")
            .put("contextId", "ctx")
            .put("workerId", "worker")
            .put("ownerFence", 1)
            .put("scopeHash", "s")
            .put("sourceRevision", "1")
            .put("configurationRevision", "1");
    var producer =
        context
            .putArray("producers")
            .addObject()
            .put("bindingId", "b")
            .put("producerAdmissionId", "admission");
    context.put("contextRevision", 1).put("authoredInputsHash", "a".repeat(64));
    producer.set("coordinate", original.path("coordinate"));
    producer.set("origin", original.path("executionEvidence").path("origin"));
    producer.set("recipe", original.path("operation").path("recipe").deepCopy());
    producer
        .putObject("availability")
        .put("bindingId", "b")
        .put("producerAdmissionId", "admission")
        .put("contextId", "ctx")
        .put("workerId", "worker")
        .put("ownerFence", 1);
    var readProof = context.deepCopy().put("preparationId", "exact-prep");
    readProof.remove("producers");
    var plan = C.object();
    var need =
        plan.putArray("needs").addObject().put("bindingId", "b").put("producerStepId", "read");
    need.putArray("consumers")
        .addObject()
        .put("stepId", "assert")
        .put("argumentSlot", "assert.expected");
    var history = C.object().putArray("history");
    var row = history.addObject();
    row.set("proposal", original);
    row.set("proof", readProof);
    var ledger =
        row.putObject("ledger")
            .put("state", "SUCCEEDED")
            .put("outcomeCode", "OK")
            .put("dispatchCount", 1)
            .put("preparationId", "exact-prep")
            .put("requestDigest", GuidedContracts.hash(original));
    ledger.putObject("admission").put("admissionId", "admission");
    var expected = GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history);
    assertThat(expected.path("producerPreparationId").asText()).isEqualTo("exact-prep");
    for (String state : java.util.List.of("FAILED", "UNKNOWN_OUTCOME", "ADMITTED")) {
      ledger.put("state", state);
      assertEvidenceMismatch(
          () -> GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history));
    }
    ledger.put("state", "SUCCEEDED");
    readProof.put("preparationId", "alternate-prep");
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history));
    readProof.put("preparationId", "exact-prep");
    readProof.put("ownerFence", 2);
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history));
    readProof.put("ownerFence", 1);
    readProof.put("contextRevision", 2);
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history));
    readProof.put("contextRevision", 1).put("authoredInputsHash", "b".repeat(64));
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history));
    readProof.put("authoredInputsHash", "a".repeat(64));
    producer.put("origin", "https://foreign.example.test");
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history));
    producer.set("origin", original.path("executionEvidence").path("origin"));
    producer.withObject("/recipe").put("policyRuleId", "other");
    assertEvidenceMismatch(
        () -> GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history));
    producer.set("recipe", original.path("operation").path("recipe").deepCopy());
    need.withArray("consumers").removeAll();
    assertThatThrownBy(
            () -> GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history))
        .hasMessage("BINDING_ORDER");
  }

  @Test
  void differentDocumentNamedReceiverRemainsOrdinaryButExactSourceAndForeignModesStayClosed() {
    var proposal = nodeProposal("e1");
    proposal.putObject("coordinate").put("stepId", "assert").put("ordinal", 0);
    proposal.putObject("executionEvidence").put("origin", "https://example.test");
    proposal
        .putObject("operation")
        .put("kind", "assert")
        .put("predicate", "containsText")
        .putObject("expected")
        .put("kind", "binding")
        .put("bindingId", "b");
    var original = proposal.deepCopy();
    original.withObject("/coordinate").put("stepId", "read");
    original.putObject("operation").put("kind", "read").put("bindingId", "b");
    original
        .withObject("/operation")
        .putObject("recipe")
        .put("kind", "visibleText")
        .put("classification", "permittedBusinessData")
        .put("policyRuleId", "business");
    var context =
        C.object()
            .put("sessionId", "session")
            .put("contextId", "ctx")
            .put("workerId", "worker")
            .put("ownerFence", 1)
            .put("scopeHash", "s")
            .put("sourceRevision", "1")
            .put("configurationRevision", "1");
    var producer =
        context
            .putArray("producers")
            .addObject()
            .put("bindingId", "b")
            .put("producerAdmissionId", "admission");
    context.put("contextRevision", 1).put("authoredInputsHash", "a".repeat(64));
    producer.set("coordinate", original.path("coordinate"));
    producer.set("origin", original.path("executionEvidence").path("origin"));
    producer.set("recipe", original.path("operation").path("recipe").deepCopy());
    producer
        .putObject("availability")
        .put("bindingId", "b")
        .put("producerAdmissionId", "admission")
        .put("contextId", "ctx")
        .put("workerId", "worker")
        .put("ownerFence", 1);
    var readProof = context.deepCopy().put("preparationId", "exact-prep");
    readProof.remove("producers");
    var plan = C.object();
    var need =
        plan.putArray("needs").addObject().put("bindingId", "b").put("producerStepId", "read");
    need.putArray("consumers")
        .addObject()
        .put("stepId", "assert")
        .put("argumentSlot", "assert.expected");
    var history = C.object().putArray("history");
    var row = history.addObject();
    row.set("proposal", original);
    row.set("proof", readProof);
    var ledger =
        row.putObject("ledger")
            .put("state", "SUCCEEDED")
            .put("outcomeCode", "OK")
            .put("dispatchCount", 1)
            .put("preparationId", "exact-prep")
            .put("requestDigest", GuidedContracts.hash(original));
    ledger.putObject("admission").put("admissionId", "admission");

    var observation = observation().put("documentId", "receiver-document");
    observation.withObject("/facts/e1").put("role", "heading").put("name", "Invoice");
    proposal.withObject("/target").put("documentId", "receiver-document");
    var ordinaryProof = proof("heading", "Invoice");
    for (String field :
        java.util.List.of(
            "sessionId",
            "contextId",
            "contextRevision",
            "authoredInputsHash",
            "workerId",
            "ownerFence",
            "scopeHash",
            "sourceRevision",
            "configurationRevision")) {
      ordinaryProof.set(field, context.path(field));
    }
    ordinaryProof.put("preparationId", "consumer");
    assertThatCode(() -> GuidedPreparationCrossCheck.verify(proposal, ordinaryProof, observation))
        .doesNotThrowAnyException();
    assertThatCode(
            () ->
                GuidedPreparationCrossCheck.verifySourceHistory(
                    C, plan, proposal, ordinaryProof, history, context.path("producers")))
        .doesNotThrowAnyException();
    assertThat(
            GuidedPreparationCrossCheck.sourceBinding(C, plan, proposal, context, history).isNull())
        .isTrue();
    var foreignProof = ordinaryProof.deepCopy();
    foreignProof.withObject("/target").put("assertTextMode", "READ_BINDING_SOURCE");
    foreignProof
        .putObject("assertSourceBinding")
        .put("bindingId", "b")
        .put("producerAdmissionId", "admission")
        .put("producerPreparationId", "exact-prep");
    assertEvidenceMismatch(
        () ->
            GuidedPreparationCrossCheck.verifySourceHistory(
                C, plan, proposal, foreignProof, history, context.path("producers")));
    proposal.withObject("/target").put("documentId", "doc-1");
    observation.put("documentId", "doc-1");
    observation
        .withObject("/facts/e1")
        .put("role", "button")
        .put("name", "Save")
        .put("text", "Save");
    ordinaryProof.withObject("/target/identity").put("role", "button").put("name", "Save");
    assertThatCode(() -> GuidedPreparationCrossCheck.verify(proposal, ordinaryProof, observation))
        .doesNotThrowAnyException();
    assertThatThrownBy(
            () ->
                GuidedPreparationCrossCheck.verifySourceHistory(
                    C, plan, proposal, ordinaryProof, history, context.path("producers")))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(refusal.status()).isEqualTo(422);
            });
  }
}
