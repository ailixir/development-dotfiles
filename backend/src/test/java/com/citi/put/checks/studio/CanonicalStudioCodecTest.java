package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.CanonicalStudioCodec;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.Viewport;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

/** O-1: canonical storage remains, all alternative authoring shapes are refused. */
class CanonicalStudioCodecTest {
  private final ObjectMapper mapper =
      new ObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

  @Test
  void canonicalArrayRoundTripsAndStringWrappedStepsAreRefused() {
    assertThat(
            CanonicalStudioCodec.parseSteps(
                CanonicalStudioCodec.stepsToJson(List.of("雪", "Go home"))))
        .containsExactly("雪", "Go home");
    assertThatThrownBy(() -> CanonicalStudioCodec.parseSteps("\"[\\\"Go home\\\"]\""))
        .isInstanceOf(StudioValidationException.class);
    assertThatThrownBy(() -> CanonicalStudioCodec.parseSteps("[{\"originalText\":\"Go home\"}]"))
        .isInstanceOf(StudioValidationException.class);
  }

  @Test
  void typedVariablesRoundTripAndNestedOrAliasedFormsAreRefused() {
    var values =
        List.of(StudioVariable.plain("USER", "  "), StudioVariable.secretRef("vault://pw", "PW"));
    assertThat(CanonicalStudioCodec.parseVariables(CanonicalStudioCodec.variablesToJson(values)))
        .isEqualTo(values);
    for (String invalid :
        List.of(
            "[{\"name\":\"PW\",\"kind\":\"secret\",\"secretId\":\"PW\"}]",
            "[{\"name\":\"PW\",\"value\":{\"kind\":\"secret\"}}]",
            "[{\"name\":\"PW\",\"kind\":\"secretRef\",\"secretId\":\"..\"}]")) {
      assertThatThrownBy(() -> CanonicalStudioCodec.parseVariables(invalid))
          .isInstanceOf(StudioValidationException.class);
    }
  }

  @Test
  void onlyCanonicalChromiumIsAccepted() {
    assertThat(CanonicalStudioCodec.normalizeBrowser(null)).isEqualTo("chromium");
    assertThat(CanonicalStudioCodec.normalizeBrowser("chromium")).isEqualTo("chromium");
    for (String invalid : List.of("chrome", "Chrome", "firefox", " chromium ", "")) {
      assertThatThrownBy(() -> CanonicalStudioCodec.normalizeBrowser(invalid))
          .isInstanceOf(StudioValidationException.class)
          .extracting(error -> ((StudioValidationException) error).getCode())
          .isEqualTo("INVALID_CONFIGURATION");
    }
  }

  @Test
  void aBlankStepIsRejectedAtWriteNamingItsNumberButAnEmptyDraftIsAccepted() {
    assertThatThrownBy(
            () -> CanonicalStudioCodec.validateForWrite(request(List.of("Go home", " "), 30)))
        .hasMessage("Step 2 is blank. Write what the step should do, or remove it.");
    CanonicalStudioCodec.validateForWrite(request(List.of(), 30));
  }

  @Test
  void aTimeoutOutsideTheContractIsRejectedNotCoerced() {
    for (int timeout : new int[] {0, -5, 121}) {
      assertThatThrownBy(
              () -> CanonicalStudioCodec.validateForWrite(request(List.of("Go home"), timeout)))
          .isInstanceOf(StudioValidationException.class)
          .extracting(error -> ((StudioValidationException) error).getCode())
          .isEqualTo("INVALID_CONFIGURATION");
    }
    CanonicalStudioCodec.validateForWrite(request(List.of("Go home"), 1));
    CanonicalStudioCodec.validateForWrite(request(List.of("Go home"), 120));
  }

  @Test
  void flattenedBodyIsRefusedByTheStrictMetadataComposition() {
    assertThatThrownBy(
            () ->
                mapper.readValue(
                    "{\"browser\":\"chrome\",\"viewportWidth\":1280}", UITestRequest.class))
        .isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
  }

  @Test
  void theCanonicalBodyDeserializesUnchanged() throws Exception {
    var request =
        mapper.readValue(
            """
        {"name":"Draft","csiId":"60400","environment":"Production","steps":["Go home"],
        "variables":[{"name":"USER","kind":"plain","value":"alice"}],
        "configuration":{"browser":"chromium","viewport":{"width":1920,"height":1080},
        "timeoutSeconds":30,"waitStrategy":"networkidle"}}
        """,
            UITestRequest.class);
    assertThat(request.steps()).containsExactly("Go home");
    assertThat(request.variables()).containsExactly(StudioVariable.plain("USER", "alice"));
    assertThat(request.configuration()).isEqualTo(TestConfiguration.defaults());
  }

  @Test
  void anAbsentConfigurationFallsBackToTheDocumentedDefaults() throws Exception {
    assertThat(mapper.readValue("{\"steps\":[]}", UITestRequest.class).configuration())
        .isEqualTo(TestConfiguration.defaults());
  }

  private static UITestRequest request(List<String> steps, int timeout) {
    return new UITestRequest(
        "n",
        "d",
        "60400",
        "Production",
        steps,
        List.of(),
        new TestConfiguration("chromium", Viewport.defaults(), timeout, "networkidle"),
        1L,
        1L);
  }
}
