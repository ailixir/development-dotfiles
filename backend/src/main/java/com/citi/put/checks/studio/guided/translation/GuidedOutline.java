package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * ADR-SC-007: reads the outline string an observation carries. The outline is the only part of an
 * observation the model sees; the facts table holds what the backend decides on. Both are keyed by
 * the same short refs, and this class is the single reader of the outline text (the ingestion
 * consistency check and the test helpers that script a model reply use it).
 *
 * <p>A line is {@code - role "name" [ref] ...}. The name is a JSON string, so a name that itself
 * contains {@code [e9]} is part of the name and never a ref. Lines without a ref (withheld,
 * password and unsupported lines, the "more" markers) show nothing a model can name.
 */
public final class GuidedOutline {
  private GuidedOutline() {}

  /** One parsed outline line. {@code name} and {@code ref} are null when the line has none. */
  public record Line(int indent, String role, String name, String ref, String rest) {}

  private static final String QUOTED = "\"(?:[^\"\\\\]|\\\\.)*\"";
  private static final Pattern LINE =
      Pattern.compile(
          "\\A( *)- (\\S+)(?: ("
              + QUOTED
              + "))?(?: \\[(e[0-9]{1,6})\\])?([^\\n\\r\\u2028\\u2029]*)\\z");
  private static final Pattern MORE_OPTIONS = Pattern.compile("\\A( *)… [0-9]+ more options *\\z");
  private static final Pattern MORE_NODES =
      Pattern.compile("\\A… [0-9]+ more nodes not shown *\\z");
  private static final ObjectMapper JSON = new ObjectMapper();

  /** The parsed lines in order; markers and lines that do not parse are not part of the result. */
  public static List<Line> parse(String outline) {
    List<Line> lines = new ArrayList<>();
    for (String raw : outline.split("\n", -1)) {
      if (MORE_OPTIONS.matcher(raw).matches() || MORE_NODES.matcher(raw).matches()) {
        continue;
      }
      Matcher match = LINE.matcher(raw);
      if (!match.matches()) {
        continue;
      }
      lines.add(
          new Line(
              match.group(1).length() / 2,
              match.group(2),
              match.group(3) == null ? null : unquote(match.group(3)),
              match.group(4),
              match.group(5)));
    }
    return lines;
  }

  private static String unquote(String quoted) {
    try {
      return JSON.readValue(quoted, String.class);
    } catch (Exception invalid) {
      return quoted.substring(1, quoted.length() - 1);
    }
  }

  /** The refs the outline shows, in order. */
  public static Set<String> shownRefs(String outline) {
    Set<String> refs = new LinkedHashSet<>();
    for (Line line : parse(outline)) {
      if (line.ref() != null) {
        refs.add(line.ref());
      }
    }
    return refs;
  }

  /**
   * An observation is admitted only when the refs of its facts are exactly the refs its outline
   * shows (INVALID_CONTRACT 422): a fact with no outline line, or an outline ref with no fact,
   * would let the model name something the gates cannot judge.
   */
  public static void requireConsistent(JsonNode observation) {
    JsonNode outline = observation.path("outline");
    JsonNode facts = observation.path("facts");
    require(outline.isTextual() && facts.isObject(), "INVALID_CONTRACT", 422);
    Set<String> shown = shownRefs(outline.asText());
    Set<String> keys = new LinkedHashSet<>();
    facts.fieldNames().forEachRemaining(keys::add);
    require(shown.equals(keys), "INVALID_CONTRACT", 422);
    GuidedGates.requireCoherentOrdinals(facts);
    var seen = new java.util.HashSet<String>();
    var positions = new java.util.HashMap<List<String>, Integer>();
    for (Line line : parse(outline.asText())) {
      if (line.ref() == null) {
        continue;
      }
      JsonNode fact = facts.path(line.ref());
      require(
          seen.add(line.ref()) && line.role().equals(fact.path("role").asText()),
          "INVALID_CONTRACT",
          422);
      var key =
          List.of(
              fact.path("role").asText(),
              fact.path("name").asText(),
              fact.path("evidence").asText());
      int position = positions.merge(key, 1, Integer::sum);
      var ordinal =
          Pattern.compile("\\{ordinal=([0-9]+)/([0-9]+)\\}")
              .matcher(Pattern.compile(QUOTED).matcher(line.rest()).replaceAll(""));
      if (fact.has("ordinal")) {
        require(
            ordinal.find()
                && ordinal.group(1).equals(Integer.toString(position))
                && ordinal.group(2).equals(fact.path("ordinal").path("count").asText())
                && fact.path("ordinal").path("index").asInt() == position
                && !ordinal.find(),
            "INVALID_CONTRACT",
            422);
      } else {
        require(!ordinal.find(), "INVALID_CONTRACT", 422);
      }
    }
  }
}
