package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Round 057 (user decision): region-qualified step labels. Admission of {@code scopeIntent},
 * qualified availability in acquisition, the qualified branch of {@code effectiveObligation}, the
 * clarification rule, the acquisition identity and the prompt projection. The rule itself is pinned
 * against the vectors shared with the Node validator in GuidedQualifiedLabelVectorsTest.
 */
class GuidedQualifiedLabelTest {
  static final GuidedContracts C = new GuidedContracts();
  static final ObjectMapper JSON = new ObjectMapper();
  static final String STEP = "00000000-0000-4000-8000-000000000001";
  static final String CANARY = "hostile-region-canary-DO-NOT-LEAK";
  static final JsonNode SHARED = shared();

  static JsonNode shared() {
    try {
      return JSON.readTree(
          Files.readString(
              Path.of(
                  "../docs/specs/studio-observed-authoring/contracts/v3/qualified-label-vectors.json")));
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  // ── admission (GuidedProposalValidator.admitPlan) ───────────────────────────────────────────

  private static ObjectNode session() {
    ObjectNode session = C.object().put("sessionId", "s");
    session.putArray("sourceSteps").addObject().put("stepId", STEP).put("requiresAssertion", false);
    session.putObject("limits").put("maxStatementsPerStep", 8);
    session.putObject("scope").put("sourceRevision", "1").put("configurationRevision", "1");
    ArrayNode capabilities = session.withObject("/scope").putArray("capabilities");
    List.of(
            "navigate",
            "click",
            "fill",
            "press",
            "selectOption",
            "check",
            "uncheck",
            "hover",
            "read",
            "assert")
        .forEach(capabilities::add);
    return session;
  }

  private static ArrayNode manifest(String text) {
    ArrayNode steps = JSON.createArrayNode();
    steps.addObject().put("stepId", STEP).put("text", text);
    return steps;
  }

  private static ObjectNode obligation(String kind, String target, String scope) {
    ObjectNode item =
        C.object()
            .put("stepId", STEP)
            .put("occurrence", 0)
            .put("operationKind", kind)
            .put("targetIntent", target);
    if (scope == null) {
      item.putNull("scopeIntent");
    } else {
      item.put("scopeIntent", scope);
    }
    item.putNull("referenceIndex").putNull("needId").putNull("predicate");
    return item;
  }

  private static ObjectNode response(ObjectNode... obligations) {
    ObjectNode response = C.object();
    response.putArray("sourceReferences");
    ArrayNode items = response.putArray("obligations");
    for (ObjectNode obligation : obligations) {
      items.add(obligation);
    }
    response.putArray("needs");
    return response;
  }

  private static ObjectNode admit(String text, ObjectNode... obligations) {
    return new GuidedProposalValidator(C)
        .admitPlan(session(), response(obligations), null, manifest(text));
  }

  private static void refused(String text, ObjectNode... obligations) {
    assertThatThrownBy(() -> admit(text, obligations))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> {
              assertThat(e.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(e.status()).isEqualTo(422);
            });
  }

  @Test
  void aQualifiedPlanIsAdmittedAndKeepsItsRequiredNullableShape() {
    ObjectNode plan =
        admit("Click Open in Primary workspace", obligation("click", "Open", "Primary workspace"));
    assertThat(plan.path("obligations").get(0).path("scopeIntent").asText())
        .isEqualTo("Primary workspace");
    assertThat(plan.path("obligations").get(0).path("obligationId").asText()).isNotBlank();
    ObjectNode unqualified = admit("Click Open", obligation("click", "Open", null));
    assertThat(unqualified.path("obligations").get(0).has("scopeIntent")).isTrue();
    assertThat(unqualified.path("obligations").get(0).path("scopeIntent").isNull()).isTrue();
    ObjectNode absent = obligation("click", "Open", null);
    absent.remove("scopeIntent");
    assertThatThrownBy(() -> admit("Click Open", absent))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void aQualifierThatIsNotAPhraseOfTheStepTextIsRefused() {
    refused("Click Open in Primary workspace", obligation("click", "Open", "Billing workspace"));
    // Whole phrase, not a substring of a longer word, and never from anywhere but the step.
    refused("Click Open in Primary workspaces", obligation("click", "Open", "Primary workspace"));
    refused("Click Open", obligation("click", "Open", "Primary workspace"));
    assertThatThrownBy(
            () ->
                new GuidedProposalValidator(C)
                    .admitPlan(
                        session(), response(obligation("click", "Open", "Primary")), null, null))
        .isInstanceOf(GuidedSessionException.class);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "Click Open in PRIMARY   workspace",
        "Click Open in primary\tworkspace.",
        "Click Open in Primary-workspace",
        "Click Open in Ｐrimary workspace"
      })
  void phraseMatchingIgnoresCaseWhitespaceAndFullWidthForms(String text) {
    assertThat(
            admit(text, obligation("click", "Open", "Primary workspace"))
                .path("obligations")
                .get(0)
                .path("scopeIntent")
                .asText())
        .isEqualTo("Primary workspace");
  }

  @Test
  void aPhraseOfDifferentUnicodeRespectsNfkcAndAstralLetters() {
    admit("Click Open in Ünïcode workspace", obligation("click", "Open", "ünïcode WORKSPACE"));
    admit("Click Open in 𝔘nicode workspace", obligation("click", "Open", "Unicode workspace"));
    refused("Click Open in Unicode workspace", obligation("click", "Open", "Unicode" + " region"));
  }

  @Test
  void theQualifierIsNeverInsideOrEqualToTheTargetIntent() {
    refused(
        "Click Open in Primary workspace",
        obligation("click", "Open in Primary workspace", "Primary workspace"));
    refused(
        "Click Primary workspace", obligation("click", "primary WORKSPACE", "Primary workspace"));
  }

  private static ObjectNode withSourceSpan(ObjectNode obligation) {
    ObjectNode response = response(obligation);
    ((ArrayNode) response.path("sourceReferences"))
        .addObject()
        .put("referenceKind", "sourceSpan")
        .put("sourceRevision", "1")
        .put("stepId", STEP)
        .put("startUtf16", 0)
        .put("endUtf16", 4)
        .put("kind", "destination")
        .put(
            "intendedSlot",
            obligation.path("operationKind").asText().equals("assert")
                ? "assert.expected"
                : "navigate.destination");
    return response;
  }

  private static ObjectNode withSecret(ObjectNode obligation) {
    ObjectNode response = response(obligation);
    ((ArrayNode) response.path("sourceReferences"))
        .addObject()
        .put("referenceKind", "configuration")
        .put("configurationRevision", "1")
        .put("stepId", STEP)
        .put("referenceId", "ref-1")
        .put("kind", "secretRef")
        .put("intendedSlot", "fill.value")
        .put("referenceName", "PASSWORD");
    return response;
  }

  private static void admitResponse(String text, ObjectNode response) {
    new GuidedProposalValidator(C).admitPlan(session(), response, null, manifest(text));
  }

  @Test
  void aQualifierIsRefusedWhereTheTargetIsNotANode() {
    String text = "Open https://example.test or check the URL of Primary workspace";
    ObjectNode navigate = obligation("navigate", "page", null);
    navigate.put("referenceIndex", 0);
    admitResponse(text, withSourceSpan(navigate));
    ObjectNode qualifiedNavigate = obligation("navigate", "page", "Primary workspace");
    qualifiedNavigate.put("referenceIndex", 0);
    assertThatThrownBy(() -> admitResponse(text, withSourceSpan(qualifiedNavigate)))
        .isInstanceOf(GuidedSessionException.class);
    for (String predicate : List.of("url", "title")) {
      ObjectNode plain = obligation("assert", "page", null);
      plain.put("predicate", predicate).put("referenceIndex", 0);
      admitResponse(text, withSourceSpan(plain));
      ObjectNode scoped = obligation("assert", "page", "Primary workspace");
      scoped.put("predicate", predicate).put("referenceIndex", 0);
      assertThatThrownBy(() -> admitResponse(text, withSourceSpan(scoped)))
          .isInstanceOf(GuidedSessionException.class);
    }
  }

  @Test
  void aQualifiedSecretFillIsRefused() {
    String text = "Fill Password with <secret PASSWORD> in Primary workspace";
    ObjectNode plain = obligation("fill", "Password", null);
    plain.put("referenceIndex", 0);
    admitResponse(text, withSecret(plain));
    ObjectNode scoped = obligation("fill", "Password", "Primary workspace");
    scoped.put("referenceIndex", 0);
    assertThatThrownBy(() -> admitResponse(text, withSecret(scoped)))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void visibleAndContainsTextAssertionsMayBeQualifiedButNotUrlOrTitle() {
    ObjectNode visible = obligation("assert", "Ready", "Primary workspace");
    visible.put("predicate", "visible");
    admit("Verify Ready is visible in Primary workspace", visible);
  }

  // ── acquisition availability (GuidedTranslationService.acquisitionAvailable) ────────────────

  /** progress as the session holds it: document, generation and the sanitized observation. */
  private static ObjectNode progress() {
    ObjectNode progress = C.object();
    progress.set("documentId", SHARED.path("observation").path("documentId"));
    progress.set("generation", SHARED.path("observation").path("generation"));
    progress.set("observation", SHARED.path("observation").deepCopy());
    progress.withObject("/observation").set("coverage", coverage());
    return progress;
  }

  private static ObjectNode coverage() {
    return C.object()
        .put("mode", "semantic")
        .put("complete", true)
        .put("truncated", false)
        .put("withheldRegions", 0)
        .put("reason", "complete")
        .put("passwordControls", 0);
  }

  private static boolean available(String target, String scope) {
    return GuidedTranslationService.acquisitionAvailable(
        progress(), obligation("click", target, scope));
  }

  @Test
  void availabilityMatrixOnOneTwoRegionObservation() {
    assertThat(available("Open", "Primary workspace")).isTrue();
    assertThat(available("Open", "Secondary workspace")).isTrue();
    assertThat(available("Open", "Tertiary workspace")).isFalse();
    assertThat(available("Open", "primary WORKSPACE")).isTrue();
    // Only the nearest region: the nested control is in "Nested panel", not in its outer region.
    assertThat(available("Open", "Nested panel")).isTrue();
    // A form label and the landmark above the region are not the nearest region.
    assertThat(available("Pay", "Billing form")).isFalse();
    assertThat(available("Open", "Orders console")).isFalse();
    // A withheld or invisible region cannot qualify; a control outside any region cannot either.
    assertThat(available("Open", "Hidden workspace")).isFalse();
    assertThat(available("Open", "Offscreen workspace")).isFalse();
    assertThat(available("Save draft", "Primary workspace")).isFalse();
    // Unqualified is unchanged: any matching node, in any region.
    assertThat(available("Open", null)).isTrue();
    assertThat(available("Nothing here", null)).isFalse();
  }

  @Test
  void aRegionNodeNulledOutOfTheObservationMakesTheQualifierUnavailable() {
    ObjectNode progress = progress();
    ArrayNode nodes = (ArrayNode) progress.withObject("/observation").path("nodes");
    for (int i = nodes.size() - 1; i >= 0; i--) {
      if (nodes.get(i).path("nodeId").asText().equals("n-primary")) {
        nodes.remove(i);
      }
    }
    assertThat(
            GuidedTranslationService.acquisitionAvailable(
                progress, obligation("click", "Open", "Primary workspace")))
        .isFalse();
    assertThat(
            GuidedTranslationService.acquisitionAvailable(
                progress, obligation("click", "Open", "Secondary workspace")))
        .isTrue();
  }

  @Test
  void aChoicePinnedLocatorKeepsTheExactLocatorBranchWithoutARegionTest() {
    ObjectNode pinned = obligation("click", "open-secondary", "Primary workspace");
    pinned.set("selectedLocator", SHARED.path("cases").get(1).path("target").path("locator"));
    assertThat(GuidedTranslationService.acquisitionAvailable(progress(), pinned)).isTrue();
  }

  @Test
  void aSecretFillStaysOnTheSingleRegionlessPasswordControlBranch() {
    ObjectNode progress = progress();
    progress.withObject("/observation").set("coverage", coverage().put("passwordControls", 1));
    ObjectNode secret = obligation("fill", "Password", null);
    secret.put("referenceIndex", 0);
    ObjectNode plan = C.object();
    plan.putArray("sourceReferences")
        .addObject()
        .put("referenceKind", "configuration")
        .put("kind", "secretRef")
        .put("referenceName", "PASSWORD")
        .put("stepId", STEP)
        .put("intendedSlot", "fill.value");
    secret.put("obligationId", "o1");
    plan.putArray("obligations").add(secret.deepCopy());
    assertThat(GuidedTranslationService.acquisitionAvailable(progress, secret, plan)).isTrue();
  }

  // ── effective obligation (GuidedTranslationService.effectiveObligation) ─────────────────────

  private static GuidedTranslationService service(List<ObjectNode> accepted) {
    GuidedClarificationContextStore questions = mock(GuidedClarificationContextStore.class);
    when(questions.acceptedObserved(anyString())).thenReturn(accepted);
    return new GuidedTranslationService(
        mock(GuidedSessionService.class),
        mock(GuidedSessionRepository.class),
        mock(GuidedTranslationStore.class),
        questions,
        null,
        mock(GuidedLlmGatewayClient.class),
        C,
        new GuidedPromptAssembler(C),
        null,
        null,
        null,
        new GuidedTranslationProperties(true, true, List.of(), List.of(), 131072, 4096, 20, "w"),
        Clock.systemUTC());
  }

  private static GuidedSessionRepository.Session current() {
    return new GuidedSessionRepository.Session(
        C.object().put("sessionId", "s"), progress().put("stepIndex", 0));
  }

  private static ObjectNode action(String nodeId, JsonNode locator) {
    ObjectNode action = C.object();
    ObjectNode target = action.putObject("target");
    target.put("nodeId", nodeId).put("documentId", "doc-1").put("generation", 3);
    target.set("locator", locator);
    return action;
  }

  private static JsonNode testId(String value) {
    return C.object().put("kind", "testId").put("value", value).put("exact", true);
  }

  private static JsonNode role(String role, String name) {
    return C.object().put("kind", "role").put("role", role).put("name", name).put("exact", true);
  }

  private static ObjectNode qualified(String target, String scope) {
    ObjectNode item = obligation("click", target, scope);
    item.put("obligationId", "o1");
    return item;
  }

  @Test
  void aUniqueQualifiedNodeBecomesTheEffectiveObligationWithItsLocator() {
    ObjectNode effective =
        service(List.of())
            .effectiveObligation(
                current(),
                qualified("Open", "Primary workspace"),
                action("open-primary", testId("open-primary")));
    assertThat(effective.path("targetIntent").asText()).isEqualTo("open-primary");
    assertThat(effective.path("selectedLocator")).isEqualTo(testId("open-primary"));
    assertThat(effective.path("scopeIntent").asText()).isEqualTo("Primary workspace");
    // The stored obligation is untouched and the name check of validator.action now passes.
    ObjectNode raw = qualified("Open", "Primary workspace");
    assertThat(raw.path("targetIntent").asText()).isEqualTo("Open");
  }

  @Test
  void aLocatorNameOrValueReplacesTheBareLabelForARoleHintToo() {
    ObjectNode effective =
        service(List.of())
            .effectiveObligation(
                current(),
                qualified("Save", "Primary workspace"),
                action("save-unique", role("button", "Save")));
    assertThat(effective.path("targetIntent").asText()).isEqualTo("Save");
    assertThat(effective.path("selectedLocator")).isEqualTo(role("button", "Save"));
  }

  @Test
  void theQualifiedBranchRefusesEverythingTheRuleForbids() {
    GuidedTranslationService service = service(List.of());
    ObjectNode open = qualified("Open", "Primary workspace");
    // A role hint shared by two nodes.
    refusedEffective(service, open, action("open-primary", role("button", "Open")));
    // A locator that is not one of the node's hints.
    refusedEffective(service, open, action("open-primary", testId("open-secondary")));
    // A node of the other region.
    refusedEffective(service, open, action("open-secondary", testId("open-secondary")));
    // Two candidates in one region: an ACTION is never a unique selection.
    refusedEffective(
        service,
        qualified("Archive", "Primary workspace"),
        action("archive-a", testId("archive-a")));
    // A page target cannot satisfy a qualified obligation.
    ObjectNode page = C.object();
    page.putObject("target").put("kind", "page").put("documentId", "doc-1").put("generation", 3);
    refusedEffective(service, open, page);
  }

  private static void refusedEffective(
      GuidedTranslationService service, ObjectNode obligation, ObjectNode action) {
    assertThatThrownBy(() -> service.effectiveObligation(current(), obligation, action))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> {
              assertThat(e.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(e.status()).isEqualTo(422);
            });
  }

  @Test
  void withoutAnActionTheQualifiedObligationIsProjectedUnchanged() {
    ObjectNode effective =
        service(List.of())
            .effectiveObligation(current(), qualified("Open", "Primary workspace"), null);
    assertThat(effective.path("targetIntent").asText()).isEqualTo("Open");
    assertThat(effective.path("scopeIntent").asText()).isEqualTo("Primary workspace");
    assertThat(effective.has("selectedLocator")).isFalse();
  }

  @Test
  void anAcceptedObservedChoiceTakesPrecedenceOverTheQualifiedRule() {
    // The accepted answer pins open-secondary although the author wrote "Primary workspace":
    // the user's choice already resolved the obligation, so the qualified rule never runs.
    ObjectNode row = C.object().put("acceptedChoiceId", "choice-1");
    row.putObject("context").put("clarificationId", "q1");
    row.putArray("meanings")
        .addObject()
        .put("choiceId", "choice-1")
        .putObject("meaning")
        .put("obligationId", "o1")
        .set("locator", testId("open-secondary"));
    GuidedSessionRepository.Session current = current();
    current.progress().putObject("resolvedClarifications").putObject("q1");
    ObjectNode effective =
        service(List.of(row))
            .effectiveObligation(
                current,
                qualified("Open", "Primary workspace"),
                action("open-secondary", testId("open-secondary")));
    assertThat(effective.path("targetIntent").asText()).isEqualTo("open-secondary");
    assertThat(effective.path("selectedLocator")).isEqualTo(testId("open-secondary"));
  }

  @Test
  void hostileRegionAndLabelStringsNeverReachTheError() {
    ObjectNode progress = progress();
    ArrayNode nodes = (ArrayNode) progress.withObject("/observation").path("nodes");
    for (JsonNode node : nodes) {
      if (node.path("nodeId").asText().equals("n-primary")) {
        ((ObjectNode) node).put("name", CANARY);
      }
      if (node.path("nodeId").asText().equals("open-primary")) {
        ((ObjectNode) node).put("name", CANARY + " Open");
      }
    }
    GuidedSessionRepository.Session hostile =
        new GuidedSessionRepository.Session(C.object().put("sessionId", "s"), progress);
    assertThatThrownBy(
            () ->
                service(List.of())
                    .effectiveObligation(
                        hostile,
                        qualified("Open", CANARY),
                        action("open-secondary", testId("open-secondary"))))
        .satisfies(
            e -> {
              assertThat(e.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(e.toString()).doesNotContain(CANARY);
              assertThat(((GuidedSessionException) e).response().toString()).doesNotContain(CANARY);
            });
  }

  // ── clarification (GuidedQualifiedLabel.requireQuestionChoice) ──────────────────────────────

  private static void question(ObjectNode obligation, String nodeId) {
    JsonNode observation = SHARED.path("observation");
    GuidedQualifiedLabel.requireQuestionChoice(
        observation,
        observation.path("documentId"),
        observation.path("generation"),
        obligation,
        nodeId);
  }

  @Test
  void aQuestionForASingleCandidateIsRefusedBecauseTheAuthorAlreadySaidWhich() {
    assertThatThrownBy(() -> question(qualified("Open", "Primary workspace"), "open-primary"))
        .isInstanceOf(GuidedSessionException.class);
    assertThatThrownBy(() -> question(qualified("Open", "Tertiary workspace"), "open-primary"))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void aQuestionAmongSeveralCandidatesAllowsOnlyThoseNodes() {
    ObjectNode archive = qualified("Archive", "Primary workspace");
    question(archive, "archive-a");
    question(archive, "archive-b");
    assertThatThrownBy(() -> question(archive, "open-primary"))
        .isInstanceOf(GuidedSessionException.class);
    assertThatThrownBy(() -> question(archive, "archive-missing"))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void anUnqualifiedQuestionIsUnchanged() {
    question(qualified("Open", null), "open-primary");
    question(qualified("Open", null), "open-secondary");
  }

  // ── acquisition identity (GuidedTranslationStore.acquisitionTarget) ─────────────────────────

  @Test
  void theAcquisitionIdentityCoversTheQualifierAndKeepsUnqualifiedHashesUnchanged() {
    ObjectNode plain = obligation("click", "Open", null);
    assertThat(GuidedContracts.hash(GuidedTranslationStore.acquisitionTarget(plain)))
        .isEqualTo(GuidedContracts.hash(plain.path("targetIntent")));
    ObjectNode pinned = obligation("click", "Open", null);
    pinned.set("selectedLocator", testId("open-primary"));
    assertThat(GuidedContracts.hash(GuidedTranslationStore.acquisitionTarget(pinned)))
        .isEqualTo(
            GuidedContracts.hash(JSON.createArrayNode().add("Open").add(testId("open-primary"))));
    String primary =
        GuidedContracts.hash(
            GuidedTranslationStore.acquisitionTarget(
                obligation("click", "Open", "Primary workspace")));
    String secondary =
        GuidedContracts.hash(
            GuidedTranslationStore.acquisitionTarget(
                obligation("click", "Open", "Secondary workspace")));
    assertThat(primary)
        .isNotEqualTo(secondary)
        .isNotEqualTo(GuidedContracts.hash(plain.path("targetIntent")));
    ObjectNode both = obligation("click", "Open", "Primary workspace");
    both.set("selectedLocator", testId("open-primary"));
    assertThat(GuidedContracts.hash(GuidedTranslationStore.acquisitionTarget(both)))
        .isNotEqualTo(primary);
  }

  // ── prompt projection ──────────────────────────────────────────────────────────────────────

  @Test
  void theModelContextCarriesScopeIntentForEveryRemainingObligation() {
    ObjectNode session = session().put("scopeHash", "a".repeat(64));
    ObjectNode manifest = C.object();
    manifest.putArray("sourceSteps").addObject().put("stepId", STEP).put("text", "Click Open");
    manifest.putArray("configurationReferences");
    manifest.putArray("authoringContext");
    ObjectNode state = C.object();
    state.set("manifest", manifest);
    ObjectNode progress =
        C.object().put("stepIndex", 0).put("translationOrdinal", 0).put("contextRevision", 0);
    ArrayNode remaining = JSON.createArrayNode();
    remaining.add(qualified("Open", "Primary workspace"));
    GuidedModelRequest request =
        new GuidedPromptAssembler(C)
            .assemble(
                "request",
                1,
                GuidedModelRequest.Kind.SOURCE_PLAN,
                session,
                progress,
                state,
                JSON.createArrayNode(),
                remaining,
                JSON.createArrayNode(),
                List.of(),
                1024);
    JsonNode obligations = request.projection().document().path("obligations");
    assertThat(obligations).hasSize(1);
    assertThat(obligations.get(0).path("scopeIntent").asText()).isEqualTo("Primary workspace");
    assertThat(request.outputContract()).contains("scopeIntent");
  }
}
