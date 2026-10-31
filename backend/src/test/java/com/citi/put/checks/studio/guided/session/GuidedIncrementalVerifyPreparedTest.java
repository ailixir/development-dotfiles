package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-008 D2: a prefix preparation is checked against the verified learned program by the single
 * operation identity: the coordinate, the origin and the step record (code, captures, uses and
 * their hash). Pure, so no database.
 */
class GuidedIncrementalVerifyPreparedTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String EVIDENCE = "e".repeat(64);
  private static final String ORIGIN = "https://orders.example.test";

  private static ObjectNode step(String code) {
    ObjectNode operation = C.object().put("kind", "step").put("code", code);
    operation.putArray("captures");
    operation.putArray("uses");
    operation.put("sourceHash", GuidedContracts.hash(C.object().textNode(code)));
    return operation;
  }

  private static ObjectNode coordinate(int ordinal) {
    return C.object().put("stepId", "step-1").put("ordinal", ordinal);
  }

  private static ObjectNode learned(int ordinal, ObjectNode operation) {
    ObjectNode action = C.object();
    action.set("coordinate", coordinate(ordinal));
    action.put("origin", ORIGIN);
    action.set("operation", operation);
    action.put("admissionId", "admission-" + ordinal);
    action.put(
        "operationHash",
        GuidedOperationIdentity.hash(coordinate(ordinal), action.path("origin"), operation));
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

  private static ObjectNode request(String digest, int ordinal) {
    ObjectNode request = C.object().put("requestDigest", digest);
    request
        .putObject("request")
        .put("evidenceHash", EVIDENCE)
        .set("coordinate", coordinate(ordinal));
    return request;
  }

  private static ObjectNode prepared(
      String digest, int ordinal, ObjectNode operation, String documentId, int generation) {
    ObjectNode response = C.object().put("kind", "PREPARED").put("requestDigest", digest);
    ObjectNode proposal = response.putObject("proposal");
    proposal.set("coordinate", coordinate(ordinal));
    proposal.set("operation", operation);
    proposal
        .putObject("executionEvidence")
        .put("origin", ORIGIN)
        .put("documentId", documentId)
        .put("generation", generation);
    response.putObject("preparation").put("evidenceHash", EVIDENCE);
    return response;
  }

  private static void refused(Runnable check, String code) {
    assertThatThrownBy(check::run)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal.getMessage()).isEqualTo(code);
              assertThat(refusal.status()).isEqualTo(409);
            });
  }

  @Test
  void thePreparedStepEqualsTheLearnedOperationByHash() {
    ObjectNode click = step("await page.getByRole('button', { name: 'Save' }).click();");
    ObjectNode program = program(learned(0, click));
    assertThatCode(
            () ->
                GuidedIncrementalStore.verifyPrepared(
                    program,
                    request("d".repeat(64), 0),
                    prepared("d".repeat(64), 0, click, "doc-1", 3)))
        .doesNotThrowAnyException();
  }

  @Test
  void aDifferentDocumentOrGenerationWithTheSameStepIsAccepted() {
    ObjectNode click = step("await page.getByRole('button', { name: 'Save' }).click();");
    ObjectNode program = program(learned(0, click));
    for (var response :
        new ObjectNode[] {
          prepared("d".repeat(64), 0, click, "doc-1", 3),
          prepared("d".repeat(64), 0, click, "doc-91", 17)
        }) {
      assertThatCode(
              () ->
                  GuidedIncrementalStore.verifyPrepared(
                      program, request("d".repeat(64), 0), response))
          .doesNotThrowAnyException();
    }
  }

  @Test
  void aChangedByteOfCodeIsAnOperationMismatch() {
    ObjectNode program = program(learned(0, step("await a();")));
    refused(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                program,
                request("d".repeat(64), 0),
                prepared("d".repeat(64), 0, step("await b();"), "doc-1", 3)),
        "OPERATION_MISMATCH");
  }

  @Test
  void aCoordinateOrDigestMismatchIsRefused() {
    ObjectNode click = step("await a();");
    ObjectNode program = program(learned(0, click));
    refused(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                program,
                request("d".repeat(64), 0),
                prepared("d".repeat(64), 1, click, "doc-1", 3)),
        "OPERATION_MISMATCH");
    refused(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                program,
                request("d".repeat(64), 0),
                prepared("f".repeat(64), 0, click, "doc-1", 3)),
        "EVIDENCE_MISMATCH");
  }

  @Test
  void aTamperedLearnedHashIsAnOperationMismatch() {
    ObjectNode click = step("await a();");
    ObjectNode action = learned(0, click);
    action.put("operationHash", "0".repeat(64));
    refused(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                program(action),
                request("d".repeat(64), 0),
                prepared("d".repeat(64), 0, click, "doc-1", 3)),
        "OPERATION_MISMATCH");
  }

  @Test
  void aPreparationForOtherEvidenceIsAnEvidenceMismatch() {
    ObjectNode click = step("await a();");
    ObjectNode response = prepared("d".repeat(64), 0, click, "doc-1", 3);
    response.withObject("/preparation").put("evidenceHash", "0".repeat(64));
    refused(
        () ->
            GuidedIncrementalStore.verifyPrepared(
                program(learned(0, click)), request("d".repeat(64), 0), response),
        "EVIDENCE_MISMATCH");
  }

  @Test
  void aWaitIsNotAPreparationSoThereIsNothingToVerify() {
    ObjectNode program = program(learned(0, step("await a();")));
    ObjectNode wait = C.object().put("kind", "WAIT").put("requestDigest", "d".repeat(64));
    assertThatCode(
            () -> GuidedIncrementalStore.verifyPrepared(program, request("d".repeat(64), 0), wait))
        .doesNotThrowAnyException();
  }
}
