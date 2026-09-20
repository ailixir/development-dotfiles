package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.gateway.GatewayResponseParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Story 10.8 AC-10 — <b>the consumer pins its own executable artifact version.</b>
 *
 * <p>{@code artifact.schema.json} constrains {@code version} to {@code integer, minimum 1} on
 * purpose, so a future V2 document is still schema-valid. Schema validity is therefore <em>not</em>
 * executability: nothing downstream of this backend understands a V2 artifact. The test that
 * matters is the one below — it constructs exactly that document, proves the schema accepts it, and
 * then proves the pipeline does not.
 */
class ArtifactVersionPinTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final Path SCHEMA =
      Path.of("..", "docs", "specs", "studio", "artifact.schema.json");

  private static final String VERSION_TWO =
      """
      {"version":2,"steps":[{"stepIndex":0,"originalText":"Go home",
       "code":"await page.goto('https://example.com/');"}]}
      """;

  private static final String VERSION_ONE =
      """
      {"version":1,"steps":[{"stepIndex":0,"originalText":"Go home",
       "code":"await page.goto('https://example.com/');"}]}
      """;

  @Test
  void theFrozenSchemaDeliberatelyAcceptsAVersionTwoArtifact() throws IOException {
    JsonNode schemaNode = MAPPER.readTree(Files.readString(SCHEMA, StandardCharsets.UTF_8));
    JsonSchema schema =
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(schemaNode);

    assertThat(schema.validate(MAPPER.readTree(VERSION_TWO)))
        .as(
            "the premise of this criterion: the schema permits version >= 1, so a version:2"
                + " document is schema-valid and the pin has to come from somewhere else")
        .isEmpty();
    assertThat(schemaNode.path("properties").path("version").path("minimum").asInt()).isEqualTo(1);
    assertThat(schemaNode.path("properties").path("version").has("maximum"))
        .as("if the schema ever pins a maximum, this criterion's premise has changed")
        .isFalse();
  }

  @Test
  void theParserRejectsASchemaValidVersionTwoArtifact() {
    GatewayResponseParser parser =
        new GatewayResponseParser(
            new org.springframework.core.io.ClassPathResource("studio/artifact.schema.json"));

    GatewayResponseParser.ParseResult result = parser.parse(VERSION_TWO);

    assertThat(result.isValid()).isFalse();
    assertThat(result.failureReason())
        .contains("unsupported artifact version")
        .contains("$.version");
    assertThat(parser.parse(VERSION_ONE).isValid()).isTrue();
  }

  @Test
  void thePinIsOneConstantReadByEveryConsumer() throws IOException {
    assertThat(CompilePins.SUPPORTED_ARTIFACT_VERSION).isEqualTo(1);
    assertThat(GatewayResponseParser.SUPPORTED_ARTIFACT_VERSION)
        .as("the gateway parser's constant must be an alias of the pin, not a second opinion")
        .isEqualTo(CompilePins.SUPPORTED_ARTIFACT_VERSION);

    // Exactly one declaration. A second literal would be a second decision, and the two would
    // disagree on the day someone bumped only the one they happened to be reading.
    List<Path> declaring = new java.util.ArrayList<>();
    for (Path file : PromptAssemblyTest.moduleFiles()) {
      String text = Files.readString(file, StandardCharsets.UTF_8);
      if (text.matches("(?s).*SUPPORTED_ARTIFACT_VERSION\\s*=\\s*\\d.*")) {
        declaring.add(file.getFileName());
      }
    }
    assertThat(declaring)
        .as("only CompilePins may assign a literal to the artifact version pin")
        .containsExactly(Path.of("CompilePins.java"));
  }

  /**
   * The behavioural half — a schema-valid {@code version: 2} artifact is never written as a
   * candidate revision and is never sent to {@code /v1/validate} — is proved end to end by {@code
   * CompilePipelineTest.aSchemaValidVersionTwoArtifactIsNeverValidatedOrPersisted}, which counts
   * the runner calls on the wire.
   */
  @Test
  void thePipelineOwnsTheReAssertionRatherThanTrustingTheClient() throws IOException {
    Path pipeline =
        Path.of(
            "src",
            "main",
            "java",
            "com",
            "citi",
            "put",
            "checks",
            "studio",
            "compile",
            "CompilePipeline.java");
    String source = Files.readString(pipeline, StandardCharsets.UTF_8);

    assertThat(source)
        .as(
            "the pipeline must re-assert the pin on whatever artifact it is handed: a stub, a"
                + " future second client or a changed parser must not be able to slip a V2"
                + " document past it")
        .contains("IncrementalAssembler.assemble");
    String assembler =
        Files.readString(
            Path.of(
                "src/main/java/com/citi/put/checks/studio/compile/incremental",
                "IncrementalAssembler.java"));
    assertThat(assembler).contains("CompilePins.SUPPORTED_ARTIFACT_VERSION");
    assertThat(source.indexOf("IncrementalAssembler.assemble"))
        .as("the re-assertion must happen before the validator is called")
        .isLessThan(source.indexOf("validationClient.validate("));
  }
}
