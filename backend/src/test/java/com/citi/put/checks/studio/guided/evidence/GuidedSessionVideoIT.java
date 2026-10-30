package com.citi.put.checks.studio.guided.evidence;

import static com.citi.put.checks.studio.guided.evidence.GuidedRecordingSeed.action;
import static com.citi.put.checks.studio.guided.evidence.GuidedRecordingSeed.body;
import static com.citi.put.checks.studio.guided.evidence.GuidedRecordingSeed.timings;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.studio.evidence.FakeVideoObjectStore;
import com.citi.put.checks.studio.evidence.TestEvidenceStores;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * STUDIO-OBS-013 AC-3/AC-6 (backend half), ruling AR-1: the recording-evidence callback through the
 * real guided internal chain (service JWT + mutual TLS), and {@code GET
 * /api/v1/studio/guided-sessions/{id}/video} through the platform session, on the application's
 * PostgreSQL.
 *
 * <p>What this class does NOT prove, recorded rather than implied: the runner half (recorded guided
 * context, offsets stamped on the run clock, upload, manifest) and the joined learn run on the
 * OBS-007 login fixture. Those are R13/R14 and the S3 joined proof. Here the recording bytes are
 * placed in the test evidence store at the server-derived key, as the runner would upload them.
 *
 * <p>The session access boundary is a mock whose {@code checkUser} admits only the session's own
 * principal; every other call is a no-op. Authorization is otherwise the production path: the video
 * route calls {@code readGuidedSession}'s own read.
 */
@SpringBootTest(
    properties = {
      "studio.execution.callback.service-token=legacy-test-token",
      "studio.guided-authoring.reaper-delay-ms=3600000"
    })
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestEvidenceStores.class)
class GuidedSessionVideoIT {

  private static final KeyPair KEYS = keys();
  private static final String OWNER = "user-1";

  @Autowired private MockMvc mvc;
  @Autowired private ObjectMapper json;
  @Autowired private JdbcTemplate jdbc;
  @org.springframework.boot.test.mock.mockito.SpyBean private FakeVideoObjectStore store;
  @MockBean private GuidedSessionAccess access;

  private GuidedRecordingSeed seed;

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

  @BeforeEach
  void setUp() {
    store.clear();
    store.makeReachable();
    seed = new GuidedRecordingSeed(jdbc);
    doAnswer(
            call -> {
              var principal = call.getArgument(0);
              JsonNode session = call.getArgument(1);
              GuidedSessionException.require(
                  principal instanceof BffAuthenticationToken token
                      && token
                          .getPrincipal()
                          .userId()
                          .equals(session.path("scope").path("principalId").asText()),
                  "FORBIDDEN_SCOPE",
                  403);
              return null;
            })
        .when(access)
        .checkUser(any(), any());
  }

  private String token(String subject, String role) throws Exception {
    long now = Instant.now().getEpochSecond();
    String header = "{\"alg\":\"RS256\",\"typ\":\"JWT\"}";
    String claims =
        json.createObjectNode()
            .put("iss", "issuer")
            .put("sub", subject)
            .put("role", role)
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

  private MockHttpServletResponse callback(
      String sessionId, long fence, String key, String body, boolean certificate) throws Exception {
    var request =
        post("/internal/v2/studio/guided-sessions/" + sessionId + "/recording-evidence")
            .header("Authorization", "Bearer " + token("worker-1", "owning-worker"))
            .header("Idempotency-Key", key)
            .header("X-Owner-Fence", fence)
            .contentType("application/json")
            .content(body);
    if (certificate) {
      request =
          request.requestAttr(
              "jakarta.servlet.request.X509Certificate",
              new X509Certificate[] {org.mockito.Mockito.mock(X509Certificate.class)});
    }
    return mvc.perform(request).andReturn().getResponse();
  }

  private MockHttpServletResponse video(String sessionId, String user, String range, String query)
      throws Exception {
    var request =
        get("/api/v1/studio/guided-sessions/" + sessionId + "/video" + query)
            .header("X-User-Id", user);
    if (range != null) {
      request = request.header("Range", range);
    }
    return mvc.perform(request).andReturn().getResponse();
  }

  private MockHttpServletResponse readSession(String sessionId, String user) throws Exception {
    return mvc.perform(get("/api/v1/studio/guided-sessions/" + sessionId).header("X-User-Id", user))
        .andReturn()
        .getResponse();
  }

  private static byte[] recording(int size) {
    byte[] bytes = new byte[size];
    for (int i = 0; i < size; i++) {
      bytes[i] = (byte) (i * 31 + 7);
    }
    return bytes;
  }

  /** A recorded session: STORED fact accepted through the internal chain, bytes in the store. */
  private GuidedRecordingSeed.Seeded recorded(byte[] bytes) throws Exception {
    var s = seed.session("SUCCEEDED", 60, 1);
    seed.action(s.sessionId(), "adm-" + s.sessionId(), GuidedRecordingSeed.STEP_ONE, 0, true);
    ObjectNode body = body(s, "rec-" + s.sessionId().substring(4, 12), "STORED", false);
    timings(body).add(action("adm-" + s.sessionId(), GuidedRecordingSeed.STEP_ONE, 0, 40, 260));
    assertThat(callback(s.sessionId(), 1, "k-" + s.sessionId(), body.toString(), true).getStatus())
        .isEqualTo(202);
    store.put(
        GuidedRecordingKeys.derive(GuidedRecordingSeed.CSI_ID, s.sessionId())
            .orElseThrow()
            .videoKey(),
        bytes);
    return s;
  }

  private static String withoutRequestId(String body) {
    return body.replaceAll("\"requestId\":\"[^\"]*\"", "\"requestId\":\"-\"");
  }

  // ── the internal callback ────────────────────────────────────────────────

  @Test
  void theCallbackIsAuthenticatedByTheGuidedChainAndIdempotentUnderOneKey() throws Exception {
    var s = seed.session("SUCCEEDED", 60, 1);
    String body = body(s, "rec-a", "UNAVAILABLE", false).toString();

    assertThat(callback(s.sessionId(), 1, "rec-rec-a", body, false).getStatus())
        .as("no client certificate: refused by the internal chain")
        .isEqualTo(401);

    MockHttpServletResponse first = callback(s.sessionId(), 1, "rec-rec-a", body, true);
    assertThat(first.getStatus()).isEqualTo(202);
    assertThat(json.readTree(first.getContentAsString())).isEqualTo(json.readTree(body));
    MockHttpServletResponse again = callback(s.sessionId(), 1, "rec-rec-a", body, true);
    assertThat(again.getStatus()).isEqualTo(202);
    assertThat(again.getContentAsString()).isEqualTo(first.getContentAsString());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_session_recordings WHERE session_id=?",
                Integer.class,
                s.sessionId()))
        .isEqualTo(1);
  }

  @Test
  void theStrictWireReaderRefusesAFractionalReading() throws Exception {
    var s = seed.session("SUCCEEDED", 60, 1);
    seed.action(s.sessionId(), "a1", GuidedRecordingSeed.STEP_ONE, 0, true);
    ObjectNode body = body(s, "rec-f", "STORED", false);
    timings(body).add(action("a1", GuidedRecordingSeed.STEP_ONE, 0, 12, 20));
    String fractional = body.toString().replace("\"startMs\":12", "\"startMs\":12.5");
    MockHttpServletResponse response = callback(s.sessionId(), 1, "k", fractional, true);
    assertThat(response.getStatus()).isEqualTo(422);
    assertThat(json.readTree(response.getContentAsString()).path("code").asText())
        .isEqualTo("INVALID_CONTRACT");
  }

  @Test
  void aPublishedLearnsRecordingIsRefusedRecordingNotRetainedAndNoRowIsWritten() throws Exception {
    var s = seed.session("SUCCEEDED", 60, 1);
    seed.markPublished(s.sessionId());
    String body = body(s, "rec-pub", "STORED", false).toString();

    MockHttpServletResponse refused = callback(s.sessionId(), 1, "k-pub", body, true);

    assertThat(refused.getStatus()).isEqualTo(409);
    JsonNode envelope = json.readTree(refused.getContentAsString());
    assertThat(envelope.path("code").asText()).isEqualTo("RECORDING_NOT_RETAINED");
    assertThat(envelope.path("retryable").asBoolean()).as("definite, never retried").isFalse();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_session_recordings WHERE session_id=?",
                Integer.class,
                s.sessionId()))
        .isZero();
    // A resend gets the same definite answer.
    assertThat(callback(s.sessionId(), 1, "k-pub", body, true).getStatus()).isEqualTo(409);
  }

  @Test
  void aSucceededButUnpublishedLearnKeepsItsRecording() throws Exception {
    // SUCCEEDED with the publication PENDING or REFUSED: no receipt row, so nothing is discarded.
    var s = seed.session("SUCCEEDED", 60, 1);

    assertThat(
            callback(
                    s.sessionId(),
                    1,
                    "k-keep",
                    body(s, "rec-keep", "FAILED", false).toString(),
                    true)
                .getStatus())
        .isEqualTo(202);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_session_recordings WHERE session_id=?",
                Integer.class,
                s.sessionId()))
        .isEqualTo(1);
    assertThat(result(s.sessionId()).path("evidence").path("video").path("status").asText())
        .isEqualTo("FAILED");
  }

  @Test
  void aPublishedLearnsVideoRouteIsNoEvidenceEvenWhenARowAndAnObjectExist() throws Exception {
    // The row was written while the session was still finalizing; the publication then committed.
    var s = recorded(recording(64));
    assertThat(video(s.sessionId(), OWNER, null, "").getStatus()).isEqualTo(200);
    seed.markPublished(s.sessionId());
    org.mockito.Mockito.clearInvocations(store);

    MockHttpServletResponse hidden = video(s.sessionId(), OWNER, null, "");

    assertThat(hidden.getStatus()).isEqualTo(404);
    assertThat(json.readTree(hidden.getContentAsString()).path("error").asText())
        .isEqualTo("VIDEO_UNAVAILABLE");
    org.mockito.Mockito.verifyNoInteractions(store);
  }

  // ── the public video route ───────────────────────────────────────────────

  @Test
  void anAvailableRecordingIsServedWholeAndByRangeFromTheMeasuredSize() throws Exception {
    byte[] bytes = recording(5000);
    var s = recorded(bytes);

    MockHttpServletResponse whole = video(s.sessionId(), OWNER, null, "");
    assertThat(whole.getStatus()).isEqualTo(200);
    assertThat(whole.getContentAsByteArray()).isEqualTo(bytes);
    assertThat(whole.getContentType()).isEqualTo("video/webm");
    assertThat(whole.getHeader("Accept-Ranges")).isEqualTo("bytes");
    assertThat(whole.getHeader("Cache-Control")).isEqualTo("private, no-store");
    assertThat(whole.getHeader("Content-Disposition")).isNull();

    MockHttpServletResponse ranged = video(s.sessionId(), OWNER, "bytes=100-1099", "");
    assertThat(ranged.getStatus()).isEqualTo(206);
    assertThat(ranged.getContentAsByteArray()).isEqualTo(Arrays.copyOfRange(bytes, 100, 1100));
    assertThat(ranged.getHeader("Content-Range")).isEqualTo("bytes 100-1099/5000");

    MockHttpServletResponse unsatisfiable = video(s.sessionId(), OWNER, "bytes=9000-", "");
    assertThat(unsatisfiable.getStatus()).isEqualTo(416);
    assertThat(unsatisfiable.getHeader("Content-Range")).isEqualTo("bytes */5000");

    MockHttpServletResponse download = video(s.sessionId(), OWNER, null, "?download=true");
    assertThat(download.getHeader("Content-Disposition"))
        .isEqualTo("attachment; filename=\"guided-session-" + s.sessionId() + ".webm\"");
  }

  @Test
  void authorizationIsReadGuidedSessionsOwnDecision() throws Exception {
    var s = recorded(recording(10));

    MockHttpServletResponse denied = video(s.sessionId(), "user-2", null, "");
    MockHttpServletResponse sessionDenied = readSession(s.sessionId(), "user-2");
    assertThat(denied.getStatus()).isEqualTo(403).isEqualTo(sessionDenied.getStatus());
    assertThat(withoutRequestId(denied.getContentAsString()))
        .isEqualTo(withoutRequestId(sessionDenied.getContentAsString()));

    MockHttpServletResponse unknown = video("rec-no-such-session", OWNER, null, "");
    MockHttpServletResponse sessionUnknown = readSession("rec-no-such-session", OWNER);
    assertThat(unknown.getStatus()).isEqualTo(403).isEqualTo(sessionUnknown.getStatus());
    assertThat(withoutRequestId(unknown.getContentAsString()))
        .isEqualTo(withoutRequestId(sessionUnknown.getContentAsString()))
        .isEqualTo(withoutRequestId(denied.getContentAsString()));
  }

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(
      strings = {"FORBIDDEN_SCOPE", "AUTHORITY_UNAVAILABLE"})
  void everyRangeAndDownloadRechecksRevokedOrUnavailableAuthorityWithoutStoreAccess(String code)
      throws Exception {
    var s = recorded(recording(64));
    assertThat(video(s.sessionId(), OWNER, "bytes=0-3", "").getStatus()).isEqualTo(206);
    org.mockito.Mockito.clearInvocations(store);
    int status = code.equals("FORBIDDEN_SCOPE") ? 403 : 503;
    org.mockito.Mockito.doThrow(new GuidedSessionException(code, status))
        .when(access)
        .checkUser(any(), any());
    var expected = readSession(s.sessionId(), OWNER);
    assertThat(expected.getStatus()).isEqualTo(status);
    for (MockHttpServletResponse denied :
        new MockHttpServletResponse[] {
          video(s.sessionId(), OWNER, "bytes=4-7", ""),
          video(s.sessionId(), OWNER, null, "?download=true")
        }) {
      assertThat(denied.getStatus()).isEqualTo(expected.getStatus());
      assertThat(withoutRequestId(denied.getContentAsString()))
          .isEqualTo(withoutRequestId(expected.getContentAsString()));
    }
    org.mockito.Mockito.verifyNoInteractions(store);
  }

  @Test
  void nothingToServeIs404AndExpiryIs410() throws Exception {
    var running = seed.session("ACTING", 300, 1);
    assertThat(video(running.sessionId(), OWNER, null, "").getStatus()).isEqualTo(404);

    var failed = seed.session("SUCCEEDED", 60, 1);
    callback(failed.sessionId(), 1, "k", body(failed, "rf", "FAILED", false).toString(), true);
    MockHttpServletResponse failedVideo = video(failed.sessionId(), OWNER, null, "");
    assertThat(failedVideo.getStatus()).isEqualTo(404);
    assertThat(json.readTree(failedVideo.getContentAsString()).path("error").asText())
        .isEqualTo("VIDEO_UNAVAILABLE");

    var gone = seed.session("SUCCEEDED", -600, 1);
    assertThat(video(gone.sessionId(), OWNER, null, "").getStatus()).isEqualTo(404);

    var available = recorded(recording(10));
    store.clear();
    assertThat(video(available.sessionId(), OWNER, null, "").getStatus())
        .as("an AVAILABLE fact whose object is absent from a reachable store")
        .isEqualTo(404);

    var expired = seed.session("SUCCEEDED", 60, 1);
    jdbc.update(
        "INSERT INTO studio_guided_session_recordings(session_id,scope_hash,recording_id,"
            + "worker_id,owner_fence,state,partial,video_key,manifest_key,recorded_at,expires_at,"
            + "timings) VALUES (?,?,?,'worker-1',1,'AVAILABLE',false,'k','m',"
            + "clock_timestamp() - interval '2 days', clock_timestamp() - interval '1 day','[]')",
        expired.sessionId(),
        expired.scopeHash(),
        "old-" + expired.sessionId().substring(4, 12));
    MockHttpServletResponse expiredVideo = video(expired.sessionId(), OWNER, null, "");
    assertThat(expiredVideo.getStatus()).isEqualTo(410);
    assertThat(json.readTree(expiredVideo.getContentAsString()).path("error").asText())
        .isEqualTo("VIDEO_EXPIRED");
  }

  @Test
  void anUnreachableStoreIs503AndNoSurfaceNamesAKeyBucketOrEndpoint() throws Exception {
    var s = recorded(recording(64));
    store.makeUnreachable();
    MockHttpServletResponse down = video(s.sessionId(), OWNER, null, "");
    assertThat(down.getStatus()).isEqualTo(503);
    assertThat(json.readTree(down.getContentAsString()).path("error").asText())
        .isEqualTo("VIDEO_STORE_UNAVAILABLE");
    store.makeReachable();

    String key =
        GuidedRecordingKeys.derive(GuidedRecordingSeed.CSI_ID, s.sessionId())
            .orElseThrow()
            .videoKey();
    for (MockHttpServletResponse response :
        new MockHttpServletResponse[] {
          down,
          video(s.sessionId(), OWNER, "bytes=999-", ""),
          video(s.sessionId(), "user-2", null, ""),
          video(s.sessionId(), OWNER, null, "?download=true"),
          readSession(s.sessionId(), OWNER)
        }) {
      String headers =
          response.getHeaderNames().stream()
              .map(name -> name + ":" + response.getHeaders(name))
              .reduce("", String::concat);
      String text =
          headers
              + (response.getContentType() != null && response.getContentType().startsWith("video/")
                  ? ""
                  : response.getContentAsString());
      assertThat(text).doesNotContain(key, "studio/", "manifest", "put-checks-studio-evidence");
    }
  }

  // ── S3: GuidedSessionService.result() publishes the projection ───────────

  private JsonNode result(String sessionId) throws Exception {
    MockHttpServletResponse response =
        mvc.perform(
                get("/api/v1/studio/guided-sessions/" + sessionId + "/result")
                    .header("X-User-Id", OWNER))
            .andReturn()
            .getResponse();
    assertThat(response.getStatus()).as(response.getContentAsString()).isEqualTo(200);
    JsonNode body = json.readTree(response.getContentAsString());
    // C2b: evidence.video is a VideoEvidence object; null is invalid.
    new com.citi.put.checks.studio.guided.session.GuidedContracts().validate("v3/result", body);
    assertThat(body.path("evidence").path("video").isObject()).isTrue();
    return body;
  }

  @Test
  void theSessionServicesResultCarriesTheRecordingEvidenceAndValidates() throws Exception {
    var s = recorded(recording(32));
    JsonNode available = result(s.sessionId());
    assertThat(available.path("evidence").path("kind").asText()).isEqualTo("guidedLedger");
    assertThat(available.path("evidence").path("ref").asText()).isEqualTo(s.sessionId());
    assertThat(available.path("evidence").path("video").path("status").asText())
        .isEqualTo("AVAILABLE");
    assertThat(available.path("evidence").path("video").path("expiresAt").isTextual()).isTrue();
    // One derived step item and one action item, IDs and integers only.
    assertThat(available.path("actionTimings")).hasSize(2);
    assertThat(available.path("actionTimings").get(0).path("kind").asText()).isEqualTo("step");
    assertThat(available.path("actionTimings").get(1).path("kind").asText()).isEqualTo("action");
    // Learned-from-execution evidence is never replay-verified evidence.
    assertThat(available.path("replayVerified").asBoolean()).isFalse();

    var waiting = seed.session("SUCCEEDED", 60, 1);
    JsonNode processing = result(waiting.sessionId());
    assertThat(processing.path("evidence").path("video").toString())
        .isEqualTo(
            "{\"status\":\"PROCESSING\",\"error\":null,\"expiresAt\":null,\"partial\":false}");
    assertThat(processing.path("actionTimings")).isEmpty();

    var gone = seed.session("FAILED", -600, 1);
    assertThat(result(gone.sessionId()).path("evidence").path("video").path("status").asText())
        .isEqualTo("UNAVAILABLE");

    var failed = seed.session("SUCCEEDED", 60, 1);
    callback(
        failed.sessionId(),
        1,
        "k",
        body(failed, "rf2-" + failed.sessionId().substring(4, 12), "FAILED", false).toString(),
        true);
    JsonNode failedResult = result(failed.sessionId());
    assertThat(failedResult.path("evidence").path("video").path("error").asText())
        .isEqualTo(RecordedGuidedEvidenceProjection.FAILED_TEXT);
    assertThat(failedResult.toString()).doesNotContain("studio/", ".webm", "manifest");
  }
}
