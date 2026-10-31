package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.translation.GuidedObservationFacts.Selection;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The facts helpers a clarification calls: the JavaScript text semantics shared with the runner and
 * the count of refs that carry one semantic identity.
 */
class GuidedObservationFactsTest {
  private static final GuidedContracts C = new GuidedContracts();

  @Test
  void normFoldsCaseNfkcWhitespaceAndEdgePunctuation() {
    assertThat(GuidedObservationFacts.norm("  Ｓｉｇｎ   IN!!  ")).isEqualTo("sign in");
    assertThat(GuidedObservationFacts.norm("\"Sign in\"")).isEqualTo("sign in");
    assertThat(GuidedObservationFacts.norm("ﬁle")).isEqualTo("file");
  }

  @Test
  void normTreatsTheEcmaScriptWhitespaceSetAsWhitespace() {
    // U+00A0 and U+FEFF are whitespace in ECMAScript; U+0085 is not.
    assertThat(GuidedObservationFacts.norm("a  b")).isEqualTo("a b");
    assertThat(GuidedObservationFacts.norm("﻿a﻿")).isEqualTo("a");
    assertThat(GuidedObservationFacts.norm("a\u0085b")).isEqualTo("a\u0085b");
  }

  @Test
  void aStringWithNoLetterOrDigitKeepsItsSymbols() {
    assertThat(GuidedObservationFacts.norm("+")).isEqualTo("+");
    assertThat(GuidedObservationFacts.norm("  ...  ")).isEqualTo("...");
    assertThat(GuidedObservationFacts.words("+")).isEmpty();
  }

  @Test
  void wordsAreRunsOfLettersAndDigitsOfAtLeastTwoCodePoints() {
    assertThat(GuidedObservationFacts.words("a bc d-ef 12 x")).containsExactly("bc", "ef", "12");
    // A supplementary-plane letter counts as one code point, so a lone one is not a word.
    assertThat(GuidedObservationFacts.words("𝐀")).isEmpty();
    assertThat(GuidedObservationFacts.words("𝐀𝐁")).hasSize(1);
  }

  @Test
  void boundCollapsesWhitespaceAndCutsWithAnEllipsisExactlyAsTheOutlineDoes() {
    assertThat(GuidedObservationFacts.bound("  a \n b ", 160)).isEqualTo("a b");
    String long161 = "x".repeat(161);
    String bounded =
        GuidedObservationFacts.bound(long161, GuidedObservationFacts.OUTLINE_NAME_CHARS);
    assertThat(bounded).isEqualTo("x".repeat(159) + "…");
    assertThat(bounded.codePointCount(0, bounded.length())).isEqualTo(160);
    assertThat(GuidedObservationFacts.bound("x".repeat(160), 160)).isEqualTo("x".repeat(160));
  }

  @Test
  void matchingRefsRequiresExactDuplicateOrdinalAndNeverAFirstMatch() {
    ObjectNode facts = C.object();
    for (String ref : List.of("e1", "e2", "e3")) {
      facts
          .putObject(ref)
          .put("role", "button")
          .put("name", ref.equals("e3") ? "Other" : "Save")
          .put("evidence", ref.equals("e3") ? "Other" : "Save")
          .put("editable", false)
          .putArray("evidenceSegments");
    }
    facts.withObject("/e1").putObject("ordinal").put("index", 1).put("count", 2);
    facts.withObject("/e2").putObject("ordinal").put("index", 2).put("count", 2);
    assertThat(GuidedObservationFacts.matchingRefs(facts, new Selection("button", "Save", "Save")))
        .isEmpty();
    assertThat(
            GuidedObservationFacts.matchingRefs(
                facts, GuidedObservationFacts.selectionOf(facts.path("e1"))))
        .containsExactly("e1");
    assertThat(
            GuidedObservationFacts.matchingRefs(
                facts, GuidedObservationFacts.selectionOf(facts.path("e2"))))
        .containsExactly("e2");
    assertThat(
            GuidedObservationFacts.matchingRefs(facts, new Selection("button", "Other", "Other")))
        .containsExactly("e3");
    assertThat(
            GuidedObservationFacts.matchingRefs(
                facts, new Selection("button", "Save", "Save near")))
        .isEmpty();
    assertThat(GuidedObservationFacts.matchingRefs(facts, new Selection("link", "Save", "Save")))
        .isEmpty();
    assertThat(GuidedObservationFacts.matchingRefs(null, new Selection("button", "Save", "Save")))
        .isEmpty();
  }
}
