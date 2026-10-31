package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class GuidedAuthoredUriCandidatesTest {
  static final GuidedContracts C = new GuidedContracts();
  static final AllowedDomains DOMAINS = new AllowedDomains(List.of("example.test", "localhost"));
  private final GuidedAuthoredUriCandidates hints = new GuidedAuthoredUriCandidates(C, DOMAINS);

  record Fixture(ObjectNode session, ObjectNode manifest) {}

  static Fixture fixture(String... texts) {
    ObjectNode session =
        C.object().put("sessionId", "uri-hint-session").put("scopeHash", "a".repeat(64));
    var scope =
        session.putObject("scope").put("sourceRevision", "1").put("configurationRevision", "1");
    ObjectNode manifest = C.object().put("sourceRevision", "1").put("configurationRevision", "1");
    manifest.putArray("configurationReferences");
    manifest.putObject("configurationValues");
    manifest.putArray("authoringContext");
    var steps = manifest.putArray("sourceSteps");
    var scoped = session.putArray("sourceSteps");
    for (int at = 0; at < texts.length; at++) {
      String id = new UUID(0, at + 1).toString();
      var step = steps.addObject().put("stepId", id).put("text", texts[at]);
      step.putArray("regions").addObject().put("startUtf16", 0).put("endUtf16", texts[at].length());
      scoped.addObject().put("stepId", id);
    }
    return new Fixture(session, manifest);
  }

  static GuidedModelRequest request(
      Fixture fixture,
      GuidedModelRequest.Kind kind,
      ObjectNode state,
      ObjectNode progress,
      JsonNode selections) {
    state.set("manifest", fixture.manifest());
    return new GuidedPromptAssembler(C, DOMAINS)
        .assemble(
            "uri-hint-request",
            1,
            kind,
            fixture.session(),
            progress,
            state,
            C.object().arrayNode(),
            C.object().arrayNode(),
            selections,
            List.of(),
            4096);
  }

  private ArrayNode candidates(Fixture fixture) {
    return hints.candidates(fixture.session(), fixture.manifest());
  }

  private String resolve(Fixture fixture, JsonNode reference) {
    return new GuidedSourceReferenceValidator(C, DOMAINS)
        .resolve(
            fixture.session(),
            new GuidedSourceInputResolver(C, DOMAINS)
                .sources(fixture.session(), fixture.manifest()),
            reference)
        .path("value")
        .asText();
  }

  @Test
  void quotedLiteralsAreSuggestedWithExactOffsetsPerLiteralSlot() {
    String assertion = "Check that the page shows the text \"Your username is invalid!\"";
    Fixture fixture =
        fixture(
            "Go to \"https://example.test/login\"",
            "Type \"incorrectUser\" in the \"Username\" field",
            "Click the \"Submit\" button",
            assertion);
    var all = candidates(fixture);
    var literals = new java.util.ArrayList<String>();
    for (var candidate : all) {
      if (candidate.path("kind").asText().equals("nonsecretText")) {
        String value = resolve(fixture, candidate);
        literals.add(value);
        if (value.equals("Your username is invalid!")) {
          // The E2E-016 miscount was 33-59 and 35-60; the suggestion is the exact [36,61).
          assertThat(candidate.path("startUtf16").asInt()).isEqualTo(36);
          assertThat(candidate.path("endUtf16").asInt()).isEqualTo(61);
        }
      }
    }
    assertThat(literals)
        .contains("incorrectUser", "Username", "Submit", "Your username is invalid!")
        .noneMatch(literal -> literal.contains("https://"));
    // 1 destination + 4 quoted non-URL literals.
    assertThat(all).hasSize(5);
    assertThat(all.toString().length()).isLessThan(4000);
  }

  @Test
  void completeLastCharacterIsSuggestedWithoutChangingPreviouslyValidShorterSpans() {
    Fixture fixture = fixture("Open http://localhost:18182/fixture");
    var candidate = candidates(fixture).get(0);
    assertThat(candidate.path("startUtf16").asInt()).isEqualTo(5);
    assertThat(candidate.path("endUtf16").asInt()).isEqualTo(35);
    assertThat(resolve(fixture, candidate)).isEqualTo("http://localhost:18182/fixture");
    ObjectNode shorter = ((ObjectNode) candidate).deepCopy().put("endUtf16", 34);
    assertThat(resolve(fixture, shorter)).isEqualTo("http://localhost:18182/fixtur");
    assertThat(shorter.path("endUtf16").asInt()).isEqualTo(34);
    assertThat(candidate.size()).isEqualTo(6);
    assertThat(candidate.toString()).doesNotContain("inputId", "value", "obligationId");
  }

  @Test
  void unicodeOffsetsAndUriSpellingArePreservedInUtf16() {
    String url = "https://example.test/é?q=e%CC%81&mode=one#last";
    Fixture fixture = fixture("😀 e\u0301 " + url);
    var candidate = candidates(fixture).get(0);
    assertThat(candidate.path("startUtf16").asInt()).isEqualTo(6);
    assertThat(candidate.path("endUtf16").asInt()).isEqualTo(6 + url.length());
    assertThat(resolve(fixture, candidate)).isEqualTo(url);
  }

  @ParameterizedTest
  @ValueSource(strings = {"\"", "'", "`"})
  void explicitQuotesPreserveQueryPunctuationAndExcludeOutsideDelimiters(String quote) {
    String url = "https://example.test/a?q=x,y;z#end.";
    Fixture fixture = fixture("Open " + quote + url + quote + ".");
    var candidate = candidates(fixture).get(0);
    assertThat(candidate.path("startUtf16").asInt()).isEqualTo(6);
    assertThat(candidate.path("endUtf16").asInt()).isEqualTo(6 + url.length());
    assertThat(resolve(fixture, candidate)).isEqualTo(url);
  }

  @Test
  void multipleWhitespaceSeparatedUrisKeepEveryDistinctOccurrenceInStableOrder() {
    Fixture fixture =
        fixture(
            "https://example.test/first\u00a0https://example.test/second"
                + " https://example.test/first");
    var candidates = candidates(fixture);
    assertThat(candidates).hasSize(3);
    assertThat(resolve(fixture, candidates.get(0))).isEqualTo("https://example.test/first");
    assertThat(resolve(fixture, candidates.get(1))).isEqualTo("https://example.test/second");
    assertThat(resolve(fixture, candidates.get(2))).isEqualTo("https://example.test/first");
    assertThat(candidates.get(0).path("startUtf16"))
        .isNotEqualTo(candidates.get(2).path("startUtf16"));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "https://example.test/path.",
        "https://example.test/path,",
        "https://example.test/path;",
        "https://example.test/path:",
        "https://example.test/path!",
        "https://example.test/path?",
        "https://example.test/path)",
        "(https://example.test/path)",
        "https://example.test/a,b",
        "https://example.test/a;mode=x",
        "https://example.test/ahttps://example.test/b",
        "\"https://example.test/path",
        "'https://example.test/path\"",
        "\"https://example.test/a'b\"",
        "\"https://example.test/a\\\"",
        "https://example.test/path\"",
        "\"https://example.test/path\"'"
      })
  void ambiguousTokensAreOmittedWholeWithoutGuessingOrTrimming(String text) {
    assertThat(candidates(fixture(text))).isEmpty();
  }

  @Test
  void lexesWholeTextBeforeSingleRegionContainmentAndNeverManufacturesAClippedUri() {
    String text = "Open https://example.test/public<var city>";
    Fixture fixture = fixture(text);
    var step = (ObjectNode) fixture.manifest().path("sourceSteps").get(0);
    step.putArray("regions").addObject().put("startUtf16", 0).put("endUtf16", text.indexOf('<'));
    assertThat(candidates(fixture)).isEmpty();

    Fixture divided = fixture("https://example.test/whole");
    var regions = ((ObjectNode) divided.manifest().path("sourceSteps").get(0)).putArray("regions");
    regions.addObject().put("startUtf16", 0).put("endUtf16", 10);
    regions.addObject().put("startUtf16", 10).put("endUtf16", 26);
    assertThat(candidates(divided)).isEmpty();
  }

  @Test
  void unclassifiedSecretAndConfigurationValuesDoNotBecomeSuggestions() {
    Fixture fixture = fixture("Use <secret ACCESS> and <var ADDRESS>");
    fixture
        .manifest()
        .withObject("/configurationValues")
        .put("private", "https://example.test/private-config");
    fixture.session().put("capturedValue", "https://example.test/private-capture");
    assertThat(candidates(fixture)).isEmpty();
    Fixture excluded = fixture("\"https://example.test/private\" https://example.test/public");
    var step = (ObjectNode) excluded.manifest().path("sourceSteps").get(0);
    String text = step.path("text").asText();
    step.putArray("regions")
        .addObject()
        .put("startUtf16", text.indexOf("https", 2))
        .put("endUtf16", text.length());
    assertThat(candidates(excluded)).hasSize(1);
    assertThat(resolve(excluded, candidates(excluded).get(0)))
        .isEqualTo("https://example.test/public");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "https://denied.test/path",
        "https://user:synthetic@example.test/path",
        "ftp://example.test/path",
        "https://example.test:99999/path",
        "https://[invalid]/path",
        "https://example.test/"
      })
  void scopeUriAndRevisionChecksRemainIndependent(String url) {
    Fixture fixture = fixture(url);
    if (url.equals("https://example.test/")) {
      fixture.manifest().put("sourceRevision", "stale");
    }
    assertThat(candidates(fixture)).isEmpty();
  }

  @Test
  void existingSizeUnicodeAndConfigurationRevisionLimitsFilterHintsOnly() {
    assertThat(candidates(fixture("https://example.test/" + "a".repeat(2048)))).isEmpty();
    assertThat(candidates(fixture("https://example.test/" + "日".repeat(1400)))).isEmpty();
    assertThat(candidates(fixture("\uD800 https://example.test/path"))).isEmpty();
    Fixture stale = fixture("https://example.test/path");
    stale.manifest().put("configurationRevision", "stale");
    assertThat(candidates(stale)).isEmpty();
    Fixture port = fixture("https://example.test:443/raw%2Fpath?q=x#frag");
    assertThat(resolve(port, candidates(port).get(0)))
        .isEqualTo("https://example.test:443/raw%2Fpath?q=x#frag");
  }

  @Test
  void candidateCapCountsRefusedResolverChecksRatherThanOnlySuccessfulHints() {
    Fixture refused = fixture(("https://denied/x ").repeat(200) + "https://example.test/last");
    assertThat(candidates(refused)).isEmpty();
    Fixture lastAllowed = fixture(("https://denied/x ").repeat(199) + "https://example.test/last");
    assertThat(candidates(lastAllowed)).hasSize(1);
  }

  @Test
  void fullManifestAndReferenceBoundsAreFiniteWithoutTruncatingAnyPriorArray() {
    String[] texts = new String[100];
    java.util.Arrays.fill(
        texts, "https://example.test/a https://example.test/b https://example.test/c");
    Fixture fixture = fixture(texts);
    var candidates = candidates(fixture);
    assertThat(candidates).hasSize(200);
    assertThat(candidates.get(199).path("stepId"))
        .isEqualTo(fixture.manifest().path("sourceSteps").get(66).path("stepId"));
    assertThat(resolve(fixture, candidates.get(199))).isEqualTo("https://example.test/b");
    String[] tooMany = new String[101];
    java.util.Arrays.fill(tooMany, "https://example.test/path");
    assertThat(candidates(fixture(tooMany))).isEmpty();
    assertThat(candidates(fixture(" ".repeat(4001)))).isEmpty();
  }

  @ParameterizedTest
  @ValueSource(strings = {"\"0\"", "0.5", "2147483648"})
  void malformedRegionOffsetsCannotBeCoercedIntoApprovedSourceSpans(String invalidOffset) {
    Fixture fixture = fixture("https://example.test/path");
    ((ObjectNode) fixture.manifest().path("sourceSteps").get(0).path("regions").get(0))
        .set("startUtf16", C.parse(invalidOffset));
    assertThat(candidates(fixture)).isEmpty();
  }

  @Test
  void actualInitialProjectionContainsOnlyOptionalProvenanceAndCannotAdmitItAsAPlan() {
    Fixture fixture = fixture("Open https://example.test/path");
    var request =
        request(
            fixture,
            GuidedModelRequest.Kind.SOURCE_PLAN,
            C.object().putNull("plan"),
            C.object(),
            C.object().arrayNode());
    var context = request.projection().document();
    assertThat(context.path("sourceReferences")).isEqualTo(candidates(fixture));
    assertThat(context.path("obligations")).isEmpty();
    assertThat(context.path("inputs")).isEmpty();
    assertThatThrownBy(() -> new GuidedProposalValidator(C).admitPlan(fixture.session(), context))
        .hasMessage("INVALID_CONTRACT");
    ObjectNode projectionCopy = request.projection().document();
    ((ObjectNode) projectionCopy.path("sourceReferences").get(0)).put("endUtf16", 1);
    assertThat(fixture.manifest().path("sourceSteps").get(0).path("text").asText())
        .isEqualTo("Open https://example.test/path");
    assertThat(request.projection().document().path("sourceReferences"))
        .isEqualTo(candidates(fixture));
  }

  @Test
  void anyPriorPlanIncludingZeroReferencesIsPreservedWithoutCandidateInjectionOrAliasing() {
    Fixture fixture = fixture("https://example.test/one https://example.test/two");
    var prior = candidates(fixture);
    ArrayNode reversed = C.object().arrayNode().add(prior.get(1)).add(prior.get(0));
    ObjectNode state = C.object();
    state.putObject("plan").set("sourceReferences", reversed);
    ObjectNode context =
        new GuidedPromptAssembler(C, DOMAINS)
            .buildPositiveContext(
                GuidedModelRequest.Kind.SOURCE_PLAN,
                fixture.session(),
                C.object(),
                withManifest(state, fixture),
                C.object().arrayNode(),
                C.object().arrayNode(),
                C.object().arrayNode(),
                List.of());
    assertThat(context.path("sourceReferences")).isEqualTo(reversed);
    ((ObjectNode) context.path("sourceReferences").get(0)).put("endUtf16", 1);
    assertThat(reversed.get(0).path("endUtf16").asInt()).isGreaterThan(1);
    ((ObjectNode) state.path("plan")).putArray("sourceReferences");
    assertThat(
            request(
                    fixture,
                    GuidedModelRequest.Kind.SOURCE_PLAN,
                    state,
                    C.object(),
                    C.object().arrayNode())
                .projection()
                .document()
                .path("sourceReferences"))
        .isEmpty();
    state.put("plan", "non-null-invalid-prior-state");
    assertThat(
            request(
                    fixture,
                    GuidedModelRequest.Kind.SOURCE_PLAN,
                    state,
                    C.object(),
                    C.object().arrayNode())
                .projection()
                .document()
                .path("sourceReferences"))
        .isEmpty();
  }

  private static ObjectNode withManifest(ObjectNode state, Fixture fixture) {
    state.set("manifest", fixture.manifest());
    return state;
  }

  @Test
  void learningWindowsAndPublicSourceChoicesRetainTheirExistingMeaningWithoutNewHints() {
    Fixture fixture = fixture("https://example.test/path");
    String stepId = fixture.session().path("sourceSteps").get(0).path("stepId").asText();
    ObjectNode progress = C.object();
    var window =
        progress
            .putObject("learningWindow")
            .put("firstLearnStepId", stepId)
            .put("nextSemanticOrdinal", 0);
    window.putArray("learnableStepIds").add(stepId);
    window.putArray("completedCoordinates");
    window.putArray("availableBindingIds");
    var context =
        request(
                fixture,
                GuidedModelRequest.Kind.SOURCE_PLAN,
                C.object(),
                progress,
                C.object().arrayNode())
            .projection()
            .document();
    assertThat(context.path("learningWindow")).isEqualTo(window);
    assertThat(context.path("sourceReferences")).isEmpty();
    ArrayNode selected = C.object().arrayNode();
    ObjectNode choice = selected.addObject();
    choice.putObject("need").put("stepId", stepId).put("occurrence", 0);
    choice.set("reference", candidates(fixture).get(0));
    context =
        request(fixture, GuidedModelRequest.Kind.SOURCE_PLAN, C.object(), C.object(), selected)
            .projection()
            .document();
    assertThat(context.path("clarificationSelections")).isEqualTo(selected);
    assertThat(context.path("sourceReferences")).isEmpty();
  }

  @Test
  void aReLearnPlanGetsExactLiteralOffsetsForTheLearnableStepsOnly() {
    Fixture fixture =
        fixture(
            "Go to \"https://example.test/login\"",
            "Type \"student\" in the \"Username\" field",
            "Check that the page shows the text \"Test login\"");
    String reused = fixture.session().path("sourceSteps").get(0).path("stepId").asText();
    String edited = fixture.session().path("sourceSteps").get(1).path("stepId").asText();
    String last = fixture.session().path("sourceSteps").get(2).path("stepId").asText();
    ObjectNode state = C.object();
    var plan = state.putObject("plan");
    plan.putArray("sourceReferences");
    plan.putArray("obligations");
    plan.putArray("needs");
    ObjectNode progress = C.object();
    var window =
        progress
            .putObject("learningWindow")
            .put("firstLearnStepId", edited)
            .put("nextSemanticOrdinal", 0);
    window.putArray("learnableStepIds").add(edited).add(last);
    window.putArray("completedCoordinates");
    window.putArray("availableBindingIds");
    var references =
        request(
                fixture,
                GuidedModelRequest.Kind.SOURCE_PLAN,
                state,
                progress,
                C.object().arrayNode())
            .projection()
            .document()
            .path("sourceReferences");
    assertThat(references).isNotEmpty();
    for (var reference : references) {
      assertThat(reference.path("stepId").asText()).isIn(edited, last).isNotEqualTo(reused);
      String value = resolve(fixture, reference);
      int start = reference.path("startUtf16").asInt();
      int end = reference.path("endUtf16").asInt();
      assertThat(value).hasSize(end - start);
    }
    assertThat(references.toString()).contains("\"startUtf16\":36,\"endUtf16\":46");
  }
}
