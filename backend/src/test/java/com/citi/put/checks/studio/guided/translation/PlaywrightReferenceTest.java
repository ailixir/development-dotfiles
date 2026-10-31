package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The generated Playwright reference and its hint-only section selection (ADR-SC-008 D6). */
class PlaywrightReferenceTest {
  private static final PlaywrightReference REFERENCE = PlaywrightReference.load();

  @Test
  void theReferenceHashIsTheSha256OfTheResourceBytes() throws Exception {
    byte[] bytes;
    try (var in = getClass().getResourceAsStream("/studio/playwright-reference/reference.txt")) {
      bytes = in.readAllBytes();
    }
    assertThat(REFERENCE.referenceHash())
        .hasSize(64)
        .isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
    assertThat(PlaywrightReference.load().referenceHash()).isEqualTo(REFERENCE.referenceHash());
  }

  @Test
  void theCoreIsAlwaysLoadedAndTheSectionsFitTheirCaps() {
    List<String> ids = REFERENCE.sectionIds();
    assertThat(ids)
        .doesNotHaveDuplicates()
        .startsWith("core.locators", "core.actions", "core.assertions");
    int core = 0;
    for (String id : ids) {
      if (REFERENCE.isCore(id)) {
        core += REFERENCE.sectionBytes(id);
      } else {
        assertThat(REFERENCE.sectionBytes(id)).as(id).isLessThanOrEqualTo(4096);
      }
    }
    assertThat(core).isLessThanOrEqualTo(20480);
    String text = REFERENCE.select(List.of());
    assertThat(text)
        .contains(
            "locator.click(", "locator.fill(", "page.getByRole(", "expect(locator).toHaveText(")
        .doesNotContain("locator.evaluate(", "page.waitForEvent(");
    ids.stream()
        .filter(id -> !REFERENCE.isCore(id))
        .forEach(id -> assertThat(REFERENCE.index()).contains(id + " (extended)"));
  }

  @Test
  void aPickIsAHintThatNeverThrowsAndAlwaysGivesTheSameBytes() {
    String script = REFERENCE.select(List.of("script", "waits"));
    assertThat(script).contains("locator.evaluate(", "page.waitForEvent(");
    assertThat(REFERENCE.select(List.of("waits", "script"))).as("file order").isEqualTo(script);
    // Unknown ids, core ids and duplicates are ignored and do not use up the four places.
    assertThat(REFERENCE.select(List.of("nope", "core.locators", "script", "script", "waits")))
        .isEqualTo(script);
    // Only the first four valid extended ids count.
    assertThat(
            REFERENCE.select(
                List.of("script", "waits", "frames", "network", "storage", "environment")))
        .isEqualTo(REFERENCE.select(List.of("script", "waits", "frames", "network")))
        .doesNotContain("context.cookies(");
    assertThat(REFERENCE.select(List.of("script", "waits"))).isEqualTo(script);
  }

  @Test
  void theRunIntegrityMembersAreNotOffered() {
    String everything =
        REFERENCE.select(
            REFERENCE.sectionIds().stream().filter(id -> !REFERENCE.isCore(id)).limit(4).toList());
    assertThat(everything)
        .doesNotContain(
            "page.video",
            "page.close(",
            "context.close(",
            "context.browser(",
            "context.newPage(",
            "context.newCDPSession(",
            "context.tracing");
    for (String id : REFERENCE.sectionIds()) {
      assertThat(REFERENCE.select(List.of(id)).getBytes(StandardCharsets.UTF_8).length)
          .isPositive();
    }
  }
}
