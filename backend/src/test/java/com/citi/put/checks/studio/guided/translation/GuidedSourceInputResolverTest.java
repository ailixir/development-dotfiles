package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class GuidedSourceInputResolverTest {
  private final GuidedContracts c = new GuidedContracts();
  private final GuidedSourceInputResolver resolver =
      new GuidedSourceInputResolver(c, com.citi.put.checks.studio.support.TestDomains.FIXTURES);

  @Test
  void exactUnicodeSpansAreSlicedByTheClosedBridgeAndTokensRemainIneligible() {
    var scope = GuidedSourceClassifierTest.scope();
    var current = GuidedSourceClassifierTest.current("Enter é😀 then <var city>");
    var manifest = GuidedSourceClassifierTest.classifier().classify(current, scope);
    ObjectNode session = c.object().put("scopeHash", "a".repeat(64));
    session.set("scope", scope);
    session.putArray("sourceSteps").addObject().put("stepId", GuidedSourceClassifierTest.STEP);
    ObjectNode reference =
        c.object()
            .put("referenceKind", "sourceSpan")
            .put("sourceRevision", "1")
            .put("stepId", GuidedSourceClassifierTest.STEP)
            .put("startUtf16", 6)
            .put("endUtf16", 9)
            .put("kind", "nonsecretText");
    var validator =
        new GuidedSourceReferenceValidator(
            c, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    assertThat(
            validator
                .resolve(session, resolver.sources(session, manifest), reference)
                .path("value")
                .asText())
        .isEqualTo("é😀");
    assertThatThrownBy(
            () ->
                validator.resolve(
                    session,
                    resolver.sources(session, manifest),
                    reference.deepCopy().put("endUtf16", 8)))
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(
            () ->
                validator.resolve(
                    session,
                    resolver.sources(session, manifest),
                    reference.deepCopy().put("startUtf16", 15).put("endUtf16", 25)))
        .isInstanceOf(RuntimeException.class);
    assertThatThrownBy(
            () ->
                validator.resolve(
                    session,
                    resolver.sources(session, manifest),
                    reference.deepCopy().put("sourceRevision", "changed")))
        .hasMessage("REVISION_CONFLICT");
  }

  @Test
  void intentionalEmptySavedTextMaterializesWithoutInventingNullText() {
    ObjectNode draft = GuidedSourceClassifierTest.current("Clear with <var city>");
    ((ObjectNode) draft.path("variables").get(0)).put("value", "");
    ObjectNode scope = GuidedSourceClassifierTest.scope();
    ObjectNode manifest = GuidedSourceClassifierTest.classifier().classify(draft, scope);
    ObjectNode session = c.object().put("scopeHash", "a".repeat(64));
    session.set("scope", scope);
    session.putArray("sourceSteps").addObject().put("stepId", GuidedSourceClassifierTest.STEP);
    for (com.fasterxml.jackson.databind.JsonNode reference :
        manifest.path("configurationReferences")) {
      if (reference.path("kind").asText().equals("nonsecretText")) {
        ObjectNode candidate = ((ObjectNode) reference).deepCopy();
        candidate.remove("referenceName");
        candidate.put("referenceKind", "configuration").put("configurationRevision", "1");
        var input =
            new GuidedSourceReferenceValidator(
                    c, com.citi.put.checks.studio.support.TestDomains.FIXTURES)
                .resolve(session, resolver.sources(session, manifest), candidate);
        assertThat(input.path("value").textValue()).isEmpty();
      }
    }
  }

  @Test
  void typedAndAssertedLiteralSpansMustCoverExactlyTheQuotedLiteral() {
    var scope = GuidedSourceClassifierTest.scope();
    String text = "Check that the page shows the text \"Test login\" now";
    var manifest =
        GuidedSourceClassifierTest.classifier()
            .classify(GuidedSourceClassifierTest.current(text), scope);
    ObjectNode session = c.object().put("scopeHash", "a".repeat(64));
    session.set("scope", scope);
    session.putArray("sourceSteps").addObject().put("stepId", GuidedSourceClassifierTest.STEP);
    int start = text.indexOf("Test login");
    int end = start + "Test login".length();
    ObjectNode reference =
        c.object()
            .put("referenceKind", "sourceSpan")
            .put("sourceRevision", "1")
            .put("stepId", GuidedSourceClassifierTest.STEP)
            .put("startUtf16", start)
            .put("endUtf16", end)
            .put("kind", "nonsecretText");
    resolver.validate(session, manifest, c.object().putArray("items").add(reference).deepCopy());
    // The E2E miscount: three code units early, so the span is `t "Test lo`.
    for (int shift : new int[] {-3, -1, 1}) {
      var shifted =
          reference.deepCopy().put("startUtf16", start + shift).put("endUtf16", end + shift);
      assertThatThrownBy(
              () ->
                  resolver.validate(
                      session, manifest, c.object().putArray("items").add(shifted).deepCopy()))
          .hasMessage("INVALID_CONTRACT");
    }
    // Excluding a final character or including a delimiter is not the whole literal either.
    for (int[] bounds : new int[][] {{start, end - 1}, {start - 1, end}, {start, end + 1}}) {
      var inexact = reference.deepCopy().put("startUtf16", bounds[0]).put("endUtf16", bounds[1]);
      assertThatThrownBy(
              () ->
                  resolver.validate(
                      session, manifest, c.object().putArray("items").add(inexact).deepCopy()))
          .hasMessage("INVALID_CONTRACT");
    }
  }

  @Test
  void correctSpansForStepsWithSeveralQuotedLiteralsAndTrailingPunctuationAreAccepted() {
    var scope = GuidedSourceClassifierTest.scope();
    ObjectNode session = c.object().put("scopeHash", "a".repeat(64));
    session.set("scope", scope);
    session.putArray("sourceSteps").addObject().put("stepId", GuidedSourceClassifierTest.STEP);
    String[][] cases = {
      {"Type \"incorrectUser\" in the \"Username\" field", "incorrectUser"},
      {
        "Check that the page shows the text \"Your username is invalid!\"",
        "Your username is invalid!"
      },
      {"Check that the page shows the text \"Test login\"", "Test login"},
    };
    for (String[] row : cases) {
      var manifest =
          GuidedSourceClassifierTest.classifier()
              .classify(GuidedSourceClassifierTest.current(row[0]), scope);
      int start = row[0].indexOf(row[1]);
      ObjectNode reference =
          c.object()
              .put("referenceKind", "sourceSpan")
              .put("sourceRevision", "1")
              .put("stepId", GuidedSourceClassifierTest.STEP)
              .put("startUtf16", start)
              .put("endUtf16", start + row[1].length())
              .put("kind", "nonsecretText");
      resolver.validate(session, manifest, c.object().putArray("items").add(reference).deepCopy());
    }
  }
}
