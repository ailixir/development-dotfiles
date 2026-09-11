package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The single configuration source for the compile pipeline's bounds (Story 10.8, AC-19;
 * architecture &sect;8.5 "keep their implementation values in one configuration source").
 *
 * <p>Every value is a starting value to be tuned against staging measurements, not a commitment.
 * What is <em>not</em> negotiable is that each bound has a defined behaviour at the bound and that
 * no bound is enforced by a comment: the story's bounds table is normative and each row has a test
 * that drives the input past it.
 *
 * <p>The gateway's own caps (input/output bytes, request timeout, bulkhead concurrency, transport
 * retry) stay on {@link StudioGatewayProperties} where 10.5 put them; this record carries only the
 * bounds this story owns, under the same {@code studio.compile} root.
 *
 * @param pipeline bounded compile work
 * @param authoring limits enforced before a compile request is begun
 * @param diagnostics caps applied to validator output before it is persisted
 * @param repair the bounded repair loop (story 10.9, architecture &sect;4.3)
 * @param sweep the abandoned-compile sweep (story 10.9, architecture &sect;4.7)
 */
@ConfigurationProperties(prefix = "studio.compile")
public record StudioCompileProperties(
    @DefaultValue Pipeline pipeline,
    @DefaultValue Authoring authoring,
    @DefaultValue Diagnostics diagnostics,
    @DefaultValue Repair repair,
    @DefaultValue Sweep sweep) {

  /**
   * Bounded compile work (AC-17, AC-18).
   *
   * <p>Story 10.9 raised {@code attemptBudget} from 180s to 240s and widened its meaning: it now
   * covers the <em>whole compile request including its repairs</em>, not one gateway/validator
   * pair. A second nested budget was rejected — &sect;8.5 asks for one configuration source, and
   * two wall-clock budgets is the kind of pair that drifts until one silently dominates the other.
   *
   * @param concurrency fixed pool size; there is no queue, so attempt {@code concurrency + 1} is
   *     refused rather than parked
   * @param attemptBudget total wall-clock budget for one compile request, covering prompt assembly,
   *     every gateway call, parsing, every {@code /v1/validate} call and persistence
   */
  public record Pipeline(
      @DefaultValue("4") int concurrency, @DefaultValue("240s") Duration attemptBudget) {}

  /**
   * The bounded repair loop (story 10.9, AC-10a; architecture &sect;4.3 "a maximum of two repair
   * attempts").
   *
   * <p>This is a bound the architecture fixes, not a tuning parameter. Raising it raises the
   * arithmetic the budget must satisfy, and the pool is the knob for throughput.
   *
   * @param maxAttempts repair attempts after the first proposal, so at most {@code 1 + maxAttempts}
   *     {@code propose} calls and the same number of {@code /v1/validate} calls per compile request
   */
  public record Repair(@DefaultValue("2") int maxAttempts) {}

  /**
   * The abandoned-compile sweep (story 10.9, AC-18; architecture &sect;4.7 "Recovery of an
   * abandoned compile request marks it retryable without replacing the confirmed history").
   *
   * <p>What it buys is a truthful authoring display, not a recovered capability: because readiness
   * never reads {@code compile_status}, a row stranded in {@code COMPILING} blocks nothing — the
   * confirmed revision still executes and {@code POST /execute} is still accepted.
   *
   * @param enabled whether the schedule runs; the statement itself is always available
   * @param threshold how long a row may sit in {@code COMPILING} before it is swept; validated at
   *     startup to exceed {@code pipeline.attempt-budget}, so a healthy in-flight compile can never
   *     be swept out from under itself
   * @param batchSize rows per run; the run stops at the cap and the next scheduled run continues,
   *     so the statement is never an unbounded {@code UPDATE}
   * @param intervalMs milliseconds between runs, as a plain number so the schedule and this record
   *     read one configuration key rather than two representations of one value
   */
  public record Sweep(
      @DefaultValue("true") boolean enabled,
      @DefaultValue("600s") Duration threshold,
      @DefaultValue("200") int batchSize,
      @DefaultValue("60000") long intervalMs) {

    /**
     * The interval as a duration.
     *
     * @return {@code intervalMs} as a {@link Duration}
     */
    public Duration interval() {
      return Duration.ofMillis(intervalMs);
    }
  }

  /**
   * Authoring limits (AC-6). All three are rejected at the API with a {@code 400} and a code; no
   * compile request is begun and no compile state changes.
   *
   * @param maxSteps maximum number of source steps; must never be looser than the runner's {@code
   *     DEFAULT_BOUNDS.maxSteps}, or a draft could be authorable and structurally uncompilable
   * @param maxLineChars maximum UTF-16 length of one source line
   * @param maxSourceBytes maximum UTF-8 size of the ordered source, measured as the lines joined by
   *     a newline — the author's own text, not its JSON envelope
   */
  public record Authoring(
      @DefaultValue("100") int maxSteps,
      @DefaultValue("1024") int maxLineChars,
      @DefaultValue("65536") int maxSourceBytes) {}

  /**
   * Diagnostics caps (AC-15). Truncation is explicit in the stored structure, never silent.
   *
   * @param maxPerStep diagnostics retained per step, aligned with the runner's {@code
   *     maxDiagnosticsPerStep}
   * @param maxMessageChars maximum message length, aligned with {@code maxDiagnosticMessageLength}
   * @param maxExcerptChars maximum excerpt length, aligned with {@code maxExcerptLength}
   * @param maxTotalBytes maximum UTF-8 size of the persisted {@code compile_diagnostics} document
   */
  public record Diagnostics(
      @DefaultValue("10") int maxPerStep,
      @DefaultValue("400") int maxMessageChars,
      @DefaultValue("120") int maxExcerptChars,
      @DefaultValue("65536") int maxTotalBytes) {}

  /**
   * Fails startup with one message listing every invalid value.
   *
   * <p>The per-attempt budget is checked against the gateway's request timeout rather than merely
   * being positive: a budget at or below the gateway deadline would abandon every slow call before
   * the gateway itself gave up, turning a recoverable {@code GATEWAY_TIMEOUT} into a budget expiry
   * and hiding which bound actually fired.
   *
   * <p>Story 10.9 adds the arithmetic that makes the repair loop honest. The budget now covers the
   * whole request, so it must exceed the worst case the bounds themselves describe: {@code (1 +
   * repair.max-attempts) x (gateway.request-timeout + runner.validate-timeout)}. Without the check
   * a healthy loop could be abandoned mid-repair by arithmetic nobody had done, and the recorded
   * code would name the budget rather than the bound that actually fired. The sweep threshold is
   * checked against the budget for the mirror-image reason: a threshold at or below the budget
   * would let the sweep take a compile that is still legitimately running.
   *
   * @param gateway 10.5's gateway configuration, the source of the timeout this budget must exceed
   * @param runner the runner configuration, the source of the {@code /v1/validate} deadline
   * @throws IllegalStateException when any bound is unusable
   */
  public void validate(StudioGatewayProperties gateway, StudioRunnerProperties runner) {
    List<String> problems = new ArrayList<>();
    requirePositive(problems, "pipeline.concurrency", pipeline().concurrency());
    requirePositive(problems, "authoring.max-steps", authoring().maxSteps());
    requirePositive(problems, "authoring.max-line-chars", authoring().maxLineChars());
    requirePositive(problems, "authoring.max-source-bytes", authoring().maxSourceBytes());
    requirePositive(problems, "diagnostics.max-per-step", diagnostics().maxPerStep());
    requirePositive(problems, "diagnostics.max-message-chars", diagnostics().maxMessageChars());
    requirePositive(problems, "diagnostics.max-excerpt-chars", diagnostics().maxExcerptChars());
    requirePositive(problems, "diagnostics.max-total-bytes", diagnostics().maxTotalBytes());

    long budgetMs = pipeline().attemptBudget() == null ? 0L : pipeline().attemptBudget().toMillis();
    requirePositive(problems, "pipeline.attempt-budget", budgetMs);
    long gatewayTimeoutMs =
        gateway == null || gateway.requestTimeout() == null
            ? 0L
            : gateway.requestTimeout().toMillis();
    if (budgetMs > 0 && gatewayTimeoutMs > 0 && budgetMs <= gatewayTimeoutMs) {
      problems.add(
          "studio.compile.pipeline.attempt-budget ("
              + budgetMs
              + "ms) must be strictly greater than studio.compile.gateway.request-timeout ("
              + gatewayTimeoutMs
              + "ms)");
    }

    requireNonNegative(problems, "repair.max-attempts", repair().maxAttempts());
    requirePositive(problems, "sweep.batch-size", sweep().batchSize());
    requirePositive(problems, "sweep.interval-ms", sweep().intervalMs());
    long thresholdMs = sweep().threshold() == null ? 0L : sweep().threshold().toMillis();
    requirePositive(problems, "sweep.threshold", thresholdMs);

    long validateTimeoutMs =
        runner == null || runner.validateTimeout() == null
            ? 0L
            : runner.validateTimeout().toMillis();
    if (budgetMs > 0 && gatewayTimeoutMs > 0 && validateTimeoutMs > 0) {
      long worstCaseMs = (1L + repair().maxAttempts()) * (gatewayTimeoutMs + validateTimeoutMs);
      if (budgetMs <= worstCaseMs) {
        problems.add(
            "studio.compile.pipeline.attempt-budget ("
                + budgetMs
                + "ms) must be strictly greater than (1 + studio.compile.repair.max-attempts="
                + repair().maxAttempts()
                + ") x (studio.compile.gateway.request-timeout="
                + gatewayTimeoutMs
                + "ms + studio.runner.validate-timeout="
                + validateTimeoutMs
                + "ms) = "
                + worstCaseMs
                + "ms, or a healthy repair loop would be abandoned by the budget");
      }
    }
    if (budgetMs > 0 && thresholdMs > 0 && thresholdMs <= budgetMs) {
      problems.add(
          "studio.compile.sweep.threshold ("
              + thresholdMs
              + "ms) must be strictly greater than studio.compile.pipeline.attempt-budget ("
              + budgetMs
              + "ms), or the sweep could take a compile that is still legitimately running");
    }

    if (!problems.isEmpty()) {
      throw new IllegalStateException(
          "The Studio compile bounds are not usable: " + String.join("; ", problems));
    }
  }

  private static void requireNonNegative(List<String> problems, String name, long value) {
    if (value < 0) {
      problems.add("studio.compile." + name + " must be >= 0 but was " + value);
    }
  }

  private static void requirePositive(List<String> problems, String name, long value) {
    if (value <= 0) {
      problems.add("studio.compile." + name + " must be > 0 but was " + value);
    }
  }
}
