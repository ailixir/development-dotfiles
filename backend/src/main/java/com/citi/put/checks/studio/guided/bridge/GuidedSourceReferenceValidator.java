package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.navigation.AllowedDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Trusted immutable provenance validation; deliberately performs no English extraction. */
public final class GuidedSourceReferenceValidator {
  public record ClassifiedRegion(int startUtf16, int endUtf16) {}

  public record Source(String text, List<ClassifiedRegion> approvedNonsecretRegions) {
    public Source {
      approvedNonsecretRegions = List.copyOf(approvedNonsecretRegions);
    }

    /**
     * Whether {@code [start, end)} may be typed: inside one approved region, or a template, meaning
     * authored text mixed with whole plain {@code <var NAME>} tokens and nothing else. A span that
     * is only one variable token stays on the whole-variable configuration path, an edge inside a
     * token would type half of it, and a secret token is never part of a template.
     */
    public boolean approves(int start, int end) {
      if (approvedNonsecretRegions.stream()
          .anyMatch(region -> region.startUtf16() <= start && region.endUtf16() >= end)) {
        return true;
      }
      if (!SourceTemplate.hasVariable(text, start, end)
          || SourceTemplate.isWholeVariable(text, start, end)
          || SourceTemplate.splitsToken(text, start, end)
          || SourceTemplate.overlapsSecret(text, start, end)) {
        return false;
      }
      List<int[]> cover = new java.util.ArrayList<>();
      approvedNonsecretRegions.forEach(
          region -> cover.add(new int[] {region.startUtf16(), region.endUtf16()}));
      SourceTemplate.variables(text)
          .forEach(token -> cover.add(new int[] {token.start(), token.end()}));
      cover.sort(java.util.Comparator.comparingInt(interval -> interval[0]));
      int from = -1, to = -1;
      for (int[] interval : cover) {
        if (interval[0] > to) {
          if (from <= start && to >= end) {
            return true;
          }
          from = interval[0];
          to = interval[1];
        } else {
          to = Math.max(to, interval[1]);
        }
      }
      return from <= start && to >= end;
    }
  }

  public record ConfigurationValue(
      String value,
      String stepId,
      String kind,
      String intendedSlot,
      String scopeHash,
      boolean approvedNonsecret,
      String referenceName) {
    public ConfigurationValue(
        String value,
        String stepId,
        String kind,
        String intendedSlot,
        String scopeHash,
        boolean approvedNonsecret) {
      this(value, stepId, kind, intendedSlot, scopeHash, approvedNonsecret, null);
    }
  }

  public record Sources(
      String sourceRevision,
      String configurationRevision,
      Map<String, Source> steps,
      Map<String, ConfigurationValue> configuration) {
    public Sources {
      steps = Map.copyOf(steps);
      configuration = Map.copyOf(configuration);
    }
  }

  private final GuidedContracts contracts;
  private final AllowedDomains domains;

  public GuidedSourceReferenceValidator(GuidedContracts contracts, AllowedDomains domains) {
    this.contracts = contracts;
    this.domains = domains;
  }

  public ObjectNode resolve(JsonNode session, Sources sources, JsonNode candidate) {
    return resolve(session, sources, candidate, true);
  }

  /**
   * The same checks without reading any configuration value: a template's variable tokens stay as
   * authored. For source-only suggestions, never for an input a run will type.
   */
  public ObjectNode resolveSourceOnly(JsonNode session, Sources sources, JsonNode candidate) {
    return resolve(session, sources, candidate, false);
  }

  private ObjectNode resolve(
      JsonNode session, Sources sources, JsonNode candidate, boolean expandVariables) {
    contracts.validate("v3/source-reference", candidate);
    JsonNode scope = session.path("scope");
    require(
        sources.sourceRevision().equals(scope.path("sourceRevision").asText())
            && sources.configurationRevision().equals(scope.path("configurationRevision").asText()),
        "REVISION_CONFLICT",
        409);
    String step = candidate.path("stepId").asText(), kind = candidate.path("kind").asText();
    String slot = candidate.path("intendedSlot").asText();
    boolean stepExists = false;
    for (JsonNode sourceStep : session.path("sourceSteps")) {
      stepExists |= sourceStep.path("stepId").asText().equals(step);
    }
    require(
        stepExists && (kind.equals("destination") == slot.equals("navigate.destination")),
        "INVALID_CONTRACT",
        422);
    String value;
    if (candidate.path("referenceKind").asText().equals("sourceSpan")) {
      require(
          candidate.path("sourceRevision").asText().equals(sources.sourceRevision()),
          "REVISION_CONFLICT",
          409);
      Source source = sources.steps().get(step);
      require(source != null, "FORBIDDEN_SCOPE", 403);
      int start = candidate.path("startUtf16").asInt(), end = candidate.path("endUtf16").asInt();
      require(
          start < end
              && end <= source.text().length()
              && boundary(source.text(), start)
              && boundary(source.text(), end),
          "INVALID_CONTRACT",
          422);
      require(source.approves(start, end), "FORBIDDEN_SCOPE", 403);
      boolean template = SourceTemplate.hasVariable(source.text(), start, end);
      // A variable inside a navigation URL is not supported: the destination is checked as typed.
      require(!template || !kind.equals("destination"), "FORBIDDEN_SCOPE", 403);
      if (template && expandVariables) {
        value =
            SourceTemplate.expand(
                source.text(), start, end, name -> variableValue(sources, step, name));
        require(value != null, "MISSING_SOURCE", 409);
      } else {
        value = source.text().substring(start, end);
      }
    } else {
      require(
          candidate.path("configurationRevision").asText().equals(sources.configurationRevision()),
          "REVISION_CONFLICT",
          409);
      ConfigurationValue config =
          sources.configuration().get(candidate.path("referenceId").asText());
      require(
          config != null
              && (config.approvedNonsecret() || kind.equals("secretRef"))
              && config.stepId().equals(step)
              && config.kind().equals(kind)
              && config.intendedSlot().equals(slot)
              && config.scopeHash().equals(session.path("scopeHash").asText()),
          "FORBIDDEN_SCOPE",
          403);
      if (kind.equals("secretRef")) {
        require(
            slot.equals("fill.value")
                && candidate.path("referenceName").asText().equals(config.referenceName())
                && com.citi.put.checks.studio.secrets.StudioVaultProvider.isValidSecretName(
                    config.referenceName()),
            "FORBIDDEN_SCOPE",
            403);
        ObjectNode input =
            contracts
                .object()
                .put("inputId", UUID.randomUUID().toString())
                .put("sourceStepId", step)
                .put("kind", "secretRef")
                .put("secretId", config.referenceName())
                .put("intendedSlot", "fill.value");
        input.set("provenance", candidate.deepCopy());
        return input;
      }
      value = config.value();
    }
    require(value.getBytes(StandardCharsets.UTF_8).length <= 4096, "INVALID_CONTRACT", 422);
    // canonical validates complete UTF-16, without normalizing or decoding source bytes.
    GuidedContracts.canonical(contracts.object().put("value", value));
    if (kind.equals("destination")) {
      // The deployment's allowed domains are the only navigation control: any http(s) page on a
      // listed domain or its subdomains, whether or not the test names it.
      require(value.length() <= 2048 && domains.allows(value), "ORIGIN_NOT_ALLOWED", 403);
    }
    ObjectNode input =
        contracts
            .object()
            .put("inputId", UUID.randomUUID().toString())
            .put("sourceStepId", step)
            .put("kind", kind)
            .put("value", value)
            .put("intendedSlot", slot);
    input.set("provenance", candidate.deepCopy());
    return input;
  }

  private static String variableValue(Sources sources, String step, String name) {
    for (ConfigurationValue config : sources.configuration().values()) {
      if (config.stepId().equals(step)
          && name.equals(config.referenceName())
          && config.kind().equals("nonsecretText")
          && config.approvedNonsecret()) {
        return config.value();
      }
    }
    return null;
  }

  private static boolean boundary(String text, int offset) {
    return offset == 0
        || offset == text.length()
        || !(Character.isHighSurrogate(text.charAt(offset - 1))
            && Character.isLowSurrogate(text.charAt(offset)));
  }
}
