package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class GuidedTemplateMaterializationTest {
  private static final String STEP = "00000000-0000-4000-8000-0000000000a1";
  private static final String TEXT = "Search for \"Top 3 banks. is <var BANK>?\"";
  private final GuidedContracts c = new GuidedContracts();

  private GuidedSourceReferenceValidator.Sources sources() {
    var configuration =
        Map.of(
            "cfg-fill",
            new GuidedSourceReferenceValidator.ConfigurationValue(
                "Citi", STEP, "nonsecretText", "fill.value", "s", true, "BANK"),
            "cfg-select",
            new GuidedSourceReferenceValidator.ConfigurationValue(
                "Citi", STEP, "nonsecretText", "selectOption.value", "s", true, "BANK"));
    return new GuidedSourceReferenceValidator.Sources(
        "1",
        "1",
        Map.of(
            STEP,
            new GuidedSourceReferenceValidator.Source(
                TEXT,
                List.of(
                    new GuidedSourceReferenceValidator.ClassifiedRegion(0, TEXT.indexOf('<')),
                    new GuidedSourceReferenceValidator.ClassifiedRegion(
                        TEXT.indexOf('>') + 1, TEXT.length())))),
        configuration);
  }

  private com.fasterxml.jackson.databind.node.ObjectNode span(int start, int end) {
    return c.object()
        .put("referenceKind", "sourceSpan")
        .put("stepId", STEP)
        .put("startUtf16", start)
        .put("endUtf16", end);
  }

  @Test
  void aTemplateSpanFreezesItsVariableAsAnUnusedWholeVariableInputToKeepTheValueWithheld() {
    var references = c.object().arrayNode().add(span(TEXT.indexOf("Top"), TEXT.lastIndexOf('"')));
    var found = GuidedMaterializationService.templateVariableReferences(c, sources(), references);
    assertThat(found).hasSize(1);
    assertThat(found.get(0).path("referenceKind").asText()).isEqualTo("configuration");
    assertThat(found.get(0).path("referenceId").asText()).isEqualTo("cfg-fill");
    assertThat(found.get(0).path("kind").asText()).isEqualTo("nonsecretText");
    assertThat(found.get(0).path("intendedSlot").asText()).isEqualTo("fill.value");
    assertThat(found.get(0).path("configurationRevision").asText()).isEqualTo("1");
  }

  @Test
  void aPlainSpanOrAConfigurationReferenceAddsNothing() {
    var references =
        c.object()
            .arrayNode()
            .add(span(0, 6))
            .add(c.object().put("referenceKind", "configuration").put("stepId", STEP));
    assertThat(GuidedMaterializationService.templateVariableReferences(c, sources(), references))
        .isEmpty();
  }
}
