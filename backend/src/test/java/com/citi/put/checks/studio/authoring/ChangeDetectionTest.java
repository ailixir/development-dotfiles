package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ChangeDetectionTest {
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final JsonNode CONFIG = config("Production", 30);
  private static final AuthoringV2Request BASE = draft(10);

  @Test
  void editFourthStepChangesOnlyFourthAndTailInputs() {
    var changed = new ArrayList<>(BASE.steps());
    changed.set(3, new AuthoringStep(changed.get(3).id(), "edited", StepAuthoringContext.empty()));
    var current = source(changed);
    assertThat(boundary(current)).isEqualTo(3);
    var before = IncrementalAuthoringIdentity.chains(BASE, identity(BASE), CONFIG);
    var after = IncrementalAuthoringIdentity.chains(current, identity(current), CONFIG);
    assertThat(after.subList(0, 3)).isEqualTo(before.subList(0, 3));
    for (int index = 3; index < 10; index++) {
      assertThat(after.get(index)).isNotEqualTo(before.get(index));
    }
  }

  @Test
  void insertAtFourSelectsNewStep() {
    var changed = new ArrayList<>(BASE.steps());
    changed.add(3, new AuthoringStep(UUID.randomUUID(), "inserted", StepAuthoringContext.empty()));
    assertThat(boundary(source(changed))).isEqualTo(3);
  }

  @Test
  void deleteFourthSelectsNextSurvivingStep() {
    var changed = new ArrayList<>(BASE.steps());
    changed.remove(3);
    assertThat(boundary(source(changed))).isEqualTo(3);
  }

  @Test
  void swapFourAndFiveSelectsCurrentFourth() {
    var changed = new ArrayList<>(BASE.steps());
    java.util.Collections.swap(changed, 3, 4);
    assertThat(boundary(source(changed))).isEqualTo(3);
  }

  @Test
  void multipleEditsSelectEarliestPosition() {
    var changed = new ArrayList<>(BASE.steps());
    changed.set(1, new AuthoringStep(changed.get(1).id(), "second", StepAuthoringContext.empty()));
    changed.remove(6);
    assertThat(boundary(source(changed))).isEqualTo(1);
  }

  @Test
  void tailDeletionRelearnsLastRemainingStep() {
    assertThat(boundary(source(BASE.steps().subList(0, 7)))).isEqualTo(6);
    assertThat(boundary(source(BASE.steps().subList(0, 1)))).isZero();
  }

  @Test
  void configurationChangesSelectFirstStep() {
    assertThat(
            IncrementalAuthoringIdentity.boundary(
                BASE, identity(BASE), config("Staging", 30), BASE, identity(BASE), CONFIG))
        .isZero();
    assertThat(
            IncrementalAuthoringIdentity.boundary(
                BASE, identity(BASE), config("Production", 31), BASE, identity(BASE), CONFIG))
        .isZero();
    // Pure envelope sensitivity only; the production codec still accepts Chromium exclusively.
    var browser = CONFIG.deepCopy();
    ((com.fasterxml.jackson.databind.node.ObjectNode) browser).put("browser", "firefox");
    assertThat(
            IncrementalAuthoringIdentity.boundary(
                BASE, identity(BASE), browser, BASE, identity(BASE), CONFIG))
        .isZero();
  }

  @Test
  void viewportWaitAndGlobalContextChangesSelectFirstStep() {
    var viewport = CONFIG.deepCopy();
    ((com.fasterxml.jackson.databind.node.ObjectNode) viewport.path("viewport")).put("width", 1440);
    assertThat(
            IncrementalAuthoringIdentity.boundary(
                BASE, identity(BASE), viewport, BASE, identity(BASE), CONFIG))
        .isZero();
    var wait = CONFIG.deepCopy();
    ((com.fasterxml.jackson.databind.node.ObjectNode) wait).put("waitStrategy", "domcontentloaded");
    assertThat(
            IncrementalAuthoringIdentity.boundary(
                BASE, identity(BASE), wait, BASE, identity(BASE), CONFIG))
        .isZero();
    var contextual =
        new AuthoringV2Request(
            2,
            new GlobalAuthoringContext(
                List.of(
                    new com.citi.put.checks.studio.dto.ContextText("Use the Operations workspace")),
                List.of()),
            BASE.steps());
    assertThat(boundary(contextual)).isZero();
  }

  @Test
  void stepContextChangeSelectsOnlyItsStableStepAndTail() {
    var steps = new ArrayList<>(BASE.steps());
    var fourth = steps.get(3);
    steps.set(
        3,
        new AuthoringStep(
            fourth.id(),
            fourth.text(),
            new StepAuthoringContext(
                List.of(
                    new com.citi.put.checks.studio.dto.ContextText(
                        "Use the approved regional panel")),
                List.of())));
    assertThat(boundary(source(steps))).isEqualTo(3);
  }

  @Test
  void unusedDeclarationChangeDoesNotCreateAReferencedIdentityOrBoundary() {
    var before =
        IncrementalAuthoringIdentity.resolve(BASE, List.of(StudioVariable.plain("UNUSED", "old")));
    var after =
        IncrementalAuthoringIdentity.resolve(BASE, List.of(StudioVariable.plain("UNUSED", "new")));
    assertThat(IncrementalAuthoringIdentity.boundary(BASE, after, CONFIG, BASE, before, CONFIG))
        .isEqualTo(-1);
    assertThat(after.inputs()).isEqualTo(before.inputs());
  }

  @Test
  void policyChangesDoNotMoveBoundary() {
    var changed = CONFIG.deepCopy();
    ((com.fasterxml.jackson.databind.node.ObjectNode) changed).put("governedPolicyVersion", 2);
    assertThat(
            IncrementalAuthoringIdentity.boundary(
                BASE, identity(BASE), changed, BASE, identity(BASE), CONFIG))
        .isEqualTo(-1);
  }

  @Test
  void unchangedDraftIsReadyAndFirstRunUnlearned() {
    assertThat(boundary(BASE)).isEqualTo(-1);
    assertThat(source(List.of()).steps()).isEmpty();
  }

  @Test
  void textOnlyPlainValueChangeIsDetected() {
    var draft =
        source(
            List.of(
                new AuthoringStep(
                    UUID.randomUUID(), "Fill <var ACCOUNT>", StepAuthoringContext.empty())));
    var before =
        IncrementalAuthoringIdentity.resolve(
            draft, List.of(StudioVariable.plain("ACCOUNT", "alpha")));
    var after =
        IncrementalAuthoringIdentity.resolve(
            draft, List.of(StudioVariable.plain("ACCOUNT", "beta")));
    assertThat(IncrementalAuthoringIdentity.boundary(draft, after, CONFIG, draft, before, CONFIG))
        .isZero();
    assertThat(after.inputs().nonsecretReferencedValues()).hasSize(1);
  }

  @Test
  void contextSecretDeclarationChangeUsesFrozenBase() throws Exception {
    var authoring =
        MAPPER.readValue(
            "{\"authoringSchemaVersion\":2,\"steps\":[{\"id\":\"00000000-0000-4000-8000-000000000001\","
                + "\"text\":\"Sign in\",\"context\":{\"entries\":[{\"kind\":\"secretRef\",\"referenceId\":\"vault://"
                + "studio/customer-password\"}],\"evidenceReferences\":[]}}]}",
            AuthoringV2Request.class);
    var before =
        IncrementalAuthoringIdentity.resolve(
            authoring,
            List.of(StudioVariable.secretRef("vault://studio/customer-password", "OLD")));
    var frozen =
        IncrementalAuthoringIdentity.frozen(authoring, before.inputs(), before.references());
    var after =
        IncrementalAuthoringIdentity.resolve(
            authoring,
            List.of(StudioVariable.secretRef("vault://studio/customer-password", "NEW")));
    assertThat(
            IncrementalAuthoringIdentity.boundary(
                authoring, after, CONFIG, authoring, frozen, CONFIG))
        .isZero();
  }

  @Test
  void missingBaseContextSecretMappingRefusesReuse() {
    var frozen = identity(BASE);
    var incomplete = frozen.references().deepCopy();
    incomplete.remove("authoringIdentityVersion");
    assertThatThrownBy(() -> IncrementalAuthoringIdentity.frozen(BASE, frozen.inputs(), incomplete))
        .extracting(
            error ->
                ((com.citi.put.checks.studio.guided.session.GuidedSessionException) error)
                    .messageCode())
        .isEqualTo("BASE_IDENTITY_INCOMPLETE");
  }

  private static int boundary(AuthoringV2Request source) {
    return IncrementalAuthoringIdentity.boundary(
        source, identity(source), CONFIG, BASE, identity(BASE), CONFIG);
  }

  private static IncrementalAuthoringIdentity.Identity identity(AuthoringV2Request source) {
    return IncrementalAuthoringIdentity.resolve(source, List.of());
  }

  private static AuthoringV2Request source(List<AuthoringStep> steps) {
    return new AuthoringV2Request(2, GlobalAuthoringContext.empty(), steps);
  }

  private static AuthoringV2Request draft(int count) {
    var steps = new ArrayList<AuthoringStep>();
    for (int index = 0; index < count; index++) {
      steps.add(
          new AuthoringStep(new UUID(0, index + 1), "Step " + index, StepAuthoringContext.empty()));
    }
    return source(steps);
  }

  private static JsonNode config(String environment, int timeout) {
    var config =
        MAPPER
            .createObjectNode()
            .put("environment", environment)
            .put("browser", "chromium")
            .put("timeoutSeconds", timeout)
            .put("waitStrategy", "networkidle");
    config.putObject("viewport").put("width", 1920).put("height", 1080);
    return config;
  }
}
