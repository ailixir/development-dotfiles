package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * Story 10.45 AC 5 (spec &sect;3.2.6 "Provider schema", &sect;6.1 "Provider schema bytes identical
 * across two fresh JVMs / hash seeds").
 *
 * <p>{@code Map.of} iterates in an order derived from a salt the JVM randomizes at startup, so two
 * serializations inside one JVM always agree even when two JVMs do not. Comparing two in-process
 * serializations would therefore pass vacuously. The seed-independent checks are the golden string
 * below, which a salted map would match only by chance in a given JVM, and the structural walk,
 * which fails on any map whose iteration order is not fixed by construction.
 */
class ProviderSchemaDeterminismTest {

  private static final ObjectMapper JSON = new ObjectMapper();

  private static final UUID FIRST = UUID.fromString("00000000-0000-0000-0000-00000000000a");
  private static final UUID SECOND = UUID.fromString("00000000-0000-0000-0000-00000000000b");

  /**
   * The FULL schema content, in its fixed key order. Provider schema version 2 (VAL-030): each step
   * is a per-status {@code anyOf}, mirroring the benchmark's validated candidate.
   */
  private static final String GOLDEN =
      "{\"type\":\"object\",\"required\":[\"version\",\"kind\",\"steps\"],"
          + "\"properties\":{"
          + "\"version\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":1},"
          + "\"kind\":{\"type\":\"string\",\"enum\":[\"FULL\"]},"
          + "\"steps\":{\"type\":\"array\",\"minItems\":2,\"maxItems\":2,"
          + "\"items\":{\"anyOf\":["
          + "{\"type\":\"object\",\"required\":[\"stepId\",\"status\",\"code\"],"
          + "\"properties\":{"
          + "\"stepId\":{\"type\":\"string\",\"enum\":[\""
          + FIRST
          + "\",\""
          + SECOND
          + "\"]},"
          + "\"status\":{\"type\":\"string\",\"enum\":[\"GENERATED\"]},"
          + "\"code\":{\"type\":\"string\"}}},"
          + "{\"type\":\"object\",\"required\":[\"stepId\",\"status\",\"reason\",\"message\"],"
          + "\"properties\":{"
          + "\"stepId\":{\"type\":\"string\",\"enum\":[\""
          + FIRST
          + "\",\""
          + SECOND
          + "\"]},"
          + "\"status\":{\"type\":\"string\",\"enum\":[\"UNSUPPORTED\",\"CLARIFICATION\"]},"
          + "\"reason\":{\"type\":\"string\",\"enum\":[\"UNSUPPORTED_CAPABILITY\","
          + "\"AMBIGUOUS_INTENT\"]},"
          + "\"message\":{\"type\":\"string\"}}}]}}}}";

  private static CompileRequest request() {
    return new CompileRequest(
        UUID.fromString("11111111-2222-3333-4444-555555555555"),
        "CSI12345",
        "u-test-principal",
        "cr-0001",
        1,
        List.of("0: \"Go to example\"", "1: \"Click OK\""),
        "PLAYWRIGHT SYNTAX REFERENCE (stub body)",
        "syntax-2026.09.0",
        "Return a JSON artifact conforming to the artifact contract.",
        "prompt-2026.09.0",
        null,
        "FULL",
        List.of(FIRST, SECOND));
  }

  @Test
  void serializedSchemaMatchesTheGoldenBytesInAnyJvm() throws Exception {
    assertThat(JSON.writeValueAsString(GenAiLlmGatewayClient.providerSchema(request())))
        .isEqualTo(GOLDEN);
  }

  @Test
  void twoFreshBuildsSerializeToIdenticalBytes() throws Exception {
    String first = JSON.writeValueAsString(GenAiLlmGatewayClient.providerSchema(request()));
    String second = JSON.writeValueAsString(GenAiLlmGatewayClient.providerSchema(request()));

    assertThat(second).isEqualTo(first);
  }

  @Test
  void everyMapInTheSchemaHasAConstructionFixedIterationOrder() {
    List<String> unordered = new ArrayList<>();
    walk("$", GenAiLlmGatewayClient.providerSchema(request()), unordered);

    assertThat(unordered).as("maps whose key order depends on the JVM hash salt").isEmpty();
  }

  @Test
  void writableStepIdsKeepTheirRequestOrder() {
    Map<String, Object> schema = GenAiLlmGatewayClient.providerSchema(request());

    assertThat(schema.keySet()).containsExactly("type", "required", "properties");
    assertThat(schema.toString().indexOf(FIRST.toString()))
        .isLessThan(schema.toString().indexOf(SECOND.toString()));
  }

  @Test
  void parserValidGeneratedAndRefusalEnvelopesSatisfyTheSchema() throws Exception {
    String[] envelopes = {
      envelope(generated(FIRST), generated(SECOND)),
      envelope(generated(FIRST), refusal(SECOND, "UNSUPPORTED", "UNSUPPORTED_CAPABILITY")),
      envelope(refusal(FIRST, "CLARIFICATION", "AMBIGUOUS_INTENT"), generated(SECOND)),
    };
    for (String envelope : envelopes) {
      assertThat(
              GatewayTestSupport.parser()
                  .parseProposal(envelope, "FULL", List.of(FIRST, SECOND))
                  .isValid())
          .as("parser accepts %s", envelope)
          .isTrue();
      assertThat(schemaViolations(envelope)).as("schema accepts %s", envelope).isEmpty();
    }
  }

  @Test
  void refusalWithoutMessageOrGeneratedWithoutCodeViolatesTheSchema() throws Exception {
    String noMessage =
        envelope(
            generated(FIRST),
            "{\"stepId\":\""
                + SECOND
                + "\",\"status\":\"UNSUPPORTED\",\"reason\":\"UNSUPPORTED_CAPABILITY\"}");
    String noCode =
        envelope("{\"stepId\":\"" + FIRST + "\",\"status\":\"GENERATED\"}", generated(SECOND));

    for (String envelope : new String[] {noMessage, noCode}) {
      assertThat(
              GatewayTestSupport.parser()
                  .parseProposal(envelope, "FULL", List.of(FIRST, SECOND))
                  .isValid())
          .as("parser rejects %s", envelope)
          .isFalse();
      assertThat(schemaViolations(envelope)).as("schema rejects %s", envelope).isNotEmpty();
    }
  }

  private static java.util.Set<ValidationMessage> schemaViolations(String envelope)
      throws Exception {
    JsonSchema schema =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012)
            .getSchema(JSON.valueToTree(GenAiLlmGatewayClient.providerSchema(request())));
    return schema.validate(JSON.readTree(envelope));
  }

  private static String envelope(String first, String second) {
    return "{\"version\":1,\"kind\":\"FULL\",\"steps\":[" + first + "," + second + "]}";
  }

  private static String generated(UUID id) {
    return "{\"stepId\":\"" + id + "\",\"status\":\"GENERATED\",\"code\":\"await page.reload();\"}";
  }

  private static String refusal(UUID id, String status, String reason) {
    return "{\"stepId\":\""
        + id
        + "\",\"status\":\""
        + status
        + "\",\"reason\":\""
        + reason
        + "\",\"message\":\"Not expressible in the pinned syntax.\"}";
  }

  private static void walk(String path, Object node, List<String> unordered) {
    if (node instanceof Map<?, ?> map) {
      if (!(map instanceof LinkedHashMap<?, ?>) && !(map instanceof java.util.SortedMap<?, ?>)) {
        unordered.add(path + " (" + map.getClass().getName() + ")");
      }
      map.forEach((key, value) -> walk(path + "." + key, value, unordered));
    } else if (node instanceof List<?> list) {
      for (int index = 0; index < list.size(); index++) {
        walk(path + "[" + index + "]", list.get(index), unordered);
      }
    }
  }
}
