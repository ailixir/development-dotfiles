package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.dto.AuthoringDiagnostic;
import com.citi.put.checks.studio.dto.ResolvedLiteralInput;
import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedReferenceInput;
import com.citi.put.checks.studio.dto.ResolvedStepReview;
import com.citi.put.checks.studio.dto.ResolvedTarget;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Independent check over accepted operation code; explanation text is never inspected. */
public final class TypedIntentCorrespondence {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  public List<AuthoringDiagnostic> verify(
      List<ResolvedStepReview> resolvedIntent, String artifactJson) {
    return verify(resolvedIntent, Map.of(), Map.of(), artifactJson);
  }

  public List<AuthoringDiagnostic> verify(
      List<ResolvedStepReview> resolvedIntent,
      Map<UUID, List<ResolvedOperation.Kind>> requestedSequences,
      String artifactJson) {
    return verify(resolvedIntent, requestedSequences, Map.of(), artifactJson);
  }

  public List<AuthoringDiagnostic> verify(
      List<ResolvedStepReview> resolvedIntent,
      Map<UUID, List<ResolvedOperation.Kind>> requestedSequences,
      Map<UUID, String> targetScopes,
      String artifactJson) {
    List<AuthoringDiagnostic> diagnostics = new ArrayList<>();
    JsonNode steps;
    try {
      steps = MAPPER.readTree(artifactJson).path("steps");
    } catch (JsonProcessingException exception) {
      return List.of(
          new AuthoringDiagnostic(
              AuthoringDiagnostic.Category.UNSUPPORTED_OPERATION,
              null,
              "artifact",
              "artifact is not JSON"));
    }
    for (int index = 0; index < resolvedIntent.size(); index++) {
      ResolvedStepReview intent = resolvedIntent.get(index);
      String code = index < steps.size() ? steps.get(index).path("code").asText() : "";
      List<ResolvedOperation.Kind> sequence = requestedSequences.get(intent.stepId());
      if (!operationMatches(intent.operation(), sequence, code)) {
        diagnostics.add(
            diagnostic(intent, "operation", AuthoringDiagnostic.Category.UNSUPPORTED_OPERATION));
      }
      if (!targetMatches(intent.target(), targetScopes.get(intent.stepId()), code)) {
        diagnostics.add(
            diagnostic(intent, "target", AuthoringDiagnostic.Category.AMBIGUOUS_TARGET));
      }
      if (!inputMatches(intent, code)) {
        diagnostics.add(diagnostic(intent, "input", AuthoringDiagnostic.Category.LITERAL_MISMATCH));
      }
    }
    return List.copyOf(diagnostics);
  }

  private static boolean operationMatches(
      ResolvedOperation operation, List<ResolvedOperation.Kind> sequence, String code) {
    if (operation == null) {
      return true;
    }
    List<ResolvedOperation.Kind> expected =
        sequence == null || sequence.isEmpty() ? List.of(operation.kind()) : sequence;
    int position = -1;
    for (ResolvedOperation.Kind kind : expected) {
      int found = code.indexOf(operationMarker(kind), position + 1);
      if (found < 0) {
        return false;
      }
      position = found;
    }
    return true;
  }

  private static String operationMarker(ResolvedOperation.Kind operation) {
    return switch (operation) {
      case NAVIGATE -> "page.goto(";
      case CLICK -> ".click(";
      case FILL -> ".fill(";
      case PRESS -> ".press(";
      case SELECT -> ".selectOption(";
      case CHECK -> ".check(";
      case ASSERT -> "expect(";
    };
  }

  private static boolean targetMatches(ResolvedTarget target, String scope, String code) {
    if (target == null) {
      return true;
    }
    String marker = targetMarker(target.strategy());
    boolean valueMatches =
        argumentsFor(code, marker).stream()
            .anyMatch(
                argument ->
                    argument instanceof Literal literal && literal.value().equals(target.value()));
    return valueMatches
        && (scope == null
            || target.strategy() != ResolvedTarget.Strategy.ROLE
            || roleScopeMatches(code, target.value(), scope));
  }

  private static boolean roleScopeMatches(String code, String role, String scope) {
    int cursor = 0;
    String marker = "getByRole(";
    while ((cursor = code.indexOf(marker, cursor)) >= 0) {
      int open = cursor + marker.length() - 1;
      int close = closingParenthesis(code, open);
      if (close < 0) {
        return false;
      }
      String arguments = code.substring(open + 1, close);
      DecodedArgument first = decodeArgument(firstArgument(arguments));
      if (first instanceof Literal literal && literal.value().equals(role)) {
        int name = arguments.indexOf("name");
        int colon = name < 0 ? -1 : arguments.indexOf(':', name);
        if (colon >= 0
            && decodeArgument(arguments.substring(colon + 1).replaceFirst("}\\s*$", "").trim())
                instanceof Literal accessibleName
            && accessibleName.value().equals(scope)) {
          return true;
        }
      }
      cursor = close + 1;
    }
    return false;
  }

  private static String targetMarker(ResolvedTarget.Strategy strategy) {
    return switch (strategy) {
      case ROLE -> "getByRole(";
      case LABEL -> "getByLabel(";
      case TEST_ID -> "getByTestId(";
      case TEXT -> "getByText(";
      case URL -> "page.goto(";
    };
  }

  private static boolean inputMatches(ResolvedStepReview intent, String code) {
    if (intent.input() == null) {
      return true;
    }
    List<DecodedArgument> arguments = new ArrayList<>();
    for (String marker : List.of(".fill(", ".press(", ".selectOption(")) {
      arguments.addAll(argumentsFor(code, marker));
    }
    if (intent.input() instanceof ResolvedLiteralInput literal) {
      return arguments.stream()
          .anyMatch(
              argument ->
                  argument instanceof Literal decoded && decoded.value().equals(literal.value()));
    }
    ResolvedReferenceInput reference = (ResolvedReferenceInput) intent.input();
    return arguments.stream()
        .anyMatch(
            argument ->
                argument instanceof Reference decoded
                    && decoded.kind() == reference.kind()
                    && decoded.referenceId().equals(reference.referenceId()));
  }

  private static List<DecodedArgument> argumentsFor(String code, String marker) {
    List<DecodedArgument> arguments = new ArrayList<>();
    int cursor = 0;
    while ((cursor = code.indexOf(marker, cursor)) >= 0) {
      int open = cursor + marker.length() - 1;
      int close = closingParenthesis(code, open);
      if (close < 0) {
        break;
      }
      arguments.add(decodeArgument(firstArgument(code.substring(open + 1, close))));
      cursor = close + 1;
    }
    return arguments;
  }

  private static int closingParenthesis(String text, int open) {
    int depth = 0;
    char quote = 0;
    boolean escaped = false;
    for (int index = open; index < text.length(); index++) {
      char current = text.charAt(index);
      if (quote != 0) {
        if (escaped) {
          escaped = false;
        } else if (current == '\\') {
          escaped = true;
        } else if (current == quote) {
          quote = 0;
        }
      } else if (current == '\'' || current == '"') {
        quote = current;
      } else if (current == '(') {
        depth++;
      } else if (current == ')' && --depth == 0) {
        return index;
      }
    }
    return -1;
  }

  private static String firstArgument(String arguments) {
    int depth = 0;
    char quote = 0;
    boolean escaped = false;
    for (int index = 0; index < arguments.length(); index++) {
      char current = arguments.charAt(index);
      if (quote != 0) {
        if (escaped) {
          escaped = false;
        } else if (current == '\\') {
          escaped = true;
        } else if (current == quote) {
          quote = 0;
        }
      } else if (current == '\'' || current == '"') {
        quote = current;
      } else if (current == '(') {
        depth++;
      } else if (current == ')') {
        depth--;
      } else if (current == ',' && depth == 0) {
        return arguments.substring(0, index).trim();
      }
    }
    return arguments.trim();
  }

  private static DecodedArgument decodeArgument(String expression) {
    String value = expression.trim();
    for (ResolvedReferenceInput.Kind kind : ResolvedReferenceInput.Kind.values()) {
      String function =
          kind == ResolvedReferenceInput.Kind.SECRET_REF ? "vars.secret(" : "vars.get(";
      if (value.startsWith(function)) {
        int close = closingParenthesis(value, function.length() - 1);
        DecodedArgument nested =
            close < 0
                ? Missing.INSTANCE
                : decodeArgument(firstArgument(value.substring(function.length(), close)));
        return nested instanceof Literal literal
            ? new Reference(kind, literal.value())
            : Missing.INSTANCE;
      }
    }
    if (value.length() >= 2
        && (value.charAt(0) == '\'' || value.charAt(0) == '"')
        && value.charAt(value.length() - 1) == value.charAt(0)) {
      return new Literal(decodeJavascriptString(value));
    }
    return Missing.INSTANCE;
  }

  private static String decodeJavascriptString(String literal) {
    StringBuilder decoded = new StringBuilder();
    for (int index = 1; index < literal.length() - 1; index++) {
      char current = literal.charAt(index);
      if (current != '\\') {
        decoded.append(current);
        continue;
      }
      char escaped = literal.charAt(++index);
      switch (escaped) {
        case 'n' -> decoded.append('\n');
        case 'r' -> decoded.append('\r');
        case 't' -> decoded.append('\t');
        case '\\' -> decoded.append('\\');
        case '\'' -> decoded.append('\'');
        case '"' -> decoded.append('"');
        default -> decoded.append(escaped);
      }
    }
    return decoded.toString();
  }

  private sealed interface DecodedArgument permits Literal, Reference, Missing {}

  private record Literal(String value) implements DecodedArgument {}

  private record Reference(ResolvedReferenceInput.Kind kind, String referenceId)
      implements DecodedArgument {}

  private enum Missing implements DecodedArgument {
    INSTANCE
  }

  private static AuthoringDiagnostic diagnostic(
      ResolvedStepReview intent, String field, AuthoringDiagnostic.Category category) {
    return new AuthoringDiagnostic(category, intent.stepId(), field, category.name());
  }
}
