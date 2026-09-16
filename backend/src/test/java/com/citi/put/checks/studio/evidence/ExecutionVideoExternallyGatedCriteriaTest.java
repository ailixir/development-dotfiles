package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Story 10.15 AC-18b, AC-19b, AC-20 — the two blocked halves, recorded as <b>live skips, never as
 * passes</b>, and the two gate-still-shut assertions that cannot stay green past their gates.
 *
 * <p><b>Two external dependencies gate this story, not one.</b> The brief named `ED-06`; the
 * manifest's own {@code gates:} list for `ED-03` names 10.15 by id and SPK-03 gates <i>"10.15
 * streaming from Sonic"</i>. Both are honoured.
 *
 * <p><b>This class is deliberately not Spring-annotated.</b> Every assertion below reads files, so
 * none of it is conditional on Docker. Story 10.18a's QA gate found a deployment tier reporting
 * <i>1 passed, 89 skipped</i> as green because its blocked halves could not self-arm and its
 * passing halves were environment-conditional; the gate-still-shut assertions are the half that
 * must run everywhere, so they run here. The one assertion that genuinely needs a context — that
 * the injected store bean is the fake — is {@code ExecutionVideoStoreBindingIT}, and it is named
 * here so it cannot go missing.
 */
class ExecutionVideoExternallyGatedCriteriaTest {

  private static final Path MANIFEST = Path.of("..", "docs", "epics", "EPIC-10-EXECUTION.yaml");

  // ── the blocked halves ───────────────────────────────────────────────────

  @Test
  @Disabled(
      "AC-18b — BLOCKED on ED-03 (status: open). Spike SPK-03; integration owner 10.18, integrated "
          + "proof 10.19. The same ranged reads against REAL Sonic: a ranged GET transcript against "
          + "the real bucket; the API credentials proven read-only by a RECORDED DENIAL of a PUT; "
          + "and the observed lag between lifecycle expiry and physical deletion, with a GET on a "
          + "logically expired object recorded as either failing or still serving — which is the "
          + "fact architecture §6.2 forbids assuming. None of it is decidable against the in-memory "
          + "fake this story ships. SKIPPED, NOT PASSED.")
  @DisplayName("AC-18b — ranged reads against real Sonic (ED-03 / SPK-03 / 10.18 / 10.19)")
  void ac18bRealSonicReads() {
    throw new AssertionError("blocked on ED-03");
  }

  @Test
  @Disabled(
      "AC-19b — BLOCKED on ED-06 (status: open). Spike SPK-02; deployment owner 10.18, integrated "
          + "proof 10.19. The route through the ACTUAL ingress: a real browser on the staging hosts "
          + "in standalone and federated mode, <video> Range requests returning 206 with a valid "
          + "Content-Range, a 416, and ?download=true delivering an attachment; and 401/403 returned "
          + "THROUGH THE INGRESS for absent identity, forged identity headers, wrong CSI and revoked "
          + "access, WITHOUT falling back to a bypass. On this branch the ED-02 identity bypass "
          + "makes the absolute half unobservable — a request with no headers is answered with an "
          + "admin identity — which is why AC-1 and AC-4 are written comparatively. Evidence is "
          + "SPK-02's HAR captures under docs/qa/spikes/SPK-02/. SKIPPED, NOT PASSED.")
  @DisplayName("AC-19b — the media route through the real ingress (ED-06 / SPK-02 / 10.18 / 10.19)")
  void ac19bRealIngress() {
    throw new AssertionError("blocked on ED-06");
  }

  // ── AC-20: the gates are still shut, and this asserts it ─────────────────

  @Test
  void theEd03StorageGateIsStillShutWhichIsWhyAc18bIsSkipped() throws IOException {
    assertGateOpen("ED-03", "AC-18b");
  }

  @Test
  void theEd06IngressGateIsStillShutWhichIsWhyAc19bIsSkipped() throws IOException {
    assertGateOpen("ED-06", "AC-19b");
  }

  /**
   * Reads one dependency's {@code status} and insists it is still {@code open}.
   *
   * <p>When the gate closes this goes red <b>in a run</b>, rather than in a document nobody
   * re-reads, and the skip above it must be reviewed instead of left in place.
   */
  private void assertGateOpen(String dependencyId, String criterion) throws IOException {
    String status = statusOf(MANIFEST, dependencyId);

    assertThat(status)
        .as(
            "%s reads `status: %s` in %s.%n"
                + "  If that says `closed`, the gate MOVED and %s must be re-run for real rather "
                + "than left skipped.%n"
                + "  If it says anything else, or is null, then THIS FILE WAS NOT CHANGED BY A CODE "
                + "EDIT — the epic manifest is @pm's file, and an @pm edit to that block reddens "
                + "this story without touching a line of its subject. That is a FOC-class finding "
                + "to raise, NOT a test to adjust.",
            dependencyId, status, MANIFEST, criterion)
        .isEqualTo("open");
  }

  /**
   * The non-vacuity control @po marked <b>not cuttable</b>.
   *
   * <p>Without it, {@link #assertGateOpen} is a parser that always says {@code open}: a reader that
   * stopped finding the key, or that matched the wrong block, would satisfy every assertion above.
   * The same reader is pointed at a scratch copy whose two statuses read {@code closed} and must
   * report exactly that.
   */
  @Test
  void theGateReaderIsShownSayingClosed() throws IOException {
    String manifest = Files.readString(MANIFEST, StandardCharsets.UTF_8);
    Path scratch = Files.createTempFile("epic-manifest-scratch", ".yaml");
    scratch.toFile().deleteOnExit();
    Files.writeString(scratch, manifest.replace("status: open", "status: closed"));

    assertThat(statusOf(scratch, "ED-03"))
        .as("the reader cannot report a closed ED-03, so 'open' above means nothing")
        .isEqualTo("closed");
    assertThat(statusOf(scratch, "ED-06"))
        .as("the reader cannot report a closed ED-06, so 'open' above means nothing")
        .isEqualTo("closed");
  }

  /**
   * And the reader keys on the <b>id</b>, not on position: asked for a neighbour it returns the
   * neighbour's value, so a block that moved would be noticed rather than silently mis-read.
   */
  @Test
  void theGateReaderResolvesByIdRatherThanByPosition() throws IOException {
    String manifest = Files.readString(MANIFEST, StandardCharsets.UTF_8);
    Path scratch = Files.createTempFile("epic-manifest-scratch", ".yaml");
    scratch.toFile().deleteOnExit();
    // Only ED-06's status is changed. A positional reader would report the wrong block.
    Files.writeString(
        scratch, manifest.replaceFirst("(?s)(- id: ED-06.*?)status: open", "$1status: closed"));

    assertThat(statusOf(scratch, "ED-06")).isEqualTo("closed");
    assertThat(statusOf(scratch, "ED-03"))
        .as("changing ED-06 must not change what the reader says about ED-03")
        .isEqualTo("open");
  }

  /**
   * The status of one external dependency, located by its {@code id} and read by the {@code status}
   * key's name — never by line offset, never by surrounding prose, never by a digest.
   */
  private static String statusOf(Path manifest, String dependencyId) throws IOException {
    String text = Files.readString(manifest, StandardCharsets.UTF_8);
    Matcher entry =
        Pattern.compile(
                "(?m)^\\s*-\\s+id:\\s*"
                    + Pattern.quote(dependencyId)
                    + "[ \\t]*$(?<body>.*?)"
                    + "(?=^\\s*-\\s+id:\\s|\\z)",
                Pattern.DOTALL)
            .matcher(text);
    if (!entry.find()) {
      return null;
    }
    Matcher status =
        Pattern.compile("(?m)^\\s*status:\\s*(?<value>[A-Za-z-]+)\\s*$")
            .matcher(entry.group("body"));
    return status.find() ? status.group("value") : null;
  }
}
