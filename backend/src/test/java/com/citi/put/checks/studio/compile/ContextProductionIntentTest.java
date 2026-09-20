package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedReferenceInput;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Production ContextCompileInputs parsing/correspondence, without hand-built explicit intent. */
class ContextProductionIntentTest {

  private static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();

  @Test
  void searchFillAndEnterRequiresBothOperationsInOrderBeforePublication() throws Exception {
    ContextCompileInputs inputs =
        inputs(
            List.of(step("Type \"<var SEARCH_QUERY>\" in the \"Search\" field and press Enter")));

    assertThat(inputs.blocked()).isFalse();
    assertThat(inputs.requestedSequences().values().iterator().next())
        .containsExactly(ResolvedOperation.Kind.FILL, ResolvedOperation.Kind.PRESS);
    assertThat((ResolvedReferenceInput) inputs.resolvedIntent().get(0).input())
        .extracting(ResolvedReferenceInput::referenceId)
        .isEqualTo("SEARCH_QUERY");

    String missingSubmit =
        artifact("await page.getByLabel('Search').fill(vars.get('SEARCH_QUERY'));", inputs);
    String exact =
        artifact(
            "await page.getByLabel('Search').fill(vars.get('SEARCH_QUERY')); "
                + "await page.getByLabel('Search').press('Enter');",
            inputs);
    TypedIntentCorrespondence correspondence = new TypedIntentCorrespondence();
    assertThat(
            correspondence.verify(
                inputs.resolvedIntent(), inputs.requestedSequences(), missingSubmit))
        .isNotEmpty();
    assertThat(correspondence.verify(inputs.resolvedIntent(), inputs.requestedSequences(), exact))
        .isEmpty();
  }

  @Test
  void canonicalSharedLoginThenProtectedFixtureBuildsAllSixProductionIntents() throws Exception {
    com.fasterxml.jackson.databind.JsonNode document =
        MAPPER.readTree(
            Files.readString(
                Path.of("../docs/specs/studio/examples/context-authoring-valid.json")));
    com.fasterxml.jackson.databind.JsonNode request =
        java.util.stream.StreamSupport.stream(document.path("cases").spliterator(), false)
            .filter(
                fixture -> fixture.path("name").asText().equals("login-then-protected-navigation"))
            .findFirst()
            .map(fixture -> fixture.path("request"))
            .orElseThrow();
    ContextCompileInputs inputs =
        inputs(MAPPER.treeToValue(request, AuthoringV2Request.class), "60406");

    assertThat(inputs.blocked()).isFalse();
    assertThat(inputs.resolvedIntent()).hasSize(6);
    assertThat(inputs.resolvedIntent())
        .extracting(review -> review.operation().kind())
        .containsExactly(
            ResolvedOperation.Kind.FILL,
            ResolvedOperation.Kind.FILL,
            ResolvedOperation.Kind.CLICK,
            ResolvedOperation.Kind.ASSERT,
            ResolvedOperation.Kind.CLICK,
            ResolvedOperation.Kind.ASSERT);
    assertThat(((ResolvedReferenceInput) inputs.resolvedIntent().get(1).input()).referenceId())
        .isEqualTo("vault://studio/protected-page-password");
    assertThat(inputs.targetScopes())
        .containsEntry(UUID.fromString("00000000-0000-4000-8000-000000000072"), "Sign in")
        .containsEntry(
            UUID.fromString("00000000-0000-4000-8000-000000000075"), "Protected reports");
    UUID submitId = UUID.fromString("00000000-0000-4000-8000-000000000072");
    TypedIntentCorrespondence correspondence = new TypedIntentCorrespondence();
    String wrongName = artifact("await page.getByRole('button', {name: 'Wrong'}).click();", inputs);
    String correctName =
        artifact("await page.getByRole('button', {name: 'Sign in'}).click();", inputs);
    assertThat(
            correspondence.verify(
                List.of(inputs.resolvedIntent().get(2)),
                java.util.Map.of(submitId, List.of(ResolvedOperation.Kind.CLICK)),
                java.util.Map.of(submitId, "Sign in"),
                wrongName))
        .isNotEmpty();
    assertThat(
            correspondence.verify(
                List.of(inputs.resolvedIntent().get(2)),
                java.util.Map.of(submitId, List.of(ResolvedOperation.Kind.CLICK)),
                java.util.Map.of(submitId, "Sign in"),
                correctName))
        .isEmpty();
    assertThat(inputs.promptSection().json()).doesNotContain("secret-canary-value");
  }

  @Test
  void unsupportedSavedEnglishIsBlockingBeforeProposal() throws Exception {
    ContextCompileInputs inputs = inputs(List.of(step("Do something clever with the page")));
    assertThat(inputs.blocked()).isTrue();
    assertThat(inputs.blockingDiagnostics())
        .extracting(d -> d.category().name())
        .contains("UNSUPPORTED_OPERATION");
  }

  private static ContextCompileInputs inputs(List<AuthoringStep> steps) throws Exception {
    return inputs(new AuthoringV2Request(2, GlobalAuthoringContext.empty(), steps), "61837");
  }

  private static ContextCompileInputs inputs(AuthoringV2Request authoring, String csiId)
      throws Exception {
    UITest test =
        new UITest(
            "Intent",
            "",
            csiId,
            MAPPER.writeValueAsString(authoring.steps().stream().map(AuthoringStep::text).toList()),
            "[]",
            "chromium",
            1920,
            1080,
            "Production",
            "owner@citi.com");
    AuthoringRevisionInputs identity =
        AuthoringRevisionIdentity.create(authoring, java.util.Map.of());
    test.setAuthoring(MAPPER.writeValueAsString(authoring));
    test.setAuthoringRevisionInputs(MAPPER.writeValueAsString(identity));
    return ContextCompileInputs.from(test);
  }

  private static AuthoringStep step(String text) {
    return new AuthoringStep(UUID.randomUUID(), text, StepAuthoringContext.empty());
  }

  private static String artifact(String code, ContextCompileInputs inputs) throws Exception {
    return MAPPER.writeValueAsString(
        java.util.Map.of(
            "version",
            1,
            "steps",
            List.of(java.util.Map.of("stepIndex", 0, "originalText", "source", "code", code))));
  }
}
