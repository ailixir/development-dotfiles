package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Trusted immutable provenance validation; deliberately performs no English extraction. */
public final class GuidedSourceReferenceValidator {
  public record ClassifiedRegion(int startUtf16, int endUtf16) {}

  public record Source(String text, List<ClassifiedRegion> approvedNonsecretRegions) {
    public Source {
      approvedNonsecretRegions = List.copyOf(approvedNonsecretRegions);
    }
  }

  public record ConfigurationValue(
      String value,
      String stepId,
      String kind,
      String intendedSlot,
      String scopeHash,
      boolean approvedNonsecret) {}

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

  public GuidedSourceReferenceValidator(GuidedContracts contracts) {
    this.contracts = contracts;
  }

  public ObjectNode resolve(JsonNode session, Sources sources, JsonNode candidate) {
    contracts.validate("v2/source-reference", candidate);
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
      require(
          source.approvedNonsecretRegions().stream()
              .anyMatch(region -> region.startUtf16() <= start && region.endUtf16() >= end),
          "FORBIDDEN_SCOPE",
          403);
      value = source.text().substring(start, end);
    } else {
      require(
          candidate.path("configurationRevision").asText().equals(sources.configurationRevision()),
          "REVISION_CONFLICT",
          409);
      ConfigurationValue config =
          sources.configuration().get(candidate.path("referenceId").asText());
      require(
          config != null
              && config.approvedNonsecret()
              && config.stepId().equals(step)
              && config.kind().equals(kind)
              && config.intendedSlot().equals(slot)
              && config.scopeHash().equals(session.path("scopeHash").asText()),
          "FORBIDDEN_SCOPE",
          403);
      value = config.value();
    }
    require(value.getBytes(StandardCharsets.UTF_8).length <= 4096, "INVALID_CONTRACT", 422);
    // canonical validates complete UTF-16, without normalizing or decoding source bytes.
    GuidedContracts.canonical(contracts.object().put("value", value));
    if (kind.equals("destination")) {
      String origin = origin(value);
      boolean allowed = false;
      for (JsonNode approved : scope.path("approvedOrigins")) {
        allowed |= approved.asText().equals(origin);
      }
      require(allowed && value.length() <= 2048, "ORIGIN_NOT_ALLOWED", 403);
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

  private static boolean boundary(String text, int offset) {
    return offset == 0
        || offset == text.length()
        || !(Character.isHighSurrogate(text.charAt(offset - 1))
            && Character.isLowSurrogate(text.charAt(offset)));
  }

  public static String origin(String value) {
    try {
      URI uri = URI.create(value);
      require(
          Set.of("http", "https").contains(uri.getScheme())
              && uri.getHost() != null
              && uri.getRawUserInfo() == null,
          "ORIGIN_NOT_ALLOWED",
          403);
      int port = uri.getPort();
      return uri.getScheme()
          + "://"
          + uri.getHost().toLowerCase(java.util.Locale.ROOT)
          + (port == -1
                  || port == 80 && uri.getScheme().equals("http")
                  || port == 443 && uri.getScheme().equals("https")
              ? ""
              : ":" + port);
    } catch (IllegalArgumentException failure) {
      throw new com.citi.put.checks.studio.guided.session.GuidedSessionException(
          "ORIGIN_NOT_ALLOWED", 403);
    }
  }
}
