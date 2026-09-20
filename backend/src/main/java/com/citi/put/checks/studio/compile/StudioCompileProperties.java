package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;
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
 * @param abandonment the abandoned-compile sweep (story 10.9, architecture &sect;4.7; bound under
 *     {@code studio.compile.abandonment} since Studio v1 WP9)
 */
@ConfigurationProperties(prefix = "studio.compile")
public record StudioCompileProperties(
    @DefaultValue Pipeline pipeline,
    @DefaultValue Aggregate aggregate,
    @DefaultValue Authoring authoring,
    @DefaultValue Diagnostics diagnostics,
    @DefaultValue Repair repair,
    @DefaultValue Abandonment abandonment) {

  @ConstructorBinding
  public StudioCompileProperties {}

  /**
   * Compatibility constructor for pre-context callers; aggregate bounds retain shipped defaults.
   */
  public StudioCompileProperties(
      Pipeline pipeline,
      Authoring authoring,
      Diagnostics diagnostics,
      Repair repair,
      Abandonment abandonment) {
    this(pipeline, new Aggregate(12, 786432), authoring, diagnostics, repair, abandonment);
  }

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

  /** Whole-request gateway transport accounting across proposals, repairs and retries. */
  public record Aggregate(
      @DefaultValue("12") int maxCalls, @DefaultValue("786432") long maxBytes) {}

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
   * <p>Studio v1 WP9 (decision D11) accepts sweep-to-{@code STALE} as the v1 recovery for a compile
   * whose replica died, so the time an author waits to learn that is this record's threshold plus
   * at most one interval. The defaults were shortened for that reason: 300s is the smallest round
   * value strictly above the 240s attempt budget the startup check requires, and a 15s interval
   * keeps the added wait small against it while still being one bounded statement per replica.
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
  public record Abandonment(
      @DefaultValue("true") boolean enabled,
      @DefaultValue("300s") Duration threshold,
      @DefaultValue("200") int batchSize,
      @DefaultValue("15000") long intervalMs) {

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
   * <p>The shared monotonic budget truncates the retry/repair sequence. Lower-level timeouts are
   * caps, not a promise that all possible attempts fit inside the request deadline.
   *
   * @param gateway 10.5's gateway configuration, the source of the timeout this budget must exceed
   * @param runner the runner configuration, the source of the {@code /v1/validate} deadline
   * @throws IllegalStateException when any bound is unusable
   */
  public void validate(StudioGatewayProperties gateway, StudioRunnerProperties runner) {
    List<String> problems = new ArrayList<>();
    requirePositive(problems, "pipeline.concurrency", pipeline().concurrency());
    requirePositive(problems, "aggregate.max-calls", aggregate().maxCalls());
    requirePositive(problems, "aggregate.max-bytes", aggregate().maxBytes());
    requirePositive(problems, "authoring.max-steps", authoring().maxSteps());
    requirePositive(problems, "authoring.max-line-chars", authoring().maxLineChars());
    requirePositive(problems, "authoring.max-source-bytes", authoring().maxSourceBytes());
    requirePositive(problems, "diagnostics.max-per-step", diagnostics().maxPerStep());
    requirePositive(problems, "diagnostics.max-message-chars", diagnostics().maxMessageChars());
    requirePositive(problems, "diagnostics.max-excerpt-chars", diagnostics().maxExcerptChars());
    requirePositive(problems, "diagnostics.max-total-bytes", diagnostics().maxTotalBytes());

    long budgetMs = pipeline().attemptBudget() == null ? 0L : pipeline().attemptBudget().toMillis();
    requirePositive(problems, "pipeline.attempt-budget", budgetMs);
    requireNonNegative(problems, "repair.max-attempts", repair().maxAttempts());
    if (repair().maxAttempts() > 2) {
      problems.add("studio.compile.repair.max-attempts must be <= 2");
    }
    requirePositive(problems, "abandonment.batch-size", abandonment().batchSize());
    requirePositive(problems, "abandonment.interval-ms", abandonment().intervalMs());
    long thresholdMs =
        abandonment().threshold() == null ? 0L : abandonment().threshold().toMillis();
    requirePositive(problems, "abandonment.threshold", thresholdMs);

    if (budgetMs > 0 && thresholdMs > 0 && thresholdMs <= budgetMs) {
      problems.add(
          "studio.compile.abandonment.threshold ("
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
