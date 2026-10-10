package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Full application filter ordering: guided JWT, unchanged legacy callback and platform BFF. */
@SpringBootTest(
    properties = {
      "studio.execution.callback.service-token=legacy-test-token",
      "studio.guided-authoring.reaper-delay-ms=3600000"
    })
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GuidedHttpSecurityIT {
  private static final KeyPair KEYS = keys();
  private static final String CLAIM = "/internal/v1/studio/guided-sessions/session-1/claim";
  @Autowired private MockMvc mvc;
  @Autowired private ObjectMapper json;
  @MockBean private GuidedSessionService service;

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    registry.add(
        "studio.guided-authoring.service-public-key",
        () -> Base64.getEncoder().encodeToString(KEYS.getPublic().getEncoded()));
    registry.add("studio.guided-authoring.service-issuer", () -> "issuer");
    registry.add("studio.guided-authoring.mtls-required", () -> "true");
  }

  private static KeyPair keys() {
    try {
      var generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      return generator.generateKeyPair();
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  private String token() throws Exception {
    long now = Instant.now().getEpochSecond();
    String header = "{\"alg\":\"RS256\",\"typ\":\"JWT\"}";
    String claims =
        json.createObjectNode()
            .put("iss", "issuer")
            .put("sub", "worker-1")
            .put("role", "owning-worker")
            .put("aud", "studio-guided-controller")
            .put("iat", now)
            .put("exp", now + 60)
            .toString();
    String payload =
        encode(header.getBytes(StandardCharsets.UTF_8))
            + "."
            + encode(claims.getBytes(StandardCharsets.UTF_8));
    var signature = Signature.getInstance("SHA256withRSA");
    signature.initSign(KEYS.getPrivate());
    signature.update(payload.getBytes(StandardCharsets.US_ASCII));
    return payload + "." + encode(signature.sign());
  }

  private static String encode(byte[] bytes) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  @Test
  void internalGuidedChainRunsBeforeLegacyAndRejectsBffOrStaticToken() throws Exception {
    mvc.perform(
            post(CLAIM)
                .header("Authorization", "Bearer legacy-test-token")
                .header("X-User-Id", "user")
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isUnauthorized());
    mvc.perform(
            post(CLAIM).header("X-User-Id", "user").contentType("application/json").content("{}"))
        .andExpect(status().isUnauthorized());
    // Mockito service is not touched: rejection happens before controller/repository work.
    org.mockito.Mockito.clearInvocations(service);
    mvc.perform(
            post(CLAIM)
                .header("Authorization", "Bearer " + token())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isUnauthorized());
    verifyNoInteractions(service);
  }

  @Test
  void authenticatedWorkerArrivesWithItsVerifiedSubjectAndNonUuidKey() throws Exception {
    when(service.claim(any(), anyString(), anyString(), any())).thenReturn(json.createObjectNode());
    mvc.perform(
            post(CLAIM)
                .header("Authorization", "Bearer " + token())
                .header("Idempotency-Key", "not-a-uuid")
                .requestAttr(
                    "jakarta.servlet.request.X509Certificate",
                    new X509Certificate[] {org.mockito.Mockito.mock(X509Certificate.class)})
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isAccepted());
    ArgumentCaptor<Authentication> identity = ArgumentCaptor.forClass(Authentication.class);
    verify(service)
        .claim(
            identity.capture(),
            org.mockito.ArgumentMatchers.eq("session-1"),
            org.mockito.ArgumentMatchers.eq("not-a-uuid"),
            any());
    assertThat(identity.getValue().getName()).isEqualTo("worker-1");
  }

  @Test
  void publicV3UsesBffAndBypassesLegacyUuidIdempotency() throws Exception {
    // This authentication-only service stub returns a named public session with no publication
    // base. The real start/domain/published-view flow is exercised by the joined tests.
    var started =
        json.createObjectNode()
            .put("schemaVersion", 2)
            .put("sessionId", "security-no-publication-base")
            .put("testId", "security-test")
            .put("state", "PREPARING")
            .put("expiresAt", Instant.now().plusSeconds(60).toString());
    var counters = started.putObject("counters");
    for (String field :
        List.of(
            "actions",
            "observations",
            "modelProposals",
            "modelInputTokens",
            "modelOutputTokens",
            "sanitizedEvidenceBytes")) {
      counters.put(field, 0);
    }
    when(service.start(any(), anyString(), any())).thenReturn(started);
    mvc.perform(
            post("/api/v3/studio/guided-sessions")
                .header("X-User-Id", "user@example.test")
                .header("Idempotency-Key", "k".repeat(256))
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isAccepted());
    var principal =
        ArgumentCaptor.forClass(com.citi.put.checks.security.BffAuthenticationToken.class);
    verify(service)
        .start(principal.capture(), org.mockito.ArgumentMatchers.eq("k".repeat(256)), any());
    assertThat(principal.getValue().getPrincipal().userId()).isEqualTo("user@example.test");
    mvc.perform(
            post("/api/v3/studio/guided-sessions")
                .header("Authorization", "Bearer " + token())
                .header("Idempotency-Key", "key")
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void pendingResultAndAbsentClarificationFollowFrozenHttpStatus() throws Exception {
    when(service.read(any(), anyString(), org.mockito.ArgumentMatchers.eq("result")))
        .thenReturn(json.createObjectNode().put("state", "OBSERVING"));
    mvc.perform(
            get("/api/v3/studio/guided-sessions/session-1/result")
                .header("X-User-Id", "user@example.test"))
        .andExpect(status().isAccepted());
    mvc.perform(
            get("/api/v3/studio/guided-sessions/session-1/clarification")
                .header("X-User-Id", "user@example.test"))
        .andExpect(status().isNoContent());
  }

  @Test
  void legacyCallbackAndOpenApiRoutesRemainOnTheirExistingChains() throws Exception {
    mvc.perform(
            post("/internal/legacy-probe")
                .header("Authorization", "Bearer legacy-test-token")
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isNotFound());
    mvc.perform(post("/internal/legacy-probe").contentType("application/json").content("{}"))
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
  }

  @Test
  void rawMalformedBodiesNeverReachEitherGuidedControllerOrChangeBffPolicy() throws Exception {
    var parity =
        new GuidedContracts()
            .parse(
                java.nio.file.Files.readString(
                    java.nio.file.Path.of(
                        "../docs/specs/studio-observed-authoring/contracts/v2/wire-parity.fixtures.json")));
    org.mockito.Mockito.clearInvocations(service);
    for (var vector : parity.path("rawJson")) {
      if (vector.path("accepted").asBoolean()) {
        continue;
      }
      byte[] bytes = Base64.getDecoder().decode(vector.path("base64").asText());
      mvc.perform(
              post("/api/v3/studio/guided-sessions")
                  .header("X-User-Id", "user@example.test")
                  .header("Idempotency-Key", "malformed")
                  .contentType("application/json")
                  .content(bytes))
          .andExpect(status().isUnprocessableEntity());
      mvc.perform(
              post(CLAIM)
                  .header("Authorization", "Bearer " + token())
                  .header("Idempotency-Key", "malformed")
                  .requestAttr(
                      "jakarta.servlet.request.X509Certificate",
                      new X509Certificate[] {org.mockito.Mockito.mock(X509Certificate.class)})
                  .contentType("application/json")
                  .content(bytes))
          .andExpect(status().isUnprocessableEntity());
    }
    mvc.perform(
            post("/api/v3/studio/guided-sessions")
                .header("X-User-Id", "user@example.test")
                .header("Idempotency-Key", "wrong-charset")
                .contentType("application/json;charset=ISO-8859-1")
                .content("{}"))
        .andExpect(status().isUnprocessableEntity());
    verifyNoInteractions(service);
  }
}
