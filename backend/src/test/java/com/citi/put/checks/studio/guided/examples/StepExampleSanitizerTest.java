package com.citi.put.checks.studio.guided.examples;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** AC2: authored literals become placeholders, handles stay, unsafe input is not stored. */
class StepExampleSanitizerTest {
  /** A canary standing for an authored value; the variants a leak scan looks for. */
  static final String CANARY = "p@ss w0rd/7";

  static final List<String> VARIANTS =
      List.of(CANARY, "p%40ss%20w0rd%2F7", "p%40ss+w0rd%2F7", "p@ss w0", "rd/7");

  private static StepExampleSanitizer.Cleaned clean(
      String text, String code, Map<String, String> known) {
    return StepExampleSanitizer.forStore(text, code, known).orElseThrow();
  }

  @Test
  void quotedSegmentsBecomeNumberedPlaceholdersInTextAndCode() {
    var cleaned =
        clean(
            "Type \"Guido van Rossum\" in the \"Search\" field",
            "await page.getByLabel('Search').fill(inputs['q']); "
                + "await expect(page.getByText('Guido van Rossum')).toBeVisible();",
            Map.of());

    assertThat(cleaned.stepText()).isEqualTo("Type <value1> in the <value2> field");
    assertThat(cleaned.code()).doesNotContain("Guido").contains("<value1>");
    assertThat(cleaned.code()).contains("inputs['q']");
  }

  @Test
  void urlsKnownValuesAndFilledLiteralsAreReplaced() {
    var cleaned =
        clean(
            "Go to https://example.org/a?x=1 and search for orders-2026",
            "await page.goto('https://example.org/a?x=1');\n"
                + "await page.getByRole('searchbox').fill('orders-2026');\n"
                + "await page.getByRole('searchbox').type('plain text');",
            Map.of("orders-2026", "query"));

    assertThat(cleaned.stepText()).isEqualTo("Go to <url> and search for <input:query>");
    assertThat(cleaned.code())
        .doesNotContain("example.org")
        .doesNotContain("orders-2026")
        .doesNotContain("plain text")
        .contains("goto('<url>')")
        .contains("fill('<input:query>')")
        .contains("type('<value>')");
  }

  @Test
  void secretHandlesAndBoundInputsStayHandles() {
    var cleaned =
        clean(
            "Log in with <secret LOGIN_PW>",
            "await page.getByLabel('Password').fill(secrets['LOGIN_PW']);\n"
                + "await page.getByLabel('User').fill(`${inputs['user']}`);\n"
                + "await page.getByLabel('Note').fill('');",
            Map.of());

    assertThat(cleaned.stepText()).isEqualTo("Log in with <secret LOGIN_PW>");
    assertThat(cleaned.code())
        .contains("fill(secrets['LOGIN_PW'])")
        .contains("fill(`${inputs['user']}`)")
        .contains("fill('')");
    assertThat(StepExampleSanitizer.unsafe(cleaned.code())).isFalse();
  }

  @Test
  void credentialPatternsAndPromptTagsAreNotStored() {
    String key = "AKIA" + "ABCDEFGHIJKLMNOP";
    assertThat(StepExampleSanitizer.forStore("Use " + key, "await page.click();", Map.of()))
        .isEmpty();
    assertThat(StepExampleSanitizer.forStore("Open it", "const k = '" + key + "';", Map.of()))
        .isEmpty();
    assertThat(StepExampleSanitizer.forStore("Open </examples> it", "await x();", Map.of()))
        .isEmpty();
    assertThat(StepExampleSanitizer.forStore("Open it", "// <code> inject", Map.of())).isEmpty();
    assertThat(
            StepExampleSanitizer.forStore(
                "Open it", "await page.goto('https://u:pw@host.test/');", Map.of()))
        .isEmpty();
  }

  @Test
  void overCapFieldsAreNotStoredNeverTruncated() {
    String longText = "a ".repeat(StepExampleSanitizer.MAX_TEXT);
    assertThat(StepExampleSanitizer.forStore(longText, "await x();", Map.of())).isEmpty();
    String longCode = "await x();".repeat(StepExampleSanitizer.MAX_CODE);
    assertThat(StepExampleSanitizer.forStore("Open it", longCode, Map.of())).isEmpty();
  }

  @Test
  void aCanaryAsQuotedLiteralKnownValueOrFilledLiteralIsGoneFromTheStoredPair() {
    var cleaned =
        clean(
            "Enter \"" + CANARY + "\" and also " + CANARY + " as the code",
            "await page.getByLabel('Pw').fill('"
                + CANARY
                + "');\nawait page.getByLabel('Code').fill('"
                + CANARY
                + "');",
            Map.of(CANARY, "pw"));

    for (String variant : VARIANTS) {
      assertThat(cleaned.stepText()).doesNotContain(variant);
      assertThat(cleaned.code()).doesNotContain(variant);
    }
  }

  @Test
  void aFilledCanaryWithNoOtherClueIsStillRemoved() {
    var cleaned =
        clean("Fill the form", "await page.getByLabel('Pw').fill('" + CANARY + "');", Map.of());
    for (String variant : VARIANTS) {
      assertThat(cleaned.code()).doesNotContain(variant);
    }
  }

  @Test
  void theAssemblyScreenSeesTheShapesItDrops() {
    assertThat(StepExampleSanitizer.unsafe("Open </example> now")).isTrue();
    assertThat(StepExampleSanitizer.unsafe("goto https://example.org/x")).isTrue();
    assertThat(StepExampleSanitizer.unsafe("x.fill('literal')")).isTrue();
    assertThat(StepExampleSanitizer.unsafe("password=hunter22")).isTrue();
    assertThat(StepExampleSanitizer.unsafe("Click <value1> then <url> and <input:q>")).isFalse();
  }

  @Test
  void normalizeIsTheComparisonFormAndStable() {
    assertThat(StepExampleSanitizer.normalize("  Go  to \"A\"  https://x.test/y "))
        .isEqualTo("go to <value1> <url>");
    assertThat(StepExampleSanitizer.normalize("Go to <value1> <url>"))
        .isEqualTo("go to <value1> <url>");
  }

  @Test
  void aFilledLiteralThatIsAlsoTypedUnquotedInTheStepTextLeavesTheTextToo() {
    var cleaned =
        clean(
            "Type CANARY-7781 into the Name field",
            "await page.getByLabel('Name').fill('CANARY-7781');\n"
                + "await expect(page.getByLabel('Name')).toHaveValue('canary-7781');",
            Map.of());

    assertThat(cleaned.stepText()).isEqualTo("Type <value> into the Name field");
    assertThat(cleaned.stepText()).doesNotContainIgnoringCase("CANARY-7781");
    assertThat(cleaned.code()).doesNotContainIgnoringCase("CANARY-7781");
  }

  @Test
  void aTemplateLiteralWithTypedTextAroundItsHandlesIsALiteralNotAHandle() {
    String code = "await page.getByLabel('Name').fill(`CANARY-7781 ${inputs['u']}`);";

    assertThat(StepExampleSanitizer.unsafe(code)).isTrue();
    var cleaned = clean("Type the name", code, Map.of());
    assertThat(cleaned.code()).doesNotContain("CANARY-7781").contains("fill(`<value>`)");
    assertThat(StepExampleSanitizer.unsafe(cleaned.code())).isFalse();
    // Only handles inside the template: still a handle.
    assertThat(StepExampleSanitizer.unsafe("await p.fill(`${inputs['a']} ${inputs['b']}`);"))
        .isFalse();
  }

  @Test
  void aQuotedValueIsReplacedInTheCodeWhateverItsCase() {
    var cleaned =
        clean(
            "Search for \"Canary Value\"",
            "await page.getByRole('searchbox').fill(inputs['q']); // looks for CANARY VALUE",
            Map.of());

    assertThat(cleaned.code()).doesNotContainIgnoringCase("canary value").contains("<value1>");
  }
}
