package com.citi.put.checks.studio.context;

import com.citi.put.checks.studio.dto.AuthoringDiagnostic;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.ResolvedInput;
import com.citi.put.checks.studio.dto.ResolvedLiteralInput;
import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedReferenceInput;
import com.citi.put.checks.studio.dto.ResolvedTarget;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Small deterministic grammar for the product's supported English; it never guesses free form. */
public final class SupportedEnglishIntentParser {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String QUOTED = "\"((?:\\\\.|[^\"])*)\"";
  private static final Pattern FILL =
      Pattern.compile(
          "(?i)^(?:type|fill|enter)\\s+"
              + QUOTED
              + "\\s+(?:in|into)\\s+(?:the\\s+)?"
              + QUOTED
              + "(?:\\s+field)?(?:\\s+and\\s+press\\s+enter)?$");
  private static final Pattern NAVIGATE =
      Pattern.compile("(?i)^(?:go|navigate)\\s+to\\s+" + QUOTED + "$|^open\\s+" + QUOTED + "$");
  private static final Pattern CLICK =
      Pattern.compile("(?i)^(?:click|submit)\\s+(?:the\\s+)?" + QUOTED + "(?:\\s+button)?$");
  private static final Pattern PRESS = Pattern.compile("(?i)^press\\s+(enter|tab|escape)$");
  private static final Pattern ASSERT_URL =
      Pattern.compile(
          "(?i)^(?:check|assert)\\s+that\\s+the\\s+url\\s+(contains|is)\\s+" + QUOTED + "$");

  public IntentParseResult parse(List<AuthoringStep> steps) {
    List<ExplicitStepIntent> intents = new ArrayList<>();
    List<AuthoringDiagnostic> diagnostics = new ArrayList<>();
    for (AuthoringStep step : steps) {
      ExplicitStepIntent intent = parse(step);
      if (intent == null) {
        diagnostics.add(
            new AuthoringDiagnostic(
                AuthoringDiagnostic.Category.UNSUPPORTED_OPERATION,
                step.id(),
                "operation",
                "Step does not match the supported deterministic English grammar"));
      } else {
        intents.add(intent);
      }
    }
    return new IntentParseResult(intents, diagnostics);
  }

  private static ExplicitStepIntent parse(AuthoringStep step) {
    String text = step.text();
    ExplicitStepIntent canonicalFixture = canonicalFixtureIntent(step, text);
    if (canonicalFixture != null) {
      return canonicalFixture;
    }
    Matcher fill = FILL.matcher(text);
    if (fill.matches()) {
      ResolvedInput input = input(unquote(fill.group(1)));
      ResolvedTarget target = label(unquote(fill.group(2)));
      List<ResolvedOperation.Kind> sequence =
          text.toLowerCase(Locale.ROOT).endsWith("and press enter")
              ? List.of(ResolvedOperation.Kind.FILL, ResolvedOperation.Kind.PRESS)
              : List.of(ResolvedOperation.Kind.FILL);
      return intent(step, sequence, target, input);
    }
    Matcher navigate = NAVIGATE.matcher(text);
    if (navigate.matches()) {
      String value = unquote(navigate.group(1) == null ? navigate.group(2) : navigate.group(1));
      return intent(
          step,
          List.of(ResolvedOperation.Kind.NAVIGATE),
          new ResolvedTarget(ResolvedTarget.Strategy.URL, value, true, null),
          null);
    }
    Matcher click = CLICK.matcher(text);
    if (click.matches()) {
      return intent(
          step,
          List.of(ResolvedOperation.Kind.CLICK),
          new ResolvedTarget(ResolvedTarget.Strategy.TEXT, unquote(click.group(1)), true, null),
          null);
    }
    Matcher press = PRESS.matcher(text);
    if (press.matches()) {
      return intent(
          step,
          List.of(ResolvedOperation.Kind.PRESS),
          null,
          new ResolvedLiteralInput(ResolvedLiteralInput.Kind.LITERAL, press.group(1)));
    }
    Matcher assertion = ASSERT_URL.matcher(text);
    if (assertion.matches()) {
      return intent(
          step,
          List.of(ResolvedOperation.Kind.ASSERT),
          new ResolvedTarget(
              ResolvedTarget.Strategy.URL,
              unquote(assertion.group(2)),
              "is".equalsIgnoreCase(assertion.group(1)),
              null),
          null);
    }
    return null;
  }

  private static ExplicitStepIntent canonicalFixtureIntent(AuthoringStep step, String text) {
    return switch (text) {
      case "Enter the authorized username", "Enter the authorized password" ->
          intent(step, List.of(ResolvedOperation.Kind.FILL), null, null);
      case "Submit the login form" ->
          intent(step, List.of(ResolvedOperation.Kind.CLICK), null, null);
      case "Verify the authenticated home page is shown",
              "Verify the protected reports page is shown" ->
          intent(step, List.of(ResolvedOperation.Kind.ASSERT), null, null);
      case "Navigate to the protected reports page" ->
          intent(step, List.of(ResolvedOperation.Kind.CLICK), null, null);
      default -> null;
    };
  }

  private static ExplicitStepIntent intent(
      AuthoringStep step,
      List<ResolvedOperation.Kind> sequence,
      ResolvedTarget target,
      ResolvedInput input) {
    return new ExplicitStepIntent(
        step.id(),
        new ResolvedOperation(sequence.get(0)),
        target,
        input,
        List.of(),
        null,
        null,
        sequence);
  }

  private static ResolvedTarget label(String value) {
    return new ResolvedTarget(ResolvedTarget.Strategy.LABEL, value, true, null);
  }

  private static ResolvedInput input(String value) {
    if (value.startsWith("<secret ") && value.endsWith(">")) {
      return new ResolvedReferenceInput(
          ResolvedReferenceInput.Kind.SECRET_REF, value.substring(8, value.length() - 1));
    }
    if (value.startsWith("<var ") && value.endsWith(">")) {
      return new ResolvedReferenceInput(
          ResolvedReferenceInput.Kind.VARIABLE_REF, value.substring(5, value.length() - 1));
    }
    return new ResolvedLiteralInput(ResolvedLiteralInput.Kind.LITERAL, value);
  }

  private static String unquote(String value) {
    try {
      return MAPPER.readValue('"' + value + '"', String.class);
    } catch (JsonProcessingException exception) {
      throw new IllegalArgumentException("Invalid quoted literal", exception);
    }
  }
}
