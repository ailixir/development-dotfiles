package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * STUDIO-UNIFY-001.6 AC-09: the HTTP shape of {@code GET /guided-sessions/latest} through the full
 * filter chain with the reader mocked. The query rules, the platform 401, the literal route winning
 * over {@code /{id}}, and the body leaving through the closed {@code latest-attempts} schema.
 */
@SpringBootTest(properties = "studio.guided-authoring.reaper-delay-ms=3600000")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GuidedLatestAttemptControllerTest {
  private static final String LATEST = "/api/v1/studio/guided-sessions/latest";
  private static final String USER = "latest-caller@example.test";
  private static final GuidedContracts CONTRACTS = new GuidedContracts();
  @Autowired private MockMvc mvc;
  @Autowired private ObjectMapper json;
  @MockBean private GuidedLatestAttemptReader reader;
  @MockBean private GuidedSessionService service;

  private MockHttpServletRequestBuilder asUser(String... testIds) {
    return get(LATEST).queryParam("testId", testIds).header("X-User-Id", USER);
  }

  private ObjectNode empty() {
    ObjectNode body = json.createObjectNode().put("schemaVersion", 3);
    body.putArray("attempts");
    return body;
  }

  @Test
  void aMissingOrEmptyTestIdIsInvalidQuery() throws Exception {
    mvc.perform(get(LATEST).header("X-User-Id", USER))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("INVALID_QUERY"));
    mvc.perform(get(LATEST).queryParam("testId", "").header("X-User-Id", USER))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("INVALID_QUERY"));
    verifyNoInteractions(reader, service);
  }

  @Test
  void moreThanFiftyIdsIsInvalidQueryAndFiftyIsAccepted() throws Exception {
    when(reader.read(any(), anyList())).thenReturn(empty());
    String[] fiftyOne =
        IntStream.range(0, 51).mapToObj(i -> UUID.randomUUID().toString()).toArray(String[]::new);
    mvc.perform(asUser(fiftyOne))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("INVALID_QUERY"));
    verifyNoInteractions(reader);

    String[] fifty = java.util.Arrays.copyOf(fiftyOne, 50);
    mvc.perform(asUser(fifty)).andExpect(status().isOk());
    @SuppressWarnings("unchecked")
    ArgumentCaptor<List<UUID>> ids = ArgumentCaptor.forClass(List.class);
    verify(reader).read(any(), ids.capture());
    assertThat(ids.getValue()).hasSize(50);
  }

  @Test
  void aValueThatIsNotAUuidIsInvalidQueryEvenBesideValidOnes() throws Exception {
    mvc.perform(asUser("not-a-uuid"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("INVALID_QUERY"));
    mvc.perform(asUser(UUID.randomUUID().toString(), "12345"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("INVALID_QUERY"));
    verifyNoInteractions(reader);
  }

  @Test
  void noSessionIsUnauthorizedBeforeAnyStudioCode() throws Exception {
    mvc.perform(get(LATEST).queryParam("testId", UUID.randomUUID().toString()))
        .andExpect(status().isUnauthorized());
    verifyNoInteractions(reader, service);
  }

  @Test
  void oneIdReachesTheReaderWithExactlyThatIdAndTheBffCaller() throws Exception {
    UUID id = UUID.randomUUID();
    when(reader.read(any(), anyList())).thenReturn(empty());
    mvc.perform(asUser(id.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.schemaVersion").value(3))
        .andExpect(jsonPath("$.attempts").isEmpty());
    ArgumentCaptor<Authentication> caller = ArgumentCaptor.forClass(Authentication.class);
    verify(reader).read(caller.capture(), org.mockito.ArgumentMatchers.eq(List.of(id)));
    assertThat(caller.getValue())
        .isInstanceOf(com.citi.put.checks.security.BffAuthenticationToken.class);
    assertThat(
            ((com.citi.put.checks.security.BffAuthenticationToken) caller.getValue())
                .getPrincipal()
                .userId())
        .isEqualTo(USER);
  }

  @Test
  void duplicatesCollapseAndAnUpperCaseUuidIsTheSameTest() throws Exception {
    UUID first = UUID.randomUUID();
    UUID second = UUID.randomUUID();
    when(reader.read(any(), anyList())).thenReturn(empty());
    mvc.perform(
            asUser(
                first.toString(),
                second.toString(),
                first.toString().toUpperCase(java.util.Locale.ROOT)))
        .andExpect(status().isOk());
    verify(reader).read(any(), org.mockito.ArgumentMatchers.eq(List.of(first, second)));
  }

  @Test
  void latestIsNotRoutedToTheByIdRead() throws Exception {
    when(reader.read(any(), anyList())).thenReturn(empty());
    mvc.perform(asUser(UUID.randomUUID().toString())).andExpect(status().isOk());
    verifyNoInteractions(service);
    verify(reader).read(any(), anyList());
  }

  @Test
  void theBodyLeavesThroughTheClosedSchemaWithBothAttemptShapes() throws Exception {
    UUID failed = UUID.randomUUID();
    UUID succeeded = UUID.randomUUID();
    ObjectNode body = empty();
    var attempts = (com.fasterxml.jackson.databind.node.ArrayNode) body.path("attempts");
    ObjectNode explanation =
        json.createObjectNode()
            .put("sessionId", "failed-session")
            .put("sourceRevision", "3")
            .put("configurationRevision", "1");
    explanation.putArray("steps");
    explanation.putArray("referenceFlows");
    attempts
        .addObject()
        .put("testId", failed.toString())
        .put("sessionId", "failed-session")
        .put("state", "FAILED")
        .put("startedAt", "2026-10-24T09:30:00Z")
        .put("errorCode", "BUDGET_EXCEEDED")
        .set("explanation", explanation);
    attempts
        .addObject()
        .put("testId", succeeded.toString())
        .put("sessionId", "ok-session")
        .put("state", "SUCCEEDED")
        .put("startedAt", "2026-10-23T16:05:12.123Z")
        .putNull("errorCode")
        .putNull("explanation");
    when(reader.read(any(), anyList())).thenReturn(body);

    String answer =
        mvc.perform(asUser(failed.toString(), succeeded.toString()))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode parsed = json.readTree(answer);
    CONTRACTS.validate("v3/latest-attempts", parsed);
    assertThat(parsed.path("attempts")).hasSize(2);
    assertThat(parsed.path("attempts").get(1).path("explanation").isNull()).isTrue();
  }

  @Test
  void theSchemaIsClosedAndRefusesAForeignFieldOrAnUntimedAttempt() {
    ObjectNode body = empty();
    ObjectNode attempt =
        ((com.fasterxml.jackson.databind.node.ArrayNode) body.path("attempts")).addObject();
    attempt
        .put("testId", UUID.randomUUID().toString())
        .put("sessionId", "s")
        .put("state", "RUNNING")
        .put("startedAt", "2026-10-24T09:30:00Z")
        .putNull("errorCode")
        .putNull("explanation");
    assertThatThrownBy(() -> CONTRACTS.validate("v3/latest-attempts", body))
        .isInstanceOf(GuidedSessionException.class);
    attempt.put("state", "FAILED").put("counters", 1);
    assertThatThrownBy(() -> CONTRACTS.validate("v3/latest-attempts", body))
        .isInstanceOf(GuidedSessionException.class);
    attempt.remove("counters");
    attempt.put("startedAt", "2026-10-24 09:30:00");
    assertThatThrownBy(() -> CONTRACTS.validate("v3/latest-attempts", body))
        .isInstanceOf(GuidedSessionException.class);
    attempt.put("startedAt", "2026-10-24T09:30:00Z");
    CONTRACTS.validate("v3/latest-attempts", body);
  }

  @Test
  void aReaderRefusalKeepsItsGuidedStatus() throws Exception {
    when(reader.read(any(), anyList()))
        .thenThrow(new GuidedSessionException("FORBIDDEN_SCOPE", 403));
    mvc.perform(asUser(UUID.randomUUID().toString())).andExpect(status().isForbidden());
  }

  @Test
  void withoutAReaderTheRouteIsARuntimeIncompatibility() {
    var controller = new GuidedSessionController(mock(GuidedSessionService.class));
    assertThatThrownBy(() -> controller.latest(null, List.of(UUID.randomUUID().toString())))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refused -> {
              assertThat(refused.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
              assertThat(refused.status()).isEqualTo(409);
            });
    assertThatThrownBy(() -> controller.latest(null, List.of()))
        .isInstanceOf(com.citi.put.checks.studio.StudioValidationException.class);
  }
}
