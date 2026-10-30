package com.citi.put.checks.studio.guided.bridge;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A source span is a template when it contains plain {@code <var NAME>} tokens: the authored text
 * between the tokens is literal, each token is the saved value of that variable. Trusted code fills
 * the tokens, at learn time from the manifest's configuration values and at replay from the plain
 * values of the revision's declared variables, so the model never sees a variable's value and the
 * artifact stores the span, not the value.
 *
 * <p>Secrets are never part of a template: a {@code <secret ID>} token is whole-value only and no
 * template span may overlap one.
 */
public final class SourceTemplate {
  private static final Pattern VARIABLE = Pattern.compile("<var\\s+([A-Za-z0-9_.-]{1,64})>");
  private static final Pattern SECRET = Pattern.compile("<secret\\s+[A-Za-z0-9_.-]{1,64}>");

  /** One token: {@code [start, end)} in the step text and the referenced name. */
  public record Token(int start, int end, String name) {}

  private SourceTemplate() {}

  public static List<Token> variables(String text) {
    List<Token> found = new ArrayList<>();
    Matcher matcher = VARIABLE.matcher(text);
    while (matcher.find()) {
      found.add(new Token(matcher.start(), matcher.end(), matcher.group(1)));
    }
    return found;
  }

  public static List<Token> secrets(String text) {
    List<Token> found = new ArrayList<>();
    Matcher matcher = SECRET.matcher(text);
    while (matcher.find()) {
      found.add(new Token(matcher.start(), matcher.end(), ""));
    }
    return found;
  }

  /**
   * The plain variables a revision's input recipes declare: a whole-variable configuration recipe
   * names one, a template span names every token it holds. A secret recipe names none.
   *
   * @param stepText the frozen authored text of a step, by id
   */
  public static Set<String> declaredPlainVariables(
      com.fasterxml.jackson.databind.JsonNode recipes, Function<String, String> stepText) {
    Set<String> names = new LinkedHashSet<>();
    for (var recipe : recipes) {
      var provenance = recipe.path("provenance");
      if (recipe.path("kind").asText().equals("secretRef")) {
        continue;
      }
      if (provenance.path("kind").asText().equals("configuration")) {
        names.add(provenance.path("referenceName").asText());
      } else if (provenance.path("kind").asText().equals("sourceSpan")) {
        names.addAll(
            variableNames(
                stepText.apply(recipe.path("stepId").asText()),
                provenance.path("start").asInt(),
                provenance.path("end").asInt()));
      }
    }
    return names;
  }

  /** Variable names the span {@code [start, end)} references, in first-mention order. */
  public static Set<String> variableNames(String text, int start, int end) {
    Set<String> names = new LinkedHashSet<>();
    for (Token token : variables(text)) {
      if (token.start() >= start && token.end() <= end) {
        names.add(token.name());
      }
    }
    return names;
  }

  public static boolean hasVariable(String text, int start, int end) {
    return !variableNames(text, start, end).isEmpty();
  }

  /** The span is one variable token and nothing else: the whole-variable configuration path. */
  public static boolean isWholeVariable(String text, int start, int end) {
    for (Token token : variables(text)) {
      if (token.start() == start && token.end() == end) {
        return true;
      }
    }
    return false;
  }

  /** An edge inside a token would type half of it. */
  public static boolean splitsToken(String text, int start, int end) {
    for (Token token : variables(text)) {
      if (token.start() < start && start < token.end()
          || token.start() < end && end < token.end()) {
        return true;
      }
    }
    return false;
  }

  public static boolean overlapsSecret(String text, int start, int end) {
    for (Token token : secrets(text)) {
      if (start < token.end() && end > token.start()) {
        return true;
      }
    }
    return false;
  }

  /**
   * The span with each variable token replaced by {@code values.apply(name)}; a null value is
   * returned as null for the whole span (a missing value is never typed as text).
   */
  public static String expand(String text, int start, int end, Function<String, String> values) {
    StringBuilder out = new StringBuilder();
    int at = start;
    for (Token token : variables(text)) {
      if (token.start() < start || token.end() > end) {
        continue;
      }
      String value = values.apply(token.name());
      if (value == null) {
        return null;
      }
      out.append(text, at, token.start()).append(value);
      at = token.end();
    }
    return out.append(text, at, end).toString();
  }
}
