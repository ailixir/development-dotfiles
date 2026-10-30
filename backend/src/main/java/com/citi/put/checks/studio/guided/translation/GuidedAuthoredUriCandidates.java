package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Optional source-only suggestions; never an accepted plan or navigation permission. */
final class GuidedAuthoredUriCandidates {
  private static final int REFERENCE_CAP = 200;
  private final GuidedContracts contracts;
  private final AllowedDomains domains;

  GuidedAuthoredUriCandidates(GuidedContracts contracts, AllowedDomains domains) {
    this.contracts = contracts;
    this.domains = domains;
  }

  ArrayNode candidates(JsonNode session, JsonNode manifest) {
    return candidates(session, manifest, null);
  }

  /**
   * @param stepIds when non-null, only suggestions for these steps (an incremental re-learn).
   */
  ArrayNode candidates(JsonNode session, JsonNode manifest, Set<String> stepIds) {
    ArrayNode result = contracts.object().arrayNode();
    JsonNode steps = manifest.path("sourceSteps");
    if (!steps.isArray()
        || steps.size() > 100
        || !manifest.path("sourceRevision").isTextual()
        || !manifest.path("configurationRevision").isTextual()) {
      return result;
    }
    var sources = new LinkedHashMap<String, GuidedSourceReferenceValidator.Source>();
    for (JsonNode step : steps) {
      JsonNode textNode = step.path("text"), regions = step.path("regions");
      if (!textNode.isTextual() || textNode.asText().length() > 4000 || !regions.isArray()) {
        return result;
      }
      String text = textNode.asText();
      try {
        GuidedContracts.canonical(textNode);
      } catch (GuidedSessionException invalidText) {
        return result;
      }
      var approved = new ArrayList<GuidedSourceReferenceValidator.ClassifiedRegion>();
      for (JsonNode region : regions) {
        if (!region.path("startUtf16").isIntegralNumber()
            || !region.path("startUtf16").canConvertToInt()
            || !region.path("endUtf16").isIntegralNumber()
            || !region.path("endUtf16").canConvertToInt()) {
          return result;
        }
        int start = region.path("startUtf16").asInt(-1);
        int end = region.path("endUtf16").asInt(-1);
        if (start < 0 || start >= end || end > text.length()) {
          return result;
        }
        approved.add(new GuidedSourceReferenceValidator.ClassifiedRegion(start, end));
      }
      if (sources.put(
              step.path("stepId").asText(),
              new GuidedSourceReferenceValidator.Source(text, approved))
          != null) {
        return result;
      }
    }
    // Configuration values are deliberately not read or supplied to this source-only resolver.
    var sourceOnly =
        new GuidedSourceReferenceValidator.Sources(
            manifest.path("sourceRevision").asText(),
            manifest.path("configurationRevision").asText(),
            sources,
            Map.of());
    var resolver = new GuidedSourceReferenceValidator(contracts, domains);
    var seen = new HashSet<String>();
    int checked = 0;
    for (var entry : sources.entrySet()) {
      if (stepIds != null && !stepIds.contains(entry.getKey())) {
        continue;
      }
      var source = entry.getValue();
      for (Span span : literals(source.text())) {
        if (!source.approves(span.start(), span.end())) {
          continue;
        }
        var candidate =
            contracts
                .object()
                .put("referenceKind", "sourceSpan")
                .put("sourceRevision", sourceOnly.sourceRevision())
                .put("stepId", entry.getKey())
                .put("startUtf16", span.start())
                .put("endUtf16", span.end())
                .put("kind", "destination")
                .put("intendedSlot", "navigate.destination");
        if (!seen.add(GuidedContracts.hash(candidate))) {
          continue;
        }
        if (checked == REFERENCE_CAP) {
          return result;
        }
        checked++;
        try {
          resolver.resolveSourceOnly(session, sourceOnly, candidate);
          result.add(candidate);
        } catch (GuidedSessionException refused) {
          if (!Set.of(
                  "INVALID_CONTRACT", "ORIGIN_NOT_ALLOWED", "FORBIDDEN_SCOPE", "REVISION_CONFLICT")
              .contains(refused.getMessage())) {
            throw refused;
          }
        }
      }
    }
    // Exact offsets of each quoted literal, so the model copies them instead of counting UTF-16
    // code units (a miscount is refused by GuidedSourceInputResolver). The slot is the model's
    // call.
    for (var entry : sources.entrySet()) {
      if (stepIds != null && !stepIds.contains(entry.getKey())) {
        continue;
      }
      var source = entry.getValue();
      for (int[] span : GuidedSourceInputResolver.quotedSpans(source.text())) {
        if (scheme(source.text(), span[0])) {
          continue; // already offered above as a destination
        }
        if (!source.approves(span[0], span[1])) {
          continue;
        }
        for (String slot : LITERAL_SLOTS) {
          var candidate =
              contracts
                  .object()
                  .put("referenceKind", "sourceSpan")
                  .put("sourceRevision", sourceOnly.sourceRevision())
                  .put("stepId", entry.getKey())
                  .put("startUtf16", span[0])
                  .put("endUtf16", span[1])
                  .put("kind", "nonsecretText")
                  .put("intendedSlot", slot);
          if (checked == REFERENCE_CAP) {
            return result;
          }
          checked++;
          try {
            resolver.resolveSourceOnly(session, sourceOnly, candidate);
            if (seen.add(GuidedContracts.hash(candidate))) {
              result.add(candidate);
            }
          } catch (GuidedSessionException refused) {
            if (!Set.of("INVALID_CONTRACT", "FORBIDDEN_SCOPE", "REVISION_CONFLICT")
                .contains(refused.getMessage())) {
              throw refused;
            }
          }
        }
      }
    }
    return result;
  }

  private static final List<String> LITERAL_SLOTS =
      List.of("fill.value", "selectOption.value", "assert.expected");

  record Span(int start, int end) {}

  /** Lex the original whole step before classified-region checks, never a clipped substring. */
  static List<Span> literals(String text) {
    var result = new ArrayList<Span>();
    int at = 0;
    while (at < text.length()) {
      if (space(text.codePointAt(at))) {
        at += Character.charCount(text.codePointAt(at));
        continue;
      }
      int start = at, end;
      char quote = text.charAt(at);
      if (quote(quote)) {
        start++;
        end = start;
        boolean ambiguous = false;
        while (end < text.length() && text.charAt(end) != quote) {
          ambiguous |= quote(text.charAt(end)) || text.charAt(end) == '\\';
          end += Character.charCount(text.codePointAt(end));
        }
        if (end == text.length()) {
          break;
        }
        at = tokenEnd(text, end + 1);
        for (int suffix = end + 1; suffix < at; suffix++) {
          ambiguous |= quote(text.charAt(suffix)) || text.charAt(suffix) == '\\';
        }
        if (!ambiguous && scheme(text, start) && end > start) {
          result.add(new Span(start, end));
        }
      } else {
        end = tokenEnd(text, at);
        at = end;
        if (scheme(text, start) && !ambiguousUnquoted(text.substring(start, end))) {
          result.add(new Span(start, end));
        }
      }
    }
    return result;
  }

  private static int tokenEnd(String text, int at) {
    while (at < text.length() && !space(text.codePointAt(at))) {
      at += Character.charCount(text.codePointAt(at));
    }
    return at;
  }

  private static boolean space(int codePoint) {
    return Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint);
  }

  private static boolean quote(char value) {
    return value == '"' || value == '\'' || value == '`';
  }

  private static boolean scheme(String text, int start) {
    return text.startsWith("http://", start) || text.startsWith("https://", start);
  }

  static boolean ambiguousUnquoted(String value) {
    if (".,;:!?)]}>".indexOf(value.charAt(value.length() - 1)) >= 0) {
      return true;
    }
    for (int at = 0; at < value.length(); at++) {
      char c = value.charAt(at);
      if (quote(c) || "()[]{}<>,;\\".indexOf(c) >= 0 || at > 0 && scheme(value, at)) {
        return true;
      }
    }
    return false;
  }
}
