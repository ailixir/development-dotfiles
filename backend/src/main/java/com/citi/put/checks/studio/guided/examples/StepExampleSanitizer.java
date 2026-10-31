package com.citi.put.checks.studio.guided.examples;

import com.citi.put.checks.studio.guided.translation.CredentialPatternScreen;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns a step text and its frozen code into something that may be stored and shown to the model
 * (ADR-SC-008 D6, FR-13d). Authored literals become placeholders; secret handles stay handles.
 *
 * <p>{@link #forStore} replaces and then refuses anything it still cannot make safe. {@link
 * #unsafe} is the screen used again at prompt assembly: it never repairs, the caller drops the
 * example.
 *
 * <p>Named limits: page-derived labels in locators stay (they are page text, not authored values);
 * free text secrets are the {@link CredentialPatternScreen} limitation; a bare word equal to a
 * known variable value is stored as {@code <input:NAME>} and may not match a gate step text.
 */
public final class StepExampleSanitizer {
  /** Field caps, in chars. A field over its cap makes the example unstorable, never truncated. */
  public static final int MAX_TEXT = 1024;

  public static final int MAX_CODE = 4096;
  private static final int MIN_VALUE_IN_CODE = 3;

  private static final Pattern QUOTED =
      Pattern.compile(
          "\"([^\"\\n]{1,200})\"|\u201c([^\u201d\\n]{1,200})\u201d"
              + "|(?<![\\p{L}\\p{N}])'([^'\\n]{1,200})'(?![\\p{L}\\p{N}])"
              + "|\u2018([^\u2019\\n]{1,200})\u2019");
  private static final Pattern URL = Pattern.compile("https?://[^\\s'\"`)<>]+");
  private static final Pattern FILL_LITERAL =
      Pattern.compile(
          "(\\.(?:fill|type|pressSequentially|selectOption)\\(\\s*)(['\"`])((?:\\\\.|(?!\\2).)*)\\2");
  private static final Pattern PLACEHOLDER_ONLY = Pattern.compile("<[A-Za-z0-9:_.-]+>");
  private static final Pattern TEMPLATE_PART = Pattern.compile("\\$\\{[^}]*}");
  private static final Pattern TAG = Pattern.compile("(?i)</?(?:examples?|step|code)\\b");

  private StepExampleSanitizer() {}

  /** A sanitized pair. */
  public record Cleaned(String stepText, String code) {}

  /**
   * @param knownValues the revision's plain variable values: value to variable name
   * @return empty when the pair is not storable: a credential pattern or a prompt tag in the input,
   *     anything unsafe left after replacing, or a field over its cap
   */
  public static Optional<Cleaned> forStore(
      String stepText, String code, Map<String, String> knownValues) {
    if (stepText == null || code == null || unsafeInput(stepText) || unsafeInput(code)) {
      return Optional.empty();
    }
    String text = collapse(stepText);
    String out = code;
    int index = 0;
    Matcher quoted = QUOTED.matcher(text);
    StringBuilder rewritten = new StringBuilder();
    while (quoted.find()) {
      index++;
      String placeholder = "<value" + index + ">";
      String inner = firstGroup(quoted);
      quoted.appendReplacement(rewritten, Matcher.quoteReplacement(placeholder));
      if (inner.length() >= MIN_VALUE_IN_CODE) {
        out = replaceIgnoreCase(out, inner, placeholder);
      }
    }
    quoted.appendTail(rewritten);
    text = rewritten.toString();
    for (var known :
        knownValues.entrySet().stream()
            .filter(e -> e.getKey() != null && e.getKey().length() >= MIN_VALUE_IN_CODE)
            .sorted(
                Comparator.<Map.Entry<String, String>>comparingInt(e -> e.getKey().length())
                    .reversed()
                    .thenComparing(Map.Entry::getKey))
            .toList()) {
      String placeholder = "<input:" + known.getValue().replaceAll("[^A-Za-z0-9_.-]", "_") + ">";
      text = replaceIgnoreCase(text, known.getKey(), placeholder);
      out = replaceIgnoreCase(out, known.getKey(), placeholder);
    }
    text = URL.matcher(text).replaceAll("<url>");
    out = URL.matcher(out).replaceAll("<url>");
    List<String> filled = new ArrayList<>();
    out = replaceFillLiterals(out, filled);
    for (String literal : filled) {
      text = replaceIgnoreCase(text, literal, "<value>");
      out = replaceIgnoreCase(out, literal, "<value>");
    }
    if (text.isBlank()
        || out.isBlank()
        || text.length() > MAX_TEXT
        || out.length() > MAX_CODE
        || unsafe(text)
        || unsafe(out)) {
      return Optional.empty();
    }
    return Optional.of(new Cleaned(text, out));
  }

  /**
   * The assembly-time screen: true when the text still shows a credential pattern, a prompt tag, a
   * URL or a literal typed into a field. The caller drops the example; nothing is repaired.
   */
  public static boolean unsafe(String text) {
    if (text == null || unsafeInput(text) || URL.matcher(text).find()) {
      return true;
    }
    Matcher fill = FILL_LITERAL.matcher(text);
    while (fill.find()) {
      if (!isHandleOrPlaceholder(fill.group(3))) {
        return true;
      }
    }
    return false;
  }

  /**
   * The comparison form of a step text: whitespace collapsed, quoted segments and URLs as
   * placeholders, lower case. Used for dedupe and gate exclusion.
   */
  public static String normalize(String stepText) {
    String text = collapse(stepText);
    Matcher quoted = QUOTED.matcher(text);
    StringBuilder rewritten = new StringBuilder();
    int index = 0;
    while (quoted.find()) {
      quoted.appendReplacement(rewritten, "<value" + (++index) + ">");
    }
    quoted.appendTail(rewritten);
    return URL.matcher(rewritten).replaceAll("<url>").toLowerCase(Locale.ROOT);
  }

  private static boolean unsafeInput(String text) {
    if (TAG.matcher(text).find()) {
      return true;
    }
    for (Pattern pattern : CredentialPatternScreen.patternClasses().values()) {
      if (pattern.matcher(text).find()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Replaces typed literals; the text of each (outside any bound handle) goes into {@code filled}.
   */
  private static String replaceFillLiterals(String code, List<String> filled) {
    Matcher fill = FILL_LITERAL.matcher(code);
    StringBuilder out = new StringBuilder();
    while (fill.find()) {
      String literal = fill.group(3);
      String replacement;
      if (isHandleOrPlaceholder(literal)) {
        replacement = fill.group(0);
      } else {
        replacement = fill.group(1) + fill.group(2) + "<value>" + fill.group(2);
        for (String piece : TEMPLATE_PART.split(literal)) {
          String typed = piece.strip();
          if (typed.length() >= MIN_VALUE_IN_CODE && !PLACEHOLDER_ONLY.matcher(typed).matches()) {
            filled.add(typed);
          }
        }
      }
      fill.appendReplacement(out, Matcher.quoteReplacement(replacement));
    }
    fill.appendTail(out);
    return out.toString();
  }

  /**
   * An empty clear, a placeholder, or a template made only of bound handles is not a literal. A
   * template with any other text around its {@code ${...}} parts is a typed literal.
   */
  private static boolean isHandleOrPlaceholder(String literal) {
    if (literal.isEmpty() || PLACEHOLDER_ONLY.matcher(literal).matches()) {
      return true;
    }
    if (!literal.contains("${")) {
      return false;
    }
    for (String piece : TEMPLATE_PART.split(literal)) {
      String text = piece.strip();
      if (!text.isEmpty() && !PLACEHOLDER_ONLY.matcher(text).matches()) {
        return false;
      }
    }
    return true;
  }

  private static String replaceIgnoreCase(String text, String needle, String replacement) {
    return Pattern.compile(Pattern.quote(needle), Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE)
        .matcher(text)
        .replaceAll(Matcher.quoteReplacement(replacement));
  }

  private static String firstGroup(Matcher matcher) {
    for (int group = 1; group <= matcher.groupCount(); group++) {
      if (matcher.group(group) != null) {
        return matcher.group(group);
      }
    }
    return "";
  }

  private static String collapse(String text) {
    return Normalizer.normalize(text, Normalizer.Form.NFKC).replaceAll("\\s+", " ").trim();
  }
}
