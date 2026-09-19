package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dto.ResolvedLiteralInput;
import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedReferenceInput;
import com.citi.put.checks.studio.dto.ResolvedStepReview;
import com.citi.put.checks.studio.dto.ResolvedTarget;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ContextTypedIntentCorrespondenceTest {

  private final TypedIntentCorrespondence correspondence = new TypedIntentCorrespondence();

  @Test
  void exactOperationTargetAndOpaqueSecretReferenceCorrespond() {
    ResolvedStepReview intent =
        review(
            new ResolvedOperation(ResolvedOperation.Kind.FILL),
            new ResolvedTarget(ResolvedTarget.Strategy.LABEL, "Password", true, null),
            new ResolvedReferenceInput(ResolvedReferenceInput.Kind.SECRET_REF, "LOGIN_PASSWORD"));
    String artifact =
        "{\"version\":1,\"steps\":[{\"code\":"
            + "\"await page.getByLabel('Password').fill(vars.secret('LOGIN_PASSWORD'));\"}]}";

    assertThat(correspondence.verify(List.of(intent), artifact)).isEmpty();
    assertThat(artifact).doesNotContain("secret-canary-value");
  }

  @Test
  void explanationCannotHideLiteralTargetOrOperationMismatch() {
    ResolvedStepReview intent =
        review(
            new ResolvedOperation(ResolvedOperation.Kind.FILL),
            new ResolvedTarget(ResolvedTarget.Strategy.LABEL, "Username", true, null),
            new ResolvedLiteralInput(ResolvedLiteralInput.Kind.LITERAL, "  exact 雪\n"));
    String artifact =
        "{\"version\":1,\"explanation\":\"all exact\",\"steps\":[{\"code\":"
            + "\"await page.getByText('Username').click();\"}]}";

    assertThat(correspondence.verify(List.of(intent), artifact))
        .extracting(diagnostic -> diagnostic.category().name())
        .contains("UNSUPPORTED_OPERATION", "AMBIGUOUS_TARGET", "LITERAL_MISMATCH");
  }

  @Test
  void escapedLiteralArgumentsCompareByDecodedSemanticValue() {
    String target = "Notes 'primary' \\ field";
    String exact = "  Café \\\"quoted\\\" C:\\tmp\\file\nsecond line  ";
    ResolvedStepReview intent =
        review(
            new ResolvedOperation(ResolvedOperation.Kind.FILL),
            new ResolvedTarget(ResolvedTarget.Strategy.LABEL, target, true, null),
            new ResolvedLiteralInput(ResolvedLiteralInput.Kind.LITERAL, exact));
    String accepted =
        artifact("await page.getByLabel(" + jsQuote(target) + ").fill(" + jsQuote(exact) + ");");
    String changedValue = accepted.replace("second line", "changed line");
    String changedAction = accepted.replace(".fill(", ".click(");

    assertThat(correspondence.verify(List.of(intent), accepted)).isEmpty();
    assertThat(correspondence.verify(List.of(intent), changedValue))
        .extracting(diagnostic -> diagnostic.category().name())
        .contains("LITERAL_MISMATCH");
    assertThat(correspondence.verify(List.of(intent), changedAction))
        .extracting(diagnostic -> diagnostic.category().name())
        .contains("UNSUPPORTED_OPERATION");
  }

  private static String jsQuote(String value) {
    return "'"
        + value
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
        + "'";
  }

  private static String artifact(String code) {
    try {
      return new com.fasterxml.jackson.databind.ObjectMapper()
          .writeValueAsString(
              java.util.Map.of("version", 1, "steps", List.of(java.util.Map.of("code", code))));
    } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
      throw new IllegalStateException(exception);
    }
  }

  private static ResolvedStepReview review(
      ResolvedOperation operation, ResolvedTarget target, Object input) {
    return new ResolvedStepReview(
        UUID.randomUUID(),
        operation,
        target,
        (com.citi.put.checks.studio.dto.ResolvedInput) input,
        List.of(),
        List.of(),
        List.of());
  }
}
