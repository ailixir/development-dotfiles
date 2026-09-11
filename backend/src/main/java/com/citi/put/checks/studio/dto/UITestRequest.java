package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import java.io.IOException;
import java.util.List;

/**
 * Create/update payload for a Studio draft, in the frozen typed shape (Architecture §8.3, AC-2).
 *
 * <p>Clients submit English {@code steps} only; the server generates the executable artifact.
 *
 * <p>{@code csiId} is accepted on create only and must reference a registered CSI; on update it may
 * be omitted or repeated, but a different value is rejected with {@code 409 CSI_IMMUTABLE}
 * (Architecture §9.1).
 *
 * <p>{@code sourceRevision} and {@code configurationRevision} are required on update and carry the
 * optimistic-concurrency check: a mismatch is rejected with {@code 409 STALE_REVISION} and no field
 * changes (Architecture §4.2). They are ignored on create, which always starts at revision 1.
 *
 * <p>Legacy request bodies — JSON-string {@code steps}/{@code variables}, structured {@code TestIR}
 * steps, flattened {@code viewportWidth}/{@code viewportHeight} and {@code browser: "chrome"} — are
 * accepted and folded into this shape by {@link LegacyDeserializer} and {@link LegacyStudioAdapter}
 * (AC-4).
 */
@JsonDeserialize(using = UITestRequest.LegacyDeserializer.class)
public record UITestRequest(
    String name,
    String description,
    String csiId,
    String environment,
    List<String> steps,
    List<StudioVariable> variables,
    TestConfiguration configuration,
    Long sourceRevision,
    Long configurationRevision) {

  public UITestRequest {
    steps = steps == null ? List.of() : List.copyOf(steps);
    variables = variables == null ? List.of() : List.copyOf(variables);
    configuration = configuration == null ? TestConfiguration.defaults() : configuration;
  }

  /**
   * Legacy constructor kept for callers written against the pre-10.1 flattened shape. It
   * restructures, it does not validate: an unsupported engine still reaches the service layer and
   * is rejected once, at the controller boundary (see {@link
   * LegacyStudioAdapter#validateForWrite(UITestRequest)}).
   *
   * @param steps JSON array of lines, or of legacy structured steps
   * @param variables JSON array of variable references
   */
  @SuppressWarnings("checkstyle:ParameterNumber")
  public UITestRequest(
      String name,
      String description,
      String csiId,
      String steps,
      String variables,
      String browser,
      int viewportWidth,
      int viewportHeight,
      int timeoutSeconds,
      String waitStrategy,
      String environment,
      Long sourceRevision,
      Long configurationRevision) {
    this(
        name,
        description,
        csiId,
        environment,
        LegacyStudioAdapter.parseSteps(steps),
        LegacyStudioAdapter.parseVariables(variables),
        new TestConfiguration(
            LegacyStudioAdapter.normalizeBrowser(browser),
            LegacyStudioAdapter.viewport(viewportWidth, viewportHeight),
            timeoutSeconds <= 0 ? TestConfiguration.DEFAULT_TIMEOUT_SECONDS : timeoutSeconds,
            waitStrategy == null ? TestConfiguration.DEFAULT_WAIT_STRATEGY : waitStrategy),
        sourceRevision,
        configurationRevision);
  }

  /**
   * Accepts both the canonical body and every legacy body shape.
   *
   * <p>A hand-written deserializer is used instead of the record's canonical constructor because
   * the legacy and canonical shapes disagree on the JSON type of {@code steps} and {@code
   * variables} and on where the configuration lives. Doing the conversion here keeps every
   * controller signature on the typed contract.
   */
  public static final class LegacyDeserializer extends StdDeserializer<UITestRequest> {

    private static final long serialVersionUID = 1L;

    public LegacyDeserializer() {
      super(UITestRequest.class);
    }

    @Override
    public UITestRequest deserialize(JsonParser parser, DeserializationContext context)
        throws IOException {
      JsonNode node = parser.getCodec().readTree(parser);
      JsonNode configuration = node.path("configuration");

      String browser =
          configuration.isObject() && configuration.path("browser").isTextual()
              ? configuration.path("browser").textValue()
              : asText(node.path("browser"));

      JsonNode viewport = configuration.path("viewport");
      Integer width =
          viewport.isObject() ? asInt(viewport.path("width")) : asInt(node.path("viewportWidth"));
      Integer height =
          viewport.isObject() ? asInt(viewport.path("height")) : asInt(node.path("viewportHeight"));

      Integer timeoutSeconds =
          configuration.isObject() && !configuration.path("timeoutSeconds").isMissingNode()
              ? asInt(configuration.path("timeoutSeconds"))
              : asInt(node.path("timeoutSeconds"));
      String waitStrategy =
          configuration.isObject() && configuration.path("waitStrategy").isTextual()
              ? configuration.path("waitStrategy").textValue()
              : asText(node.path("waitStrategy"));

      return new UITestRequest(
          asText(node.path("name")),
          asText(node.path("description")),
          asText(node.path("csiId")),
          asText(node.path("environment")),
          LegacyStudioAdapter.stepsFromNode(node.get("steps")),
          LegacyStudioAdapter.variablesFromNode(node.get("variables")),
          new TestConfiguration(
              LegacyStudioAdapter.normalizeBrowser(browser),
              LegacyStudioAdapter.viewport(width, height),
              timeoutSeconds == null || timeoutSeconds <= 0
                  ? TestConfiguration.DEFAULT_TIMEOUT_SECONDS
                  : timeoutSeconds,
              waitStrategy == null ? TestConfiguration.DEFAULT_WAIT_STRATEGY : waitStrategy),
          asLong(node.path("sourceRevision")),
          asLong(node.path("configurationRevision")));
    }

    private static String asText(JsonNode node) {
      return node == null || !node.isTextual() ? null : node.textValue();
    }

    private static Integer asInt(JsonNode node) {
      return node == null || !node.isNumber() ? null : node.intValue();
    }

    private static Long asLong(JsonNode node) {
      return node == null || !node.isNumber() ? null : node.longValue();
    }
  }
}
