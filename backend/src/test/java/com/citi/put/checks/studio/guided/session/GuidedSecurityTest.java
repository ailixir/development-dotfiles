package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

class GuidedSecurityTest {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Clock CLOCK =
      Clock.fixed(Instant.parse("2026-10-08T03:00:00Z"), ZoneOffset.UTC);
  private static KeyPair keys;

  @BeforeAll
  static void key() throws Exception {
    var generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(2048);
    keys = generator.generateKeyPair();
  }

  private GuidedInternalSecurity.IdentityFilter filter() {
    return new GuidedInternalSecurity.IdentityFilter(
        Base64.getEncoder().encodeToString(keys.getPublic().getEncoded()), "issuer", true, CLOCK);
  }

  private ObjectNode claims(String role) {
    return JSON.createObjectNode()
        .put("iss", "issuer")
        .put("sub", "worker-1")
        .put("role", role)
        .put("aud", "studio-guided-controller")
        .put("iat", CLOCK.instant().getEpochSecond())
        .put("exp", CLOCK.instant().getEpochSecond() + 60);
  }

  private String signed(String header, String claims) throws Exception {
    return signed(header.getBytes(StandardCharsets.UTF_8), claims.getBytes(StandardCharsets.UTF_8));
  }

  private String signed(byte[] header, byte[] claims) throws Exception {
    String payload = encode(header) + "." + encode(claims);
    var signature = Signature.getInstance("SHA256withRSA");
    signature.initSign(keys.getPrivate());
    signature.update(payload.getBytes(StandardCharsets.US_ASCII));
    return payload + "." + encode(signature.sign());
  }

  private String signed(ObjectNode claims) throws Exception {
    return signed("{\"alg\":\"RS256\",\"typ\":\"JWT\"}", claims.toString());
  }

  private static String encode(byte[] bytes) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private MockHttpServletRequest request(String token) {
    var request = new MockHttpServletRequest();
    request.addHeader("Authorization", "Bearer " + token);
    request.setAttribute(
        "jakarta.servlet.request.X509Certificate",
        new X509Certificate[] {mock(X509Certificate.class)});
    return request;
  }

  @Test
  void approvedKebabCaseConfigurationLowersTheFrozenCeilings() {
    var source =
        new org.springframework.boot.context.properties.source.MapConfigurationPropertySource(
            java.util.Map.of(
                "studio.guided-authoring.enabled",
                "true",
                "studio.guided-authoring.max-session-seconds",
                "30",
                "studio.guided-authoring.max-actions",
                "2"));
    var properties =
        new org.springframework.boot.context.properties.bind.Binder(source)
            .bind(
                "studio.guided-authoring",
                org.springframework.boot.context.properties.bind.Bindable.of(
                    GuidedSessionProperties.class))
            .get();
    var limits = properties.snapshot(new GuidedContracts());
    assertThat(properties.enabled()).isTrue();
    assertThat(limits.path("maxSessionSeconds").asInt()).isEqualTo(30);
    assertThat(limits.path("maxActions").asInt()).isEqualTo(2);
    assertThat(limits.path("maxObservations").asInt()).isEqualTo(400);
  }

  @Test
  void validAudienceBoundWorkerAndControllerRemainDistinct() throws Exception {
    var worker = filter().authenticate(request(signed(claims("owning-worker"))));
    assertThat(worker.getName()).isEqualTo("worker-1");
    GuidedInternalSecurity.requireRole(worker, "owning-worker");
    assertThatThrownBy(() -> GuidedInternalSecurity.requireRole(worker, "backend-controller"))
        .hasMessage("FORBIDDEN_SCOPE");
    GuidedInternalSecurity.requireRole(
        filter().authenticate(request(signed(claims("backend-controller")))), "backend-controller");
  }

  @Test
  void wrongAudienceIssuerSubjectSignatureAndRoleFail() throws Exception {
    for (String field : List.of("aud", "iss", "role", "sub")) {
      ObjectNode bad = claims("owning-worker");
      bad.put(field, field.equals("sub") ? "" : "other");
      String token = signed(bad);
      assertThatThrownBy(() -> filter().authenticate(request(token)))
          .isInstanceOf(GuidedSessionException.class);
    }
    String valid = signed(claims("owning-worker"));
    String bad = valid.substring(0, valid.lastIndexOf('.') + 1) + "A".repeat(342);
    assertThatThrownBy(() -> filter().authenticate(request(bad))).isInstanceOf(Exception.class);
  }

  @Test
  void timeTypesExpiryFutureAndLifetimeFail() throws Exception {
    long now = CLOCK.instant().getEpochSecond();
    for (ObjectNode bad :
        List.of(
            claims("owning-worker").put("iat", now + 1),
            claims("owning-worker").put("exp", now),
            claims("owning-worker").put("exp", now + 301),
            claims("owning-worker").put("iat", "1"),
            claims("owning-worker").put("nbf", now + 1),
            claims("owning-worker").put("exp", Double.MAX_VALUE))) {
      String token = signed(bad);
      assertThatThrownBy(() -> filter().authenticate(request(token)))
          .isInstanceOf(GuidedSessionException.class);
    }
  }

  @Test
  void algorithmSubstitutionDuplicateKeysAndTrailingJsonFail() throws Exception {
    for (String header :
        List.of(
            "{\"alg\":\"none\",\"typ\":\"JWT\"}",
            "{\"alg\":\"HS256\",\"typ\":\"JWT\"}",
            "{\"alg\":\"RS256\",\"typ\":\"JWT\",\"jku\":\"https://attacker.test\"}",
            "{\"alg\":\"RS256\",\"alg\":\"RS256\",\"typ\":\"JWT\"}")) {
      String token = signed(header, claims("owning-worker").toString());
      assertThatThrownBy(() -> filter().authenticate(request(token))).isInstanceOf(Exception.class);
    }
    for (String body :
        List.of(
            claims("owning-worker") + " {}",
            claims("owning-worker")
                .toString()
                .replace("\"iss\":\"issuer\"", "\"iss\":\"issuer\",\"iss\":\"issuer\""),
            "[]")) {
      String token = signed("{\"alg\":\"RS256\",\"typ\":\"JWT\"}", body);
      assertThatThrownBy(() -> filter().authenticate(request(token))).isInstanceOf(Exception.class);
    }
  }

  @Test
  void mtlsCannotBeReplacedBySecureOrForwardedHeaders() throws Exception {
    var request = request(signed(claims("owning-worker")));
    request.removeAttribute("jakarta.servlet.request.X509Certificate");
    request.setSecure(true);
    request.addHeader("X-Forwarded-Client-Cert", "pretend");
    assertThatThrownBy(() -> filter().authenticate(request)).hasMessage("UNAUTHENTICATED");
    assertThatThrownBy(
            () ->
                new GuidedInternalSecurity.IdentityFilter("", "issuer", false, CLOCK)
                    .authenticate(request))
        .hasMessage("UNAUTHENTICATED");
  }

  @Test
  void bffAndLegacyServiceTokensNeverBecomeGuidedIdentity() throws Exception {
    assertThatThrownBy(
            () ->
                GuidedInternalSecurity.requireRole(
                    new UsernamePasswordAuthenticationToken(
                        "studio-runner-callback", null, List.of()),
                    "owning-worker"))
        .hasMessage("UNAUTHENTICATED");
    assertThatThrownBy(
            () ->
                GuidedInternalSecurity.requireRole(
                    new BffAuthenticationToken(
                        new UserIdentity("user", null, null, null, List.of(), List.of())),
                    "backend-controller"))
        .hasMessage("UNAUTHENTICATED");
    var response = new MockHttpServletResponse();
    filter()
        .doFilter(
            request("legacy-service-token"),
            response,
            (req, res) -> {
              throw new AssertionError("Must authenticate before downstream work");
            });
    assertThat(response.getStatus()).isEqualTo(401);
    assertThat(response.getContentAsString()).doesNotContain("legacy-service-token");
  }

  @Test
  void malformedAndOversizedTokensAreRejectedBeforeBodyRead() throws Exception {
    for (String token : List.of("abc.def", "abc.def.ghi.extra", "a=.b.c", "a".repeat(9000))) {
      var response = new MockHttpServletResponse();
      filter()
          .doFilter(
              request(token),
              response,
              (req, res) -> {
                throw new AssertionError("No downstream work");
              });
      assertThat(response.getStatus()).isEqualTo(401);
    }
  }

  @Test
  void closedClaimsAndCanonicalNonnegativeNbfMatchRunner() throws Exception {
    assertThat(
            filter().authenticate(request(signed(claims("owning-worker").put("nbf", 0)))).getName())
        .isEqualTo("worker-1");
    for (ObjectNode body :
        List.of(
            claims("owning-worker").put("unknownSignedClaim", "ignored-before-fix"),
            claims("owning-worker").put("nbf", -1),
            claims("owning-worker").put("nbf", 9007199254740992L))) {
      String jwt = signed(body);
      assertThatThrownBy(() -> filter().authenticate(request(jwt)))
          .isInstanceOf(GuidedSessionException.class);
    }
    for (String number : List.of("-0", "0.0", "0e0")) {
      String body =
          claims("owning-worker")
              .put("nbf", 0)
              .toString()
              .replace("\"nbf\":0", "\"nbf\":" + number);
      String jwt = signed("{\"alg\":\"RS256\",\"typ\":\"JWT\"}", body);
      assertThatThrownBy(() -> filter().authenticate(request(jwt)))
          .isInstanceOf(GuidedSessionException.class);
    }
  }

  @Test
  void signedMalformedUtf8CannotBecomeReplacementCharacterIdentity() throws Exception {
    byte[] body = claims("owning-worker").toString().getBytes(StandardCharsets.UTF_8);
    int position = claims("owning-worker").toString().indexOf("worker-1");
    body[position] = (byte) 0xc3;
    body[position + 1] = (byte) 0x28;
    String jwt =
        signed("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8), body);
    assertThatThrownBy(() -> filter().authenticate(request(jwt)))
        .isInstanceOf(GuidedSessionException.class);
  }
}
