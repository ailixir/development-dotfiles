package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007: the single reader of the outline string. The shown refs must equal the keys of the
 * facts table, on real runner output and on the hostile shapes a name can take.
 */
class GuidedOutlineTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final Path BASELINE =
      Path.of("../studio-runner/test/fixtures/perception-parity/baseline.json");
  private static final String BASELINE_SHA256 =
      "d39c2ebe49a6457cfa7305ca50197445a29a28b347d86bb90845c48acd2c305a";

  /**
   * 24 pages, two passes each (plain and with private values), recorded by the WI-2 runner: the
   * refs the outline shows are exactly the facts keys and the stored shownRefs.
   */
  @Test
  void shownRefsEqualFactsKeysOnTheFortyEightRecordedOutputs() throws Exception {
    assertThat(
            HexFormat.of()
                .formatHex(
                    MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(BASELINE))))
        .as("the committed baseline is the one this conformance test was written against")
        .isEqualTo(BASELINE_SHA256);
    JsonNode baseline = C.parse(Files.readString(BASELINE));
    int outputs = 0;
    for (var page : baseline.path("pages").properties()) {
      for (var pass : page.getValue().path("passes").properties()) {
        JsonNode output = pass.getValue();
        List<String> keys = new ArrayList<>();
        output.path("facts").fieldNames().forEachRemaining(keys::add);
        String where = page.getKey() + "/" + pass.getKey();
        assertThat(GuidedOutline.shownRefs(output.path("outline").asText()))
            .as(where)
            .containsExactlyInAnyOrderElementsOf(keys);
        List<String> stored = new ArrayList<>();
        output.path("shownRefs").forEach(ref -> stored.add(ref.asText()));
        assertThat(GuidedOutline.shownRefs(output.path("outline").asText()))
            .as(where + " stored shownRefs")
            .containsExactlyInAnyOrderElementsOf(stored);
        outputs++;
      }
    }
    assertThat(outputs).isEqualTo(48);
  }

  @Test
  void aLineIsParsedIntoItsIndentRoleNameRefAndTheRest() {
    var lines =
        GuidedOutline.parse(
            "- document\n  - main\n    - link \"More information\" [e6] {url=\"more\"}\n"
                + "    - text \"A sentence.\" [e7]");
    assertThat(lines).hasSize(4);
    assertThat(lines.get(2).indent()).isEqualTo(2);
    assertThat(lines.get(2).role()).isEqualTo("link");
    assertThat(lines.get(2).name()).isEqualTo("More information");
    assertThat(lines.get(2).ref()).isEqualTo("e6");
    assertThat(lines.get(2).rest()).isEqualTo(" {url=\"more\"}");
    assertThat(lines.get(3).role()).isEqualTo("text");
    assertThat(lines.get(0).ref()).isNull();
    assertThat(lines.get(0).name()).isNull();
  }

  @Test
  void aNameThatContainsARefLookalikeIsPartOfTheNameAndNeverARef() {
    String outline = "- button \"Press [e9] now\" [e1]\n- button \"Say \\\"[e5]\\\" aloud\" [e2]";
    assertThat(GuidedOutline.shownRefs(outline)).containsExactly("e1", "e2");
    var lines = GuidedOutline.parse(outline);
    assertThat(lines.get(0).name()).isEqualTo("Press [e9] now");
    assertThat(lines.get(1).name()).isEqualTo("Say \"[e5]\" aloud");
  }

  @Test
  void unicodeNamesAndEveryBoundedSuffixAreParsed() {
    String outline =
        "- link \"Wörter 日本語 🧪\" [e3] {url=\"/a\"} {near=\"Über\"} {in=\"Menü\"} {selected}\n"
            + "- textbox \"\" [e4] {placeholder=\"Suche\"}";
    var lines = GuidedOutline.parse(outline);
    assertThat(lines.get(0).name()).isEqualTo("Wörter 日本語 🧪");
    assertThat(lines.get(0).ref()).isEqualTo("e3");
    assertThat(lines.get(0).rest()).contains("{near=\"Über\"}").contains("{selected}");
    assertThat(lines.get(1).name()).isEmpty();
    assertThat(lines.get(1).ref()).isEqualTo("e4");
  }

  @Test
  void lineWithoutARefAreWithheldPasswordUnsupportedAndTheMoreMarkers() {
    String outline =
        "- document\n  - passwordControl\n  - withheld\n  - generic {unsupported surface}\n"
            + "  - combobox \"Country\" [e2]\n    - option \"A\"\n    … 3 more options\n"
            + "… 12 more nodes not shown";
    assertThat(GuidedOutline.shownRefs(outline)).containsExactly("e2");
    assertThat(GuidedOutline.parse(outline))
        .extracting(GuidedOutline.Line::role)
        .doesNotContain("…");
  }

  @Test
  void aSevenDigitRefIsNotARef() {
    assertThat(GuidedOutline.shownRefs("- button \"x\" [e1234567]\n- button \"y\" [e123456]"))
        .containsExactly("e123456");
  }

  @Test
  void anObservationIsConsistentWhenItsFactsAreExactlyTheShownRefs() {
    ObjectNode observation =
        observation("- button \"Save\" [e1]\n- button \"Home\" [e2]", "e1", "e2");
    GuidedOutline.requireConsistent(observation);
  }

  @Test
  void aFactWithNoOutlineLineOrAnOutlineRefWithNoFactIsRefusedAsAnInvalidContract() {
    for (ObjectNode bad :
        List.of(
            observation("- button \"Save\" [e1]", "e1", "e2"),
            observation("- button \"Save\" [e1]\n- button \"Home\" [e2]", "e1"),
            observation("- button \"Save\" [e1]", "e9"))) {
      assertThatThrownBy(() -> GuidedOutline.requireConsistent(bad))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              refusal -> {
                assertThat(refusal.getMessage()).isEqualTo("INVALID_CONTRACT");
                assertThat(refusal.status()).isEqualTo(422);
              });
    }
    ObjectNode notText = C.object();
    notText.putObject("facts");
    notText.put("outline", 4);
    assertThatThrownBy(() -> GuidedOutline.requireConsistent(notText))
        .isInstanceOf(GuidedSessionException.class);
    assertThat(
            new LinkedHashSet<>(
                GuidedOutline.shownRefs("- button \"a\" [e1]\n- button \"b\" [e1]")))
        .as("a ref shown twice is one ref")
        .hasSize(1);
  }

  private static ObjectNode observation(String outline, String... refs) {
    ObjectNode observation = C.object();
    observation.put("outline", outline);
    ObjectNode facts = observation.putObject("facts");
    for (String ref : refs) {
      facts
          .putObject(ref)
          .put("role", "button")
          .put("name", "n" + ref)
          .put("editable", false)
          .put("evidence", "n" + ref)
          .putArray("evidenceSegments");
    }
    return observation;
  }
}
