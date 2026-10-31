package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-008 D2/D4: a STEP_CODE reply becomes the proposal of one step. Admission checks the size,
 * the shape, the planned captures and the original attempt authority; it holds no list of
 * operations or Playwright APIs, and it fills {@code uses} from the plan and the authored inputs,
 * never from the model.
 */
class GuidedStepProposalTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String HASH = "a".repeat(64);
  private static final String STEP = "step-1";

  private final GuidedProposalValidator validator = new GuidedProposalValidator(C);

  /** The state around one step: a session, its progress, the original attempt and the context. */
  private static final class World {
    final ObjectNode session = C.object().put("sessionId", "s").put("scopeHash", HASH);
    final ObjectNode progress = C.object();
    final ObjectNode attempt = C.object();
    final ObjectNode context = C.object();
    final ObjectNode plan = C.object();

    World() {
      session.putObject("scope").put("sourceRevision", "1");
      session.putObject("owner").put("workerId", "w").put("fence", 1);
      session.putArray("sourceSteps").addObject().put("stepId", STEP);
      ObjectNode evidence =
          C.object()
              .put("kind", "observedDocument")
              .put("sessionId", "s")
              .put("contextId", "c")
              .put("documentId", "d")
              .put("generation", 3)
              .put("origin", "https://app.example")
              .put("observationHash", HASH);
      progress.put("stepIndex", 0).put("documentId", "d").put("generation", 3);
      progress.set("executionEvidence", evidence);
      progress.put("evidenceHash", GuidedContracts.hash(evidence));
      attempt.put("planRevision", 4).put("scopeHash", HASH);
      attempt.set("scope", session.path("scope"));
      attempt.set("owner", session.path("owner"));
      attempt.put("documentId", "d").put("generation", 3).put("stepIndex", 0);
      attempt.set("executionEvidence", evidence);
      attempt.put("expectedContextRevision", 2).put("expectedAuthoredInputsHash", HASH);
      context.put("authoredInputsHash", HASH).put("contextRevision", 2);
      context.putObject("authoredInputs").putArray("inputs");
      plan.putArray("obligations");
      plan.putArray("needs");
    }

    World obligation(int occurrence, String needId, String... uses) {
      ObjectNode item =
          ((ArrayNode) plan.path("obligations"))
              .addObject()
              .put("obligationId", "o-" + occurrence)
              .put("stepId", STEP)
              .put("occurrence", occurrence);
      if (needId == null) {
        item.putNull("needId");
      } else {
        item.put("needId", needId);
      }
      ArrayNode used = item.putArray("uses");
      for (String use : uses) {
        used.add(use);
      }
      return this;
    }

    World need(String needId, String producerStep, String bindingId) {
      ((ArrayNode) plan.path("needs"))
          .addObject()
          .put("needId", needId)
          .put("producerStepId", producerStep)
          .put("bindingId", bindingId)
          .putArray("consumers");
      return this;
    }

    World input(String inputId, String step, String kind, String secretId) {
      ObjectNode input =
          ((ArrayNode) context.path("authoredInputs").path("inputs"))
              .addObject()
              .put("inputId", inputId)
              .put("sourceStepId", step)
              .put("kind", kind);
      if (secretId != null) {
        input.put("secretId", secretId);
      }
      return this;
    }

    List<JsonNode> step() {
      List<JsonNode> out = new java.util.ArrayList<>();
      plan.path("obligations").forEach(out::add);
      return out;
    }
  }

  private static ObjectNode reply(String code, String... captures) {
    ObjectNode reply =
        C.object()
            .put("schemaVersion", 3)
            .put("kind", "STEP_CODE")
            .put("requestId", "r")
            .put("status", "CODE")
            .put("code", code);
    ArrayNode list = reply.putArray("captures");
    for (String capture : captures) {
      list.add(capture);
    }
    return reply;
  }

  private ObjectNode propose(World w, ObjectNode reply) {
    return propose(w, reply, 4);
  }

  private ObjectNode propose(World w, ObjectNode reply, long planRevision) {
    return validator.stepProposal(
        w.session,
        w.progress,
        w.plan,
        w.step(),
        reply,
        w.context,
        w.attempt,
        planRevision,
        GuidedRefusalDiagnostics.Capture.NONE);
  }

  private static void refused(Runnable action, String code) {
    assertThatThrownBy(action::run)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> assertThat(failure.getMessage()).isEqualTo(code));
  }

  @Test
  void codeBecomesAStepOperationAtOrdinalZeroWithItsHash() {
    World w = new World().obligation(0, null);
    String code = "await page.getByRole('button', { name: 'Save' }).click();";
    ObjectNode proposal = propose(w, reply(code));
    assertThat(proposal.path("coordinate").path("ordinal").asInt()).isZero();
    assertThat(proposal.path("coordinate").path("stepId").asText()).isEqualTo(STEP);
    ObjectNode operation = (ObjectNode) proposal.path("operation");
    assertThat(operation.path("kind").asText()).isEqualTo("step");
    assertThat(operation.path("code").asText()).isEqualTo(code);
    assertThat(operation.path("captures")).isEmpty();
    assertThat(operation.path("sourceHash").asText())
        .isEqualTo(GuidedContracts.hash(TextNode.valueOf(code)))
        .isEqualTo(GuidedProposalValidator.sourceHash(code));
    assertThat(proposal.has("target")).isFalse();
    assertThat(proposal.path("executionEvidence")).isEqualTo(w.progress.path("executionEvidence"));
    assertThat(proposal.path("contextRevision").asInt()).isEqualTo(2);
  }

  @Test
  void aStepWithSeveralObligationsIsStillOneActionAtOrdinalZero() {
    World w = new World().obligation(0, null).obligation(1, null).obligation(2, null);
    assertThat(
            propose(w, reply("await page.goto('x');")).path("coordinate").path("ordinal").asInt())
        .isZero();
  }

  @Test
  void anyPlaywrightApiIsAdmittedThereIsNoOperationList() {
    World w = new World().obligation(0, null);
    for (String code :
        List.of(
            "await page.evaluate(() => document.title);",
            "const popup = await page.waitForEvent('popup'); await popup.close();",
            "await context.addCookies([]); await page.keyboard.press('End');",
            "await expect(page.locator('h1')).toHaveText('Done');")) {
      assertThat(propose(w, reply(code)).path("operation").path("code").asText()).isEqualTo(code);
    }
  }

  @Test
  void aTwoCaptureStepDeclaresBothBindingsAndTheModelCannotChangeThem() {
    World w =
        new World()
            .obligation(0, "need-a")
            .obligation(1, "need-b")
            .need("need-a", STEP, "binding-a")
            .need("need-b", STEP, "binding-b");
    ObjectNode proposal =
        propose(
            w,
            reply("vars['binding-a'] = 'x'; vars['binding-b'] = 'y';", "binding-b", "binding-a"));
    assertThat(proposal.path("operation").path("captures"))
        .extracting(JsonNode::asText)
        .containsExactly("binding-a", "binding-b");
    refused(() -> propose(w, reply("x", "binding-a")), "INVALID_CONTRACT");
    refused(
        () -> propose(w, reply("x", "binding-a", "binding-b", "binding-c")), "INVALID_CONTRACT");
    refused(() -> propose(w, reply("x", "binding-a", "binding-a")), "INVALID_CONTRACT");
    refused(
        () -> propose(new World().obligation(0, null), reply("x", "binding-a")),
        "INVALID_CONTRACT");
  }

  @Test
  void usesAreFilledFromThePlanAndTheInputsBoundToTheStepNeverFromTheModel() {
    World w =
        new World()
            .obligation(0, null, "need-a")
            .need("need-a", "earlier", "binding-a")
            .input("input-1", STEP, "nonsecretText", null)
            .input("input-2", STEP, "destination", null)
            .input("input-3", "other-step", "nonsecretText", null)
            .input("input-4", STEP, "secretRef", "WIKI_PASSWORD")
            .input("input-5", "other-step", "secretRef", "OTHER");
    ArrayNode uses = (ArrayNode) propose(w, reply("x")).path("operation").path("uses");
    assertThat(uses)
        .extracting(use -> use.path("kind").asText() + ":" + use.path("id").asText())
        .containsExactly(
            "binding:binding-a", "input:input-1", "input:input-2", "secret:WIKI_PASSWORD");
  }

  @Test
  void moreThanSixteenUsesIsBudgetExceeded() {
    World w = new World().obligation(0, null);
    for (int at = 0; at < 17; at++) {
      w.input("input-" + at, STEP, "nonsecretText", null);
    }
    refused(() -> propose(w, reply("x")), "BUDGET_EXCEEDED");
  }

  @Test
  void codeIsCappedAtSixteenKibInBytesNotCharacters() {
    World w = new World().obligation(0, null);
    assertThat(propose(w, reply("a".repeat(16384))).path("operation").path("code").asText())
        .hasSize(16384);
    refused(() -> propose(w, reply("a".repeat(16385))), "INVALID_CONTRACT");
    // 5,462 euro signs are 5,462 characters but 16,386 UTF-8 bytes.
    refused(() -> propose(w, reply("€".repeat(5462))), "INVALID_CONTRACT");
    assertThat(propose(w, reply("€".repeat(5461))).path("operation").path("code").asText())
        .hasSize(5461);
    refused(() -> propose(w, reply("")), "INVALID_CONTRACT");
    refused(() -> propose(w, reply("   \n ")), "INVALID_CONTRACT");
  }

  @Test
  void aStaleAttemptOrAnotherStepIsRefusedWithItsStalenessCode() {
    World w = new World().obligation(0, null);
    refused(() -> propose(w, reply("x"), 5), "REVISION_CONFLICT");
    w.progress.put("generation", 4);
    refused(() -> propose(w, reply("x")), "STALE_GENERATION");
    World moved = new World().obligation(0, null);
    moved.progress.put("stepIndex", 1);
    moved.attempt.put("stepIndex", 1);
    refused(() -> propose(moved, reply("x")), "BINDING_ORDER");
  }

  @Test
  void theRejectedGateIsRecordedForTheAttempt() {
    World w = new World().obligation(0, null);
    GuidedGateRecorder recorder = new GuidedGateRecorder();
    assertThatThrownBy(
            () ->
                validator.stepProposal(
                    w.session,
                    w.progress,
                    w.plan,
                    w.step(),
                    reply("x", "unplanned"),
                    w.context,
                    w.attempt,
                    4,
                    recorder))
        .isInstanceOf(GuidedSessionException.class);
    assertThat(recorder.firstGate()).isEqualTo(GuidedRefusalDiagnostics.Gate.STEP_CAPTURES);
  }
}
