package com.citi.put.checks.studio.authoring;

import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dto.AuthoringStep;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Save-time authoring limits (Story 10.8, AC-6; VAL-024).
 *
 * <p>Order matters and is deliberate: step count, then blank steps, then per-line length. An
 * over-limit draft is refused at the API with a {@code 400} and a stable code, and nothing is
 * written. The line bound is the {@link AuthoringStep#MAX_TEXT_CHARS} contract bound, counted in
 * UTF-16 code units and not configurable.
 */
@Component
public class AuthoringLimits {

  /** Too many steps. */
  public static final String TOO_MANY_STEPS = "SOURCE_TOO_MANY_STEPS";

  /** One step is longer than the {@code AuthoringStep.text} bound. */
  public static final String LINE_TOO_LONG = "SOURCE_LINE_TOO_LONG";

  /**
   * One of the steps is blank. The same code the save routes use for a blank step ({@code
   * CanonicalStudioCodec.validateForWrite}), so both answers read the same.
   */
  public static final String INVALID_STEPS = "INVALID_STEPS";

  private final StudioAuthoringProperties limits;

  public AuthoringLimits(StudioAuthoringProperties limits) {
    this.limits = limits;
  }

  /**
   * The bounds enforced when a draft is saved (VAL-024): step count, blank steps and per-line
   * length, in that order. An empty step list passes, because a draft is created empty and filled
   * in the editor.
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
              + ". Split it into smaller tests.");
    }

    for (int index = 0; index < source.size(); index++) {
      String line = source.get(index) == null ? "" : source.get(index);
      if (line.isBlank()) {
        throw new StudioValidationException(INVALID_STEPS, blankStepMessage(index));
      }
      if (line.length() > AuthoringStep.MAX_TEXT_CHARS) {
        throw new StudioValidationException(
            LINE_TOO_LONG,
            "Step "
                + (index + 1)
                + " is "
                + line.length()
                + " characters long; the maximum is "
                + AuthoringStep.MAX_TEXT_CHARS
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
}
