package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class HashicorpStudioVaultProviderTest {

  @TempDir Path temp;
  private HttpServer server;

  @AfterEach
  void stopServer() {
    if (server != null) {
      server.stop(0);
    }
  }

  @Test
  void readsKvV2ValueVersionAndRequiredHeadersWithoutPuttingSecretsInTheUri() throws Exception {
    AtomicReference<HttpExchange> seen = new AtomicReference<>();
    server =
        server(
            exchange -> {
              seen.set(exchange);
              respond(
                  exchange,
                  200,
                  "{\"data\":{\"data\":{\"value\":\"canary-secret\"},"
                      + "\"metadata\":{\"version\":7}}}");
            });
    Path token = temp.resolve("token");
    Files.writeString(token, "vault-token\n");

    HashicorpStudioVaultProvider provider = provider(token, "team-a");
    StudioVaultProvider.VaultEntry entry =
        provider
            .read(StudioVaultProvider.ReferenceKind.SECRET, "60406", "Production", "LOGIN PW")
            .orElseThrow();

    assertThat(new String(entry.value())).isEqualTo("canary-secret");
    assertThat(entry.versionIdentifier()).isEqualTo("7");
    assertThat(seen.get().getRequestURI().getRawPath())
        .isEqualTo("/v1/secret/data/studio/60406/Production/secrets/LOGIN%20PW");
    assertThat(seen.get().getRequestHeaders().getFirst("X-Vault-Token")).isEqualTo("vault-token");
    assertThat(seen.get().getRequestHeaders().getFirst("X-Vault-Namespace")).isEqualTo("team-a");
    assertThat(seen.get().getRequestURI().toString())
        .doesNotContain("vault-token", "canary-secret");
  }

  @Test
  void readsTheSecretsAllowedOriginsNormalized() throws Exception {
    StudioVaultProvider.VaultEntry entry =
        readSecretWith(
            "\"allowedOrigins\":\"https://Login.App.Example:443 , http://127.0.0.1:8080\"");

    assertThat(entry.allowedOrigins())
        .containsExactly("https://login.app.example", "http://127.0.0.1:8080");
    assertThat(new String(entry.value())).isEqualTo("canary-secret");
  }

  @Test
  void aMalformedAllowedOriginsListBindsTheSecretToNoOrigin() throws Exception {
    StudioVaultProvider.VaultEntry entry =
        readSecretWith("\"allowedOrigins\":\"https://login.app.example,file:///etc/passwd\"");

    assertThat(entry.allowedOrigins()).isEmpty();
    // Still a readable entry: the refusal is the runner's, at fill, naming the secret.
    assertThat(new String(entry.value())).isEqualTo("canary-secret");
  }

  @Test
  void aMissingOrNonTextAllowedOriginsBindsTheSecretToNoOrigin() throws Exception {
    assertThat(readSecretWith(null).allowedOrigins()).isEmpty();
    server.stop(0);
    assertThat(
            readSecretWith("\"allowedOrigins\":[\"https://login.app.example\"]").allowedOrigins())
        .isEmpty();
  }

  private StudioVaultProvider.VaultEntry readSecretWith(String extraField) throws Exception {
    String data =
        "{\"value\":\"canary-secret\"" + (extraField == null ? "" : "," + extraField) + "}";
    server =
        server(
            exchange ->
                respond(
                    exchange,
                    200,
                    "{\"data\":{\"data\":" + data + ",\"metadata\":{\"version\":3}}}"));
    Path token = temp.resolve("token");
    Files.writeString(token, "vault-token");
    return provider(token, null)
        .read(StudioVaultProvider.ReferenceKind.SECRET, "60406", "Production", "LOGIN_PW")
        .orElseThrow();
  }

  @Test
  void mapsOnlyNotFoundToAnAbsentReference() throws Exception {
    server = server(exchange -> respond(exchange, 404, "{}"));
    Path token = temp.resolve("token");
    Files.writeString(token, "vault-token");

    assertThat(
            provider(token, null)
                .read(StudioVaultProvider.ReferenceKind.VARIABLE, "60406", "dev", "REGION"))
        .isEmpty();
  }

  @Test
  void treatsAuthorizationAndMalformedResponsesAsUnavailableNotMissing() throws Exception {
    Path token = temp.resolve("token");
    Files.writeString(token, "vault-token");
    server = server(exchange -> respond(exchange, 403, "{\"errors\":[\"denied\"]}"));
    assertThatThrownBy(
            () ->
                provider(token, null)
                    .read(
                        StudioVaultProvider.ReferenceKind.SECRET,
                        "60406",
                        "Production",
                        "LOGIN_PW"))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageNotContaining("denied");

    server.stop(0);
    server = server(exchange -> respond(exchange, 200, "{\"data\":{}}"));
    assertThatThrownBy(
            () ->
                provider(token, null)
                    .read(
                        StudioVaultProvider.ReferenceKind.SECRET,
                        "60406",
                        "Production",
                        "LOGIN_PW"))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageNotContaining("LOGIN_PW");
  }

  @Test
  void refusesAReferenceThatCouldAliasAnotherVaultPath() throws Exception {
    AtomicReference<HttpExchange> seen = new AtomicReference<>();
    server = server(seen::set);
    Path token = temp.resolve("token");
    Files.writeString(token, "vault-token");

    assertThatThrownBy(
            () ->
                provider(token, null)
                    .read(
                        StudioVaultProvider.ReferenceKind.SECRET,
                        "60406",
                        "Production",
                        "../another-secret"))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageContaining("path-safe");
    assertThat(seen).hasValue(null);
  }

  @Test
  void theDeadlineAlsoBoundsAResponseBodyThatStallsAfterHeaders() throws Exception {
    server =
        server(
            exchange -> {
              exchange.sendResponseHeaders(200, 100);
              Thread.sleep(5_000);
            });
    Path token = temp.resolve("token");
    Files.writeString(token, "vault-token");
    long started = System.nanoTime();

    assertThatThrownBy(
            () ->
                provider(token, null, Duration.ofMillis(100))
                    .read(
                        StudioVaultProvider.ReferenceKind.SECRET,
                        "60406",
                        "Production",
                        "LOGIN_PW"))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageContaining("deadline");
    assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
  }

  private HashicorpStudioVaultProvider provider(Path token, String namespace) {
    return provider(token, namespace, Duration.ofSeconds(2));
  }

  private HashicorpStudioVaultProvider provider(
      Path token, String namespace, Duration requestTimeout) {
    StudioSecretsProperties.Vault.Hashicorp properties =
        new StudioSecretsProperties.Vault.Hashicorp(
            "http://127.0.0.1:" + server.getAddress().getPort(),
            namespace,
            "secret",
            null,
            "value",
            token.toString(),
            Duration.ofSeconds(1),
            requestTimeout,
            4096);
    return new HashicorpStudioVaultProvider(properties, new ObjectMapper());
  }

  private static HttpServer server(ThrowingHandler handler) throws IOException {
    HttpServer http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    http.createContext(
        "/",
        exchange -> {
          try {
            handler.handle(exchange);
          } catch (Exception e) {
            exchange.close();
          }
        });
    http.start();
    return http;
  }

  private static void respond(HttpExchange exchange, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    exchange.sendResponseHeaders(status, bytes.length);
    exchange.getResponseBody().write(bytes);
    exchange.close();
  }

  @FunctionalInterface
  private interface ThrowingHandler {
    void handle(HttpExchange exchange) throws Exception;
  }
}
