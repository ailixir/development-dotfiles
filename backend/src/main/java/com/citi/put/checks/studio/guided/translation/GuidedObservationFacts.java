package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * What a clarification needs from the per-ref facts of an observation: the semantic identity of an
 * element (role, name, evidence, ordinal, enclosing scopes), a count of the refs that carry it, and
 * the text helpers shared with the runner's perceive.ts ({@code norm}, {@code words}, {@code
 * bound}). Pure functions, no state, no I/O. Nothing here admits code or judges a target.
 *
 * <p>Text semantics follow JavaScript, not Java, so the same input gives the same verdict in the
 * runner and here: whitespace is the ECMAScript WhiteSpace plus LineTerminator set (including
 * U+00A0 and U+FEFF, excluding U+0085), and a string anchor is the end of the input, never a final
 * line terminator.
 */
public final class GuidedObservationFacts {
  private GuidedObservationFacts() {}

  /** The semantic selection an author accepted: role, name and evidence of the chosen element. */
  public record Selection(
      String role, String name, String evidence, JsonNode ordinal, String scopeHash) {
    public Selection(String role, String name, String evidence) {
      this(role, name, evidence, null, null);
    }
  }

  /** perceive.ts MAX_LINE_CHARS: the rendering bound of a name in an outline line. */
  public static final int OUTLINE_NAME_CHARS = 160;

  private static final String WS =
      "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2"
          + "029\\u202F\\u205F\\u3000\\uFEFF";
  private static final Pattern WHITESPACE_RUN = Pattern.compile("[" + WS + "]+");
  private static final Pattern WHITESPACE_ENDS =
      Pattern.compile("\\A[" + WS + "]+|[" + WS + "]+\\z");
  private static final Pattern PUNCTUATION_ENDS =
      Pattern.compile("\\A[\\p{P}\\p{S}" + WS + "]+|[\\p{P}\\p{S}" + WS + "]+\\z");
  private static final Pattern NON_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");

  private static final Set<String> SCOPE_SOURCE_ROLES =
      Set.of(
          "form",
          "dialog",
          "alertdialog",
          "region",
          "search",
          "navigation",
          "main",
          "row",
          "article",
          "listitem",
          "group",
          "table",
          "grid",
          "tabpanel",
          "menu",
          "toolbar",
          "banner",
          "contentinfo",
          "complementary",
          "list",
          "heading",
          "cell",
          "gridcell",
          "rowheader",
          "columnheader",
          "text",
          "paragraph",
          "strong",
          "status",
          "link");

  /** ECMAScript {@code String.prototype.trim} after whitespace collapsing. */
  private static String trim(String value) {
    return WHITESPACE_ENDS.matcher(value).replaceAll("");
  }

  /**
   * NFKC, lower case, collapsed whitespace, leading and trailing punctuation and symbols removed;
   * text with no letter or digit keeps its symbols.
   */
  public static String norm(String value) {
    String folded =
        trim(
            WHITESPACE_RUN
                .matcher(
                    Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKC)
                        .toLowerCase(Locale.ROOT))
                .replaceAll(" "));
    String stripped = PUNCTUATION_ENDS.matcher(folded).replaceAll("");
    return stripped.isEmpty() ? folded : stripped;
  }

  /** The words of {@link #norm}: runs of letters and digits of at least two code points. */
  public static List<String> words(String value) {
    List<String> out = new ArrayList<>();
    for (String word : NON_WORD.split(norm(value))) {
      if (word.codePointCount(0, word.length()) >= 2) {
        out.add(word);
      }
    }
    return out;
  }

  /**
   * perceive.ts {@code bound}: whitespace collapsed and trimmed, then at most {@code limit} code
   * points, the last replaced by an ellipsis when something was cut.
   */
  public static String bound(String value, int limit) {
    String collapsed = trim(WHITESPACE_RUN.matcher(value == null ? "" : value).replaceAll(" "));
    int count = collapsed.codePointCount(0, collapsed.length());
    if (count <= limit) {
      return collapsed;
    }
    return collapsed.substring(0, collapsed.offsetByCodePoints(0, limit - 1)) + "…";
  }

  /** The semantic selection of a fact: role, name and evidence. */
  public static Selection selectionOf(JsonNode fact) {
    return new Selection(
        fact.path("role").asText(),
        fact.path("name").asText(""),
        fact.path("evidence").asText(""),
        fact.has("ordinal") ? fact.path("ordinal").deepCopy() : null,
        fact.path("scopeHash").isTextual() ? fact.path("scopeHash").asText() : null);
  }

  /** Current public identities only; refs are normalized out of the persisted choice identity. */
  public static Selection selectionOf(JsonNode facts, JsonNode fact) {
    Selection base = selectionOf(fact);
    return new Selection(
        base.role(), base.name(), base.evidence(), base.ordinal(), scopeHash(facts, fact));
  }

  /**
   * Every ref whose fact equals the selection on role, name and evidence, in facts order. The
   * caller decides on {@code size() == 1}; there is no first-match accessor, so a tie can never be
   * broken by position.
   */
  public static List<String> matchingRefs(JsonNode facts, Selection selection) {
    List<String> refs = new ArrayList<>();
    if (facts == null || !facts.isObject()) {
      return refs;
    }
    requireCoherentOrdinals(facts);
    Iterator<Map.Entry<String, JsonNode>> fields = facts.fields();
    while (fields.hasNext()) {
      Map.Entry<String, JsonNode> entry = fields.next();
      if (selectionOf(facts, entry.getValue()).equals(selection)) {
        refs.add(entry.getKey());
      }
    }
    return refs;
  }

  /** A hash of the enclosing scopes of a fact, or null when it names none. */
  public static String scopeHash(JsonNode facts, JsonNode fact) {
    if (!fact.has("scopeRefs")) {
      return null;
    }
    ArrayNode identities = JsonNodeFactory.instance.arrayNode();
    Set<String> seen = new HashSet<>();
    for (JsonNode ref : fact.path("scopeRefs")) {
      JsonNode source = facts.path(ref.asText());
      GuidedSessionException.require(
          seen.add(ref.asText())
              && source.isObject()
              && source != fact
              && completeScopeSource(source),
          "INVALID_CONTRACT",
          422);
      var identity =
          identities
              .addObject()
              .put("role", source.path("role").asText())
              .put("name", source.path("name").asText());
      if (source.has("ordinal")) {
        identity.set("ordinal", source.path("ordinal").deepCopy());
      }
    }
    return GuidedContracts.hash(identities);
  }

  private static boolean completeScopeSource(JsonNode source) {
    String name = source.path("name").asText("");
    return source.isObject()
        && source.path("nameComplete").asBoolean(false)
        && !source.path("editable").asBoolean(false)
        && SCOPE_SOURCE_ROLES.contains(source.path("role").asText())
        && !name.isBlank()
        && name.codePointCount(0, name.length()) <= 80;
  }

  /** The scope refs of every fact are distinct, other facts, and complete scope sources. */
  public static void requireCoherentSources(JsonNode facts) {
    var fields = facts.fields();
    while (fields.hasNext()) {
      var entry = fields.next();
      Set<String> sources = new HashSet<>();
      for (JsonNode ref : entry.getValue().path("scopeRefs")) {
        GuidedSessionException.require(
            ref.isTextual()
                && sources.add(ref.asText())
                && !entry.getKey().equals(ref.asText())
                && completeScopeSource(facts.path(ref.asText())),
            "INVALID_CONTRACT",
            422);
      }
    }
  }

  /** Duplicate classes are atomic: neither partial projection nor count laundering is a choice. */
  public static void requireCoherentOrdinals(JsonNode facts) {
    if (facts == null || !facts.isObject()) {
      return;
    }
    requireCoherentSources(facts);
    Map<List<String>, List<JsonNode>> groups = new LinkedHashMap<>();
    for (JsonNode fact : facts) {
      groups
          .computeIfAbsent(
              List.of(
                  fact.path("role").asText(),
                  fact.path("name").asText(),
                  fact.path("evidence").asText()),
              ignored -> new ArrayList<>())
          .add(fact);
    }
    for (List<JsonNode> group : groups.values()) {
      Set<Integer> indices = new HashSet<>();
      for (int index = 0; index < group.size(); index++) {
        JsonNode ordinal = group.get(index).path("ordinal");
        boolean valid =
            group.size() == 1
                ? ordinal.isMissingNode()
                : ordinal.isObject()
                    && ordinal.size() == 2
                    && ordinal.path("index").isIntegralNumber()
                    && ordinal.path("count").isIntegralNumber()
                    && ordinal.path("index").canConvertToInt()
                    && ordinal.path("count").canConvertToInt()
                    && ordinal.path("index").asInt() >= 1
                    && ordinal.path("index").asInt() <= group.size()
                    && indices.add(ordinal.path("index").asInt())
                    && ordinal.path("count").asInt() == group.size();
        GuidedSessionException.require(valid, "INVALID_CONTRACT", 422);
      }
    }
  }
}
