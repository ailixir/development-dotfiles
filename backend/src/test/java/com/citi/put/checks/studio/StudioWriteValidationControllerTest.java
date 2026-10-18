package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.citi.put.checks.config.ChecksExceptionHandler;
import com.citi.put.checks.studio.authoring.AuthoringLimits;
import com.citi.put.checks.studio.authoring.StudioAuthoringProperties;
import com.citi.put.checks.studio.dto.StudioAuthoringMapper;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.validation.Validation;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * VAL-021, VAL-022, VAL-023 — the save routes refuse a blank step and an out-of-contract timeout
 * with an actionable {@code 400}, on create and update, for both the legacy and the explicit v2
 * body, and never reach the service when they do.
 *
 * <p>An empty step list is deliberately <em>accepted</em> at save: the Tests page creates every
 * draft with {@code steps: []} and the editor saves before steps exist.
 *
 * <p>The controller, the real {@link StudioAuthoringMapper} and the real {@link
 * ChecksExceptionHandler} run in a standalone MockMvc so this needs no database. The service is a
 * mock whose write methods answer {@code 409 REACHED_SERVICE}: a request that got that far passed
 * every boundary check, which is what the accepting cases assert.
 */
class StudioWriteValidationControllerTest {

  private static final String BASE = "/api/v1/studio/tests";
  private static final UUID ID = UUID.fromString("11111111-1111-1111-1111-111111111111");

  private final ObjectMapper mapper = new ObjectMapper().registerModule(new JavaTimeModule());
  private StudioService service;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    service = mock(StudioService.class);
    StudioConflictException reached = new StudioConflictException("REACHED_SERVICE", "reached");
    when(service.createAuthoringDraft(any(), any(), any())).thenThrow(reached);
    when(service.updateAuthoringDraft(any(), any(), any(), any())).thenThrow(reached);
    StudioAuthoringMapper authoringMapper =
        new StudioAuthoringMapper(
            mapper,
            Validation.buildDefaultValidatorFactory().getValidator(),
            new AuthoringLimits(new StudioAuthoringProperties(100)));
    mvc =
        MockMvcBuilders.standaloneSetup(new StudioController(service, authoringMapper))
            .setControllerAdvice(new ChecksExceptionHandler())
            .build();
  }

  // ── VAL-021: an empty draft is saved (FE create-then-edit) ──

  @Test
  void anEmptyCanonicalDraftIsAcceptedOnCreateAndUpdate() throws Exception {
    send(post(BASE), canonical(30)).andExpect(status().isConflict());
    send(put(BASE + "/" + ID), canonical(30)).andExpect(status().isConflict());

    ArgumentCaptor<UITestRequest> created = ArgumentCaptor.forClass(UITestRequest.class);
    verify(service).createAuthoringDraft(created.capture(), any(), any());
    assertThat(created.getValue().steps()).isEmpty();
    verify(service).updateAuthoringDraft(eq(ID), any(), any(), any());
  }

  // ── VAL-022: blank and whitespace-only steps ──────────────────────────────

  @Test
  void aWhitespaceOnlyStepIsRefusedOnCanonicalCreateAndUpdateNamingTheStep() throws Exception {
    for (MockHttpServletRequestBuilder route :
        new MockHttpServletRequestBuilder[] {post(BASE), put(BASE + "/" + ID)}) {
      ObjectNode body = canonical(30);
      body.withArray("steps").add("Go home").add("   ");
      send(route, body)
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error").value("INVALID_STEPS"))
          .andExpect(
              jsonPath("$.message")
                  .value("Step 2 is blank. Write what the step should do, or remove it."));
    }
    verifyNoInteractions(service);
  }

  @Test
  void aWhitespaceOnlyStepIsRefusedOnV2CreateAndUpdate() throws Exception {
    ObjectNode create = v2(" \t ");
    send(post(BASE), create)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("INVALID_STEPS"))
        .andExpect(
            jsonPath("$.message")
                .value("Step 1 is blank. Write what the step should do, or remove it."));

    ObjectNode update = v2("");
    update.put("sourceRevision", 1).put("configurationRevision", 1);
    send(put(BASE + "/" + ID), update)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("INVALID_STEPS"));
    verifyNoInteractions(service);
  }

  // ── VAL-023: timeoutSeconds is 1..120, never silently coerced ─────────────

  @Test
  void anOutOfRangeTimeoutIsRefusedOnCreateAndUpdate() throws Exception {
    for (int timeout : new int[] {0, 121}) {
      send(post(BASE), canonicalWithStep(timeout))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error").value("INVALID_CONFIGURATION"))
          .andExpect(
              jsonPath("$.message")
                  .value(
                      "timeoutSeconds is " + timeout + "; it must be between 1 and 120 seconds."));
      send(put(BASE + "/" + ID), canonicalWithStep(timeout))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error").value("INVALID_CONFIGURATION"));
      ObjectNode v2 = v2("Go home");
      v2.putObject("configuration").put("browser", "chromium").put("timeoutSeconds", timeout);
      send(post(BASE), v2)
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error").value("INVALID_CONFIGURATION"));
    }
    verifyNoInteractions(service);
  }

  @Test
  void theTimeoutBoundsAreAcceptedAndStoredAsSubmitted() throws Exception {
    send(post(BASE), canonicalWithStep(1)).andExpect(status().isConflict());
    send(put(BASE + "/" + ID), canonicalWithStep(120)).andExpect(status().isConflict());
    ObjectNode v2 = v2("Go home");
    v2.putObject("configuration").put("browser", "chromium").put("timeoutSeconds", 120);
    send(post(BASE), v2).andExpect(status().isConflict());

    ArgumentCaptor<UITestRequest> created = ArgumentCaptor.forClass(UITestRequest.class);
    verify(service, org.mockito.Mockito.times(2))
        .createAuthoringDraft(created.capture(), any(), any());
    assertThat(created.getAllValues().stream().map(value -> value.configuration().timeoutSeconds()))
        .containsExactly(1, 120);
    ArgumentCaptor<UITestRequest> updated = ArgumentCaptor.forClass(UITestRequest.class);
    verify(service).updateAuthoringDraft(eq(ID), updated.capture(), any(), any());
    assertThat(updated.getValue().configuration().timeoutSeconds()).isEqualTo(120);
  }

  // ── VAL-024: the step-count and line-length bounds apply at save ──

  @Test
  void aStepOverTheLineCapIsRefusedOnCreateAndUpdateWithTheCompileMessage() throws Exception {
    for (MockHttpServletRequestBuilder route :
        new MockHttpServletRequestBuilder[] {post(BASE), put(BASE + "/" + ID)}) {
      ObjectNode body = canonical(30);
      body.withArray("steps").add("Go home").add("x".repeat(501));
      send(route, body)
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error").value("SOURCE_LINE_TOO_LONG"))
          .andExpect(
              jsonPath("$.message")
                  .value(
                      "Step 2 is 501 characters long; the maximum is 500. Shorten it or split"
                          + " it into two steps."));
      // The 501-1024 band is the author-facing refusal too, not the generic INVALID_AUTHORING.
      ObjectNode longer = canonical(30);
      longer.withArray("steps").add("Go home").add("x".repeat(600));
      send(route, longer)
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error").value("SOURCE_LINE_TOO_LONG"))
          .andExpect(
              jsonPath("$.message")
                  .value(
                      "Step 2 is 600 characters long; the maximum is 500. Shorten it or split"
                          + " it into two steps."));
    }
    verifyNoInteractions(service);
  }

  @Test
  void moreStepsThanTheCapAreRefusedOnCreateAndUpdateWithTheCompileMessage() throws Exception {
    for (MockHttpServletRequestBuilder route :
        new MockHttpServletRequestBuilder[] {post(BASE), put(BASE + "/" + ID)}) {
      ObjectNode body = canonical(30);
      for (int index = 0; index < 101; index++) {
        body.withArray("steps").add("Click button " + index);
      }
      send(route, body)
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.error").value("SOURCE_TOO_MANY_STEPS"))
          .andExpect(
              jsonPath("$.message")
                  .value(
                      "This test has 101 steps; the maximum is 100. Split it into smaller"
                          + " tests."));
    }
    verifyNoInteractions(service);
  }

  @Test
  void exactlyTheCapsAreAcceptedAtSave() throws Exception {
    // 100 steps at the single AuthoringStep.text bound (500).
    ObjectNode body = canonical(30);
    for (int index = 0; index < 100; index++) {
      body.withArray("steps").add("y".repeat(500));
    }
    send(post(BASE), body).andExpect(status().isConflict());
    send(put(BASE + "/" + ID), body).andExpect(status().isConflict());
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** The body the Tests page sends on create (`StudioTestsPage`): no steps yet. */
  private ObjectNode canonical(int timeoutSeconds) {
    ObjectNode body = mapper.createObjectNode();
    body.put("authoringSchemaVersion", 2)
        .put("name", "Login smoke")
        .put("csiId", "60406")
        .put("description", "")
        .put("environment", "Development")
        .put("sourceRevision", 1)
        .put("configurationRevision", 1);
    body.putArray("steps");
    body.putArray("variables");
    ObjectNode configuration = body.putObject("configuration");
    configuration.put("browser", "chromium").put("timeoutSeconds", timeoutSeconds);
    configuration.putObject("viewport").put("width", 1920).put("height", 1080);
    configuration.put("waitStrategy", "networkidle");
    return body;
  }

  private ObjectNode canonicalWithStep(int timeoutSeconds) {
    ObjectNode body = canonical(timeoutSeconds);
    body.withArray("steps").add("Go home");
    return body;
  }

  private ObjectNode v2(String stepText) {
    ObjectNode body = mapper.createObjectNode();
    body.put("authoringSchemaVersion", 2).put("name", "Login smoke").put("csiId", "60406");
    ArrayNode steps = body.putArray("steps");
    steps.addObject().put("id", "00000000-0000-4000-8000-000000000001").put("text", stepText);
    return body;
  }

  private org.springframework.test.web.servlet.ResultActions send(
      MockHttpServletRequestBuilder route, ObjectNode body) throws Exception {
    ArrayNode source = mapper.createArrayNode();
    int index = 0;
    for (var step : body.path("steps")) {
      if (step.isTextual()) {
        source.addObject().put("id", new UUID(0, ++index).toString()).put("text", step.textValue());
      } else {
        source.add(step);
      }
    }
    body.set("steps", source);
    return mvc.perform(
        route.contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)));
  }
}
