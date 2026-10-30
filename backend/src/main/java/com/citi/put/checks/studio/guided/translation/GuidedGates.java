package com.citi.put.checks.studio.guided.translation;

import com.fasterxml.jackson.databind.JsonNode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * ADR-SC-007 D3: the grounding gates over the per-ref facts of an observation. Pure functions, no
 * state, no I/O. They are ports of the SPK-07 spike functions ({@code intentGate}, {@code
 * operationTargetGate} and the offline G2 text gate) and of the text helpers the runner's
 * perceive.ts shares with them ({@code norm}, {@code words}, {@code bound}); the committed golden
 * vectors (studio-runner/test/fixtures/gate-vectors) are evaluated against this class by {@code
 * GuidedGateVectorsTest}.
 *
 * <p>Text semantics follow JavaScript, not Java, so the same input gives the same verdict in the
 * runner and here: whitespace is the ECMAScript WhiteSpace plus LineTerminator set (including
 * U+00A0 and U+FEFF, excluding U+0085), and a string anchor is the end of the input, never a final
 * line terminator.
 */
public final class GuidedGates {
  private GuidedGates() {}

  /** One part of an evidence string: the field that supplied it and its code-unit offsets. */
  public record Segment(String field, int start, int end, String purpose) {
    public Segment(String field, int start, int end) {
      this(field, start, end, null);
    }
  }

  /**
   * The facts of one shown ref (observation.facts[ref]); {@code text} is null when withheld, when
   * the role carries no text, or when a descendant is withheld.
   */
  public record Fact(
      String role,
      String name,
      boolean editable,
      String evidence,
      List<Segment> segments,
      String text,
      boolean directTextAssertion) {
    public Fact(
        String role,
        String name,
        boolean editable,
        String evidence,
        List<Segment> segments,
        String text) {
      this(role, name, editable, evidence, segments, text, false);
    }
  }

  /** How the intent gate admitted a pick (persisted as the D7(d) record). */
  public enum IntentPath {
    EXACT_NAME,
    EVIDENCE_SUBSET,
    SELECTED_CHOICE,
    SCOPE_EVIDENCE
  }

  /** {@code code} is null when the intent gate passes. */
  public record IntentVerdict(String code, IntentPath path, List<String> fields) {
    public boolean passed() {
      return code == null;
    }
  }

  public enum TextCheck {
    NOT_APPLICABLE,
    PASS,
    REFUSE
  }

  /** The semantic selection an author accepted: role, name and evidence of the chosen element. */
  public record Selection(
      String role, String name, String evidence, JsonNode ordinal, String scopeHash) {
    public Selection(String role, String name, String evidence) {
      this(role, name, evidence, null, null);
    }
  }

  public static final String INTENT_MISSING = "INTENT_MISSING";
  public static final String INTENT_MISMATCH = "INTENT_MISMATCH";
  public static final String OPERATION_TARGET_MISMATCH = "OPERATION_TARGET_MISMATCH";

  /** perceive.ts MAX_LINE_CHARS: the rendering bound of a name in an outline line. */
  public static final int OUTLINE_NAME_CHARS = 160;

  /** perceive.ts EVIDENCE_CHARS: the cap of an evidence or text value in the facts. */
  public static final int FACT_TEXT_CHARS = 256;

  private static final String WS =
      "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2"
          + "029\\u202F\\u205F\\u3000\\uFEFF";
  private static final Pattern WHITESPACE_RUN = Pattern.compile("[" + WS + "]+");
  private static final Pattern WHITESPACE_ENDS =
      Pattern.compile("\\A[" + WS + "]+|[" + WS + "]+\\z");
  private static final Pattern PUNCTUATION_ENDS =
      Pattern.compile("\\A[\\p{P}\\p{S}" + WS + "]+|[\\p{P}\\p{S}" + WS + "]+\\z");
  private static final Pattern NON_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");
  private static final Pattern TEMPLATE_TOKEN =
      Pattern.compile("<(?:var|secret)[ \\t\\n\\u000B\\f\\r]+[A-Za-z0-9_.-]{1,64}>");

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

  private static final Set<String> SELECT_TARGETS =
      Set.of("combobox", "listbox", "option", "radio", "menuitemradio");
  private static final Set<String> CHECK_TARGETS =
      Set.of("checkbox", "radio", "switch", "menuitemcheckbox", "menuitemradio");
  private static final Set<String> FILL_ROLES = Set.of("textbox", "searchbox", "spinbutton");
  private static final Set<String> NO_TEXT_ROLES =
      Set.of("combobox", "textbox", "searchbox", "spinbutton", "slider", "listbox");

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

  /**
   * The intent gate. An empty intent is INTENT_MISSING; an intent equal to the name passes by
   * EXACT_NAME; an intent with no words can pass only that way; otherwise every intent word must be
   * a word of the evidence (EVIDENCE_SUBSET). {@code fields} names the evidence parts that supplied
   * the words (D7(d)).
   */
  public static IntentVerdict intent(String targetIntent, Fact fact) {
    return intent("read", targetIntent, fact);
  }

  /** Marked public context grants intent only to read/assert operations. */
  public static IntentVerdict intent(String kind, String targetIntent, Fact original) {
    Fact fact = allowedFact(kind, original);
    if (targetIntent == null || norm(targetIntent).isEmpty()) {
      return new IntentVerdict(INTENT_MISSING, null, List.of());
    }
    String name = fact == null || fact.name() == null ? "" : fact.name();
    if (norm(targetIntent).equals(norm(name))) {
      return new IntentVerdict(null, IntentPath.EXACT_NAME, List.of("name"));
    }
    List<String> intentWords = words(targetIntent);
    if (intentWords.isEmpty()) {
      return new IntentVerdict(INTENT_MISMATCH, null, List.of());
    }
    String evidence = fact == null || fact.evidence() == null ? "" : fact.evidence();
    Set<String> evidenceWords = new HashSet<>(words(evidence));
    if (!evidenceWords.containsAll(intentWords)) {
      return new IntentVerdict(INTENT_MISMATCH, null, List.of());
    }
    return new IntentVerdict(
        null,
        IntentPath.EVIDENCE_SUBSET,
        fieldsOf(intentWords, evidence, fact == null ? List.of() : fact.segments()));
  }

  /**
   * Each intent word is assigned to the first segment, in evidence order, whose own words contain
   * it; the result is the distinct field names of the assigned segments in evidence order.
   */
  static List<String> fieldsOf(List<String> intentWords, String evidence, List<Segment> segments) {
    List<Segment> ordered = new ArrayList<>(segments);
    ordered.sort((left, right) -> Integer.compare(left.start(), right.start()));
    List<Set<String>> own = new ArrayList<>();
    for (Segment segment : ordered) {
      int start = Math.max(0, Math.min(segment.start(), evidence.length()));
      int end = Math.max(start, Math.min(segment.end(), evidence.length()));
      own.add(new HashSet<>(words(evidence.substring(start, end))));
    }
    Set<Integer> used = new LinkedHashSet<>();
    for (String word : intentWords) {
      for (int i = 0; i < ordered.size(); i++) {
        if (own.get(i).contains(word)) {
          used.add(i);
          break;
        }
      }
    }
    Set<String> fields = new LinkedHashSet<>();
    used.stream().sorted().forEach(i -> fields.add(ordered.get(i).field()));
    return List.copyOf(fields);
  }

  /**
   * Operation-versus-role gate: a fill, selectOption, check or uncheck must land on a control that
   * can take it. click, press, hover, read and assert are unrestricted. Returns null or {@link
   * #OPERATION_TARGET_MISMATCH}.
   */
  public static String operationTarget(String kind, Fact fact) {
    String role = fact == null ? null : fact.role();
    boolean ok = true;
    if ("fill".equals(kind)) {
      ok = role != null && FILL_ROLES.contains(role) || fact != null && fact.editable();
    } else if ("selectOption".equals(kind)) {
      ok = role != null && SELECT_TARGETS.contains(role);
    } else if ("check".equals(kind) || "uncheck".equals(kind)) {
      ok = role != null && CHECK_TARGETS.contains(role);
    }
    return ok ? null : OPERATION_TARGET_MISMATCH;
  }

  /**
   * G2: an assert containsText must find its authored literal in the text of the target. Not
   * applicable (the check is skipped, Playwright verifies at replay) to any other predicate, to a
   * target whose role carries no text, to withheld or absent text, to text the runner cut at the
   * 256-character cap (a text of exactly 256 code points ending with the ellipsis U+2026) and to a
   * literal that holds a template token. Containment is NFKC, case-insensitive and
   * whitespace-collapsed.
   */
  public static TextCheck assertText(String predicate, Fact fact, String literal) {
    if (!"containsText".equals(predicate) || fact == null || literal == null) {
      return TextCheck.NOT_APPLICABLE;
    }
    String text = fact.text();
    if (fact.directTextAssertion()) {
      return text != null
              && !truncated(text)
              && !TEMPLATE_TOKEN.matcher(literal).find()
              && !fold(literal).isEmpty()
              && fold(text).contains(fold(literal))
          ? TextCheck.PASS
          : TextCheck.REFUSE;
    }
    if (text == null
        || fact.role() != null && NO_TEXT_ROLES.contains(fact.role())
        || truncated(text)
        || TEMPLATE_TOKEN.matcher(literal).find()) {
      return TextCheck.NOT_APPLICABLE;
    }
    return fold(text).contains(fold(literal)) ? TextCheck.PASS : TextCheck.REFUSE;
  }

  static boolean truncated(String text) {
    return text.codePointCount(0, text.length()) == FACT_TEXT_CHARS && text.endsWith("…");
  }

  private static String fold(String value) {
    return trim(WHITESPACE_RUN
            .matcher(Normalizer.normalize(value, Normalizer.Form.NFKC))
            .replaceAll(" "))
        .toLowerCase(Locale.ROOT);
  }

  /** A read needs the visible text of its target: a fact without text cannot be read. */
  public static boolean readEligible(Fact fact) {
    return fact != null && fact.text() != null && !fact.directTextAssertion();
  }

  /** The facts of one ref as {@link Fact}, or null when the node is absent or not an object. */
  public static Fact of(JsonNode fact) {
    if (fact == null || !fact.isObject()) {
      return null;
    }
    List<Segment> segments = new ArrayList<>();
    for (JsonNode segment : fact.path("evidenceSegments")) {
      segments.add(
          new Segment(
              segment.path("field").asText(),
              segment.path("start").asInt(),
              segment.path("end").asInt(),
              segment.path("purpose").isTextual() ? segment.path("purpose").asText() : null));
    }
    return new Fact(
        fact.path("role").asText(),
        fact.path("name").asText(""),
        fact.path("editable").asBoolean(false),
        fact.path("evidence").asText(""),
        List.copyOf(segments),
        fact.path("text").isTextual() ? fact.path("text").asText() : null,
        fact.path("directTextAssertion").asBoolean(false));
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

  private static Fact allowedFact(String kind, Fact fact) {
    if (fact == null || "read".equals(kind) || "assert".equals(kind)) {
      return fact;
    }
    StringBuilder evidence = new StringBuilder();
    List<Segment> segments = new ArrayList<>();
    for (Segment segment : fact.segments()) {
      if (segment.purpose() != null) {
        continue;
      }
      if (segment.start() < 0
          || segment.end() < segment.start()
          || segment.end() > fact.evidence().length()) {
        continue;
      }
      if (!evidence.isEmpty()) {
        evidence.append(' ');
      }
      int start = evidence.length();
      evidence.append(fact.evidence(), segment.start(), segment.end());
      segments.add(new Segment(segment.field(), start, evidence.length()));
    }
    return new Fact(
        fact.role(),
        fact.name(),
        fact.editable(),
        evidence.toString(),
        List.copyOf(segments),
        fact.text(),
        fact.directTextAssertion());
  }

  public static boolean readFallbackEligible(JsonNode fact) {
    return fact.isObject()
        && !fact.has("directTextAssertion")
        && fact.path("text").isTextual()
        && !fact.path("editable").asBoolean()
        && !Set.of(
                "button",
                "textbox",
                "searchbox",
                "spinbutton",
                "combobox",
                "listbox",
                "option",
                "radio",
                "checkbox",
                "switch",
                "menuitem",
                "menuitemradio",
                "menuitemcheckbox")
            .contains(fact.path("role").asText());
  }

  /** Current public identities only; refs are normalized out of the persisted choice identity. */
  public static Selection selectionOf(JsonNode facts, JsonNode fact) {
    Selection base = selectionOf(fact);
    return new Selection(
        base.role(), base.name(), base.evidence(), base.ordinal(), scopeHash(facts, fact));
  }

  public static String scopeHash(JsonNode facts, JsonNode fact) {
    if (!fact.has("scopeRefs")) {
      return null;
    }
    var identities = new com.fasterxml.jackson.databind.ObjectMapper().createArrayNode();
    Set<String> seen = new HashSet<>();
    for (JsonNode ref : fact.path("scopeRefs")) {
      JsonNode source = facts.path(ref.asText());
      com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
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
    return com.citi.put.checks.studio.guided.session.GuidedContracts.hash(identities);
  }

  /** Nonnull authored scope is a conjunction, including selected-choice admission. */
  public static boolean scopeSatisfied(JsonNode obligation, JsonNode facts, JsonNode target) {
    if (!obligation.path("scopeIntent").isTextual()) {
      return true;
    }
    String scope = norm(obligation.path("scopeIntent").asText());
    String completeScope = fold(obligation.path("scopeIntent").asText());
    boolean descriptor = completeScope.startsWith("infobox for ");
    if (scope.isBlank()
        || (completeScope.equals("infobox") || completeScope.startsWith("infobox "))
            && !descriptor) {
      return false;
    }
    for (JsonNode ref : descriptor ? java.util.List.<JsonNode>of() : target.path("scopeRefs")) {
      JsonNode source = facts.path(ref.asText());
      if (completeScopeSource(source) && scope.equals(norm(source.path("name").asText()))) {
        return true;
      }
    }
    String kind = obligation.path("operationKind").asText();
    if (!Set.of("read", "assert").contains(kind) || genericScope(scope)) {
      return false;
    }
    JsonNode relation = target.path("readScope");
    if (descriptor && !relation.has("tableTitleRef")) {
      return false;
    }
    if (!Set.of("SAME_ROW_LABEL", "IMMEDIATE_HEADING_SAME_PARENT", "R7_ADJACENT_PUBLIC")
        .contains(relation.path("relation").asText())) {
      return false;
    }
    if (relation.has("tableTitleRef")) {
      if (!relation.path("relation").asText().equals("SAME_ROW_LABEL")
          || !relation.path("tableTitleRef").isTextual()) {
        return false;
      }
      String titleRef = relation.path("tableTitleRef").asText();
      JsonNode title = facts.path(titleRef);
      boolean member = false;
      boolean label = false;
      Set<String> seen = new HashSet<>();
      for (JsonNode ref : relation.path("sourceRefs")) {
        if (!ref.isTextual()
            || !seen.add(ref.asText())
            || !completeReadSource(facts.path(ref.asText()), ref.asText().equals(titleRef))) {
          return false;
        }
        member |= ref.asText().equals(titleRef);
        label |= !ref.asText().equals(titleRef);
      }
      // A closed authored descriptor preserves the entire complete table title.
      String exactTitle = descriptor ? completeScope.substring(12) : completeScope;
      return member
          && label
          && !genericScope(exactTitle)
          && !exactTitle.isBlank()
          && completeReadSource(title, true)
          && exactTitle.equals(fold(title.path("name").asText()));
    }
    for (JsonNode ref : relation.path("sourceRefs")) {
      JsonNode source = facts.path(ref.asText());
      if (completeScopeSource(source)
          && GuidedActionGuard.containsPhrase(source.path("name").asText(), scope)) {
        return true;
      }
    }
    return false;
  }

  private static boolean completeReadSource(JsonNode source, boolean tableTitle) {
    return completeScopeSource(source)
        || tableTitle
            && source.isObject()
            && source.path("role").asText().equals("caption")
            && source.path("nameComplete").asBoolean(false)
            && !source.path("editable").asBoolean(false)
            && !source.path("name").asText().isBlank()
            && source.path("name").asText().codePointCount(0, source.path("name").asText().length())
                <= 80;
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

  private static boolean genericScope(String scope) {
    return Set.of("row", "table", "page", "region", "section", "group", "list", "item", "content")
        .contains(scope);
  }

  public static void requireCoherentSources(JsonNode facts) {
    var fields = facts.fields();
    while (fields.hasNext()) {
      var entry = fields.next();
      JsonNode fact = entry.getValue(), scope = fact.path("readScope");
      if (fact.has("directTextAssertion")) {
        com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
            fact.path("directTextAssertion").isBoolean()
                && fact.path("directTextAssertion").asBoolean()
                && fact.path("role").asText().equals("paragraph")
                && fact.path("name").asText().isEmpty()
                && !fact.path("editable").asBoolean()
                && fact.path("ownTextComplete").asBoolean()
                && fact.path("text").isTextual()
                && !truncated(fact.path("text").asText()),
            "INVALID_CONTRACT",
            422);
      }
      Set<String> effectSources = new HashSet<>();
      for (JsonNode ref : fact.path("scopeRefs")) {
        com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
            ref.isTextual()
                && effectSources.add(ref.asText())
                && !entry.getKey().equals(ref.asText())
                && completeScopeSource(facts.path(ref.asText())),
            "INVALID_CONTRACT",
            422);
      }
      if (!fact.has("readScope")) {
        continue;
      }
      Set<String> refs = new HashSet<>();
      for (JsonNode ref : scope.path("sourceRefs")) {
        com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
            ref.isTextual()
                && refs.add(ref.asText())
                && !entry.getKey().equals(ref.asText())
                && completeReadSource(
                    facts.path(ref.asText()), ref.equals(scope.path("tableTitleRef"))),
            "INVALID_CONTRACT",
            422);
      }
      if (scope.has("tableTitleRef")) {
        com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
            scope.path("tableTitleRef").isTextual()
                && refs.contains(scope.path("tableTitleRef").asText())
                && refs.size() >= 2
                && scope.path("relation").asText().equals("SAME_ROW_LABEL"),
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
    Map<List<String>, List<JsonNode>> groups = new java.util.LinkedHashMap<>();
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
        com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
            valid, "INVALID_CONTRACT", 422);
      }
    }
  }
}
