package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

/** The target intent of an assert that consumes a captured value is a generic word, or the read's own intent. */
public class GuidedSourceIntentTest {
  private static final GuidedContracts C = new GuidedContracts();

  private static boolean satisfied(String assertIntent, String readIntent, boolean boundToSource) {
    ObjectNode progress = C.object();
    progress.putObject("assertSourceBinding").put("bindingId", "binding");
    ObjectNode plan = C.object();
    plan.putArray("obligations")
        .addObject()
        .put("operationKind", "read")
        .put("needId", "need")
        .put("targetIntent", readIntent);
    ObjectNode obligation = C.object().put("needId", "need").put("targetIntent", assertIntent);
    ObjectNode proposal = C.object();
    proposal
        .putObject("operation")
        .put("kind", "assert")
        .put("predicate", "containsText")
        .putObject("expected")
        .put("kind", "binding")
        .put("bindingId", boundToSource ? "binding" : "another");
    return GuidedProposalValidator.sourceIntentSatisfied(progress, plan, obligation, proposal);
  }

  @Test
  void genericValueAndPageWordsAreAcceptedForAnAssertBoundToItsReadSource() {
    for (String intent :
        new String[] {
          "version number", "copied value", "title", "page", "the page", "page text", "page content"
        }) {
      assertThat(satisfied(intent, "stable:", true)).as(intent).isTrue();
    }
    assertThat(satisfied("stable:", "stable:", true)).isTrue();
  }

  @Test
  void anUnrelatedIntentOrAnAssertNotBoundToTheSourceStaysRefused() {
    assertThat(satisfied("zebra", "stable:", true)).isFalse();
    assertThat(satisfied("page of zebras", "stable:", true)).isFalse();
    assertThat(satisfied("page", "stable:", false)).isFalse();
  }
}
