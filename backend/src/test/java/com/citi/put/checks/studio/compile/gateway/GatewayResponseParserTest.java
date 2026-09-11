package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.compile.gateway.GatewayResponseParser.ParseResult;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * Story 10.5 AC-7: the same defensive extraction runs whether structured output was requested or
 * not, because SPK-01 has not established that R2D2 honours the request.
 */
class GatewayResponseParserTest {

  private final GatewayResponseParser parser = GatewayTestSupport.parser();

  @Test
  void pureJsonIsAccepted() {
    assertThat(parser.parse(GatewayTestSupport.VALID_ARTIFACT).isValid()).isTrue();
  }

  @Test
  void proseWrappedJsonIsAccepted() {
    ParseResult result =
        parser.parse("Sure. " + GatewayTestSupport.VALID_ARTIFACT + " Let me know if that helps.");

    assertThat(result.isValid()).isTrue();
    assertThat(result.artifactJson()).contains("\"version\":1");
  }

  @Test
  void bracesInsideStringsDoNotTruncateTheDocument() {
    String artifact =
        "{\"version\":1,\"steps\":[{\"stepIndex\":0,"
            + "\"originalText\":\"Type \\\"{not json}\\\" in the field\","
            + "\"code\":\"await page.getByLabel('x').fill('{y}');\"}]}";

    ParseResult result = parser.parse("```json\n" + artifact + "\n```");

    assertThat(result.isValid()).isTrue();
    assertThat(result.artifactJson()).contains("not json");
  }

  @Test
  void anUnterminatedObjectIsRejected() {
    ParseResult result = parser.parse("{\"version\":1,\"steps\":[");

    assertThat(result.isValid()).isFalse();
    assertThat(result.failureReason()).isEqualTo("no JSON document found in the gateway response");
  }

  @Test
  void proseWithoutJsonIsRejected() {
    ParseResult result = parser.parse("I cannot translate step 2 into a supported action.");

    assertThat(result.isValid()).isFalse();
    assertThat(result.failureReason()).isEqualTo("no JSON document found in the gateway response");
  }

  @Test
  void emptyAnswersAreRejected() {
    assertThat(parser.parse(null).failureReason()).isEqualTo("empty gateway response");
    assertThat(parser.parse("   ").failureReason()).isEqualTo("empty gateway response");
  }

  @Test
  void unknownArtifactFieldsAreRejected() {
    ParseResult result =
        parser.parse(
            "{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"x\",\"code\":\"y\","
                + "\"confidence\":0.9}]}");

    assertThat(result.isValid()).isFalse();
    assertThat(result.failureReason()).startsWith("schema violation at ");
  }

  @Test
  void aWrongArtifactVersionIsRejected() {
    ParseResult result =
        parser.parse(
            "{\"version\":2,\"steps\":[{\"stepIndex\":0,\"originalText\":\"x\","
                + "\"code\":\"y\"}]}");

    assertThat(result.isValid()).isFalse();
    assertThat(result.failureReason()).contains("$.version");
  }

  @Test
  void aMissingSchemaResourceFailsFast() {
    assertThatThrownBy(() -> new GatewayResponseParser(new ClassPathResource("studio/absent.json")))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("Unable to load the artifact schema");
  }
}
