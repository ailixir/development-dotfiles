package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.support.RunnerTestTls;
import com.citi.put.checks.studio.support.RunnerTestTls.Identity;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsExchange;
import com.sun.net.httpserver.HttpsParameters;
import com.sun.net.httpserver.HttpsServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.time.Duration;
import javax.net.ssl.SSLContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The runner-hop TLS API (STUDIO-OBS-009 AC-3, ruling A4), proven over real handshakes against the
 * shared test CA ({@link RunnerTestTls}), not against mocks. The three runner clients are wired to
 * this class in a later lane; this test only proves the API they will take.
 */
class StudioRunnerTlsTest {

  private static RunnerTestTls ca;

  @TempDir Path temp;

  private HttpsServer server;

  @BeforeAll
  static void generateCa() {
    ca = RunnerTestTls.shared();
  }

  @AfterEach
  void stopServer() {
    if (server != null) {
      server.stop(0);
      server = null;
    }
  }

  // ---- handshakes ----

  @Test
  void mutualTlsSucceedsAndTheServerSeesTheBackendCertificate() throws Exception {
    int port = startServer(Identity.RUNNER, ca.trustStore(), ca.trustStorePasswordFile(), true);

    HttpResponse<String> response = get(ca.backendTls(), port);

    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.body()).isEqualTo("CN=obs009-backend");
  }

  @Test
  void theServerRefusesAClientCertificateThatTheCaDidNotIssue() throws Exception {
    int port = startServer(Identity.RUNNER, ca.trustStore(), ca.trustStorePasswordFile(), true);
    StudioRunnerTls rogueClient =
        StudioRunnerTls.from(
            ca.settingsFor(Identity.ROGUE, ca.trustStore(), ca.trustStorePasswordFile()));

    assertThatThrownBy(() -> get(rogueClient, port)).isInstanceOf(IOException.class);
  }

  @Test
  void theClientRefusesAServerThatTheCaDidNotIssue() throws Exception {
    // The rogue server certificate has serverAuth and the right SANs: only its issuer is wrong.
    int port =
        startServer(Identity.ROGUE, ca.rogueTrustStore(), ca.rogueTrustStorePasswordFile(), false);

    assertThatThrownBy(() -> get(ca.backendTls(), port)).isInstanceOf(IOException.class);
  }

  @Test
  void trustComesOnlyFromTheConfiguredTrustStoreNeverFromJvmDefaults() throws Exception {
    // A client whose explicit trust store holds only the rogue certificate must refuse a server
    // that the test CA issued, whatever the JVM's own roots say.
    int port = startServer(Identity.RUNNER, ca.trustStore(), ca.trustStorePasswordFile(), true);
    StudioRunnerTls distrustful =
        StudioRunnerTls.from(
            ca.settingsFor(
                Identity.BACKEND, ca.rogueTrustStore(), ca.rogueTrustStorePasswordFile()));

    assertThatThrownBy(() -> get(distrustful, port)).isInstanceOf(IOException.class);
  }

  // ---- the shape clients rely on ----

  @Test
  void parametersOfferOnlyModernTlsAndCheckTheHostName() {
    StudioRunnerTls tls = ca.backendTls();

    assertThat(tls.sslParameters().getProtocols()).containsExactly("TLSv1.3", "TLSv1.2");
    assertThat(tls.sslParameters().getEndpointIdentificationAlgorithm()).isEqualTo("HTTPS");
    assertThat(tls.sslContext().getProtocol()).isEqualTo("TLS");
  }

  @Test
  void parametersAreACopyThatCallersCannotUseToWeakenTheInstance() {
    StudioRunnerTls tls = ca.backendTls();
    var mutated = tls.sslParameters();
    mutated.setEndpointIdentificationAlgorithm(null);
    mutated.setProtocols(new String[] {"TLSv1"});

    assertThat(tls.sslParameters().getEndpointIdentificationAlgorithm()).isEqualTo("HTTPS");
    assertThat(tls.sslParameters().getProtocols()).containsExactly("TLSv1.3", "TLSv1.2");
  }

  @Test
  void configureGivesAClientBuilderTheContextAndTheHostNameCheck() {
    StudioRunnerTls tls = ca.backendTls();

    HttpClient client = tls.configure(HttpClient.newBuilder()).build();

    assertThat(client.sslContext()).isSameAs(tls.sslContext());
    assertThat(client.sslParameters().getEndpointIdentificationAlgorithm()).isEqualTo("HTTPS");
  }

  @Test
  void toStringAndAccessorsExposeNoSecret() throws Exception {
    StudioRunnerTls tls = ca.backendTls();
    String password =
        Files.readString(ca.keyStorePasswordFile(Identity.BACKEND), StandardCharsets.US_ASCII)
            .strip();

    assertThat(tls.toString()).doesNotContain(password).contains("obs009-backend");
    assertThat(tls.clientCertificateSubject()).isEqualTo("CN=obs009-backend");
  }

  // ---- fail closed ----

  @Test
  void nothingConfiguredFailsInsteadOfFallingBackToJvmDefaults() {
    assertThatThrownBy(() -> StudioRunnerTls.from(null))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.runner.tls is not configured");
    assertThatThrownBy(
            () ->
                StudioRunnerTls.from(
                    new StudioRunnerTls.Settings(null, null, null, null, null, null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.runner.tls.key-store-password-file is not configured");
    assertThatThrownBy(
            () ->
                StudioRunnerTls.from(
                    new StudioRunnerTls.Settings(
                        ca.keyStore(Identity.BACKEND),
                        ca.keyStorePasswordFile(Identity.BACKEND),
                        null,
                        null,
                        ca.trustStorePasswordFile(),
                        null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.runner.tls.trust-store is not configured");
  }

  @Test
  void aMissingOrEmptyPasswordFileIsRefusedByName() throws Exception {
    Path empty = Files.writeString(temp.resolve("empty.pass"), "\n");

    assertThatThrownBy(
            () ->
                StudioRunnerTls.from(
                    new StudioRunnerTls.Settings(
                        ca.keyStore(Identity.BACKEND),
                        temp.resolve("absent.pass"),
                        null,
                        ca.trustStore(),
                        ca.trustStorePasswordFile(),
                        null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.runner.tls.key-store-password-file cannot be read");
    assertThatThrownBy(
            () ->
                StudioRunnerTls.from(
                    new StudioRunnerTls.Settings(
                        ca.keyStore(Identity.BACKEND),
                        empty,
                        null,
                        ca.trustStore(),
                        ca.trustStorePasswordFile(),
                        null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.runner.tls.key-store-password-file is empty");
  }

  @Test
  void aWrongPasswordIsRefusedWithoutEchoingIt() throws Exception {
    String wrong = "not-the-password-" + System.nanoTime();
    Path wrongFile = Files.writeString(temp.resolve("wrong.pass"), wrong + "\n");

    assertThatThrownBy(
            () ->
                StudioRunnerTls.from(
                    new StudioRunnerTls.Settings(
                        ca.keyStore(Identity.BACKEND),
                        wrongFile,
                        null,
                        ca.trustStore(),
                        ca.trustStorePasswordFile(),
                        null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.runner.tls.key-store cannot be loaded as PKCS12")
        .hasMessageContaining("password rejected")
        .satisfies(failure -> assertThat(failure.toString()).doesNotContain(wrong));
  }

  @Test
  void aMissingStoreFileIsRefusedByName() {
    assertThatThrownBy(
            () ->
                StudioRunnerTls.from(
                    new StudioRunnerTls.Settings(
                        temp.resolve("absent.p12"),
                        ca.keyStorePasswordFile(Identity.BACKEND),
                        null,
                        ca.trustStore(),
                        ca.trustStorePasswordFile(),
                        null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.runner.tls.key-store cannot be loaded")
        .hasMessageContaining("file not found");
  }

  @Test
  void aKeyStoreWithoutAPrivateKeyIsRefused() {
    // The trust store has certificate entries only: it cannot authenticate the backend.
    assertThatThrownBy(
            () ->
                StudioRunnerTls.from(
                    new StudioRunnerTls.Settings(
                        ca.trustStore(),
                        ca.trustStorePasswordFile(),
                        null,
                        ca.trustStore(),
                        ca.trustStorePasswordFile(),
                        null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("holds no private-key entry");
  }

  @Test
  void aTrustStoreThatHoldsAPrivateKeyIsRefused() {
    assertThatThrownBy(
            () ->
                StudioRunnerTls.from(
                    new StudioRunnerTls.Settings(
                        ca.keyStore(Identity.BACKEND),
                        ca.keyStorePasswordFile(Identity.BACKEND),
                        null,
                        ca.keyStore(Identity.BACKEND),
                        ca.keyStorePasswordFile(Identity.BACKEND),
                        null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("certificates only");
  }

  @Test
  void anEmptyTrustStoreIsRefused() throws Exception {
    KeyStore empty = KeyStore.getInstance("PKCS12");
    empty.load(null, null);
    Path store = temp.resolve("empty-trust.p12");
    Path pass = Files.writeString(temp.resolve("empty-trust.pass"), "changeit-test\n");
    try (var out = Files.newOutputStream(store)) {
      empty.store(out, "changeit-test".toCharArray());
    }

    assertThatThrownBy(
            () ->
                StudioRunnerTls.from(
                    new StudioRunnerTls.Settings(
                        ca.keyStore(Identity.BACKEND),
                        ca.keyStorePasswordFile(Identity.BACKEND),
                        null,
                        store,
                        pass,
                        null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("holds no trusted certificate");
  }

  @Test
  void aKeyStoreWithTwoPrivateKeysIsRefused() throws Exception {
    KeyStore backend = ca.loadKeyStore(Identity.BACKEND);
    KeyStore runner = ca.loadKeyStore(Identity.RUNNER);
    char[] backendPassword = ca.keyStorePassword(Identity.BACKEND);
    char[] runnerPassword = ca.keyStorePassword(Identity.RUNNER);
    KeyStore both = KeyStore.getInstance("PKCS12");
    both.load(null, null);
    both.setKeyEntry(
        "backend",
        backend.getKey("backend", backendPassword),
        backendPassword,
        backend.getCertificateChain("backend"));
    both.setKeyEntry(
        "runner",
        runner.getKey("runner", runnerPassword),
        backendPassword,
        runner.getCertificateChain("runner"));
    KeyStore trust = ca.loadKeyStore(Identity.BACKEND);
    KeyStore trustOnly = KeyStore.getInstance("PKCS12");
    trustOnly.load(null, null);
    trustOnly.setCertificateEntry("ca", trust.getCertificateChain("backend")[1]);

    assertThatThrownBy(() -> StudioRunnerTls.fromStores(both, backendPassword, trustOnly))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("exactly one private-key entry");
  }

  @Test
  void aClientCertificateThatDoesNotAllowClientAuthIsRefused() {
    Path serverOnly = ca.issueVariant("variant-server-only", "serverAuth", null, 2);

    assertThatThrownBy(
            () -> StudioRunnerTls.from(settingsWithKeyStore("variant-server-only", serverOnly)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("does not allow clientAuth");
  }

  @Test
  void anExpiredClientCertificateIsRefused() {
    Path expired = ca.issueVariant("variant-expired", "clientAuth", "-3d", 1);

    assertThatThrownBy(() -> StudioRunnerTls.from(settingsWithKeyStore("variant-expired", expired)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("not within its validity period");
  }

  // ---- no JVM defaults ----

  @Test
  void theApiSourceNeverReachesForJvmTlsDefaults() throws Exception {
    Path source = Path.of("src/main/java/com/citi/put/checks/studio/dispatch/StudioRunnerTls.java");
    String text = Files.readString(source);

    assertThat(text).doesNotContain("SSLContext.getDefault");
    assertThat(text).doesNotContain("System.getProperty(\"javax.net.ssl");
    assertThat(text).doesNotContain("SSLContext.setDefault");
    assertThat(text).doesNotContain("HttpsURLConnection");
  }

  // ---- helpers ----

  private StudioRunnerTls.Settings settingsWithKeyStore(String stem, Path keyStore) {
    return new StudioRunnerTls.Settings(
        keyStore,
        keyStore.resolveSibling(stem + ".p12.pass"),
        null,
        ca.trustStore(),
        ca.trustStorePasswordFile(),
        null);
  }

  private HttpResponse<String> get(StudioRunnerTls tls, int port) throws Exception {
    HttpClient client =
        tls.configure(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))).build();
    HttpRequest request =
        HttpRequest.newBuilder(URI.create("https://localhost:" + port + "/who"))
            .timeout(Duration.ofSeconds(10))
            .GET()
            .build();
    return client.send(request, HttpResponse.BodyHandlers.ofString());
  }

  /** Starts an HTTPS server on loopback with {@code identity} as its certificate. */
  private int startServer(Identity identity, Path trust, Path trustPassword, boolean requireClient)
      throws Exception {
    SSLContext context = ca.serverContext(identity, trust, trustPassword);

    server = HttpsServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
    server.setHttpsConfigurator(
        new HttpsConfigurator(context) {
          @Override
          public void configure(HttpsParameters parameters) {
            var params = context.getDefaultSSLParameters();
            params.setNeedClientAuth(requireClient);
            parameters.setSSLParameters(params);
          }
        });
    server.createContext(
        "/who",
        exchange -> {
          String subject =
              requireClient
                  ? ((HttpsExchange) exchange).getSSLSession().getPeerPrincipal().getName()
                  : "anonymous";
          byte[] body = subject.getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(200, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    server.start();
    return server.getAddress().getPort();
  }
}
