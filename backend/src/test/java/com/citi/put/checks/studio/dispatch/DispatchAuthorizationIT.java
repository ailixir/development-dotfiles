package com.citi.put.checks.studio.dispatch;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.config.CoreServiceProperties;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CoreServiceClient;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationProperties;
import com.citi.put.checks.studio.guided.publication.PublicationContracts;
import com.citi.put.checks.studio.guided.publication.PublicationGrantAuthority;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Real uncached Core HTTP calls; cached BFF ownership cannot replace current publication authority.
 */
class DispatchAuthorizationIT {
  private static final String COOKIE = "synthetic-core-cookie-only";
  private final GuidedContracts contracts = new GuidedContracts();
  private final Instant now = Instant.parse("2026-10-09T12:00:00.123456789Z");
  private WireMockServer core;
  private ProvisionalDispatchAuthorization authorization;
  private BffAuthenticationToken owner;
  private MockHttpServletRequest request;

  @BeforeEach
  void start() {
    core = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    core.start();
    var authority =
        new PublicationGrantAuthority(
            new CoreServiceClient(
                new CoreServiceProperties(
                    core.baseUrl(), new CoreServiceProperties.Timeout(500, 500)),
                new ObjectMapper()),
            new CsiOwnershipEvaluator(),
            Clock.fixed(now, ZoneOffset.UTC),
            new GuidedPublicationProperties(
                true, 3, 15000, 5000, PublicationContracts.MAX_VALIDATION_BYTES));
    authorization = new ProvisionalDispatchAuthorization(null, null);
    var beans = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
    beans.registerSingleton("publicationGrantAuthority", authority);
    authorization.initializePublicationAuthority(
        beans.getBeanProvider(PublicationGrantAuthority.class));
    owner =
        new BffAuthenticationToken(
            new UserIdentity(
                "owner",
                "owner@example.invalid",
                "Owner",
                "test",
                List.of(),
                List.of(new CsiOwnershipEntry("1234", "owner"))));
    request = new MockHttpServletRequest();
    request.setCookies(new Cookie("put_session", COOKIE));
  }

  @AfterEach
  void stop() {
    core.stop();
  }

  private void current(String principal, String role) {
    core.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .withHeader("Cookie", equalTo("put_session=" + COOKIE))
            .willReturn(
                okJson(
                    "{\"user_id\":\""
                        + principal
                        + "\",\"roles\":[],\"csi_ownership\":[{\"csi_id\":\"1234\",\"role\":\""
                        + role
                        + "\"}]}")));
  }

  private PublicationContracts.Receipt receipt() {
    return new PublicationContracts.Receipt(
        contracts.object().put("originalPrincipalId", "owner").put("csiId", "1234"));
  }

  @Test
  void historicalReceiptNeedsFreshReadButNoExecuteSessionOrAccountAuthority() {
    current("owner", "viewer");
    authorization.authorizeReceiptRead(owner, request, receipt());
    authorization.authorizeReceiptRead(owner, request, receipt());
    core.verify(2, getRequestedFor(urlEqualTo("/api/v1/users/me")));
    assertThatThrownBy(() -> authorization.fresh(owner, request, "owner", "1234", true))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("FORBIDDEN_SCOPE");
  }

  @Test
  void changedPrincipalCannotUseCachedOriginalOwner() {
    current("intruder", "owner");
    assertThatThrownBy(() -> authorization.authorizeReceiptRead(owner, request, receipt()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("FORBIDDEN_SCOPE");
    core.verify(1, getRequestedFor(urlEqualTo("/api/v1/users/me")));
  }

  @Test
  void revokedReadAndMissingCookieRefuseWithoutCookiePersistence() {
    current("owner", "none");
    assertThatThrownBy(() -> authorization.authorizeReceiptRead(owner, request, receipt()))
        .hasMessage("FORBIDDEN_SCOPE");
    MockHttpServletRequest missing = new MockHttpServletRequest();
    assertThatThrownBy(() -> authorization.authorizeReceiptRead(owner, missing, receipt()))
        .hasMessage("UNAUTHENTICATED");
    core.verify(1, getRequestedFor(urlEqualTo("/api/v1/users/me")));
    assertThat(receipt().document().toString()).doesNotContain(COOKIE);
  }

  @Test
  void expiredCookieAndUnavailableCoreNeverFallBackToCachedIdentity() {
    core.stubFor(get(urlEqualTo("/api/v1/users/me")).willReturn(aResponse().withStatus(401)));
    assertThatThrownBy(() -> authorization.authorizeReceiptRead(owner, request, receipt()))
        .hasMessage("UNAUTHENTICATED");
    core.resetAll();
    core.stubFor(get(urlEqualTo("/api/v1/users/me")).willReturn(aResponse().withStatus(503)));
    assertThatThrownBy(() -> authorization.authorizeReceiptRead(owner, request, receipt()))
        .hasMessage("AUTHORITY_UNAVAILABLE");
  }

  @Test
  void publishGrantIsBoundToOriginalCapturedDeadlineAndNeverExtendedByRenewal() {
    current("owner", "owner");
    var identity = contracts.object();
    identity
        .putObject("base")
        .put("sessionId", "s")
        .put("originalPrincipalId", "owner")
        .put("csiId", "1234");
    identity.put("validationDeadline", "2026-10-09T12:00:01.000Z");
    var snapshot = new PublicationContracts.Snapshot(identity, contracts.object());
    var session = contracts.object().put("expiresAt", "2026-10-09T12:05:00.000Z");
    session.putObject("owner").put("leaseExpiresAt", "2026-10-09T12:04:00.000Z");
    var grant = authorization.authorizePublication(owner, request, snapshot, session);
    assertThat(grant.expiresAt()).isEqualTo(Instant.parse("2026-10-09T12:00:01.000Z"));
    assertThat(grant.snapshotHash()).isEqualTo(snapshot.hash());
    identity.put("validationDeadline", "2026-10-09T11:59:59.000Z");
    assertThatThrownBy(
            () ->
                authorization.authorizePublication(
                    owner,
                    request,
                    new PublicationContracts.Snapshot(identity, contracts.object()),
                    session))
        .hasMessage("EXPIRED");
  }

  @Test
  void observedTimeUsesExactMillisecondsAndFloorsAuthorityDeadlines() {
    assertThat(PublicationContracts.time(Instant.parse("2026-10-09T12:00:00Z")))
        .isEqualTo("2026-10-09T12:00:00.000Z");
    assertThat(PublicationContracts.time(now)).isEqualTo("2026-10-09T12:00:00.123Z");
    assertThat(PublicationContracts.millisecond(now)).isBefore(now);
  }

  @Test
  void packagedObservedArtifactsResolveDefinitionsWithoutRecursingOrRelaxingClosure()
      throws Exception {
    for (String name : List.of("fresh-order-reference", "control-value-reference")) {
      var fixture =
          contracts.parse(
              java.nio.file.Files.readString(
                  java.nio.file.Path.of(
                      "../studio-runner/fixtures/observed-reference/" + name + ".json")));
      var artifact = fixture.path("artifact");
      contracts.validate("v3/replay-artifact", artifact);
      var mutated = (com.fasterxml.jackson.databind.node.ObjectNode) artifact.deepCopy();
      ((com.fasterxml.jackson.databind.node.ObjectNode)
              mutated.path("steps").get(0).path("operations").get(0))
          .put("source", "unsolicited-code");
      assertThatThrownBy(() -> contracts.validate("v3/replay-artifact", mutated))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("INVALID_CONTRACT");
    }
  }

  @Test
  void workerWithoutPublicationCollaboratorRefusesEveryPublicationOperation() {
    var worker = new ProvisionalDispatchAuthorization(null, null);
    var beans = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
    worker.initializePublicationAuthority(beans.getBeanProvider(PublicationGrantAuthority.class));
    for (org.assertj.core.api.ThrowableAssert.ThrowingCallable operation :
        List.<org.assertj.core.api.ThrowableAssert.ThrowingCallable>of(
            () -> worker.fresh(owner, request, "owner", "1234", true),
            () -> worker.authorizePublication(owner, request, null, null),
            () -> worker.authorizeReceiptRead(owner, request, receipt()))) {
      assertThatThrownBy(operation)
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              failure -> {
                assertThat(failure.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
                assertThat(failure.status()).isEqualTo(409);
              });
    }
    core.verify(0, getRequestedFor(urlEqualTo("/api/v1/users/me")));
  }
}
