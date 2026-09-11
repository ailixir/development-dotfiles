package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.gateway.StudioGatewayProperties;
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
 */
@ConfigurationProperties(prefix = "studio.compile")
public record StudioCompileProperties(
    @DefaultValue Pipeline pipeline,
    @DefaultValue Authoring authoring,
    @DefaultValue Diagnostics diagnostics) {

  /**
   * Bounded compile work (AC-17, AC-18).
   *
   * @param concurrency fixed pool size; there is no queue, so attempt {@code concurrency + 1} is
   *     refused rather than parked
   * @param attemptBudget total wall-clock budget for one attempt, covering prompt assembly, the
   *     gateway call, parsing, {@code /v1/validate} and persistence
   */
  public record Pipeline(
      @DefaultValue("4") int concurrency, @DefaultValue("180s") Duration attemptBudget) {}

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
   * @param gateway 10.5's gateway configuration, the source of the timeout this budget must exceed
   * @throws IllegalStateException when any bound is unusable
   */
  public void validate(StudioGatewayProperties gateway) {
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

    if (!problems.isEmpty()) {
      throw new IllegalStateException(
          "The Studio compile bounds are not usable: " + String.join("; ", problems));
    }
  }

  private static void requirePositive(List<String> problems, String name, long value) {
    if (value <= 0) {
      problems.add("studio.compile." + name + " must be > 0 but was " + value);
    }
  }
}
