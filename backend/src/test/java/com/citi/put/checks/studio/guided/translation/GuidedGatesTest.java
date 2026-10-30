package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.translation.GuidedGates.Fact;
import com.citi.put.checks.studio.guided.translation.GuidedGates.IntentPath;
import com.citi.put.checks.studio.guided.translation.GuidedGates.IntentVerdict;
import com.citi.put.checks.studio.guided.translation.GuidedGates.Segment;
import com.citi.put.checks.studio.guided.translation.GuidedGates.Selection;
import com.citi.put.checks.studio.guided.translation.GuidedGates.TextCheck;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * ADR-SC-007 D3/D4/D7(d): every branch of the pure grounding gates, apart from the golden vectors.
 * The vectors prove the ports against the spike; these tests pin the rules in the words of the ADR.
 */
class GuidedGatesTest {
  private static final GuidedContracts C = new GuidedContracts();

  private static Fact fact(String role, String name, String evidence) {
    return new Fact(role, name, false, evidence, List.of(), null);
  }

  private static Fact withText(String role, String text) {
    return new Fact(role, "", false, "", List.of(), text);
  }

  // ---- norm and words (the JavaScript semantics, not Java's) ----

  @Test
  void normFoldsCaseNfkcWhitespaceAndEdgePunctuation() {
    assertThat(GuidedGates.norm("  Ｓｉｇｎ   IN!!  ")).isEqualTo("sign in");
    assertThat(GuidedGates.norm("\"Sign in\"")).isEqualTo("sign in");
    assertThat(GuidedGates.norm("ﬁle")).isEqualTo("file");
  }

  @Test
  void normTreatsTheEcmaScriptWhitespaceSetAsWhitespace() {
    // U+00A0 and U+FEFF are whitespace in ECMAScript; U+0085 is not.
    assertThat(GuidedGates.norm("a  b")).isEqualTo("a b");
    assertThat(GuidedGates.norm("﻿a﻿")).isEqualTo("a");
    assertThat(GuidedGates.norm("a\u0085b")).isEqualTo("a\u0085b");
  }

  @Test
  void aStringWithNoLetterOrDigitKeepsItsSymbols() {
    assertThat(GuidedGates.norm("+")).isEqualTo("+");
    assertThat(GuidedGates.norm("  ...  ")).isEqualTo("...");
    assertThat(GuidedGates.words("+")).isEmpty();
  }

  @Test
  void wordsAreRunsOfLettersAndDigitsOfAtLeastTwoCodePoints() {
    assertThat(GuidedGates.words("a bc d-ef 12 x")).containsExactly("bc", "ef", "12");
    // A supplementary-plane letter counts as one code point, so a lone one is not a word.
    assertThat(GuidedGates.words("𝐀")).isEmpty();
    assertThat(GuidedGates.words("𝐀𝐁")).hasSize(1);
  }

  @Test
  void boundCollapsesWhitespaceAndCutsWithAnEllipsisExactlyAsTheOutlineDoes() {
    assertThat(GuidedGates.bound("  a \n b ", 160)).isEqualTo("a b");
    String long161 = "x".repeat(161);
    String bounded = GuidedGates.bound(long161, GuidedGates.OUTLINE_NAME_CHARS);
    assertThat(bounded).isEqualTo("x".repeat(159) + "…");
    assertThat(bounded.codePointCount(0, bounded.length())).isEqualTo(160);
    assertThat(GuidedGates.bound("x".repeat(160), 160)).isEqualTo("x".repeat(160));
  }

  // ---- the intent gate ----

  @ParameterizedTest
  @ValueSource(strings = {"", "   ", "\t\n"})
  void anEmptyIntentIsMissing(String intent) {
    IntentVerdict verdict = GuidedGates.intent(intent, fact("button", "Search", "Search"));
    assertThat(verdict.code()).isEqualTo(GuidedGates.INTENT_MISSING);
    assertThat(GuidedGates.intent(null, fact("button", "Search", "Search")).code())
        .isEqualTo(GuidedGates.INTENT_MISSING);
  }

  @Test
  void anIntentEqualToTheNamePassesByExactNameWhateverTheCaseAndPunctuation() {
    IntentVerdict verdict = GuidedGates.intent("SIGN IN!", fact("button", "Sign in", "Sign in"));
    assertThat(verdict.passed()).isTrue();
    assertThat(verdict.path()).isEqualTo(IntentPath.EXACT_NAME);
    assertThat(verdict.fields()).containsExactly("name");
  }

  @Test
  void anIntentWithNoWordPassesOnlyByNameEquality() {
    assertThat(GuidedGates.intent("x", fact("button", "x", "x")).passed()).isTrue();
    assertThat(GuidedGates.intent("x", fact("button", "xy", "xy x marks the spot")).code())
        .isEqualTo(GuidedGates.INTENT_MISMATCH);
    assertThat(GuidedGates.intent("+", fact("button", "plus", "plus plus sign")).code())
        .isEqualTo(GuidedGates.INTENT_MISMATCH);
  }

  @Test
  void everyIntentWordMustBeAWordOfTheEvidence() {
    Fact fact = fact("button", "Delete", "Delete items");
    assertThat(GuidedGates.intent("delete items", fact).path())
        .isEqualTo(IntentPath.EVIDENCE_SUBSET);
    assertThat(GuidedGates.intent("delete account", fact).code())
        .isEqualTo(GuidedGates.INTENT_MISMATCH);
  }

  @Test
  void aMissingFactNeverPassesTheIntentGate() {
    assertThat(GuidedGates.intent("Search", null).code()).isEqualTo(GuidedGates.INTENT_MISMATCH);
  }

  @Test
  void theEvidenceFieldsAreTheFirstSegmentsInEvidenceOrderThatHoldTheIntentWords() {
    // evidence "(Unused) Status Description" = name | header | header
    String evidence = "(Unused) Status Description";
    Fact fact =
        new Fact(
            "cell",
            "(Unused)",
            false,
            evidence,
            List.of(
                new Segment("name", 0, 8),
                new Segment("header", 9, 15),
                new Segment("sibling", 16, 27)),
            null);
    IntentVerdict verdict = GuidedGates.intent("status description", fact);
    assertThat(verdict.path()).isEqualTo(IntentPath.EVIDENCE_SUBSET);
    assertThat(verdict.fields()).containsExactly("header", "sibling");
    // The first segment that holds the word wins; a word the name also holds is credited to name.
    assertThat(GuidedGates.intent("unused status", fact).fields())
        .containsExactly("name", "header");
  }

  @Test
  void aSegmentCutByTheEvidenceCapStillSuppliesItsWords() {
    String name = "alpha ".repeat(40).trim(); // 239 characters
    // The runner caps the evidence string: the tail " delta" is cut off, " beta gamma" survives.
    String evidence = (name + " beta gamma delta").substring(0, 250);
    Fact fact =
        new Fact(
            "cell",
            name,
            false,
            evidence,
            List.of(
                new Segment("name", 0, name.length()), new Segment("near", name.length() + 1, 250)),
            null);
    IntentVerdict verdict = GuidedGates.intent("alpha beta", fact);
    assertThat(verdict.passed()).isTrue();
    assertThat(verdict.fields()).containsExactly("name", "near");
    // A word that only a cut-off tail would hold is not in the evidence at all.
    assertThat(GuidedGates.intent("alpha delta", fact).code())
        .isEqualTo(GuidedGates.INTENT_MISMATCH);
  }

  // ---- operation versus role ----

  @ParameterizedTest
  @CsvSource({
    "fill,textbox,false,true",
    "fill,searchbox,false,true",
    "fill,spinbutton,false,true",
    "fill,generic,true,true",
    "fill,combobox,false,false",
    "fill,button,false,false",
    "selectOption,combobox,false,true",
    "selectOption,listbox,false,true",
    "selectOption,option,false,true",
    "selectOption,radio,false,true",
    "selectOption,menuitemradio,false,true",
    "selectOption,radiogroup,false,false",
    "selectOption,textbox,false,false",
    "check,checkbox,false,true",
    "check,radio,false,true",
    "check,switch,false,true",
    "uncheck,menuitemcheckbox,false,true",
    "uncheck,menuitemradio,false,true",
    "uncheck,button,false,false",
    "click,button,false,true",
    "press,generic,false,true",
    "hover,link,false,true",
    "read,text,false,true",
    "assert,heading,false,true"
  })
  void anOperationNeedsAControlThatCanTakeIt(
      String kind, String role, boolean editable, boolean ok) {
    Fact fact = new Fact(role, "n", editable, "n", List.of(), null);
    assertThat(GuidedGates.operationTarget(kind, fact) == null).isEqualTo(ok);
  }

  @Test
  void aMissingFactCannotTakeARestrictedOperationButCanBeClickedOrRead() {
    assertThat(GuidedGates.operationTarget("fill", null))
        .isEqualTo(GuidedGates.OPERATION_TARGET_MISMATCH);
    assertThat(GuidedGates.operationTarget("selectOption", null))
        .isEqualTo(GuidedGates.OPERATION_TARGET_MISMATCH);
    assertThat(GuidedGates.operationTarget("click", null)).isNull();
    assertThat(GuidedGates.operationTarget(null, fact("button", "n", "n"))).isNull();
  }

  // ---- G2: assert containsText ----

  @Test
  void containmentIsNfkcCaseInsensitiveAndWhitespaceCollapsed() {
    Fact cell = withText("cell", "Order   accepted for shipping");
    assertThat(GuidedGates.assertText("containsText", cell, "ORDER ACCEPTED"))
        .isEqualTo(TextCheck.PASS);
    assertThat(GuidedGates.assertText("containsText", cell, " Ｏｒｄｅｒ  accepted "))
        .isEqualTo(TextCheck.PASS);
    assertThat(GuidedGates.assertText("containsText", cell, "Order rejected"))
        .isEqualTo(TextCheck.REFUSE);
    assertThat(GuidedGates.assertText("containsText", cell, "")).isEqualTo(TextCheck.PASS);
  }

  @Test
  void theTextGateIsNotApplicableWhereItCannotJudge() {
    Fact cell = withText("cell", "Order accepted");
    assertThat(GuidedGates.assertText("visible", cell, "zzz")).isEqualTo(TextCheck.NOT_APPLICABLE);
    assertThat(GuidedGates.assertText("hasValue", cell, "zzz")).isEqualTo(TextCheck.NOT_APPLICABLE);
    assertThat(GuidedGates.assertText("containsText", fact("cell", "n", "n"), "zzz"))
        .as("withheld or absent text")
        .isEqualTo(TextCheck.NOT_APPLICABLE);
    for (String role :
        List.of("combobox", "textbox", "searchbox", "spinbutton", "slider", "listbox")) {
      assertThat(GuidedGates.assertText("containsText", withText(role, "something"), "zzz"))
          .as(role)
          .isEqualTo(TextCheck.NOT_APPLICABLE);
    }
    assertThat(GuidedGates.assertText("containsText", cell, null))
        .isEqualTo(TextCheck.NOT_APPLICABLE);
    assertThat(GuidedGates.assertText("containsText", cell, "Hello <var NAME>"))
        .as("a literal that holds a template token is not the runtime value")
        .isEqualTo(TextCheck.NOT_APPLICABLE);
  }

  @Test
  void aTextCutAtTheCapIsNotApplicableButALongerTextIsJudged() {
    String cut = "w".repeat(255) + "…";
    assertThat(GuidedGates.assertText("containsText", withText("cell", cut), "beyond"))
        .isEqualTo(TextCheck.NOT_APPLICABLE);
    String longer = "w".repeat(300);
    assertThat(GuidedGates.assertText("containsText", withText("cell", longer), "beyond"))
        .isEqualTo(TextCheck.REFUSE);
    String shortEllipsis = "w".repeat(10) + "…";
    assertThat(GuidedGates.assertText("containsText", withText("cell", shortEllipsis), "beyond"))
        .isEqualTo(TextCheck.REFUSE);
  }

  // ---- read eligibility and selections ----

  @Test
  void aReadNeedsTheTextOfItsTarget() {
    assertThat(GuidedGates.readEligible(withText("text", "Reference 42"))).isTrue();
    assertThat(GuidedGates.readEligible(fact("text", "Reference 42", "Reference 42"))).isFalse();
    assertThat(GuidedGates.readEligible(null)).isFalse();
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
    assertThat(GuidedGates.matchingRefs(facts, new Selection("button", "Save", "Save"))).isEmpty();
    assertThat(GuidedGates.matchingRefs(facts, GuidedGates.selectionOf(facts.path("e1"))))
        .containsExactly("e1");
    assertThat(GuidedGates.matchingRefs(facts, GuidedGates.selectionOf(facts.path("e2"))))
        .containsExactly("e2");
    assertThat(GuidedGates.matchingRefs(facts, new Selection("button", "Other", "Other")))
        .containsExactly("e3");
    assertThat(GuidedGates.matchingRefs(facts, new Selection("button", "Save", "Save near")))
        .isEmpty();
    assertThat(GuidedGates.matchingRefs(facts, new Selection("link", "Save", "Save"))).isEmpty();
    assertThat(GuidedGates.matchingRefs(null, new Selection("button", "Save", "Save"))).isEmpty();
  }

  @Test
  void factsOfAnObjectKeepTheirTextAndAnAbsentTextStaysNull() {
    ObjectNode node = C.object().put("role", "cell").put("name", "N").put("editable", true);
    node.put("evidence", "N e")
        .putArray("evidenceSegments")
        .addObject()
        .put("field", "name")
        .put("start", 0)
        .put("end", 1);
    Fact withoutText = GuidedGates.of(node);
    assertThat(withoutText.text()).isNull();
    assertThat(withoutText.editable()).isTrue();
    assertThat(withoutText.segments()).containsExactly(new Segment("name", 0, 1));
    node.put("text", "T");
    assertThat(GuidedGates.of(node).text()).isEqualTo("T");
    assertThat(GuidedGates.of(null)).isNull();
    assertThat(GuidedGates.of(C.object().put("x", 1).path("x"))).isNull();
  }

  @Test
  void mixedParagraphDirectRunRequiresExactContiguousLiteralAndNeverGrantsRead() {
    var fact =
        C.object()
            .put("role", "paragraph")
            .put("name", "")
            .put("editable", false)
            .put("evidence", "This domain is for use in illustrative examples in documents.")
            .put("text", "This domain is for use in illustrative examples in documents.")
            .put("directTextAssertion", true);
    Fact direct = GuidedGates.of(fact);
    assertThat(GuidedGates.assertText("containsText", direct, "use in illustrative examples"))
        .isEqualTo(GuidedGates.TextCheck.PASS);
    for (String expected :
        java.util.List.of("examples illustrative", "documents. Learn more.", "missing")) {
      assertThat(GuidedGates.assertText("containsText", direct, expected))
          .isEqualTo(GuidedGates.TextCheck.REFUSE);
    }
    assertThat(GuidedGates.readEligible(direct)).isFalse();
    assertThat(GuidedGates.readFallbackEligible(fact)).isFalse();
    fact.remove("text");
    assertThat(GuidedGates.assertText("containsText", GuidedGates.of(fact), "domain"))
        .isEqualTo(GuidedGates.TextCheck.REFUSE);
    fact.put("text", "x".repeat(255) + "…");
    assertThat(GuidedGates.assertText("containsText", GuidedGates.of(fact), "x"))
        .isEqualTo(GuidedGates.TextCheck.REFUSE);
  }

  @Test
  void tableDescriptorKeepsFullExactTitleAndRequiresIndependentRowLabel() {
    var facts = C.object();
    for (String ref : java.util.List.of("e1", "e2", "e3")) {
      facts
          .putObject(ref)
          .put("role", ref.equals("e1") ? "cell" : "link")
          .put("name", ref.equals("e2") ? "Python" : ref.equals("e3") ? "Designed by" : "Guido")
          .put("nameComplete", true)
          .put("editable", false);
    }
    var target = facts.withObject("/e1");
    var scope =
        target.putObject("readScope").put("relation", "SAME_ROW_LABEL").put("tableTitleRef", "e2");
    scope.putArray("sourceRefs").add("e2").add("e3");
    var obligation =
        C.object().put("operationKind", "read").put("scopeIntent", "infobox for Python");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isTrue();
    for (String invalid :
        java.util.List.of(
            "infobox for Py",
            "infobox for Python 3",
            "table for Python",
            "infobox for JavaScript")) {
      obligation.put("scopeIntent", invalid);
      assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
    }
    obligation.put("scopeIntent", "infobox for Python");
    scope.putArray("sourceRefs").add("e2");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
    scope.putArray("sourceRefs").add("e2").add("e3").add("e3");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
  }

  @Test
  void infoboxDescriptorCannotBorrowNamedRegionOrCollapseFullTitlePunctuation() {
    var facts = C.object();
    facts.putObject("e1").put("role", "cell").put("name", "value");
    facts
        .putObject("e2")
        .put("role", "caption")
        .put("name", "C++")
        .put("nameComplete", true)
        .put("editable", false);
    facts
        .putObject("e3")
        .put("role", "link")
        .put("name", "Designed by")
        .put("nameComplete", true)
        .put("editable", false);
    facts
        .putObject("e4")
        .put("role", "region")
        .put("name", "infobox for C")
        .put("nameComplete", true)
        .put("editable", false);
    var target = facts.withObject("/e1");
    target.putArray("scopeRefs").add("e4");
    var obligation = C.object().put("operationKind", "read").put("scopeIntent", "infobox for C");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
    var relation =
        target.putObject("readScope").put("relation", "SAME_ROW_LABEL").put("tableTitleRef", "e2");
    relation.putArray("sourceRefs").add("e2").add("e3");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
    obligation.put("scopeIntent", "infobox for C++");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isTrue();
    obligation.put("operationKind", "click");
    assertThat(GuidedGates.scopeSatisfied(obligation, facts, target)).isFalse();
  }
}
