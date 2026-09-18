package com.citi.put.checks.studio.recovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;

/**
 * Studio v1 WP16 — the running reaper's cancel margin covers a healthy runner's whole cancel path.
 *
 * <p>Before WP16 the margin was {@code start-deadline} (30 s), while the runner's own bounds on the
 * same path add up to 82 s with the shipped values. A slow object store on a cancelled run could
 * therefore have its row closed by the reaper while the runner was still uploading, its {@code
 * FINAL} refused, and its recording lost from the row. These tests pin the three halves of the fix:
 * the margin is <b>derived</b> from the runner's bounds, an explicit margin is <b>validated</b>
 * against them at startup, and the values the backend assumes are <b>the runner's own</b>.
 */
class RunnerCancelBudgetTest {

  private static final Path RUNNER_CONFIG =
      Path.of("..", "studio-runner", "src", "server", "config.ts");
  private static final Path RUNNER_COORDINATOR =
      Path.of("..", "studio-runner", "src", "server", "runCoordinator.ts");

  // ── derived ───────────────────────────────────────────────────────────────

  @Test
  void theShippedMarginCoversTheRunnersWorstCaseAndTheOldMarginDidNot() throws IOException {
    RunnerCancelBudget shipped = shipped(Map.of());
    StudioExecutionProperties execution = shippedExecution();

    assertThat(shipped.worstCase())
        .as("2s poll + 2 x 10s read + 5s grace + 10s settle + 15s evidence + 30s delivery")
        .isEqualTo(Duration.ofSeconds(82));
    assertThat(shipped.effectiveMargin()).isEqualTo(Duration.ofSeconds(92));
    assertThat(execution.startDeadlineOrDefault())
        .as("the finding: the pre-WP16 margin was shorter than the path it was a backstop for")
        .isLessThan(shipped.worstCase());
  }

  @Test
  void theMarginMovesWithEveryRunnerBoundItIsDerivedFrom() throws IOException {
    Duration base = shipped(Map.of()).effectiveMargin();

    assertThat(shipped(Map.of("STUDIO_RUNNER_TERMINAL_DELIVERY_WINDOW_MS", "60000")))
        .extracting(RunnerCancelBudget::effectiveMargin)
        .isEqualTo(base.plusSeconds(30));
    assertThat(shipped(Map.of("STUDIO_RUNNER_OBJECT_STORE_WINDOW_MS", "45000")))
        .extracting(RunnerCancelBudget::effectiveMargin)
        .isEqualTo(base.plusSeconds(30));
    assertThat(shipped(Map.of("STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS", "8000")))
        .extracting(RunnerCancelBudget::effectiveMargin)
        .isEqualTo(base.plusSeconds(3));
    assertThat(shipped(Map.of("STUDIO_RUNNER_ADMISSION_TIMEOUT_MS", "20000")))
        .as("the read timeout counts three times: stale read, observing read, progress settle")
        .extracting(RunnerCancelBudget::effectiveMargin)
        .isEqualTo(base.plusSeconds(30));
  }

  // ── validated ─────────────────────────────────────────────────────────────

  @Test
  void anExplicitMarginShorterThanTheWorstCaseIsRefusedAndNamesEveryTerm() {
    assertThatThrownBy(() -> bind(Map.of("studio.execution.cancel.margin", "30s")))
        .rootCause()
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("margin (PT30S)")
        .hasMessageContaining("PT1M22S")
        .hasMessageContaining("control-poll-interval")
        .hasMessageContaining("stop-grace")
        .hasMessageContaining("evidence-window")
        .hasMessageContaining("delivery-window");
  }

  @Test
  void anExplicitMarginIsCheckedAgainstTheConfiguredBoundsNotTheDefaults() {
    // 90 s covers the defaults (82 s) but not a 60 s delivery window (112 s).
    assertThat(bind(Map.of("studio.execution.cancel.margin", "90s")).effectiveMargin())
        .isEqualTo(Duration.ofSeconds(90));
    assertThatThrownBy(
            () ->
                bind(
                    Map.of(
                        "studio.execution.cancel.margin", "90s",
                        "studio.execution.cancel.delivery-window", "60s")))
        .rootCause()
        .hasMessageContaining("PT1M52S");
  }

  @Test
  void anExplicitMarginAtLeastTheWorstCaseIsUsedAsIs() {
    assertThat(bind(Map.of("studio.execution.cancel.margin", "82s")).effectiveMargin())
        .isEqualTo(Duration.ofSeconds(82));
    assertThat(bind(Map.of("studio.execution.cancel.margin", "5m")).effectiveMargin())
        .isEqualTo(Duration.ofMinutes(5));
  }

  @Test
  void aTooShortMarginStopsTheApplicationFromStarting() {
    new ApplicationContextRunner()
        .withUserConfiguration(BudgetOnly.class)
        .withPropertyValues("studio.execution.cancel.margin=30s")
        .run(context -> assertThat(context).hasFailed());
    new ApplicationContextRunner()
        .withUserConfiguration(BudgetOnly.class)
        .withPropertyValues("studio.execution.cancel.margin=120s")
        .run(context -> assertThat(context).hasNotFailed());
  }

  @Test
  void nonPositiveBoundsAreRefused() {
    assertThatThrownBy(() -> bind(Map.of("studio.execution.cancel.stop-grace", "0s")))
        .rootCause()
        .hasMessageContaining("stop-grace must be positive");
    assertThatThrownBy(() -> bind(Map.of("studio.execution.cancel.slack", "-1s")))
        .rootCause()
        .hasMessageContaining("slack must not be negative");
  }

  // ── the reaper uses it ────────────────────────────────────────────────────

  @Test
  void theReaperLooksForCancelsOlderThanTheMarginNotTheStartDeadline() {
    StudioDispatchLedgerStatements statements = mock(StudioDispatchLedgerStatements.class);
    Instant now = Instant.parse("2026-09-18T12:00:00Z");
    RunningReaper reaper =
        new RunningReaper(
            statements,
            mock(FinalizationReconciler.class),
            new Binder(new MapConfigurationPropertySource(Map.of()))
                .bindOrCreate("studio.execution", StudioExecutionProperties.class),
            RunnerCancelBudget.defaults(),
            Clock.fixed(now, ZoneOffset.UTC));

    reaper.reapOnce();

    assertThat(reaper.cancelMargin()).isEqualTo(Duration.ofSeconds(92));
    verify(statements).findUnfinishedCancels(eq(now.minusSeconds(92)), anyInt());
  }

  // ── the runner's own ──────────────────────────────────────────────────────

  /**
   * The defaults this backend assumes are the defaults the runner ships.
   *
   * <p>Read from the runner's source, on the {@code RunnerPinDriftTest} pattern: a runner that
   * lengthens its delivery window without this file noticing would re-open the race silently.
   */
  @Test
  void theShippedBudgetEqualsTheRunnersOwnDefaults() throws IOException {
    RunnerCancelBudget shipped = shipped(Map.of());

    assertThat(shipped.controlPollIntervalOrDefault().toMillis())
        .as("CONTROL_POLL_INTERVAL_MS in %s", RUNNER_COORDINATOR)
        .isEqualTo(runnerConstant("CONTROL_POLL_INTERVAL_MS"));
    assertThat(shipped.reportTimeoutOrDefault().toMillis())
        .as("ADMISSION_TIMEOUT_MS (the runner's reportTimeoutMs) in %s", RUNNER_CONFIG)
        .isEqualTo(runnerFallback("ADMISSION_TIMEOUT_MS"));
    assertThat(shipped.stopGraceOrDefault().toMillis())
        .isEqualTo(runnerFallback("BROWSER_STOP_TIMEOUT_MS"));
    assertThat(shipped.evidenceWindowOrDefault().toMillis())
        .isEqualTo(runnerFallback("OBJECT_STORE_WINDOW_MS"));
    assertThat(shipped.deliveryWindowOrDefault().toMillis())
        .isEqualTo(runnerFallback("TERMINAL_DELIVERY_WINDOW_MS"));
    assertThat(RunnerCancelBudget.defaults().worstCase())
        .as("the record's own defaults agree with application.yml's")
        .isEqualTo(shipped.worstCase());
  }

  @Test
  void theReportTimeoutTheBudgetAssumesIsTheOneTheRunnerUsesForControlAndProgress()
      throws IOException {
    String application =
        Files.readString(
            Path.of("..", "studio-runner", "src", "server", "application.ts"),
            StandardCharsets.UTF_8);

    assertThat(application)
        .as(
            "the budget counts STUDIO_RUNNER_ADMISSION_TIMEOUT_MS as the control/progress timeout;"
                + " if the runner stops wiring it that way, the budget is measuring the wrong knob")
        .containsPattern("reportTimeoutMs:\\s*config\\.admissionTimeoutMs");
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  @Configuration
  @EnableConfigurationProperties(RunnerCancelBudget.class)
  static class BudgetOnly {}

  private static RunnerCancelBudget bind(Map<String, String> properties) {
    return new Binder(new MapConfigurationPropertySource(properties))
        .bindOrCreate("studio.execution.cancel", RunnerCancelBudget.class);
  }

  /** {@code application.yml} as shipped, with {@code overrides} standing in for the environment. */
  private static Binder shippedBinder(Map<String, String> overrides) throws IOException {
    StandardEnvironment environment = new StandardEnvironment();
    environment
        .getPropertySources()
        .remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
    environment
        .getPropertySources()
        .remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
    environment
        .getPropertySources()
        .addFirst(
            new org.springframework.core.env.MapPropertySource("overrides", Map.copyOf(overrides)));
    new YamlPropertySourceLoader()
        .load(
            "application.yml",
            new FileSystemResource(Path.of("src", "main", "resources", "application.yml")))
        .forEach(source -> environment.getPropertySources().addLast(source));
    return Binder.get(environment);
  }

  private static RunnerCancelBudget shipped(Map<String, String> overrides) throws IOException {
    return shippedBinder(overrides)
        .bindOrCreate("studio.execution.cancel", RunnerCancelBudget.class);
  }

  private static StudioExecutionProperties shippedExecution() throws IOException {
    return shippedBinder(Map.of())
        .bindOrCreate("studio.execution", StudioExecutionProperties.class);
  }

  private static long runnerFallback(String key) throws IOException {
    String source = Files.readString(RUNNER_CONFIG, StandardCharsets.UTF_8);
    Matcher matcher =
        Pattern.compile("\\b" + key + ":\\s*\\{[^}]*?fallback:\\s*([0-9_]+)", Pattern.DOTALL)
            .matcher(source);
    assertThat(matcher.find())
        .as("%s declares %s with a numeric fallback", RUNNER_CONFIG, key)
        .isTrue();
    return Long.parseLong(matcher.group(1).replace("_", ""));
  }

  private static long runnerConstant(String name) throws IOException {
    String source = Files.readString(RUNNER_COORDINATOR, StandardCharsets.UTF_8);
    Matcher matcher =
        Pattern.compile("export const " + name + "\\s*=\\s*([0-9_]+)").matcher(source);
    assertThat(matcher.find()).as("%s exports %s", RUNNER_COORDINATOR, name).isTrue();
    return Long.parseLong(matcher.group(1).replace("_", ""));
  }
}
