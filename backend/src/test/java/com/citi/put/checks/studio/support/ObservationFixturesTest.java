package com.citi.put.checks.studio.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.translation.GuidedOutline;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/** The shared observation builder produces what the v3 schemas and the ingestion check accept. */
class ObservationFixturesTest {
  private static final GuidedContracts C = new GuidedContracts();

  @Test
  void everyBuilderShapeValidatesAgainstTheObservationSchemaAndTheOutlineCheck() {
    ObjectNode empty = ObservationFixtures.observation().build();
    ObjectNode small =
        ObservationFixtures.observation()
            .readRuleId("business-reference")
            .element("e1", "button", "Save")
            .editable("e2", "textbox", "Destination")
            .readable("e3", "text", "Reference", "R-1234")
            .line("  - passwordControl")
            .line("  - withheld")
            .coverage(1, 0, 1)
            .build();
    ObjectNode projected =
        ObservationFixtures.observation()
            .element("e1", "link", "Quote \"x\" [e9]")
            .element("e2", "button", "")
            .projected(40)
            .build();
    for (ObjectNode observation : new ObjectNode[] {empty, small, projected}) {
      C.validate("v3/observation", observation);
      GuidedOutline.requireConsistent(observation);
    }
    assertThat(small.path("facts").size()).isEqualTo(3);
    assertThat(small.path("outline").asText()).contains("passwordControl").contains("[e3]");
    assertThat(projected.path("projection").path("notShown").asInt()).isEqualTo(40);
    assertThat(GuidedOutline.shownRefs(projected.path("outline").asText()))
        .containsExactly("e1", "e2");
  }

  @Test
  void aResolvedTargetValidatesAgainstTheLocatorAndIdentityContracts() {
    ObjectNode target = ObservationFixtures.resolvedTarget("save", "button", "Save");
    C.validate("v3/locator", target.path("locator"));
    assertThat(target.path("identity").path("name").asText()).isEqualTo("Save");
    assertThat(
            ObservationFixtures.resolvedTarget("x", "textbox", null)
                .path("identity")
                .path("name")
                .isNull())
        .isTrue();
    assertThat(ObservationFixtures.nodeRef("e4").path("ref").asText()).isEqualTo("e4");
  }
}
