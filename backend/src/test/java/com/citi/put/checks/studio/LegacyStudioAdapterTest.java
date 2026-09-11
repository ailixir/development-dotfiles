package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.Viewport;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Story 10.1 AC-4 — every legacy shape the prototype produced is still readable, and exactly one
 * engine survives.
 */
class LegacyStudioAdapterTest {

  private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

  @Test
  void jsonStringStepsAndTypedStepsProduceTheSameList() {
    assertThat(LegacyStudioAdapter.parseSteps("[\"Go home\",\"Click Sign On\"]"))
        .containsExactly("Go home", "Click Sign On");
    assertThat(LegacyStudioAdapter.parseSteps("\"[\\\"Go home\\\"]\"")).containsExactly("Go home");
    assertThat(LegacyStudioAdapter.parseSteps(null)).isEmpty();
  }

  @Test
  void structuredTestIrStepsBecomeOrderedOriginalText() {
    String ir =
        "[{\"index\":0,\"type\":\"go_to\",\"originalText\":\"Go to \\\"https://citi.com\\\"\","
            + "\"url\":\"https://citi.com\"},"
            + "{\"index\":1,\"type\":\"click\",\"originalText\":\"Click \\\"Sign On\\\"\"}]";

    assertThat(LegacyStudioAdapter.parseSteps(ir))
        .containsExactly("Go to \"https://citi.com\"", "Click \"Sign On\"");
  }

  @Test
  void aStructuredStepWithoutOriginalTextIsRejectedRatherThanGuessed() {
    assertThatThrownBy(() -> LegacyStudioAdapter.parseSteps("[{\"type\":\"click\"}]"))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("originalText");
  }

  @Test
  void bothVariableShapesReadBackAsTypedReferences() {
    List<StudioVariable> typed =
        LegacyStudioAdapter.parseVariables(
            "[{\"name\":\"USER\",\"kind\":\"plain\",\"value\":\"alice\"},"
                + "{\"name\":\"PW\",\"kind\":\"secretRef\",\"secretId\":\"vault://pw\"}]");
    assertThat(typed)
        .containsExactly(
            StudioVariable.plain("USER", "alice"), StudioVariable.secretRef("PW", "vault://pw"));

    List<StudioVariable> legacy =
        LegacyStudioAdapter.parseVariables(
            "[{\"name\":\"USER\",\"value\":{\"kind\":\"plain\",\"value\":\"alice\"}},"
                + "{\"name\":\"PW\",\"value\":{\"kind\":\"secret\",\"ref\":{\"id\":\"vault://pw\"}}}]");
    assertThat(legacy).isEqualTo(typed);
  }

  @Test
  void chromeIsChromiumAndEveryOtherEngineIsRejectedAtTheBoundary() {
    assertThat(LegacyStudioAdapter.normalizeBrowser("chrome")).isEqualTo("chromium");
    assertThat(LegacyStudioAdapter.normalizeBrowser("Chrome")).isEqualTo("chromium");
    assertThat(LegacyStudioAdapter.normalizeBrowser(null)).isEqualTo("chromium");
    // Normalization does not judge; the boundary does.
    assertThat(LegacyStudioAdapter.normalizeBrowser("firefox")).isEqualTo("firefox");

    UITestRequest firefox =
        new UITestRequest(
            "n",
            "d",
            "60400",
            "[]",
            "[]",
            "firefox",
            1920,
            1080,
            30,
            "networkidle",
            "Production",
            1L,
            1L);
    assertThatThrownBy(() -> LegacyStudioAdapter.validateForWrite(firefox))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("chromium");

    UITestRequest chrome =
        new UITestRequest(
            "n",
            "d",
            "60400",
            "[]",
            "[]",
            "chrome",
            1920,
            1080,
            30,
            "networkidle",
            "Production",
            1L,
            1L);
    LegacyStudioAdapter.validateForWrite(chrome);
  }

  @Test
  void legacyOutcomesMapOntoTheCanonicalVocabulary() {
    assertThat(LegacyStudioAdapter.normalizeStatus("COMPLETED")).isEqualTo(ExecutionStatus.PASSED);
    assertThat(LegacyStudioAdapter.normalizeStatus("TIMEOUT")).isEqualTo(ExecutionStatus.ERROR);
    assertThat(LegacyStudioAdapter.normalizeErrorCode("TIMEOUT", null))
        .isEqualTo(ExecutionErrorCode.TIMEOUT);
    // A persisted code is never overwritten by the adapter.
    assertThat(LegacyStudioAdapter.normalizeErrorCode("TIMEOUT", "STALE")).isEqualTo("STALE");
    assertThat(LegacyStudioAdapter.normalizeStatus("PASSED")).isEqualTo("PASSED");
  }

  @Test
  void aFlattenedLegacyBodyDeserializesIntoTheTypedContract() throws Exception {
    String legacy =
        """
        {"name":"Draft","description":"d","csiId":"60400",
         "steps":"[\\"Go home\\"]","variables":"[]","browser":"chrome",
         "viewportWidth":1280,"viewportHeight":720,"timeoutSeconds":45,
         "waitStrategy":"load","environment":"Staging",
         "sourceRevision":3,"configurationRevision":2}
        """;

    UITestRequest request = objectMapper.readValue(legacy, UITestRequest.class);

    assertThat(request.steps()).containsExactly("Go home");
    assertThat(request.variables()).isEmpty();
    assertThat(request.configuration())
        .isEqualTo(new TestConfiguration("chromium", new Viewport(1280, 720), 45, "load"));
    assertThat(request.environment()).isEqualTo("Staging");
    assertThat(request.sourceRevision()).isEqualTo(3L);
  }

  @Test
  void theCanonicalBodyDeserializesUnchanged() throws Exception {
    String canonical =
        """
        {"name":"Draft","csiId":"60400","environment":"Production",
         "steps":["Go home"],
         "variables":[{"name":"USER","kind":"plain","value":"alice"}],
         "configuration":{"browser":"chromium","viewport":{"width":1920,"height":1080},
                          "timeoutSeconds":30,"waitStrategy":"networkidle"}}
        """;

    UITestRequest request = objectMapper.readValue(canonical, UITestRequest.class);

    assertThat(request.steps()).containsExactly("Go home");
    assertThat(request.variables()).containsExactly(StudioVariable.plain("USER", "alice"));
    assertThat(request.configuration()).isEqualTo(TestConfiguration.defaults());
    assertThat(request.sourceRevision()).isNull();
  }

  @Test
  void anAbsentConfigurationFallsBackToTheDocumentedDefaults() throws Exception {
    UITestRequest request =
        objectMapper.readValue(
            "{\"name\":\"Draft\",\"environment\":\"Production\",\"steps\":[]}",
            UITestRequest.class);

    assertThat(request.configuration()).isEqualTo(TestConfiguration.defaults());
    assertThat(request.steps()).isEmpty();
  }
}
