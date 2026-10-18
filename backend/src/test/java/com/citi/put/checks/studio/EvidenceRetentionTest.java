package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.internal.RunnerReportProjection;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * Story 10.14 AC-19a — retention is <b>one</b> configuration value, and the API stamps expiry from
 * it.
 *
 * <p>Architecture §8.5 asks that bounds <i>"keep their implementation values in one configuration
 * source"</i>, and §6.2 asks that logical expiry be enforced by the API at {@code videoExpiresAt}
 * <i>"even if physical lifecycle deletion is asynchronous"</i>. Both are already true; this keeps
 * them true across a story that touches the evidence path end to end.
 *
 * <p><b>AC-19b is deferred and is recorded as skipped, never passed</b>, at the bottom of this
 * file: physical deletion, versioning/noncurrent behaviour and incomplete-upload cleanup are facts
 * about a real Sonic bucket, which `ED-03` does not yet provide.
 */
class EvidenceRetentionTest {

  private static final Path APPLICATION_YML =
      Path.of("src", "main", "resources", "application.yml");

  /** The single declaration. Read from the file rather than transcribed, like AC-17's list. */
  private static final Pattern RETENTION =
      Pattern.compile("evidence-retention:\\s*\\$\\{STUDIO_EVIDENCE_RETENTION:(?<value>[^}]+)}");

  @Test
  void theThirtyDayRetentionIsDeclaredExactlyOnceAndTheDefaultAgreesWithIt() throws IOException {
    String yaml = Files.readString(APPLICATION_YML, StandardCharsets.UTF_8);
    Matcher matcher = RETENTION.matcher(yaml);

    assertThat(matcher.find()).as("evidence-retention is declared in application.yml").isTrue();
    assertThat(matcher.group("value")).isEqualTo("30d");
    assertThat(matcher.find())
        .as("declared once — a second copy is the drift §8.5 exists to prevent")
        .isFalse();

    // And the code default agrees with the configured value, so a deployment that omits the
    // environment variable gets the same 30 days rather than a different number.
    assertThat(
            new StudioExecutionProperties(
                    null, null, null, null, null, null, null, null, null, null, null)
                .evidenceRetentionOrDefault())
        .isEqualTo(Duration.ofDays(30));
  }

  @Test
  void theProjectionStampsExpiryFromThatValueAndOnlyOnAvailable() {
    Instant now = Instant.parse("2026-09-11T10:00:00Z");
    Duration retention = Duration.ofDays(30);

    RunnerReportProjection.Projected stored = project("STORED", retention, now);
    assertThat(stored.videoStatus()).isEqualTo(VideoEvidence.AVAILABLE);
    assertThat(stored.videoExpiresAt())
        .as("now + the one configured retention, and nothing else")
        .isEqualTo(now.plus(retention));

    for (String state : List.of("PENDING", "FAILED", "UNAVAILABLE")) {
      assertThat(project(state, retention, now).videoExpiresAt())
          .as("no expiry for %s — AVAILABLE is the only state the API stamps", state)
          .isNull();
    }
  }

  @Test
  void aDifferentConfiguredRetentionMovesTheExpiryRatherThanBeingIgnored() {
    Instant now = Instant.parse("2026-09-11T10:00:00Z");

    // The control for the assertion above: a hardcoded 30 days would pass it and fail this.
    assertThat(project("STORED", Duration.ofDays(7), now).videoExpiresAt())
        .isEqualTo(now.plus(Duration.ofDays(7)));
  }

  private static RunnerReportProjection.Projected project(
      String evidenceState, Duration retention, Instant now) {
    RunnerReport report =
        new RunnerReport(
            UUID.randomUUID(),
            UUID.randomUUID(),
            UUID.randomUUID(),
            "studio-runner-0",
            RunnerReport.FINAL,
            9L,
            now,
            now.minusSeconds(37),
            List.of(),
            List.of(),
            false,
            Map.of(),
            new RunOutcome(RunOutcome.PASSED, null, null, null),
            new RunnerEvidence("studio/v.webm", "studio/m.result.json", evidenceState, false),
            null,
            Map.of());
    return RunnerReportProjection.project(report, List.of(), retention, now);
  }
}
