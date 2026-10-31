package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.secrets.SecretValue;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-008 D2/FR-3: a stored step is an opaque, hash-checked record. The checks here are the ones
 * every authority path runs through {@code ObservedRevisionVerifier.verify} before any job exists.
 */
class ObservedRevisionVerifierStepTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String STEP = "00000000-0000-4000-8000-000000000001";

  private static ObjectNode step(String code) {
    ObjectNode operation = C.object().put("kind", "step").put("code", code);
    operation.putArray("captures");
    operation.putArray("uses");
    operation.put("sourceHash", GuidedContracts.hash(operation.path("code")));
    return operation;
  }

  /** A record whose code the canonical hash cannot even encode (lone surrogate). */
  private static ObjectNode unhashable(String code) {
    ObjectNode operation = C.object().put("kind", "step").put("code", code);
    operation.putArray("captures");
    operation.putArray("uses");
    operation.put("sourceHash", "a".repeat(64));
    return operation;
  }

  private static ObjectNode artifact(ObjectNode... operations) {
    ObjectNode artifact = C.object();
    ArrayNode steps = artifact.putArray("steps");
    ObjectNode step = steps.addObject().put("stepIndex", 0).put("stepId", STEP);
    ArrayNode list = step.putArray("operations");
    int ordinal = 0;
    for (ObjectNode operation : operations) {
      ObjectNode action = list.addObject().put("guardId", "g" + ordinal);
      action.putObject("coordinate").put("stepId", STEP).put("ordinal", ordinal++);
      action.set("operation", operation);
    }
    artifact.putArray("inputRecipes");
    return artifact;
  }

  private static ObjectNode policy(String... bindings) {
    ObjectNode policy = C.object();
    ArrayNode list = policy.putArray("bindings");
    for (String binding : bindings) {
      list.addObject().put("bindingId", binding);
    }
    return policy;
  }

  private static void refused(ObjectNode artifact, ObjectNode policy, String code, int status) {
    assertThatThrownBy(() -> ObservedRevisionVerifier.requireFrozenSteps(artifact, policy))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> {
              assertThat(failure.getMessage()).isEqualTo(code);
              assertThat(failure.status()).isEqualTo(status);
            });
  }

  @Test
  void aWellFormedFrozenStepPasses() {
    assertThatCode(
            () ->
                ObservedRevisionVerifier.requireFrozenSteps(
                    artifact(step("await page.goto('https://a.example');")), policy()))
        .doesNotThrowAnyException();
  }

  @Test
  void oneChangedByteOfCodeIsRefusedOnTheHashAlone() {
    ObjectNode operation = step("await page.getByRole('button').click();");
    operation.put("code", "await page.getByRole('button').clack();");
    // Every other field of the record is valid: only sourceHash no longer matches the code.
    refused(artifact(operation), policy(), "EVIDENCE_MISMATCH", 409);
  }

  @Test
  void aKindThatIsNotStepIsRefused() {
    ObjectNode operation = step("await page.goto('https://a.example');");
    operation.put("kind", "navigate");
    refused(artifact(operation), policy(), "EVIDENCE_MISMATCH", 409);
  }

  @Test
  void aStepIsExactlyOneOperationAtOrdinalZero() {
    ObjectNode first = step("await page.goto('https://a.example');");
    ObjectNode second = step("await page.goto('https://b.example');");
    refused(artifact(first, second), policy(), "EVIDENCE_MISMATCH", 409);
    ObjectNode shifted = artifact(first);
    ((ObjectNode) shifted.path("steps").get(0).path("operations").get(0).path("coordinate"))
        .put("ordinal", 1);
    refused(shifted, policy(), "EVIDENCE_MISMATCH", 409);
    ObjectNode empty = artifact(first);
    ((ArrayNode) empty.path("steps").get(0).path("operations")).removeAll();
    refused(empty, policy(), "EVIDENCE_MISMATCH", 409);
  }

  @Test
  void codeOverSixteenKibIsRefusedEvenWithAValidHash() {
    String atCap = "x".repeat(GuidedStepRecord.MAX_CODE_BYTES);
    assertThatCode(
            () -> ObservedRevisionVerifier.requireFrozenSteps(artifact(step(atCap)), policy()))
        .doesNotThrowAnyException();
    refused(artifact(step(atCap + "x")), policy(), "BUDGET_EXCEEDED", 413);
    String multibyte = "é".repeat(GuidedStepRecord.MAX_CODE_BYTES / 2 + 1);
    refused(artifact(step(multibyte)), policy(), "BUDGET_EXCEEDED", 413);
  }

  @Test
  void codeAStoredDocumentCannotCarryIsRefusedBeforeItIsPersisted() {
    refused(artifact(step("a\u0000b")), policy(), "INVALID_CONTRACT", 422);
    refused(artifact(unhashable("a\uD800b")), policy(), "INVALID_CONTRACT", 422);
    refused(artifact(unhashable("a\uDC00b")), policy(), "INVALID_CONTRACT", 422);
    assertThatCode(
            () ->
                ObservedRevisionVerifier.requireFrozenSteps(
                    artifact(step("emoji 😀 ok")), policy()))
        .doesNotThrowAnyException();
  }

  @Test
  void capturesAndUsesMustBeDeclaredByTheRevision() {
    ObjectNode captures = step("vars['b1'] = await page.title();");
    captures.putArray("captures").add("b1");
    captures.put("sourceHash", GuidedContracts.hash(captures.path("code")));
    refused(artifact(captures), policy(), "EVIDENCE_MISMATCH", 409);
    assertThatCode(
            () -> ObservedRevisionVerifier.requireFrozenSteps(artifact(captures), policy("b1")))
        .doesNotThrowAnyException();

    ObjectNode binding = step("await page.fill('#q', vars['b1']);");
    binding.putArray("uses").addObject().put("kind", "binding").put("id", "b1");
    refused(artifact(binding), policy(), "EVIDENCE_MISMATCH", 409);
    assertThatCode(
            () -> ObservedRevisionVerifier.requireFrozenSteps(artifact(binding), policy("b1")))
        .doesNotThrowAnyException();

    ObjectNode input = step("await page.fill('#q', inputs['in-1']);");
    input.putArray("uses").addObject().put("kind", "input").put("id", "in-1");
    ObjectNode withoutRecipe = artifact(input);
    refused(withoutRecipe, policy(), "EVIDENCE_MISMATCH", 409);
    ObjectNode withRecipe = artifact(input);
    ((ArrayNode) withRecipe.path("inputRecipes"))
        .addObject()
        .put("inputId", "in-1")
        .put("stepId", STEP)
        .put("kind", "nonsecretText");
    assertThatCode(() -> ObservedRevisionVerifier.requireFrozenSteps(withRecipe, policy()))
        .doesNotThrowAnyException();

    ObjectNode secret = step("await page.fill('#p', secrets['PASS']);");
    secret.putArray("uses").addObject().put("kind", "secret").put("id", "PASS");
    refused(artifact(secret), policy(), "EVIDENCE_MISMATCH", 409);
    ObjectNode secretRecipe = artifact(secret);
    ObjectNode recipe =
        ((ArrayNode) secretRecipe.path("inputRecipes"))
            .addObject()
            .put("inputId", "in-p")
            .put("stepId", STEP)
            .put("kind", "secretRef");
    recipe.putObject("provenance").put("kind", "configuration").put("referenceName", "PASS");
    assertThatCode(() -> ObservedRevisionVerifier.requireFrozenSteps(secretRecipe, policy()))
        .doesNotThrowAnyException();
    ObjectNode otherStep = secretRecipe.deepCopy();
    ((ObjectNode) otherStep.path("inputRecipes").get(0)).put("stepId", "another-step");
    refused(otherStep, policy(), "EVIDENCE_MISMATCH", 409);
  }

  @Test
  void twentyStepsOfEightKibFitTheArtifactCapAndTheNamedWorstCaseDoesNot() {
    // Code is stored twice (learnedPlan.actions and steps): 20 x 8 KiB x 2 is about 320 KiB.
    ObjectNode artifact = fullArtifact(20, 8192);
    assertThatCode(
            () -> PublicationContracts.bounded(artifact, PublicationContracts.MAX_ARTIFACT_BYTES))
        .doesNotThrowAnyException();
    // The named risk (E5 row 23): 100 steps x 16 KiB x 2 is over the 1 MiB cap and is refused with
    // the existing closed code, never stored.
    ObjectNode worst = fullArtifact(100, 16384);
    assertThatThrownBy(
            () -> PublicationContracts.bounded(worst, PublicationContracts.MAX_ARTIFACT_BYTES))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> assertThat(failure.getMessage()).isEqualTo("BUDGET_EXCEEDED"));
  }

  private static ObjectNode fullArtifact(int steps, int codeBytes) {
    ObjectNode artifact = C.object();
    ArrayNode list = artifact.putArray("steps");
    ArrayNode actions = artifact.putObject("learnedPlan").putArray("actions");
    for (int i = 0; i < steps; i++) {
      ObjectNode operation = step("x".repeat(codeBytes));
      ObjectNode action = list.addObject().put("stepIndex", i).putArray("operations").addObject();
      action.set("operation", operation);
      actions.addObject().set("operation", operation.deepCopy());
    }
    return artifact;
  }

  // ── the secret scan ────────────────────────────────────────────────────────

  private static StudioReferenceResolver.Resolved resolved(String secret) {
    return new StudioReferenceResolver.Resolved(
        Map.of(), Map.of("PASS", secret.toCharArray()), Map.of("PASS", "version-1"));
  }

  private static ObservedRevisionVerifier verifier() {
    return new ObservedRevisionVerifier(null, C, null, null, null);
  }

  @Test
  void aShortSecretDoesNotRefuseAnUnrelatedStep() {
    // "test" occurs in almost any code; scanning for it would refuse every replay.
    try (var resolved = resolved("test")) {
      assertThatCode(
              () ->
                  verifier()
                      .assertResolvedSecretLiterals(
                          artifact(step("await page.getByText('test').click(); // latest")),
                          resolved))
          .doesNotThrowAnyException();
    }
  }

  @Test
  void aLongSecretLiteralInCodeRefusesBeforeTheRunnerIsCalledAndTheErrorCarriesOnlyTheCode() {
    String secret = "hunter2-LONG-secret";
    try (var resolved = resolved(secret)) {
      ObjectNode artifact = artifact(step("await page.fill('#p', '" + secret + "');"));
      assertThatThrownBy(() -> verifier().assertResolvedSecretLiterals(artifact, resolved))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              failure -> {
                assertThat(failure.getMessage()).isEqualTo("REFERENCE_MISMATCH");
                assertThat(failure.status()).isEqualTo(422);
                assertThat(failure.response().toString()).doesNotContain(secret);
                assertThat(failure.getMessage() + failure.messageCode()).doesNotContain(secret);
                assertThat(failure.getCause()).isNull();
              });
    }
  }

  @Test
  void aSecretHandleIsNotALiteral() {
    try (var resolved = resolved("hunter2-LONG-secret")) {
      assertThatCode(
              () ->
                  verifier()
                      .assertResolvedSecretLiterals(
                          artifact(step("await page.fill('#p', secrets['PASS']);")), resolved))
          .doesNotThrowAnyException();
    }
  }

  @Test
  void aPlainInputEqualToASecretIsRefusedWhateverItsLength() {
    try (var resolved = resolved("abc")) {
      ArrayNode inputs = C.object().putArray("inputs");
      inputs.addObject().put("inputId", "in-1").put("value", "abc");
      assertThatThrownBy(
              () ->
                  verifier()
                      .assertResolvedSecretLiterals(
                          artifact(step("await page.goto('https://a.example');")),
                          resolved,
                          inputs))
          .hasMessage("REFERENCE_MISMATCH");
    }
  }

  @Test
  void theSecretBufferIsNeverTurnedIntoAStringByTheScan() {
    var secret = new SecretValue("hunter2-LONG-secret".toCharArray());
    assertThat(secret.occursIn("a hunter2-LONG-secret b")).isTrue();
    assertThat(secret.occursIn("hunter2-LONG-secre")).isFalse();
    assertThat(secret.occursIn("")).isFalse();
    secret.close();
    assertThat(secret.occursIn("hunter2-LONG-secret")).isFalse();
    assertThat(List.of(secret.toString())).containsExactly("<secret>");
  }
}
