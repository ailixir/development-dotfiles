package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Story 10.1 — the artifact schema exists once, in two places, and may never quietly become two
 * schemas.
 *
 * <p>{@code docs/specs/studio/artifact.schema.json} is the source of truth (AC-1). Story 10.5 needs
 * the same schema on the runtime classpath to parse gateway responses defensively, so {@code
 * backend/src/main/resources/studio/artifact.schema.json} is a byte-identical copy. Copies drift.
 * This test makes drift a build failure at the moment it is introduced instead of a mystery when a
 * gateway response is rejected in staging.
 */
class ArtifactSchemaDriftTest {

  private static final Path CANONICAL =
      Path.of("..", "docs", "specs", "studio", "artifact.schema.json");
  private static final String CLASSPATH_COPY = "/studio/artifact.schema.json";

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void theClasspathCopyIsByteIdenticalToTheCanonicalContract() throws IOException {
    assertThat(CANONICAL)
        .as("the canonical artifact schema must live in docs/specs/studio")
        .exists();

    String canonical = Files.readString(CANONICAL, StandardCharsets.UTF_8);
    String copy = readClasspathCopy();

    assertThat(copy)
        .as(
            "backend/src/main/resources%s has drifted from %s — copy the canonical file over it",
            CLASSPATH_COPY, CANONICAL)
        .isEqualTo(canonical);
  }

  @Test
  void theSchemaAcceptsItsOwnExamplesAndRejectsAMisalignedArtifact() throws IOException {
    JsonNode schemaNode = objectMapper.readTree(readClasspathCopy());
    JsonSchema schema =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schemaNode);

    for (JsonNode example : schemaNode.path("examples")) {
      assertThat(schema.validate(example))
          .as("declared example must validate: %s", example)
          .isEmpty();
    }

    // A step that omits its generated code is not an artifact; the compiler never emits one.
    JsonNode missingCode =
        objectMapper.readTree(
            "{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"Go home\"}]}");
    assertThat(schema.validate(missingCode)).isNotEmpty();

    // Unknown keys are rejected rather than silently ignored: an artifact is a closed shape.
    JsonNode extraKey =
        objectMapper.readTree("{\"version\":1,\"steps\":[],\"python\":\"print(1)\"}");
    Set<?> violations = schema.validate(extraKey);
    assertThat(violations).isNotEmpty();
  }

  @Test
  void theCanonicalPathIsTheOneThePoDecided() {
    assertThatThrownBy(
            () -> Files.readString(Path.of("..", "docs", "specs", "studio", "nope.json")))
        .isInstanceOf(IOException.class);
    assertThat(Path.of("..", "docs", "specs", "studio", "openapi.yaml")).exists();
  }

  private String readClasspathCopy() throws IOException {
    try (InputStream in = ArtifactSchemaDriftTest.class.getResourceAsStream(CLASSPATH_COPY)) {
      assertThat(in).as("the artifact schema must be on the runtime classpath").isNotNull();
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
  }
}
