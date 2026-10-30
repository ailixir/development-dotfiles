package com.citi.put.checks.studio.guided.translation;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Finds the first absolute http(s) URL a UI test authors, in step order: the URL that decides where
 * learning starts.
 *
 * <p>A URL is one the destination-candidate span detection finds (quoted or bare), a bare URL that
 * ends a sentence ("Open https://x/login."), or a {@code <var name>} reference to a non-secret
 * variable whose value is an absolute http(s) URL. Within a step the leftmost one wins. A test
 * whose steps name no URL falls back to its first non-secret URL variable, however it is
 * referenced. The URL is returned as authored: whether its host is allowed is the caller's
 * decision, so a URL the rule would refuse (user info, a bad port) is still the first URL and is
 * refused, not skipped.
 */
final class AuthoredUrls {
  private static final String TRAILING_PUNCTUATION = ".,;:!?)]}>\"'`";
  private static final Pattern TOKEN = Pattern.compile("[^\\s\\p{Z}]+");
  private static final Pattern VARIABLE = Pattern.compile("<var\\s+([A-Za-z0-9_.-]{1,64})>");

  private AuthoredUrls() {}

  /**
   * @param authoring the persisted authoring document ({@code steps[].text})
   * @param variables the persisted variables ({@code [{name, kind, value}]})
   * @return the first authored URL, or null when the test names none
   */
  static String first(JsonNode authoring, JsonNode variables) {
    Map<String, String> urlVariables = new LinkedHashMap<>();
    for (JsonNode variable : variables) {
      if (variable.path("kind").asText().equals("plain") && variable.path("value").isTextual()) {
        String value = variable.path("value").asText();
        if (value.startsWith("http://") || value.startsWith("https://")) {
          urlVariables.putIfAbsent(variable.path("name").asText(), value);
        }
      }
    }
    for (JsonNode step : authoring.path("steps")) {
      JsonNode text = step.path("text");
      if (!text.isTextual()) {
        continue;
      }
      String found = firstIn(text.asText(), urlVariables);
      if (found != null) {
        return found;
      }
    }
    return urlVariables.values().stream().findFirst().orElse(null);
  }

  private static String firstIn(String text, Map<String, String> urlVariables) {
    int bestAt = Integer.MAX_VALUE;
    String best = null;
    for (var span : GuidedAuthoredUriCandidates.literals(text)) {
      if (span.start() < bestAt) {
        bestAt = span.start();
        best = text.substring(span.start(), span.end());
      }
    }
    Matcher tokens = TOKEN.matcher(text);
    while (tokens.find()) {
      String token = tokens.group();
      int start = 0;
      while (start < token.length() && "([{<".indexOf(token.charAt(start)) >= 0) {
        start++;
      }
      int end = token.length();
      while (end > start && TRAILING_PUNCTUATION.indexOf(token.charAt(end - 1)) >= 0) {
        end--;
      }
      String url = token.substring(start, end);
      int at = tokens.start() + start;
      if ((url.startsWith("http://") || url.startsWith("https://"))
          && !GuidedAuthoredUriCandidates.ambiguousUnquoted(url)
          && at < bestAt) {
        bestAt = at;
        best = url;
      }
    }
    Matcher references = VARIABLE.matcher(text);
    while (references.find()) {
      String value = urlVariables.get(references.group(1));
      if (value != null && references.start() < bestAt) {
        bestAt = references.start();
        best = value;
      }
    }
    return best;
  }
}
