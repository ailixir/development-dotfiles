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

  /**
   * The frozen schema allows {@code version >= 1} so a future V2 document stays schema-valid, but
   * nothing downstream of this parser can execute a V2 artifact. The rejection therefore has to
   * come from the parser, not from schema validation: an otherwise identical V1 document is
   * accepted, so it is the version alone that is being refused.
   */
  @Test
  void aWrongArtifactVersionIsRejected() {
    String body = "\"steps\":[{\"stepIndex\":0,\"originalText\":\"x\",\"code\":\"y\"}]}";

    ParseResult result = parser.parse("{\"version\":2," + body);

    assertThat(result.isValid()).isFalse();
    assertThat(result.failureReason()).contains("$.version").contains("expected 1");
    assertThat(parser.parse("{\"version\":1," + body).isValid()).isTrue();
  }

  @Test
  void aMissingSchemaResourceFailsFast() {
    assertThatThrownBy(() -> new GatewayResponseParser(new ClassPathResource("studio/absent.json")))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("Unable to load the artifact schema");
  }

  // ── VAL-019a: one closed rejection reason per envelope check ──────────────

  private static final java.util.UUID A =
      java.util.UUID.fromString("00000000-0000-0000-0000-00000000000a");
  private static final java.util.UUID B =
      java.util.UUID.fromString("00000000-0000-0000-0000-00000000000b");
  private static final java.util.List<java.util.UUID> IDS = java.util.List.of(A, B);

  private static String generated(java.util.UUID id) {
    return "{\"stepId\":\"" + id + "\",\"status\":\"GENERATED\",\"code\":\"await x();\"}";
  }

  private static String envelope(String first, String second) {
    return "{\"version\":1,\"kind\":\"FULL\",\"steps\":[" + first + "," + second + "]}";
  }

  private ParseResult proposal(String text) {
    return parser.parseProposal(text, "FULL", IDS);
  }

  private void assertRejected(
      String text, GatewayResponseParser.ProposalRejection expected, Integer stepIndex) {
    ParseResult result = proposal(text);
    assertThat(result.isValid()).as("%s must be rejected", expected).isFalse();
    assertThat(result.rejection()).isEqualTo(expected);
    assertThat(result.rejectStepIndex()).isEqualTo(stepIndex);
  }

  @Test
  void aValidEnvelopeCarriesNoRejection() {
    ParseResult result = proposal(envelope(generated(A), generated(B)));
    assertThat(result.isValid()).isTrue();
    assertThat(result.rejection()).isNull();
    assertThat(result.rejectStepIndex()).isNull();
  }

  @Test
  void eachSyntaxDefectHasItsOwnReasonDecidedByParseStageNotMessage() {
    String valid = envelope(generated(A), generated(B));
    assertRejected("   ", GatewayResponseParser.ProposalRejection.EMPTY, null);
    assertRejected(null, GatewayResponseParser.ProposalRejection.EMPTY, null);
    assertRejected("{\"version\":1,", GatewayResponseParser.ProposalRejection.MALFORMED_JSON, null);
    assertRejected("not json", GatewayResponseParser.ProposalRejection.MALFORMED_JSON, null);
    assertRejected(
        "{\"version\":1,\"version\":1,\"kind\":\"FULL\",\"steps\":["
            + generated(A)
            + ","
            + generated(B)
            + "]}",
        GatewayResponseParser.ProposalRejection.DUPLICATE_KEY,
        null);
    assertRejected(valid + " {}", GatewayResponseParser.ProposalRejection.TRAILING_CONTENT, null);
    assertRejected(
        "```json\n" + valid + "\n```",
        GatewayResponseParser.ProposalRejection.MALFORMED_JSON,
        null);
  }

  @Test
  void eachEnvelopeDefectHasItsOwnReason() {
    String steps = "[" + generated(A) + "," + generated(B) + "]";
    assertRejected(
        "{\"version\":1,\"kind\":\"FULL\",\"steps\":" + steps + ",\"extra\":1}",
        GatewayResponseParser.ProposalRejection.ENVELOPE_KEYS,
        null);
    assertRejected(
        "{\"version\":2,\"kind\":\"FULL\",\"steps\":" + steps + "}",
        GatewayResponseParser.ProposalRejection.VERSION,
        null);
    assertRejected(
        "{\"version\":\"1\",\"kind\":\"FULL\",\"steps\":" + steps + "}",
        GatewayResponseParser.ProposalRejection.VERSION,
        null);
    assertRejected(
        "{\"version\":1,\"kind\":\"PATCH\",\"steps\":" + steps + "}",
        GatewayResponseParser.ProposalRejection.KIND_MISMATCH,
        null);
    assertRejected(
        "{\"version\":1,\"kind\":\"FULL\",\"steps\":{}}",
        GatewayResponseParser.ProposalRejection.STEPS_NOT_ARRAY,
        null);
    assertRejected(
        "{\"version\":1,\"kind\":\"FULL\",\"steps\":[" + generated(A) + "]}",
        GatewayResponseParser.ProposalRejection.STEP_COUNT,
        null);
  }

  @Test
  void eachStepDefectHasItsOwnReasonAndTheZeroBasedPosition() {
    assertRejected(
        envelope(generated(A), generated(A)),
        GatewayResponseParser.ProposalRejection.STEP_ID_MISMATCH,
        1);
    assertRejected(
        envelope(generated(A), "{\"stepId\":\"" + B + "\",\"status\":\"DONE\"}"),
        GatewayResponseParser.ProposalRejection.STATUS_UNKNOWN,
        1);
    assertRejected(
        envelope(
            "{\"stepId\":\"" + A + "\",\"status\":\"GENERATED\",\"code\":\"x\",\"message\":\"m\"}",
            generated(B)),
        GatewayResponseParser.ProposalRejection.GENERATED_KEYS,
        0);
    assertRejected(
        envelope(generated(A), "{\"stepId\":\"" + B + "\",\"status\":\"GENERATED\",\"code\":\"\"}"),
        GatewayResponseParser.ProposalRejection.CODE_EMPTY_OR_TOO_LONG,
        1);
    assertRejected(
        envelope(
            generated(A),
            "{\"stepId\":\""
                + B
                + "\",\"status\":\"GENERATED\",\"code\":\""
                + "x".repeat(2001)
                + "\"}"),
        GatewayResponseParser.ProposalRejection.CODE_EMPTY_OR_TOO_LONG,
        1);
    assertRejected(
        envelope(
            generated(A),
            "{\"stepId\":\""
                + B
                + "\",\"status\":\"UNSUPPORTED\",\"reason\":\"UNSUPPORTED_CAPABILITY\"}"),
        GatewayResponseParser.ProposalRejection.REJECTION_KEYS,
        1);
    assertRejected(
        envelope(
            generated(A),
            "{\"stepId\":\""
                + B
                + "\",\"status\":\"UNSUPPORTED\",\"reason\":\"AMBIGUOUS_INTENT\",\"message\":\"m\"}"),
        GatewayResponseParser.ProposalRejection.REJECTION_REASON_MISMATCH,
        1);
    assertRejected(
        envelope(
            generated(A),
            "{\"stepId\":\""
                + B
                + "\",\"status\":\"CLARIFICATION\",\"reason\":\"AMBIGUOUS_INTENT\",\"message\":\"\"}"),
        GatewayResponseParser.ProposalRejection.MESSAGE_EMPTY_OR_TOO_LONG,
        1);
  }

  /** Every parser value is repairable; the adapter- and pipeline-side values are terminal. */
  @Test
  void onlyParserDetectedReasonsAreRepairable() {
    for (GatewayResponseParser.ProposalRejection value :
        GatewayResponseParser.ProposalRejection.values()) {
      boolean terminal =
          java.util.Set.of(
                  GatewayResponseParser.ProposalRejection.FINISH_REASON,
                  GatewayResponseParser.ProposalRejection.ASSEMBLY_FAILED,
                  GatewayResponseParser.ProposalRejection.ARTIFACT_VERSION)
              .contains(value);
      assertThat(value.repairable()).as("%s", value).isEqualTo(!terminal);
    }
  }
}
