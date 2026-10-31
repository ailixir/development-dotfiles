package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;

/** Server provenance and exact source slicing; no model-created bytes or trust flags. */
public final class GuidedSourceInputResolver {
  private static final org.slf4j.Logger LOG =
      org.slf4j.LoggerFactory.getLogger(GuidedSourceInputResolver.class);

  private final GuidedContracts contracts;
  private final AllowedDomains domains;

  public GuidedSourceInputResolver(GuidedContracts contracts, AllowedDomains domains) {
    this.contracts = contracts;
    this.domains = domains;
  }

  public GuidedSourceReferenceValidator.Sources sources(JsonNode session, JsonNode manifest) {
    var steps = new LinkedHashMap<String, GuidedSourceReferenceValidator.Source>();
    for (JsonNode step : manifest.path("sourceSteps")) {
      var regions = new ArrayList<GuidedSourceReferenceValidator.ClassifiedRegion>();
      for (JsonNode region : step.path("regions")) {
        regions.add(
            new GuidedSourceReferenceValidator.ClassifiedRegion(
                region.path("startUtf16").asInt(), region.path("endUtf16").asInt()));
      }
      steps.put(
          step.path("stepId").asText(),
          new GuidedSourceReferenceValidator.Source(step.path("text").asText(), regions));
    }
    var configs = new LinkedHashMap<String, GuidedSourceReferenceValidator.ConfigurationValue>();
    manifest
        .path("configurationValues")
        .fields()
        .forEachRemaining(
            entry -> {
              JsonNode value = entry.getValue();
              configs.put(
                  entry.getKey(),
                  new GuidedSourceReferenceValidator.ConfigurationValue(
                      value.has("value") ? value.path("value").asText() : null,
                      value.path("stepId").asText(),
                      value.path("kind").asText(),
                      session.path("scopeHash").asText(),
                      !value.path("kind").asText().equals("secretRef"),
                      value.path("referenceName").asText()));
            });
    return new GuidedSourceReferenceValidator.Sources(
        manifest.path("sourceRevision").asText(),
        manifest.path("configurationRevision").asText(),
        steps,
        configs);
  }

  /**
   * The authored literal a source reference names: the exact source span of its step, in the
   * manifest. Null for a reference that is not a source span (a saved configuration value, a
   * secret) or whose span lies outside its step; those values are never compared against page text.
   */
  public static String literalOf(JsonNode manifest, JsonNode reference) {
    if (!reference.path("referenceKind").asText().equals("sourceSpan")) {
      return null;
    }
    for (JsonNode step : manifest.path("sourceSteps")) {
      if (step.path("stepId").equals(reference.path("stepId")) && step.path("text").isTextual()) {
        String text = step.path("text").asText();
        int start = reference.path("startUtf16").asInt(-1),
            end = reference.path("endUtf16").asInt(-1);
        return start >= 0 && end >= start && end <= text.length()
            ? text.substring(start, end)
            : null;
      }
    }
    return null;
  }

  public void validate(JsonNode session, JsonNode manifest, JsonNode references) {
    require(references.isArray() && references.size() <= 200, "INVALID_CONTRACT", 422);
    var validator = new GuidedSourceReferenceValidator(contracts, domains);
    var seen = new java.util.HashSet<String>();
    for (JsonNode reference : references) {
      require(seen.add(GuidedContracts.hash(reference)), "INVALID_CONTRACT", 422);
      validator.resolve(session, sources(session, manifest), reference);
      requireQuotedLiteral(manifest, reference);
    }
  }

  /**
   * In a step that quotes a literal, a typed, selected or asserted literal is that quoted text: the
   * model's UTF-16 offsets must start right after an opening quote and end right before its closing
   * quote, so a miscounted span is a repairable contract error instead of a wrong stored literal.
   */
  private static void requireQuotedLiteral(JsonNode manifest, JsonNode reference) {
    if (!reference.path("referenceKind").asText().equals("sourceSpan")
        || !reference.path("kind").asText().equals("nonsecretText")) {
      return;
    }
    String text = null;
    for (JsonNode step : manifest.path("sourceSteps")) {
      if (step.path("stepId").equals(reference.path("stepId"))) {
        text = step.path("text").asText();
      }
    }
    int start = reference.path("startUtf16").asInt(), end = reference.path("endUtf16").asInt();
    require(text != null, "INVALID_CONTRACT", 422);
    if (!hasQuotedLiteral(text)) {
      // Nothing the author quoted to anchor on: the bridge's region check is the only authority.
      return;
    }
    boolean exact = start > 0 && end < text.length();
    if (exact) {
      char open = text.charAt(start - 1);
      exact =
          closing(open) == text.charAt(end)
              && closing(open) != 0
              && text.substring(start, end).indexOf(text.charAt(end)) < 0;
    }
    if (!exact) {
      // Offsets only, never step text: enough to tell a miscounted span from a wrong kind.
      LOG.warn(
          "Refused literal span kind={} start={} end={} textLength={} quotedLiterals={}",
          reference.path("kind").asText(),
          start,
          end,
          text.length(),
          quotedLiterals(text));
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "INVALID_CONTRACT", 422);
    }
  }

  private static java.util.List<String> quotedLiterals(String text) {
    var found = new java.util.ArrayList<String>();
    for (int[] span : quotedSpans(text)) {
      found.add("[" + span[0] + "," + span[1] + ")");
    }
    return found;
  }

  /** Content offsets {start, end} of each non-empty quoted literal, delimiters excluded. */
  static java.util.List<int[]> quotedSpans(String text) {
    var found = new java.util.ArrayList<int[]>();
    for (int i = 0; i < text.length(); i++) {
      char close = closing(text.charAt(i));
      int end = close == 0 ? -1 : text.indexOf(close, i + 1);
      if (end > i + 1) {
        found.add(new int[] {i + 1, end});
        i = end;
      }
    }
    return found;
  }

  private static boolean hasQuotedLiteral(String text) {
    for (int i = 0; i < text.length(); i++) {
      char close = closing(text.charAt(i));
      if (close != 0 && text.indexOf(close, i + 1) > i) {
        return true;
      }
    }
    return false;
  }

  private static char closing(char open) {
    return switch (open) {
      case '"' -> '"';
      case '\'' -> '\'';
      case '`' -> '`';
      case '\u201c' -> '\u201d';
      case '\u2018' -> '\u2019';
      default -> 0;
    };
  }
}
