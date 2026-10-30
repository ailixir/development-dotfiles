package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.bridge.SourceTemplate;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.support.TestDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/**
 * A quoted value may mix authored text with plain {@code <var NAME>} tokens: one source span whose
 * text is the template, filled by trusted code. Secrets stay whole-value only.
 */
class GuidedTemplateSpanTest {
  private static final String TEXT = "Search for \"Top 3 banks. is <var city>?\"";
  private static final int START = TEXT.indexOf("Top");
  private static final int END = TEXT.lastIndexOf('"');
  private final GuidedContracts c = new GuidedContracts();
  private final GuidedSourceInputResolver resolver =
      new GuidedSourceInputResolver(c, TestDomains.FIXTURES);
  private final GuidedSourceReferenceValidator validator =
      new GuidedSourceReferenceValidator(c, TestDomains.FIXTURES);

  private ObjectNode draft(String text, String value) {
    ObjectNode draft = GuidedSourceClassifierTest.current(text);
    ((ObjectNode) draft.path("variables").get(0)).put("value", value);
    return draft;
  }

  private ObjectNode session() {
    ObjectNode session = c.object().put("scopeHash", "a".repeat(64));
    session.set("scope", GuidedSourceClassifierTest.scope());
    session.putArray("sourceSteps").addObject().put("stepId", GuidedSourceClassifierTest.STEP);
    return session;
  }

  private ObjectNode span(int start, int end, String kind, String slot) {
    return c.object()
        .put("referenceKind", "sourceSpan")
        .put("sourceRevision", "1")
        .put("stepId", GuidedSourceClassifierTest.STEP)
        .put("startUtf16", start)
        .put("endUtf16", end)
        .put("kind", kind)
        .put("intendedSlot", slot);
  }

  private JsonNode manifest(String text, String value) {
    return GuidedSourceClassifierTest.classifier()
        .classify(draft(text, value), GuidedSourceClassifierTest.scope());
  }

  @Test
  void textMixedWithAVariableIsOneInputWhoseValueIsTheFilledTemplate() {
    JsonNode manifest = manifest(TEXT, "Citi");
    // The manifest still splits the step around the token: the template is decided by the bridge.
    assertThat(manifest.path("sourceSteps").get(0).path("regions").size()).isEqualTo(2);
    ObjectNode input =
        validator.resolve(
            session(),
            resolver.sources(session(), manifest),
            span(START, END, "nonsecretText", "fill.value"));
    assertThat(input.path("value").asText()).isEqualTo("Top 3 banks. is Citi?");
    assertThat(input.path("provenance").path("referenceKind").asText()).isEqualTo("sourceSpan");
    for (String slot : new String[] {"selectOption.value", "assert.expected"}) {
      assertThat(
              validator
                  .resolve(
                      session(),
                      resolver.sources(session(), manifest),
                      span(START, END, "nonsecretText", slot))
                  .path("value")
                  .asText())
          .isEqualTo("Top 3 banks. is Citi?");
    }
    // The model-facing quoted-literal rule still holds: the whole quoted text and nothing else.
    resolver.validate(
        session(),
        manifest,
        c.object()
            .putArray("items")
            .add(span(START, END, "nonsecretText", "fill.value"))
            .deepCopy());
    assertThatThrownBy(
            () ->
                resolver.validate(
                    session(),
                    manifest,
                    c.object()
                        .putArray("items")
                        .add(span(START, END - 1, "nonsecretText", "fill.value"))
                        .deepCopy()))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void anEmptyVariableValueIsStillATemplateValueNotAMissingOne() {
    JsonNode manifest = manifest(TEXT, "");
    assertThat(
            validator
                .resolve(
                    session(),
                    resolver.sources(session(), manifest),
                    span(START, END, "nonsecretText", "fill.value"))
                .path("value")
                .asText())
        .isEqualTo("Top 3 banks. is ?");
  }

  @Test
  void aTokenWithoutAConfigurationValueIsRefusedNotTypedAsText() {
    JsonNode manifest = manifest(TEXT, "Citi");
    ((ObjectNode) manifest).putObject("configurationValues");
    assertThatThrownBy(
            () ->
                validator.resolve(
                    session(),
                    resolver.sources(session(), manifest),
                    span(START, END, "nonsecretText", "fill.value")))
        .hasMessage("MISSING_SOURCE");
  }

  @Test
  void aWholeVariableAHalfTokenAndADestinationStayRefused() {
    JsonNode manifest = manifest(TEXT, "Citi");
    int token = TEXT.indexOf("<var city>");
    // Exactly one variable is the whole-variable configuration path, not a template.
    assertThatThrownBy(
            () ->
                validator.resolve(
                    session(),
                    resolver.sources(session(), manifest),
                    span(token, token + "<var city>".length(), "nonsecretText", "fill.value")))
        .hasMessage("FORBIDDEN_SCOPE");
    // An edge inside a token would type half of it.
    for (int[] bounds : new int[][] {{START, token + 4}, {token + 3, END}}) {
      assertThatThrownBy(
              () ->
                  validator.resolve(
                      session(),
                      resolver.sources(session(), manifest),
                      span(bounds[0], bounds[1], "nonsecretText", "fill.value")))
          .hasMessage("FORBIDDEN_SCOPE");
    }
    // Variables inside a navigation URL are not interpolated.
    String url = "Open \"https://example.test/<var city>/home\"";
    JsonNode urlManifest = manifest(url, "Citi");
    int from = url.indexOf("https");
    assertThatThrownBy(
            () ->
                validator.resolve(
                    session(),
                    resolver.sources(session(), urlManifest),
                    span(from, url.lastIndexOf('"'), "destination", "navigate.destination")))
        .hasMessage("FORBIDDEN_SCOPE");
  }

  @Test
  void aSecretNextToTextInsideAQuotedValueIsRefusedAtStartWithItsOwnReason() {
    for (String text :
        new String[] {
          "Type \"pass <secret PASS>\" in \"Password\"",
          "Type \"<secret PASS> and <var city>\" in \"Password\"",
          "Type `<secret PASS>!` in \"Password\""
        }) {
      ObjectNode draft = draft(text, "Citi");
      draft
          .withArray("variables")
          .addObject()
          .put("kind", "secretRef")
          .put("name", "password")
          .put("secretId", "PASS");
      assertThatThrownBy(
              () ->
                  GuidedSourceClassifierTest.classifier()
                      .classify(draft, GuidedSourceClassifierTest.scope()))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              refusal -> {
                assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
                assertThat(refusal.messageCode()).isEqualTo("SECRET_IN_TEXT");
                assertThat(refusal.status()).isEqualTo(422);
              });
    }
  }

  @Test
  void aSecretAsTheWholeQuotedValueOrOutsideQuotesIsStillAccepted() {
    for (String text :
        new String[] {
          "Type \"<secret PASS>\" in \"Password\"",
          "Enter <secret PASS> as password",
          // An apostrophe is not a quote: this is not a quoted span holding the secret.
          "Click the user's <secret PASS> field, don't wait"
        }) {
      ObjectNode draft = draft(text, "Citi");
      draft
          .withArray("variables")
          .addObject()
          .put("kind", "secretRef")
          .put("name", "password")
          .put("secretId", "PASS");
      assertThat(
              GuidedSourceClassifierTest.classifier()
                  .classify(draft, GuidedSourceClassifierTest.scope())
                  .path("configurationReferences")
                  .toString())
          .contains("secretRef");
    }
  }

  @Test
  void aSecretIsNeverReachableThroughATemplateSpan() {
    // A step the start check cannot see as mixed (no quote pair around it) still cannot be spanned.
    String text = "Type pass <secret PASS> and <var city> now";
    ObjectNode draft = draft(text, "Citi");
    draft
        .withArray("variables")
        .addObject()
        .put("kind", "secretRef")
        .put("name", "password")
        .put("secretId", "PASS");
    JsonNode manifest =
        GuidedSourceClassifierTest.classifier().classify(draft, GuidedSourceClassifierTest.scope());
    int from = text.indexOf("pass"), to = text.indexOf(" now");
    assertThatThrownBy(
            () ->
                validator.resolve(
                    session(),
                    resolver.sources(session(), manifest),
                    span(from, to, "nonsecretText", "fill.value")))
        .hasMessage("FORBIDDEN_SCOPE");
  }

  @Test
  void suggestionsOfferTheTemplateSpanButNotAWholeVariableOrASecretValue() {
    JsonNode manifest = manifest(TEXT, "Citi");
    var hints =
        new GuidedAuthoredUriCandidates(c, TestDomains.FIXTURES).candidates(session(), manifest);
    assertThat(hints).hasSize(3);
    for (JsonNode hint : hints) {
      assertThat(hint.path("startUtf16").asInt()).isEqualTo(START);
      assertThat(hint.path("endUtf16").asInt()).isEqualTo(END);
    }
    // The saved value never travels in a suggestion.
    assertThat(hints.toString()).doesNotContain("Citi");
    String whole = "Type \"<var city>\" in \"Search\"";
    var wholeHints =
        new GuidedAuthoredUriCandidates(c, TestDomains.FIXTURES)
            .candidates(session(), manifest(whole, "Citi"));
    // Only the literal \"Search\" (3 slots); the quoted variable stays on the configuration path.
    assertThat(wholeHints).hasSize(3);
    assertThat(wholeHints.get(0).path("startUtf16").asInt()).isEqualTo(whole.indexOf("Search"));
  }

  @Test
  void theSourceTemplateReadsTokensAndFillsOnlyWholeOnes() {
    String text = "a <var X> b <var Y>.<secret S>";
    assertThat(SourceTemplate.variableNames(text, 0, text.length())).containsExactly("X", "Y");
    assertThat(SourceTemplate.expand(text, 0, 19, name -> name.equals("X") ? "1" : "22"))
        .isEqualTo("a 1 b 22");
    assertThat(SourceTemplate.expand(text, 0, 19, name -> null)).isNull();
    assertThat(SourceTemplate.splitsToken(text, 2, 6)).isTrue();
    assertThat(SourceTemplate.splitsToken(text, 0, 9)).isFalse();
    assertThat(SourceTemplate.overlapsSecret(text, 0, text.length())).isTrue();
    assertThat(SourceTemplate.overlapsSecret(text, 0, 19)).isFalse();
    assertThat(SourceTemplate.isWholeVariable(text, 2, 9)).isTrue();
    // A variable value that looks like a token is data: one pass, never re-expanded.
    assertThat(SourceTemplate.expand(text, 2, 9, name -> "<var Y>")).isEqualTo("<var Y>");
  }

  @Test
  void aRevisionDeclaresTheVariablesOfWholeVariableRecipesAndTemplateSpansButNotSecrets() {
    var recipes = c.object().arrayNode();
    recipes.add(
        c.object()
            .put("stepId", "s1")
            .put("kind", "nonsecretText")
            .set(
                "provenance",
                c.object()
                    .put("kind", "configuration")
                    .put("referenceId", "cfg-1")
                    .put("referenceName", "WHOLE")));
    recipes.add(
        c.object()
            .put("stepId", "s2")
            .put("kind", "nonsecretText")
            .set(
                "provenance",
                c.object().put("kind", "sourceSpan").put("start", START).put("end", END)));
    recipes.add(
        c.object()
            .put("stepId", "s3")
            .put("kind", "secretRef")
            .set(
                "provenance",
                c.object()
                    .put("kind", "configuration")
                    .put("referenceId", "cfg-2")
                    .put("referenceName", "PASS")));
    assertThat(
            SourceTemplate.declaredPlainVariables(
                recipes, step -> step.equals("s2") ? TEXT : "no tokens here"))
        .containsExactly("WHOLE", "city");
  }
}
