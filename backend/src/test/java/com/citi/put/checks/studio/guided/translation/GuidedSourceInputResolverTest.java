package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class GuidedSourceInputResolverTest {
  private final GuidedContracts c = new GuidedContracts();
  private final GuidedSourceInputResolver resolver = new GuidedSourceInputResolver(c);

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
            .put("kind", "nonsecretText")
            .put("intendedSlot", "fill.value");
    var validator = new GuidedSourceReferenceValidator(c);
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
      if (reference.path("intendedSlot").asText().equals("fill.value")) {
        ObjectNode candidate = ((ObjectNode) reference).deepCopy();
        candidate.remove("referenceName");
        candidate.put("referenceKind", "configuration").put("configurationRevision", "1");
        var input =
            new GuidedSourceReferenceValidator(c)
                .resolve(session, resolver.sources(session, manifest), candidate);
        assertThat(input.path("value").textValue()).isEmpty();
      }
    }
  }
}
