package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.StudioValidationException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Authoring limits, enforced before a compile request is begun (Story 10.8, AC-6; architecture
 * &sect;4.3 "Enforce input/output byte and step limits").
 *
 * <p>Order matters and is deliberate: step count, then per-line length, then total bytes. An
 * over-limit draft is refused at the API with a {@code 400} and a stable code, {@code beginCompile}
 * is never called and no compile state changes — a draft that cannot be compiled must not first be
 * moved to {@code COMPILING} and then failed, because that would spend a state transition to say
 * something the request thread already knew.
 *
 * <p>The step cap is checked against the runner's own {@code DEFAULT_BOUNDS.maxSteps} by {@code
 * RunnerBoundsAlignmentTest}: a backend cap looser than the runner's would make a draft authorable
 * and structurally uncompilable, which is a bound that only fails after a gateway call has been
 * paid for.
 */
@Component
public class AuthoringLimits {

  /** Too many steps for the runner to validate (AC-6). */
  public static final String TOO_MANY_STEPS = "SOURCE_TOO_MANY_STEPS";

  /** One source line is longer than the configured cap. */
  public static final String LINE_TOO_LONG = "SOURCE_LINE_TOO_LONG";

  /** The ordered source as a whole is over the configured byte cap. */
  public static final String SOURCE_TOO_LARGE = "SOURCE_TOO_LARGE";

  /**
   * The draft has no steps, or one of its steps is blank. The same code the save routes use for a
   * blank step ({@code LegacyStudioAdapter.validateForWrite}), so a draft saved before that check
   * existed is refused here with the same actionable answer instead of failing asynchronously.
   */
  public static final String INVALID_STEPS = "INVALID_STEPS";

  private final StudioCompileProperties.Authoring limits;

  public AuthoringLimits(StudioCompileProperties properties) {
    this.limits = properties.authoring();
  }

  /**
   * Rejects a draft that cannot be compiled within the configured bounds.
   *
   * <p>Each check is inclusive at the bound: a draft of exactly {@code maxSteps} steps, with lines
   * of exactly {@code maxLineChars} characters totalling exactly {@code maxSourceBytes}, is
   * accepted; one more of anything is not.
   *
   * @param orderedSource the draft's steps in author order
   * @throws StudioValidationException with one of this class's codes, carrying the offending step
   *     index but never the offending text
   */
  public void requireWithinLimits(List<String> orderedSource) {
    List<String> source = orderedSource == null ? List.of() : orderedSource;

    // An empty or blank source has nothing to compile: refusing here keeps it from reaching
    // beginCompile and failing asynchronously as an internal or gateway error (VAL-021, VAL-022).
    if (source.isEmpty()) {
      throw new StudioValidationException(
          INVALID_STEPS, "This test has no steps. Add at least one step before compiling.");
    }

    requireSaveable(source);

    int bytes = totalSourceBytes(source);
    if (bytes > limits.maxSourceBytes()) {
      throw new StudioValidationException(
          SOURCE_TOO_LARGE,
          "The steps of this test total "
              + bytes
              + " bytes; the maximum is "
              + limits.maxSourceBytes()
              + ". Split it into smaller tests before compiling.");
    }
  }

  /**
   * The subset of the compile bounds enforced when a draft is saved (VAL-024): step count, blank
   * steps and per-line length, with the same codes and the same messages as compile, in the same
   * order. An empty step list passes, because a draft is created empty and filled in the editor; it
   * is refused at compile. The total-bytes bound is compile-only.
   *
   * @param orderedSource the draft's steps in author order
   * @throws StudioValidationException {@code SOURCE_TOO_MANY_STEPS}, {@code INVALID_STEPS} or
   *     {@code SOURCE_LINE_TOO_LONG}, naming the step number but never echoing its text
   */
  public void requireSaveable(List<String> orderedSource) {
    List<String> source = orderedSource == null ? List.of() : orderedSource;
    if (source.size() > limits.maxSteps()) {
      throw new StudioValidationException(
          TOO_MANY_STEPS,
          "This test has "
              + source.size()
              + " steps; the maximum is "
              + limits.maxSteps()
              + ". Split it into smaller tests before compiling.");
    }

    for (int index = 0; index < source.size(); index++) {
      String line = source.get(index) == null ? "" : source.get(index);
      if (line.isBlank()) {
        throw new StudioValidationException(INVALID_STEPS, blankStepMessage(index));
      }
      if (line.length() > limits.maxLineChars()) {
        throw new StudioValidationException(
            LINE_TOO_LONG,
            "Step "
                + (index + 1)
                + " is "
                + line.length()
                + " characters long; the maximum is "
                + limits.maxLineChars()
                + ". Shorten it or split it into two steps.");
      }
    }
  }

  /**
   * The message for a blank step, shared with the save-time check so both answers read the same.
   *
   * @param index zero-based step index
   * @return the author-facing message naming the one-based step number
   */
  public static String blankStepMessage(int index) {
    return "Step " + (index + 1) + " is blank. Write what the step should do, or remove it.";
  }

  /**
   * Total source size, measured the way the bounds table states it: the author's own ordered text,
   * lines joined by a newline, in UTF-8. Deliberately not the size of the JSON envelope, so the
   * number a user is shown is the number they can act on.
   *
   * @param orderedSource the draft's steps in author order
   * @return UTF-8 byte count
   */
  public static int totalSourceBytes(List<String> orderedSource) {
    return String.join("\n", orderedSource).getBytes(StandardCharsets.UTF_8).length;
  }
}
