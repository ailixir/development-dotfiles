package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.compile.ContextPromptSection;
import com.citi.put.checks.studio.compile.PromptAssembler;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/**
 * The local translation provider answers recorded sources and is honest about everything else.
 *
 * <p>The point of these assertions is the <em>shape of the refusal</em>. A local stand-in that
 * answered an unrecorded source with anything invented, or that reported the miss as an author
 * mistake or a parse failure, would let a local run be presented as evidence that free-form English
 * translates — which is exactly the claim the recorded corpus cannot support and the staging gate
 * exists to make.
 */
class RecordedFixtureGatewayClientTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final List<String> SOURCE =
      List.of("Go to \"https://example.com/\"", "Check that the URL contains \"example.com\"");
  private static final String ARTIFACT =
      "{\"version\":1,\"steps\":["
          + "{\"stepIndex\":0,\"originalText\":\"Go to \\\"https://example.com/\\\"\","
          + "\"code\":\"await page.goto('https://example.com/');\"},"
          + "{\"stepIndex\":1,\"originalText\":\"Check that the URL contains \\\"example.com\\\"\","
          + "\"code\":\"await expect(page).toHaveURL(/.*example\\\\.com.*/);\"}]}";

  private final GatewayAuditLogger auditLogger = new GatewayAuditLogger();

  private static Resource fixture(String name, List<String> source, String artifactJson) {
    try {
      var document = MAPPER.createObjectNode();
      document.put("name", name);
      var lines = document.putArray("source");
      source.forEach(lines::add);
      document.set("artifact", MAPPER.readTree(artifactJson));
      return new ByteArrayResource(MAPPER.writeValueAsBytes(document), "recorded fixture " + name) {
        @Override
        public String getDescription() {
          return "recorded fixture " + name;
        }
      };
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private static CompileRequest requestFor(List<String> source) {
    return new PromptAssembler()
        .assemble(UUID.randomUUID(), "178672", "bb12345", UUID.randomUUID(), 1, source);
  }

  private RecordedFixtureGatewayClient clientWith(Resource... fixtures) {
    return new RecordedFixtureGatewayClient(RecordedFixtureCorpus.load(fixtures), auditLogger);
  }

  @Test
  void aRecordedSourceIsAnsweredWithItsRecordedArtifact() {
    RecordedFixtureGatewayClient client = clientWith(fixture("example-domain", SOURCE, ARTIFACT));

    CompileResponse response = client.propose(requestFor(SOURCE));

    assertThat(response.isOk()).isTrue();
    assertThat(response.outcome()).isEqualTo(GatewayOutcome.OK);
    assertThat(MAPPER.valueToTree(response.artifact().orElseThrow()).asText())
        .as("the artifact travels as the recorded document")
        .isNotBlank();
    assertThat(response.outputBytes())
        .isEqualTo(response.artifactJson().getBytes(StandardCharsets.UTF_8).length);
  }

  @Test
  void provenanceNamesTheCorpusRatherThanAModel() {
    RecordedFixtureGatewayClient client = clientWith(fixture("example-domain", SOURCE, ARTIFACT));

    GatewayProvenance provenance = client.propose(requestFor(SOURCE)).provenance();

    // An audit of a local run must never read as a Vertex call.
    assertThat(provenance.model()).isEqualTo("recorded-fixture");
    assertThat(provenance.sdkVersion()).isEqualTo("none");
    assertThat(provenance.modelVersion()).isNull();
  }

  @Test
  void anUnrecordedSourceIsReportedAsTranslationBeingUnavailable() {
    RecordedFixtureGatewayClient client = clientWith(fixture("example-domain", SOURCE, ARTIFACT));

    CompileResponse response =
        client.propose(requestFor(List.of("Go to \"https://something-else.invalid/\"")));

    assertThat(response.isOk()).isFalse();
    assertThat(response.artifact()).isEmpty();
    // Unavailable, not "your English is wrong" and not "the model answered badly".
    assertThat(response.errorCode()).isEqualTo(GatewayErrorCode.GATEWAY_UNAVAILABLE);
    assertThat(response.outcome()).isEqualTo(GatewayOutcome.DISABLED);
    assertThat(response.outcome())
        .as("a miss is never dressed up as a model parse failure")
        .isNotEqualTo(GatewayOutcome.PARSE_FAILURE);
  }

  @Test
  void aFailureReasonCarriesNoneOfTheSourceItCouldNotAnswer() {
    RecordedFixtureGatewayClient client = clientWith(fixture("example-domain", SOURCE, ARTIFACT));
    String canary = "CANARY-recorded-fixture-6b1f2e";

    CompileResponse response =
        client.propose(requestFor(List.of("Go to \"https://" + canary + "/\"")));

    assertThat(response.failureReason()).doesNotContain(canary);
  }

  @Test
  void theV2EnvelopeFencingIsReadBackToTheSameSource() {
    RecordedFixtureGatewayClient client = clientWith(fixture("example-domain", SOURCE, ARTIFACT));
    // The v2 authoring path fences each line as an envelope carrying `source` plus untrusted
    // context. The same recorded pair must answer both fencing shapes, or a local run would
    // depend on which save route produced it.
    CompileRequest v2 =
        new PromptAssembler()
            .assemble(
                UUID.randomUUID(),
                "178672",
                "bb12345",
                UUID.randomUUID(),
                1,
                SOURCE,
                new ContextPromptSection(
                    SOURCE.stream()
                        .map(
                            line ->
                                (com.fasterxml.jackson.databind.JsonNode) MAPPER.createObjectNode())
                        .toList(),
                    0));

    assertThat(client.propose(v2).isOk()).isTrue();
  }

  @Test
  void aMalformedFixtureFailsLoudlyRatherThanAnsweringNothing() {
    Resource broken =
        new ByteArrayResource("{\"name\":\"broken\"}".getBytes(StandardCharsets.UTF_8), "broken");

    assertThatThrownBy(() -> RecordedFixtureCorpus.load(broken))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("source array");
  }

  @Test
  void twoFixturesRecordingTheSameSourceAreRefused() {
    assertThatThrownBy(
            () ->
                RecordedFixtureCorpus.load(
                    fixture("one", SOURCE, ARTIFACT), fixture("two", SOURCE, ARTIFACT)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("same source");
  }

  @Test
  void theShippedCorpusLoadsAndCoversTheLocalScenarios() throws Exception {
    Resource[] shipped =
        new PathMatchingResourcePatternResolver()
            .getResources("classpath*:studio/recorded-fixtures/*.json");

    assertThat(shipped).as("the local corpus ships with the application").isNotEmpty();
    RecordedFixtureCorpus corpus = RecordedFixtureCorpus.load(shipped);
    assertThat(corpus.size()).isEqualTo(shipped.length);
    assertThat(corpus.artifactFor(SOURCE))
        .as("the Example Domain scenario is recorded verbatim")
        .isPresent();
  }

  @Test
  void everyShippedFixtureSatisfiesTheArtifactSchema() throws Exception {
    // A recorded artifact that the schema would refuse is a local path that cannot work, and the
    // failure would surface as a confusing GATEWAY_PARSE_FAILURE at run time instead of here.
    GatewayResponseParser parser =
        new GatewayResponseParser(new ClassPathResource("studio/artifact.schema.json"));
    Resource[] shipped =
        new PathMatchingResourcePatternResolver()
            .getResources("classpath*:studio/recorded-fixtures/*.json");

    for (Resource resource : shipped) {
      var document = MAPPER.readTree(resource.getInputStream());
      String artifactJson = MAPPER.writeValueAsString(document.path("artifact"));
      assertThat(parser.parse(artifactJson).isValid())
          .as("recorded fixture %s must satisfy the artifact schema", resource.getDescription())
          .isTrue();
    }
  }
}
