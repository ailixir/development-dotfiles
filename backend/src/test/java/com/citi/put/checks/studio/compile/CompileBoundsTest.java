package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.compile.validator.RunnerDiagnostic;
import com.citi.put.checks.studio.compile.validator.ValidationOutcome;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/**
 * Story 10.8 AC-6, AC-15, AC-17, AC-18, AC-19 — the bounds table, one test per row.
 *
 * <p>AC-19 is the criterion these serve: every bound has a named behaviour <em>at</em> the bound,
 * and no bound is enforced only by a comment. Each case here drives the input past the bound and
 * asserts the stated outcome, and — because "at the bound" is the half that rots first — also
 * asserts that exactly the bound is still accepted. A cap that silently became an off-by-one is a
 * cap nobody can reason about.
 */
class CompileBoundsTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final StudioCompileProperties properties =
      new StudioCompileProperties(
          new StudioCompileProperties.Pipeline(2, Duration.ofMillis(250)),
          new StudioCompileProperties.Authoring(100, 1024, 65536),
          new StudioCompileProperties.Diagnostics(10, 400, 120, 4096),
          new StudioCompileProperties.Repair(2),
          new StudioCompileProperties.Sweep(true, Duration.ofSeconds(600), 200, 60_000L));

  private final AuthoringLimits limits = new AuthoringLimits(properties);

  /** The budget handler the admission cases do not exercise. */
  private static final Runnable NO_BUDGET_HANDLER = CompileBoundsTest::doNothing;

  /** An attempt that does no work: these cases assert admission, not the attempt body. */
  private static final CompileExecutor.AttemptBody NO_WORK = settlement -> doNothing();

  private static void doNothing() {
    // Intentionally empty.
  }

  // ── AC-6: steps per draft ─────────────────────────────────────────────────

  @Test
  void exactlyTheStepCapIsAcceptedAndOneMoreIsRejected() {
    assertThatCode(() -> limits.requireWithinLimits(lines(100, "Go home")))
        .doesNotThrowAnyException();

    assertThatThrownBy(() -> limits.requireWithinLimits(lines(101, "Go home")))
        .isInstanceOf(StudioValidationException.class)
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo(AuthoringLimits.TOO_MANY_STEPS);
  }

  // ── AC-6: characters per source line ──────────────────────────────────────

  @Test
  void exactlyTheLineCapIsAcceptedAndOneMoreIsRejected() {
    assertThatCode(() -> limits.requireWithinLimits(List.of("x".repeat(1024))))
        .doesNotThrowAnyException();

    assertThatThrownBy(() -> limits.requireWithinLimits(List.of("x".repeat(1025))))
        .isInstanceOf(StudioValidationException.class)
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo(AuthoringLimits.LINE_TOO_LONG);
  }

  @Test
  void theLineRejectionNamesTheStepAndNeverEchoesTheLine() {
    String line = "secret-looking-text-" + "y".repeat(1100);

    assertThatThrownBy(() -> limits.requireWithinLimits(List.of("ok", line)))
        .hasMessageContaining("Step 2")
        .hasMessageNotContaining("secret-looking-text");
  }

  // ── AC-6: total source bytes ──────────────────────────────────────────────

  @Test
  void exactlyTheSourceByteCapIsAcceptedAndOneMoreByteIsRejected() {
    List<String> atCap = sourceOfExactly(65536);
    assertThat(AuthoringLimits.totalSourceBytes(atCap)).isEqualTo(65536);
    assertThatCode(() -> limits.requireWithinLimits(atCap)).doesNotThrowAnyException();

    List<String> overCap = new ArrayList<>(sourceOfExactly(65536));
    overCap.set(0, overCap.get(0) + "x");
    assertThatThrownBy(() -> limits.requireWithinLimits(overCap))
        .isInstanceOf(StudioValidationException.class)
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo(AuthoringLimits.SOURCE_TOO_LARGE);
  }

  @Test
  void sourceBytesAreCountedInUtf8NotCharacters() {
    // A multi-byte character must cost what it costs on the wire, or the cap protects nothing.
    List<String> multiByte = List.of("é".repeat(100));

    assertThat(AuthoringLimits.totalSourceBytes(multiByte)).isEqualTo(200);
  }

  // ── AC-17: pipeline concurrency, no unbounded queue ───────────────────────

  @Test
  void saturationRefusesTheNextAttemptRatherThanQueueingIt() throws InterruptedException {
    CompileExecutor executor = new CompileExecutor(2, Duration.ofSeconds(30));
    CountDownLatch started = new CountDownLatch(2);
    CountDownLatch release = new CountDownLatch(1);
    try {
      for (int i = 0; i < 2; i++) {
        assertThat(
                executor.submit(
                    settlement -> {
                      started.countDown();
                      await(release);
                    },
                    NO_BUDGET_HANDLER))
            .isTrue();
      }
      assertThat(started.await(10, TimeUnit.SECONDS)).isTrue();

      long before = System.nanoTime();
      boolean accepted = executor.submit(NO_WORK, NO_BUDGET_HANDLER);
      long elapsedMs = (System.nanoTime() - before) / 1_000_000L;

      assertThat(accepted).as("attempt concurrency+1 must be refused, not queued").isFalse();
      assertThat(elapsedMs)
          .as("the submitting thread must not block waiting for a pool slot")
          .isLessThan(1_000L);
    } finally {
      release.countDown();
      executor.shutdown();
    }
  }

  // ── AC-18: per-attempt budget and the late result ─────────────────────────

  @Test
  void theBudgetExpiresTheAttemptAndTheLateResultPublishesNothing() throws InterruptedException {
    CompileExecutor executor = new CompileExecutor(1, Duration.ofMillis(150));
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch expired = new CountDownLatch(1);
    AtomicInteger publishedByWorker = new AtomicInteger();
    CountDownLatch workerDone = new CountDownLatch(1);
    try {
      executor.submit(
          settlement -> {
            await(release);
            if (settlement.claim()) {
              publishedByWorker.incrementAndGet();
            }
            workerDone.countDown();
          },
          expired::countDown);

      assertThat(expired.await(10, TimeUnit.SECONDS))
          .as("the budget must expire while the attempt is still blocked")
          .isTrue();

      // Release the stub *after* the budget expired: this is the late result.
      release.countDown();
      assertThat(workerDone.await(10, TimeUnit.SECONDS)).isTrue();

      assertThat(publishedByWorker.get())
          .as("a late result must be dropped in process, without calling any publish method")
          .isZero();
    } finally {
      release.countDown();
      executor.shutdown();
    }
  }

  @Test
  void exactlyOneOfTheBudgetAndTheWorkerEverSettlesAnAttempt() throws InterruptedException {
    // Raced deliberately: the budget and a fast worker both try to settle the same attempt.
    for (int round = 0; round < 50; round++) {
      CompileExecutor executor = new CompileExecutor(1, Duration.ofMillis(1));
      AtomicInteger settlements = new AtomicInteger();
      CountDownLatch done = new CountDownLatch(1);
      executor.submit(
          settlement -> {
            if (settlement.claim()) {
              settlements.incrementAndGet();
            }
            done.countDown();
          },
          settlements::incrementAndGet);
      assertThat(done.await(10, TimeUnit.SECONDS)).isTrue();
      Thread.sleep(10);
      assertThat(settlements.get())
          .as("round %d: the settlement claim must be won exactly once", round)
          .isEqualTo(1);
      executor.shutdown();
    }
  }

  @Test
  void theAttemptBudgetMustBeStrictlyGreaterThanTheGatewayRequestTimeout() {
    var gateway =
        new com.citi.put.checks.studio.compile.gateway.StudioGatewayProperties(
            false,
            null,
            null,
            null,
            null,
            null,
            Duration.ofSeconds(60),
            4,
            1,
            1,
            true,
            0,
            null,
            "classpath:studio/artifact.schema.json");
    var runner =
        new com.citi.put.checks.studio.compile.validator.StudioRunnerProperties(
            "http://runner:8080", "token", Duration.ofSeconds(10), Duration.ofSeconds(2));
    StudioCompileProperties tooShort =
        new StudioCompileProperties(
            new StudioCompileProperties.Pipeline(4, Duration.ofSeconds(60)),
            properties.authoring(),
            properties.diagnostics(),
            properties.repair(),
            properties.sweep());

    assertThatThrownBy(() -> tooShort.validate(gateway, runner))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("attempt-budget")
        .hasMessageContaining("request-timeout");

    assertThatCode(() -> RunnerPinDriftTest.defaults().validate(gateway, runner))
        .as("the shipped defaults must satisfy their own rule")
        .doesNotThrowAnyException();
  }

  // ── AC-15: diagnostics caps ───────────────────────────────────────────────

  @Test
  void aHostileValidatorResponseIsBoundedAndSaysThatItWasTruncated() throws Exception {
    DiagnosticsBounder bounder = new DiagnosticsBounder(properties);
    List<ValidationOutcome.StepVerdict> steps = new ArrayList<>();
    for (int index = 0; index < 20; index++) {
      List<RunnerDiagnostic> diagnostics = new ArrayList<>();
      for (int d = 0; d < 500; d++) {
        diagnostics.add(
            new RunnerDiagnostic(
                "DENIED_NODE", index, "m".repeat(5_000), "CallExpression", "e".repeat(5_000)));
      }
      steps.add(new ValidationOutcome.StepVerdict(index, false, diagnostics));
    }
    ValidationOutcome hostile =
        ValidationOutcome.verdict(false, "1.0.0", List.of(), Collections.unmodifiableList(steps));

    String stored = bounder.bound(hostile, 20, 1, false);
    JsonNode document = MAPPER.readTree(stored);

    assertThat(stored.getBytes(StandardCharsets.UTF_8).length)
        .as("the persisted document must be within the total byte cap")
        .isLessThanOrEqualTo(properties.diagnostics().maxTotalBytes());
    assertThat(document.path("truncated").asBoolean())
        .as("truncation must be explicit, never silent")
        .isTrue();
    assertThat(document.path("steps"))
        .as("one entry per original step, index aligned, even after shedding")
        .hasSize(20);
    for (JsonNode step : document.path("steps")) {
      assertThat(step.path("diagnostics").size())
          .as("step %s exceeded the per-step cap", step.path("stepIndex"))
          .isLessThanOrEqualTo(properties.diagnostics().maxPerStep());
      for (JsonNode diagnostic : step.path("diagnostics")) {
        assertThat(diagnostic.path("message").asText())
            .hasSizeLessThanOrEqualTo(properties.diagnostics().maxMessageChars());
        assertThat(diagnostic.path("excerpt").asText())
            .hasSizeLessThanOrEqualTo(properties.diagnostics().maxExcerptChars());
      }
    }
  }

  @Test
  void exactlyThePerStepCapIsKeptAndTheEleventhIsDroppedWithAMarker() throws Exception {
    DiagnosticsBounder bounder = new DiagnosticsBounder(properties);

    JsonNode atCap =
        MAPPER.readTree(bounder.bound(outcomeWith(10), 1, 1, false)).path("steps").get(0);
    assertThat(atCap.path("diagnostics")).hasSize(10);
    assertThat(atCap.path("truncated").asBoolean()).isFalse();

    JsonNode overCap =
        MAPPER.readTree(bounder.bound(outcomeWith(11), 1, 1, false)).path("steps").get(0);
    assertThat(overCap.path("diagnostics")).hasSize(10);
    assertThat(overCap.path("truncated").asBoolean())
        .as("a step that lost diagnostics must say so")
        .isTrue();
  }

  @Test
  void aMessageExactlyAtTheCapIsKeptWholeAndOneCharacterMoreIsMarked() throws Exception {
    DiagnosticsBounder bounder = new DiagnosticsBounder(properties);

    String atCap = "m".repeat(400);
    JsonNode kept = firstDiagnostic(bounder.bound(outcomeWithMessage(atCap), 1, 1, false));
    assertThat(kept.path("message").asText()).isEqualTo(atCap);

    JsonNode cut = firstDiagnostic(bounder.bound(outcomeWithMessage("m".repeat(401)), 1, 1, false));
    assertThat(cut.path("message").asText())
        .hasSize(400)
        .endsWith(DiagnosticsBounder.TRUNCATION_MARKER);
  }

  @Test
  void everyStepGetsAnEntryEvenWhenTheValidatorReturnedNone() throws Exception {
    DiagnosticsBounder bounder = new DiagnosticsBounder(properties);

    JsonNode document =
        MAPPER.readTree(
            bounder.bound(
                ValidationOutcome.verdict(false, "1.0.0", List.of(), List.of()), 5, 1, false));

    assertThat(document.path("steps")).hasSize(5);
    for (int index = 0; index < 5; index++) {
      assertThat(document.path("steps").get(index).path("stepIndex").asInt()).isEqualTo(index);
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private static JsonNode firstDiagnostic(String stored) throws Exception {
    return MAPPER.readTree(stored).path("steps").get(0).path("diagnostics").get(0);
  }

  private static ValidationOutcome outcomeWith(int diagnosticCount) {
    List<RunnerDiagnostic> diagnostics = new ArrayList<>();
    for (int i = 0; i < diagnosticCount; i++) {
      diagnostics.add(new RunnerDiagnostic("DENIED_NODE", 0, "problem " + i, "Call", "code"));
    }
    return ValidationOutcome.verdict(
        false,
        "1.0.0",
        List.of(),
        List.of(new ValidationOutcome.StepVerdict(0, false, diagnostics)));
  }

  private static ValidationOutcome outcomeWithMessage(String message) {
    return ValidationOutcome.verdict(
        false,
        "1.0.0",
        List.of(),
        List.of(
            new ValidationOutcome.StepVerdict(
                0,
                false,
                List.of(new RunnerDiagnostic("DENIED_NODE", 0, message, "Call", "code")))));
  }

  private static List<String> lines(int count, String text) {
    List<String> lines = new ArrayList<>(count);
    for (int i = 0; i < count; i++) {
      lines.add(text);
    }
    return lines;
  }

  /** Builds a source whose UTF-8 size, lines joined by newline, is exactly {@code bytes}. */
  private static List<String> sourceOfExactly(int bytes) {
    int lineCount = 100;
    int separators = lineCount - 1;
    int perLine = (bytes - separators) / lineCount;
    int remainder = (bytes - separators) % lineCount;
    List<String> source = new ArrayList<>(lineCount);
    for (int i = 0; i < lineCount; i++) {
      source.add("x".repeat(perLine + (i < remainder ? 1 : 0)));
    }
    return source;
  }

  private static void await(CountDownLatch latch) {
    try {
      if (!latch.await(30, TimeUnit.SECONDS)) {
        throw new IllegalStateException("Timed out holding a compile attempt open");
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }
}
