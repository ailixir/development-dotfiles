package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.citi.put.checks.ChecksApplication;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionConfiguration;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationCoordinator;
import com.citi.put.checks.studio.support.RunnerTestTls;
import com.citi.put.checks.studio.support.RunnerTestTls.Identity;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsExchange;
import com.sun.net.httpserver.HttpsParameters;
import com.sun.net.httpserver.HttpsServer;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.apache.catalina.connector.Connector;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServer;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-009 AC-2 and AC-3, backend half: the four runner-facing clients and the API pod's
 * guided connector, against real TLS peers that require a client certificate (test CA from {@link
 * RunnerTestTls}, no mocks).
 *
 * <p>Every refusal is paired with an acceptance that differs in exactly one input, and every
 * refusal asserts that <em>nothing reached the application</em> (the double's handler never ran),
 * so a handshake that failed is told apart from a handler that said no.
 *
 * <ul>
 *   <li>Submission ({@code POST /v2/runs}), cancel ({@code DELETE /v2/runs/{id}}) and bridge
 *       traffic ({@code HttpRunnerDispatchClient}) succeed only with the CA-issued backend
 *       certificate and a runner that the CA issued.
 *   <li>No certificate, a certificate the CA did not issue, a server the CA did not issue, a
 *       certificate for another host, and plaintext in either direction are each refused.
 *   <li>The bearer is still required over TLS.
 *   <li>The translation coordinator's controller hop and the guided connector use the same
 *       identity.
 *   <li>In a real application context all four clients hold the one {@link StudioRunnerTls}
 *       context.
 * </ul>
 */
class RunnerTlsClientCertIT {

  private static final RunnerTestTls CA = RunnerTestTls.shared();
  private static final String TOKEN = "obs009-runner-bearer";
  private static final String BACKEND_SUBJECT = "CN=obs009-backend";

  private final List<AutoCloseable> closeables = new CopyOnWriteArrayList<>();

  @AfterEach
  void closeDoubles() throws Exception {
    for (AutoCloseable closeable : closeables) {
      closeable.close();
    }
  }

  // ---- submission and cancel (the dispatch client) ----

  @Test
  void submissionAndCancelSucceedOnlyWithTheBackendCertificateAndTheRunnerIssuer() {
    TlsPeer runner = start(Identity.RUNNER, true);
    HttpRunnerDispatchClient client = dispatchClient(CA.backendTls(), runner.url(), TOKEN);

    DispatchOutcome admitted = client.send(RunJobFixtures.conformingJob());
    RunnerDispatchClient.CancelOutcome cancelled = client.cancel(UUID.randomUUID());

    assertThat(admitted.kind()).isEqualTo(DispatchOutcome.Kind.ACCEPTED);
    assertThat(cancelled).isEqualTo(RunnerDispatchClient.CancelOutcome.ACKNOWLEDGED);
    assertThat(runner.calls()).hasValue(2);
    assertThat(runner.peers()).containsExactly(BACKEND_SUBJECT, BACKEND_SUBJECT);
    assertThat(runner.authorizations()).containsOnly("Bearer " + TOKEN);
    assertThat(runner.requests()).containsExactly("POST /v2/runs", "DELETE /v2/runs");
  }

  @Test
  void aClientWithNoCertificateIsRefusedByTheHandshakeAndNothingReachesTheRunner()
      throws Exception {
    TlsPeer runner = start(Identity.RUNNER, true);

    // Control: a client that trusts the CA but presents nothing is refused by the same double, so
    // the double really demands a certificate.
    assertThatThrownBy(() -> trustOnly().send(get(runner.url() + "/probe"), body()))
        .isInstanceOf(IOException.class);
    // The deny-all identity (no settings): no certificate and no trust anchor.
    HttpRunnerDispatchClient unconfigured =
        dispatchClient(StudioRunnerTls.unconfigured(), runner.url(), TOKEN);

    assertThat(unconfigured.send(RunJobFixtures.conformingJob()).kind())
        .isEqualTo(DispatchOutcome.Kind.AMBIGUOUS);
    assertThat(unconfigured.cancel(UUID.randomUUID()))
        .isEqualTo(RunnerDispatchClient.CancelOutcome.FAILED);
    assertThat(runner.calls()).hasValue(0);
  }

  @Test
  void aClientCertificateTheCaDidNotIssueIsRefusedAndNothingReachesTheRunner() {
    TlsPeer runner = start(Identity.RUNNER, true);
    StudioRunnerTls rogue =
        StudioRunnerTls.from(
            CA.settingsFor(Identity.ROGUE, CA.trustStore(), CA.trustStorePasswordFile()));

    DispatchOutcome refused =
        dispatchClient(rogue, runner.url(), TOKEN).send(RunJobFixtures.conformingJob());

    assertThat(refused.kind()).isEqualTo(DispatchOutcome.Kind.AMBIGUOUS);
    assertThat(runner.calls()).hasValue(0);
  }

  @Test
  void aServerTheCaDidNotIssueIsRefusedByTheClientAndNothingReachesIt() {
    TlsPeer stray =
        startWithTrust(
            Identity.ROGUE, CA.rogueTrustStore(), CA.rogueTrustStorePasswordFile(), false);

    DispatchOutcome refused =
        dispatchClient(CA.backendTls(), stray.url(), TOKEN).send(RunJobFixtures.conformingJob());

    assertThat(refused.kind()).isEqualTo(DispatchOutcome.Kind.AMBIGUOUS);
    assertThat(stray.calls()).hasValue(0);
  }

  @Test
  void plaintextIsRefusedInBothDirections() throws Exception {
    TlsPeer tlsRunner = start(Identity.RUNNER, true);
    // A TLS-configured client speaking http:// to a TLS listener: the listener never runs a
    // handler.
    String plainUrl = tlsRunner.url().replaceFirst("^https://", "http://");
    DispatchOutcome plainToTls =
        dispatchClient(CA.backendTls(), plainUrl, TOKEN).send(RunJobFixtures.conformingJob());
    assertThat(plainToTls.kind()).isEqualTo(DispatchOutcome.Kind.AMBIGUOUS);
    assertThat(tlsRunner.calls()).hasValue(0);

    // A TLS-configured client speaking https:// to a plaintext listener: no handler runs either.
    AtomicInteger plainCalls = new AtomicInteger();
    HttpServer plain = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
    plain.createContext(
        "/",
        exchange -> {
          plainCalls.incrementAndGet();
          exchange.sendResponseHeaders(202, -1);
          exchange.close();
        });
    plain.start();
    closeables.add(() -> plain.stop(0));
    String tlsToPlain = "https://localhost:" + plain.getAddress().getPort();
    DispatchOutcome refused =
        dispatchClient(CA.backendTls(), tlsToPlain, TOKEN).send(RunJobFixtures.conformingJob());
    assertThat(refused.kind()).isEqualTo(DispatchOutcome.Kind.AMBIGUOUS);
    assertThat(plainCalls).hasValue(0);
  }

  @Test
  void theBearerIsStillRequiredOverTls() {
    TlsPeer runner = start(Identity.RUNNER, true);

    DispatchOutcome wrong =
        dispatchClient(CA.backendTls(), runner.url(), "not-the-runner-bearer")
            .send(RunJobFixtures.conformingJob());
    DispatchOutcome missing =
        dispatchClient(CA.backendTls(), runner.url(), "").send(RunJobFixtures.conformingJob());

    // The runner answers 401 to a good certificate and a wrong bearer: a definite refusal.
    assertThat(wrong.kind()).isEqualTo(DispatchOutcome.Kind.DEFINITE_REFUSAL);
    assertThat(wrong.detail()).isEqualTo("runner 401");
    assertThat(runner.calls()).as("the wrong bearer did reach the runner over TLS").hasValue(1);
    // With no identity configured the client refuses before sending anything at all.
    assertThat(missing.kind()).isEqualTo(DispatchOutcome.Kind.DEFINITE_REFUSAL);
    assertThat(missing.detail())
        .isEqualTo(HttpRunnerDispatchClient.SERVICE_IDENTITY_NOT_CONFIGURED);
    assertThat(runner.calls()).hasValue(1);
  }

  // ---- host-name verification, every client ----

  @Test
  void aCertificateForAnotherHostIsRefusedByTheDispatchAndTheBridgeClients() {
    // Valid, CA-issued, serverAuth: only the SAN names another host.
    CA.issueVariant("variant-other-host", "serverAuth,clientAuth", null, 2, "dns:other.invalid");
    TlsPeer elsewhere =
        startVariant("variant-other-host", CA.trustStore(), CA.trustStorePasswordFile(), true);
    StudioRunnerTls backend = CA.backendTls();

    DispatchOutcome refused =
        dispatchClient(backend, elsewhere.url(), TOKEN).send(RunJobFixtures.conformingJob());
    GuidedSessionException bridge = contextPush(backend, elsewhere.url());

    assertThat(refused.kind()).isEqualTo(DispatchOutcome.Kind.AMBIGUOUS);
    assertThat(bridge.getMessage()).isEqualTo("UNKNOWN_OUTCOME");
    assertThat(HttpRunnerDispatchClient.definiteContextRefusal(bridge)).isFalse();
    assertThat(elsewhere.calls()).hasValue(0);
    // The one different input: the same flow against a certificate that names this host.
    TlsPeer runner = start(Identity.RUNNER, true);
    assertThat(
            dispatchClient(backend, runner.url(), TOKEN)
                .send(RunJobFixtures.conformingJob())
                .kind())
        .isEqualTo(DispatchOutcome.Kind.ACCEPTED);
    assertThat(HttpRunnerDispatchClient.definiteContextRefusal(contextPush(backend, runner.url())))
        .isTrue();
  }

  // ---- the guided bridge client ----

  @Test
  void bridgeTrafficGetsThroughOnlyWithTheBackendCertificate() {
    TlsPeer runner = start(Identity.RUNNER, true);

    GuidedSessionException withBackend = contextPush(CA.backendTls(), runner.url());
    // The runner's closed refusal reached the client: the application layer was reached over mTLS.
    assertThat(HttpRunnerDispatchClient.definiteContextRefusal(withBackend)).isTrue();
    assertThat(runner.calls()).hasValue(1);
    assertThat(runner.peers()).containsExactly(BACKEND_SUBJECT);
    assertThat(runner.requests())
        .containsExactly("POST /internal/v2/studio/guided-sessions/session-1/context");
    assertThat(runner.authorizations()).containsExactly("Bearer synthetic-controller-token");

    GuidedSessionException noCertificate =
        contextPush(StudioRunnerTls.unconfigured(), runner.url());
    StudioRunnerTls rogue =
        StudioRunnerTls.from(
            CA.settingsFor(Identity.ROGUE, CA.trustStore(), CA.trustStorePasswordFile()));
    GuidedSessionException rogueCertificate = contextPush(rogue, runner.url());

    for (GuidedSessionException refused : List.of(noCertificate, rogueCertificate)) {
      assertThat(refused.getMessage()).isEqualTo("UNKNOWN_OUTCOME");
      assertThat(HttpRunnerDispatchClient.definiteContextRefusal(refused)).isFalse();
    }
    assertThat(runner.calls()).as("neither refused call reached the runner").hasValue(1);
  }

  // ---- the translation coordinator's controller hop ----

  @Test
  void theCoordinatorsControllerHopPresentsTheBackendCertificateAndRefusesAStrayServer()
      throws Exception {
    TlsPeer controller = start(Identity.BACKEND, true);
    HttpClient client = GuidedTranslationCoordinator.controllerClient(CA.backendTls());

    HttpResponse<String> reply =
        client.send(post(controller.url() + "/internal/v2/studio/guided-sessions/s/plans"), body());

    // The controller hop is served with the backend's own certificate: serverAuth works, and the
    // host name (localhost) is covered by its SANs.
    assertThat(reply.statusCode()).isEqualTo(202);
    assertThat(controller.peers()).containsExactly(BACKEND_SUBJECT);
    assertThat(client.followRedirects()).isEqualTo(HttpClient.Redirect.NEVER);
    assertThat(client.sslParameters().getEndpointIdentificationAlgorithm()).isEqualTo("HTTPS");

    TlsPeer stray =
        startWithTrust(
            Identity.ROGUE, CA.rogueTrustStore(), CA.rogueTrustStorePasswordFile(), false);
    assertThatThrownBy(() -> client.send(post(stray.url() + "/x"), body()))
        .isInstanceOf(IOException.class);
    assertThat(stray.calls()).hasValue(0);
    // And a coordinator client with no identity cannot reach a controller that demands one.
    HttpClient anonymous =
        GuidedTranslationCoordinator.controllerClient(StudioRunnerTls.unconfigured());
    assertThatThrownBy(() -> anonymous.send(post(controller.url() + "/x"), body()))
        .isInstanceOf(IOException.class);
    assertThat(controller.calls()).hasValue(1);
  }

  // ---- the API pod's guided connector ----

  @Test
  void theGuidedConnectorDemandsAClientCertificateAndServesTheBackendCertificate()
      throws Exception {
    Connector connector =
        GuidedSessionConfiguration.GuidedTlsConnector.connector(0, CA.backendSettings());
    TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory(0);
    factory.addAdditionalTomcatConnectors(connector);
    WebServer server =
        factory.getWebServer(
            context ->
                context
                    .addServlet(
                        "peer",
                        new HttpServlet() {
                          @Override
                          protected void doGet(
                              HttpServletRequest request, HttpServletResponse response)
                              throws IOException {
                            Object attribute =
                                request.getAttribute("jakarta.servlet.request.X509Certificate");
                            response
                                .getWriter()
                                .write(
                                    attribute instanceof X509Certificate[] chain && chain.length > 0
                                        ? chain[0].getSubjectX500Principal().getName()
                                        : "none");
                          }
                        })
                    .addMapping("/peer"));
    server.start();
    closeables.add(server::stop);
    String url = "https://localhost:" + connector.getLocalPort() + "/peer";
    StudioRunnerTls backend = CA.backendTls();

    HttpResponse<String> served =
        backend.configure(HttpClient.newBuilder()).build().send(get(url), body());

    assertThat(served.statusCode()).isEqualTo(200);
    assertThat(served.body()).isEqualTo(BACKEND_SUBJECT);
    // The runner certificate (also CA-issued, clientAuth) is accepted too: trust is the CA.
    StudioRunnerTls runnerIdentity =
        StudioRunnerTls.from(
            CA.settingsFor(Identity.RUNNER, CA.trustStore(), CA.trustStorePasswordFile()));
    assertThat(
            runnerIdentity.configure(HttpClient.newBuilder()).build().send(get(url), body()).body())
        .isEqualTo("CN=localhost");
    java.util.concurrent.atomic.AtomicReference<HttpResponse<String>> plainBody =
        new java.util.concurrent.atomic.AtomicReference<>();
    // Refused during the handshake: no certificate, a certificate the CA did not issue, a client
    // that does not trust the connector's issuer, and plaintext.
    HttpClient.Builder anonymous = HttpClient.newBuilder().sslContext(trustOnlyContext());
    assertThatThrownBy(() -> anonymous.build().send(get(url), body()))
        .isInstanceOf(IOException.class);
    StudioRunnerTls rogue =
        StudioRunnerTls.from(
            CA.settingsFor(Identity.ROGUE, CA.trustStore(), CA.trustStorePasswordFile()));
    assertThatThrownBy(
            () -> rogue.configure(HttpClient.newBuilder()).build().send(get(url), body()))
        .isInstanceOf(IOException.class);
    StudioRunnerTls distrustful =
        StudioRunnerTls.from(
            CA.settingsFor(
                Identity.BACKEND, CA.rogueTrustStore(), CA.rogueTrustStorePasswordFile()));
    assertThatThrownBy(
            () -> distrustful.configure(HttpClient.newBuilder()).build().send(get(url), body()))
        .isInstanceOf(IOException.class);
    // Plaintext on the TLS port is never served: Tomcat either drops the connection or answers 400
    // ("requires TLS"); the peer-echo servlet is not reached either way.
    Throwable plaintextFailure =
        org.assertj.core.api.Assertions.catchThrowable(
            () ->
                plainBody.set(
                    HttpClient.newHttpClient()
                        .send(get(url.replaceFirst("^https://", "http://")), body())));
    if (plaintextFailure == null) {
      assertThat(plainBody.get().statusCode()).isEqualTo(400);
      assertThat(plainBody.get().body()).doesNotContain("CN=");
    } else {
      assertThat(plaintextFailure).isInstanceOf(IOException.class);
    }
  }

  @Test
  void aBackendCertificateWithoutServerAuthCannotServeTheConnector() {
    Path clientOnly = CA.issueVariant("variant-client-only", "clientAuth", null, 2);
    StudioRunnerTls tls =
        StudioRunnerTls.from(
            new StudioRunnerTls.Settings(
                clientOnly,
                clientOnly.resolveSibling("variant-client-only.p12.pass"),
                StudioRunnerTls.DEFAULT_STORE_TYPE,
                CA.trustStore(),
                CA.trustStorePasswordFile(),
                StudioRunnerTls.DEFAULT_STORE_TYPE));

    assertThatThrownBy(tls::requireServerIdentity)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("does not allow serverAuth");
    // The shipped backend identity has both usages and passes; the deny-all identity never does.
    assertThat(CA.backendTls().requireServerIdentity()).isNotNull();
    assertThatThrownBy(() -> StudioRunnerTls.unconfigured().requireServerIdentity())
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("not configured");
  }

  @Test
  void theDenyAllIdentityHoldsNoCertificateNoTrustAndNoSecret() {
    StudioRunnerTls none = StudioRunnerTls.unconfigured();

    assertThat(none.isConfigured()).isFalse();
    assertThat(none.clientCertificateSubject()).isNull();
    assertThat(none.toString()).isEqualTo("StudioRunnerTls[unconfigured]");
    assertThat(none.sslParameters().getEndpointIdentificationAlgorithm()).isEqualTo("HTTPS");
    assertThat(StudioRunnerTls.resolve(null, true, false).isConfigured()).isFalse();
    assertThat(StudioRunnerTls.resolve(null, false, false).isConfigured())
        .as("outside local/test with no hop there is nothing to secure")
        .isFalse();
    assertThatThrownBy(() -> StudioRunnerTls.resolve(null, false, true))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.runner.tls is not configured");
  }

  // ---- all four clients in a real application context ----

  @Nested
  @SpringBootTest(
      classes = ChecksApplication.class,
      webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
  @ActiveProfiles("test")
  @Testcontainers(disabledWithoutDocker = true)
  @org.springframework.test.annotation.DirtiesContext(
      classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
  class OneIdentityInARealContext {

    private static volatile TlsPeer runner;
    private static volatile Path tokenFile;

    @DynamicPropertySource
    static void tls(DynamicPropertyRegistry registry) throws Exception {
      TlsPeer started =
          new TlsPeer(Identity.RUNNER, CA.trustStore(), CA.trustStorePasswordFile(), true);
      runner = started;
      tokenFile = Files.createTempFile("obs009-controller-token", ".jwt");
      Files.writeString(tokenFile, "synthetic-controller-token");
      registry.add("studio.runner.base-url", started::url);
      registry.add("studio.runner.service-identity-token", () -> TOKEN);
      registry.add("studio.runner.tls.key-store", () -> CA.keyStore(Identity.BACKEND).toString());
      registry.add(
          "studio.runner.tls.key-store-password-file",
          () -> CA.keyStorePasswordFile(Identity.BACKEND).toString());
      registry.add("studio.runner.tls.trust-store", () -> CA.trustStore().toString());
      registry.add(
          "studio.runner.tls.trust-store-password-file",
          () -> CA.trustStorePasswordFile().toString());
      registry.add("studio.guided-authoring.runner-origin", started::url);
      registry.add("studio.guided-authoring.translation.controller-origin", started::url);
      registry.add("studio.guided-authoring.controller-token-file", () -> tokenFile.toString());
    }

    @Autowired StudioRunnerTls tls;
    @Autowired HttpRunnerDispatchClient dispatch;
    @Autowired HttpRunnerDispatchClient bridge;
    @Autowired HttpRunnerDispatchClient validation;
    @Autowired GuidedTranslationCoordinator coordinator;

    @Test
    void allFourRunnerFacingClientsHoldTheOneConfiguredContext() {
      assertThat(tls.isConfigured()).isTrue();
      assertThat(tls.clientCertificateSubject()).isEqualTo(BACKEND_SUBJECT);
      for (Object client :
          List.of(
              field(dispatch, "httpClient"),
              field(bridge, "guidedClient"),
              field(validation, "validationClient"),
              field(coordinator, "http"))) {
        assertThat(((HttpClient) client).sslContext()).isSameAs(tls.sslContext());
      }
      // The three clients built through configure(...) also carry the host-name check.
      for (Object client :
          List.of(
              field(dispatch, "httpClient"),
              field(validation, "validationClient"),
              field(coordinator, "http"))) {
        assertThat(((HttpClient) client).sslParameters().getEndpointIdentificationAlgorithm())
            .isEqualTo("HTTPS");
      }
    }

    @Test
    void theSpringManagedClientsReachTheRunnerOverMutualTls() {
      assertThat(dispatch.send(RunJobFixtures.conformingJob()).kind())
          .isEqualTo(DispatchOutcome.Kind.ACCEPTED);

      GuidedSessionException refusal =
          catchThrowableOfType(
              () ->
                  bridge.send(
                      "context",
                      new GuidedContracts()
                          .object()
                          .put("sessionId", "session-1")
                          .put("ownerFence", 1)),
              GuidedSessionException.class);

      assertThat(HttpRunnerDispatchClient.definiteContextRefusal(refusal)).isTrue();
      assertThat(runner.peers()).containsOnly(BACKEND_SUBJECT);
      assertThat(runner.requests()).contains("POST /v2/runs");
    }

    @AfterAll
    static void stopPeer() {
      if (runner != null) {
        runner.close();
      }
    }

    private Object field(Object target, String name) {
      Object unwrapped = AopTestUtils.getUltimateTargetObject(target);
      return ReflectionTestUtils.getField(unwrapped, name);
    }
  }

  // ---- the guided connector inside the real application ----

  @Nested
  @SpringBootTest(
      classes = ChecksApplication.class,
      webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
  @ActiveProfiles("test")
  @Testcontainers(disabledWithoutDocker = true)
  @org.springframework.test.annotation.DirtiesContext(
      classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
  class GuidedConnectorInARealContext {

    private static final String CLAIM = "/internal/v2/studio/guided-sessions/session-1/claim";
    private static final String ISSUER_NAME = "obs009-guided-issuer";
    private static final KeyPair ISSUER = rsa();
    private static volatile int connectorPort;

    @DynamicPropertySource
    static void connector(DynamicPropertyRegistry registry) throws Exception {
      try (ServerSocket free = new ServerSocket(0)) {
        connectorPort = free.getLocalPort();
      }
      registry.add("studio.runner.tls.key-store", () -> CA.keyStore(Identity.BACKEND).toString());
      registry.add(
          "studio.runner.tls.key-store-password-file",
          () -> CA.keyStorePasswordFile(Identity.BACKEND).toString());
      registry.add("studio.runner.tls.trust-store", () -> CA.trustStore().toString());
      registry.add(
          "studio.runner.tls.trust-store-password-file",
          () -> CA.trustStorePasswordFile().toString());
      registry.add("studio.guided-authoring.connector.port", () -> connectorPort);
      registry.add("studio.guided-authoring.mtls-required", () -> "true");
      registry.add(
          "studio.guided-authoring.service-public-key",
          () -> Base64.getEncoder().encodeToString(ISSUER.getPublic().getEncoded()));
      registry.add("studio.guided-authoring.service-issuer", () -> ISSUER_NAME);
    }

    @LocalServerPort int plainPort;
    @Autowired StudioRunnerTls tls;

    @Test
    void theConnectorBringsTheClientCertificateToTheGuidedChainAndNothingElseDoes()
        throws Exception {
      String viaConnector = "https://localhost:" + connectorPort + CLAIM;
      String viaPlainPort = "http://localhost:" + plainPort + CLAIM;
      HttpClient withCertificate = tls.configure(HttpClient.newBuilder()).build();

      // The certificate and a good controller JWT together: the chain authenticates the call and
      // the controller answers 422 to the bare body (anything but 401 proves the chain let it in).
      int accepted = claim(withCertificate, viaConnector, jwt(ISSUER.getPrivate(), ISSUER_NAME));
      assertThat(accepted)
          .as("authenticated: the chain passes it and the controller refuses the bare body")
          .isEqualTo(422);
      // The same certificate with no JWT, and with a JWT from another key: refused by the chain.
      assertThat(claim(withCertificate, viaConnector, null)).isEqualTo(401);
      assertThat(claim(withCertificate, viaConnector, jwt(rsa().getPrivate(), ISSUER_NAME)))
          .isEqualTo(401);
      assertThat(claim(withCertificate, viaConnector, jwt(ISSUER.getPrivate(), "someone-else")))
          .isEqualTo(401);
      // The same good JWT on the plain port: no client certificate can arrive there.
      assertThat(
              claim(
                  HttpClient.newHttpClient(), viaPlainPort, jwt(ISSUER.getPrivate(), ISSUER_NAME)))
          .isEqualTo(401);
      // No certificate on the connector: the handshake fails before any request.
      HttpClient anonymous = HttpClient.newBuilder().sslContext(trustOnlyContext()).build();
      assertThatThrownBy(
              () -> claim(anonymous, viaConnector, jwt(ISSUER.getPrivate(), ISSUER_NAME)))
          .isInstanceOf(IOException.class);
    }

    /**
     * Pre-F-merge ruling item 4(i)a: the connector port serves only the guided paths. A client
     * certificate from the private CA is the transport gate, not a licence for the rest of the
     * servlet application.
     */
    @Test
    void theConnectorServesOnlyTheGuidedPathsAndThePlainPortIsUnchanged() throws Exception {
      HttpClient withCertificate = tls.configure(HttpClient.newBuilder()).build();
      String connector = "https://localhost:" + connectorPort;
      String plain = "http://localhost:" + plainPort;

      // (1) With a valid certificate, a public route and the health endpoint are refused 404 with
      // an empty body and no challenge: the filter answers before Spring Security and before any
      // controller.
      for (String path : List.of("/actuator/health", "/api/v1/csi")) {
        HttpResponse<String> refused = withCertificate.send(get(connector + path), body());
        assertThat(refused.statusCode()).as("connector " + path).isEqualTo(404);
        assertThat(refused.body()).as("connector " + path).isEmpty();
        assertThat(refused.headers().firstValue("WWW-Authenticate")).isEmpty();
      }
      // (2) A guided prefix that walks out of the guided tree is refused too; the container's own
      // 400 for an encoded separator is as good, but never a 200.
      for (String walk :
          List.of(
              "/internal/v2/studio/guided-sessions/x/..%2F..%2Fapi/v1/csi",
              "/internal/v2/studio/guided-sessions/x/%2e%2e/%2e%2e/api/v1/csi",
              "/internal/v2/studio/guided-sessions/x/..%5C..%5Capi/v1/csi")) {
        assertThat(withCertificate.send(get(connector + walk), body()).statusCode())
            .as("connector " + walk)
            .isIn(400, 404);
      }
      // (3) A guided path is still served on the connector: the chain, not the filter, answers
      // (the filter's own refusal is an empty 404 with no body at all).
      HttpResponse<String> guided =
          withCertificate.send(
              get(connector + "/internal/v2/studio/guided-sessions/session-1/claim"), body());
      assertThat(guided.statusCode()).as("guided path on the connector").isEqualTo(401);
      // (4) The plain port behaves as before: the health endpoint answers, and a public route is
      // reached (anything but the filter's 404).
      assertThat(statusOf(HttpClient.newHttpClient(), plain + "/actuator/health")).isEqualTo(200);
      assertThat(statusOf(HttpClient.newHttpClient(), plain + "/api/v1/csi")).isNotEqualTo(404);
    }

    private int statusOf(HttpClient client, String url) throws Exception {
      return client.send(get(url), body()).statusCode();
    }

    private int claim(HttpClient client, String url, String jwt) throws Exception {
      HttpRequest.Builder request =
          HttpRequest.newBuilder(URI.create(url))
              .timeout(Duration.ofSeconds(10))
              .header("Content-Type", "application/json")
              .header("Idempotency-Key", "obs009-claim")
              .POST(HttpRequest.BodyPublishers.ofString("{\"schemaVersion\":3}"));
      if (jwt != null) {
        request.header("Authorization", "Bearer " + jwt);
      }
      return client.send(request.build(), body()).statusCode();
    }

    private static KeyPair rsa() {
      try {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
      } catch (java.security.GeneralSecurityException failure) {
        throw new IllegalStateException(failure);
      }
    }

    /** An RS256 controller-bound worker JWT, shaped as {@code GuidedInternalSecurity} demands. */
    private static String jwt(java.security.PrivateKey key, String issuer) throws Exception {
      long now = java.time.Instant.now().getEpochSecond();
      ObjectMapper mapper = new ObjectMapper();
      String header = "{\"alg\":\"RS256\",\"typ\":\"JWT\"}";
      String claims =
          mapper
              .createObjectNode()
              .put("iss", issuer)
              .put("sub", "worker-1")
              .put("role", "owning-worker")
              .put("aud", "studio-guided-controller")
              .put("iat", now)
              .put("exp", now + 60)
              .toString();
      String signed =
          base64Url(header.getBytes(StandardCharsets.UTF_8))
              + "."
              + base64Url(claims.getBytes(StandardCharsets.UTF_8));
      java.security.Signature signature = java.security.Signature.getInstance("SHA256withRSA");
      signature.initSign(key);
      signature.update(signed.getBytes(StandardCharsets.US_ASCII));
      return signed + "." + base64Url(signature.sign());
    }

    private static String base64Url(byte[] bytes) {
      return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
  }

  // ---- doubles and helpers ----

  private TlsPeer start(Identity identity, boolean needClientAuth) {
    return startWithTrust(identity, CA.trustStore(), CA.trustStorePasswordFile(), needClientAuth);
  }

  private TlsPeer startWithTrust(
      Identity identity, Path trust, Path trustPasswordFile, boolean needClientAuth) {
    TlsPeer server = new TlsPeer(identity, trust, trustPasswordFile, needClientAuth);
    closeables.add(server);
    return server;
  }

  private TlsPeer startVariant(
      String stem, Path trust, Path trustPasswordFile, boolean needClientAuth) {
    TlsPeer server = new TlsPeer(stem, trust, trustPasswordFile, needClientAuth);
    closeables.add(server);
    return server;
  }

  /** The dispatch client as a deployed context builds it, against {@code url}. */
  private static HttpRunnerDispatchClient dispatchClient(
      StudioRunnerTls tls, String url, String token) {
    return new HttpRunnerDispatchClient(
        new ObjectMapper(),
        new StudioExecutionProperties(
            true, null, null, null, Duration.ofSeconds(5), null, null, null, null, null, null),
        new StudioRunnerProperties(url, token, Duration.ofSeconds(5)),
        tls);
  }

  /** One {@code context} push; the double answers a closed refusal the client classifies. */
  private static GuidedSessionException contextPush(StudioRunnerTls tls, String url) {
    HttpRunnerDispatchClient bridge =
        new HttpRunnerDispatchClient(
            URI.create(url),
            tls.sslContext(),
            () -> "synthetic-controller-token",
            new GuidedContracts());
    GuidedSessionException failure =
        catchThrowableOfType(
            () ->
                bridge.send(
                    "context",
                    new GuidedContracts()
                        .object()
                        .put("sessionId", "session-1")
                        .put("ownerFence", 1)),
            GuidedSessionException.class);
    assertThat(failure).as("the double never accepts a context push").isNotNull();
    return failure;
  }

  private static HttpRequest get(String url) {
    return HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(5)).GET().build();
  }

  private static HttpRequest post(String url) {
    return HttpRequest.newBuilder(URI.create(url))
        .timeout(Duration.ofSeconds(5))
        .POST(HttpRequest.BodyPublishers.ofString("{}"))
        .build();
  }

  private static HttpResponse.BodyHandler<String> body() {
    return HttpResponse.BodyHandlers.ofString();
  }

  /** A client that trusts the test CA and presents no certificate. */
  private static HttpClient trustOnly() throws Exception {
    return HttpClient.newBuilder().sslContext(trustOnlyContext()).build();
  }

  private static SSLContext trustOnlyContext() throws Exception {
    KeyStore trust = KeyStore.getInstance("PKCS12");
    char[] password = Files.readString(CA.trustStorePasswordFile()).strip().toCharArray();
    try (var input = Files.newInputStream(CA.trustStore())) {
      trust.load(input, password);
    }
    TrustManagerFactory factory =
        TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
    factory.init(trust);
    SSLContext context = SSLContext.getInstance("TLS");
    context.init(null, factory.getTrustManagers(), new SecureRandom());
    return context;
  }

  /**
   * A TLS peer that looks like the runner: it presents {@code identity}, optionally demands a
   * client certificate, and records every request that reaches its handler (a refused handshake
   * records nothing). {@code POST /v2/runs} and {@code DELETE /v2/runs/...} answer 202 for the
   * right bearer and 401 otherwise; a bridge {@code context} push answers 409 with the closed
   * {@code IDENTITY_MISMATCH} refusal; everything else answers 202.
   */
  static final class TlsPeer implements AutoCloseable, HttpHandler {
    private final HttpsServer server;
    private final AtomicInteger calls = new AtomicInteger();
    private final List<String> peers = new CopyOnWriteArrayList<>();
    private final List<String> authorizations = new CopyOnWriteArrayList<>();
    private final List<String> requests = new CopyOnWriteArrayList<>();

    TlsPeer(Identity identity, Path trust, Path trustPasswordFile, boolean needClientAuth) {
      this(CA.serverContext(identity, trust, trustPasswordFile), needClientAuth);
    }

    TlsPeer(String stem, Path trust, Path trustPasswordFile, boolean needClientAuth) {
      this(CA.serverContext(stem, trust, trustPasswordFile), needClientAuth);
    }

    private TlsPeer(SSLContext context, boolean needClientAuth) {
      try {
        server = HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
        server.setHttpsConfigurator(
            new HttpsConfigurator(context) {
              @Override
              public void configure(HttpsParameters parameters) {
                var configured = getSSLContext().getDefaultSSLParameters();
                configured.setNeedClientAuth(needClientAuth);
                parameters.setSSLParameters(configured);
              }
            });
        server.createContext("/", this);
        server.start();
      } catch (IOException failure) {
        throw new IllegalStateException("cannot start the TLS double");
      }
    }

    String url() {
      return "https://localhost:" + server.getAddress().getPort();
    }

    AtomicInteger calls() {
      return calls;
    }

    List<String> peers() {
      return peers;
    }

    List<String> authorizations() {
      return authorizations;
    }

    List<String> requests() {
      return requests;
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
      calls.incrementAndGet();
      try {
        if (exchange instanceof HttpsExchange secure) {
          var session = secure.getSSLSession();
          try {
            peers.add(
                ((X509Certificate) session.getPeerCertificates()[0])
                    .getSubjectX500Principal()
                    .getName());
          } catch (javax.net.ssl.SSLPeerUnverifiedException noCertificate) {
            peers.add("none");
          }
        }
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        authorizations.add(String.valueOf(authorization));
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        exchange.getRequestBody().readAllBytes();
        requests.add(method + " " + (path.startsWith("/v2/runs/") ? "/v2/runs" : path));
        if (path.endsWith("/context")) {
          byte[] refusal = "{\"code\":\"IDENTITY_MISMATCH\"}".getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(409, refusal.length);
          exchange.getResponseBody().write(refusal);
        } else if (path.startsWith("/v2/runs") && !("Bearer " + TOKEN).equals(authorization)) {
          exchange.sendResponseHeaders(401, -1);
        } else {
          exchange.sendResponseHeaders(202, -1);
        }
      } finally {
        exchange.close();
      }
    }

    @Override
    public void close() {
      server.stop(0);
    }
  }
}
