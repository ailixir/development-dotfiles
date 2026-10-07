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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class HashicorpStudioVaultProviderTest {

  private static final UUID TEST_ID = UUID.fromString("3f2b9c7e-1a4d-4e8b-9c6f-5d2a7b1e0c33");
  private static final VaultScope SCOPE = VaultScope.of("60406", "Production", TEST_ID);
  private static final String DATA_PATH =
      "/v1/secret/data/studio/60406/Production/" + TEST_ID + "/secrets/LOGIN_PW";
  private static final String METADATA_PATH =
      "/v1/secret/metadata/studio/60406/Production/" + TEST_ID + "/secrets/LOGIN_PW";
  private static final String LIST_PATH =
      "/v1/secret/metadata/studio/60406/Production/" + TEST_ID + "/secrets";
  private static final String CANARY = "Wr1te-Canary-4c9e2a-never-in-a-uri";

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
        provider.read(StudioVaultProvider.ReferenceKind.SECRET, SCOPE, "LOGIN PW").orElseThrow();

    assertThat(new String(entry.value())).isEqualTo("canary-secret");
    assertThat(entry.versionIdentifier()).isEqualTo("7");
    assertThat(seen.get().getRequestURI().getRawPath())
        .isEqualTo("/v1/secret/data/studio/60406/Production/" + TEST_ID + "/secrets/LOGIN%20PW");
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
        .read(StudioVaultProvider.ReferenceKind.SECRET, SCOPE, "LOGIN_PW")
        .orElseThrow();
  }

  @Test
  void mapsOnlyNotFoundToAnAbsentReference() throws Exception {
    server = server(exchange -> respond(exchange, 404, "{}"));
    Path token = temp.resolve("token");
    Files.writeString(token, "vault-token");

    assertThat(
            provider(token, null)
                .read(
                    StudioVaultProvider.ReferenceKind.VARIABLE,
                    VaultScope.of("60406", "dev", TEST_ID),
                    "REGION"))
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
                    .read(StudioVaultProvider.ReferenceKind.SECRET, SCOPE, "LOGIN_PW"))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageNotContaining("denied");

    server.stop(0);
    server = server(exchange -> respond(exchange, 200, "{\"data\":{}}"));
    assertThatThrownBy(
            () ->
                provider(token, null)
                    .read(StudioVaultProvider.ReferenceKind.SECRET, SCOPE, "LOGIN_PW"))
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
                    .read(StudioVaultProvider.ReferenceKind.SECRET, SCOPE, "../another-secret"))
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
                    .read(StudioVaultProvider.ReferenceKind.SECRET, SCOPE, "LOGIN_PW"))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageContaining("deadline");
    assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
  }

  // ── Create-only write (D4, D12, R-7) ────────────────────────────────────────────────────────

  /** One request the stub server received, captured before the exchange closes. */
  private record Received(
      String method, String rawPath, String rawQuery, Map<String, String> headers, byte[] body) {}

  private static Received capture(HttpExchange exchange) throws IOException {
    return new Received(
        exchange.getRequestMethod(),
        exchange.getRequestURI().getRawPath(),
        exchange.getRequestURI().getRawQuery(),
        Map.of(
            "X-Vault-Token",
            String.valueOf(exchange.getRequestHeaders().getFirst("X-Vault-Token")),
            "Content-Type",
            String.valueOf(exchange.getRequestHeaders().getFirst("Content-Type"))),
        exchange.getRequestBody().readAllBytes());
  }

  @Test
  void createSendsOneCasZeroWriteToTheTestScopedPathAndReturnsTheVersion() throws Exception {
    List<Received> seen = new CopyOnWriteArrayList<>();
    server =
        server(
            exchange -> {
              seen.add(capture(exchange));
              respond(exchange, 200, "{\"data\":{\"version\":1,\"created_time\":\"x\"}}");
            });
    Path token = writeToken();

    String version =
        provider(token, null)
            .create(SCOPE, "LOGIN_PW", CANARY.toCharArray(), List.of("https://login.app.example"));

    assertThat(version).isEqualTo("1");
    assertThat(seen).hasSize(1);
    Received write = seen.get(0);
    assertThat(write.method()).isEqualTo("POST");
    assertThat(write.rawPath()).isEqualTo(DATA_PATH);
    assertThat(write.headers()).containsEntry("X-Vault-Token", "vault-token");
    assertThat(write.headers()).containsEntry("Content-Type", "application/json");
    var body = new ObjectMapper().readTree(write.body());
    assertThat(body.path("options").path("cas").asInt(-1)).isZero();
    assertThat(body.path("data").path("value").asText()).isEqualTo(CANARY);
    assertThat(body.path("data").path("allowedOrigins").asText())
        .isEqualTo("https://login.app.example");
    assertThat(write.rawPath() + "?" + write.rawQuery()).doesNotContain(CANARY);
  }

  @Test
  void aRefusedWriteWhoseMetadataExistsIsAlreadyExistsForBoth400And403() throws Exception {
    for (int refusal : List.of(400, 403)) {
      List<Received> seen = new CopyOnWriteArrayList<>();
      server =
          server(
              exchange -> {
                Received received = capture(exchange);
                seen.add(received);
                if ("POST".equals(received.method())) {
                  respond(exchange, refusal, "{\"errors\":[\"check-and-set mismatch\"]}");
                } else {
                  respond(exchange, 200, "{\"data\":{\"current_version\":1}}");
                }
              });
      Path token = writeToken();

      assertThatThrownBy(
              () ->
                  provider(token, null)
                      .create(
                          SCOPE, "LOGIN_PW", CANARY.toCharArray(), List.of("https://a.example")))
          .as("write refused with %s", refusal)
          .isInstanceOf(SecretAlreadyExistsException.class)
          .hasMessageContaining("LOGIN_PW")
          .hasMessageNotContaining(CANARY);
      assertThat(seen).extracting(Received::method).containsExactly("POST", "GET");
      assertThat(seen.get(1).rawPath()).isEqualTo(METADATA_PATH);
      server.stop(0);
    }
    server = null;
  }

  @Test
  void aRefusedWriteWithoutMetadataIsUnavailableNotAlreadyExists() throws Exception {
    for (int[] statuses : List.of(new int[] {400, 404}, new int[] {403, 403})) {
      server =
          server(
              exchange -> {
                Received received = capture(exchange);
                respond(
                    exchange, "POST".equals(received.method()) ? statuses[0] : statuses[1], "{}");
              });
      Path token = writeToken();

      assertThatThrownBy(
              () ->
                  provider(token, null)
                      .create(
                          SCOPE, "LOGIN_PW", CANARY.toCharArray(), List.of("https://a.example")))
          .as("write %s, metadata %s", statuses[0], statuses[1])
          .isInstanceOf(VaultProviderUnavailableException.class)
          .hasMessageNotContaining(CANARY);
      server.stop(0);
    }
    server = null;
  }

  @Test
  void aServerErrorOrATimeoutOnCreateIsUnavailable() throws Exception {
    Path token = writeToken();
    server = server(exchange -> respond(exchange, 503, "{\"errors\":[\"sealed\"]}"));
    assertThatThrownBy(
            () ->
                provider(token, null)
                    .create(SCOPE, "LOGIN_PW", CANARY.toCharArray(), List.of("https://a.example")))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageNotContaining("sealed");
    server.stop(0);

    server = server(exchange -> Thread.sleep(5_000));
    long started = System.nanoTime();
    assertThatThrownBy(
            () ->
                provider(token, null, Duration.ofMillis(100))
                    .create(SCOPE, "LOGIN_PW", CANARY.toCharArray(), List.of("https://a.example")))
        .isInstanceOf(VaultProviderUnavailableException.class);
    assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(2));
  }

  /**
   * NFR-2: the serialized body buffer holds the value while it is sent, and is all zero once {@code
   * create} returns — after a success and after a failure. The caller's array is the caller's to
   * erase and is left alone.
   */
  @Test
  void theSerializedBodyBufferIsZeroAfterSuccessAndAfterFailure() throws Exception {
    Path token = writeToken();
    for (int status : List.of(200, 500)) {
      server =
          server(
              exchange -> {
                capture(exchange);
                respond(exchange, status, "{\"data\":{\"version\":1}}");
              });
      HashicorpStudioVaultProvider provider = provider(token, null);
      List<byte[]> buffers = new ArrayList<>();
      provider.observeWriteBuffers(buffers::add);
      char[] value = CANARY.toCharArray();

      try {
        provider.create(SCOPE, "LOGIN_PW", value, List.of("https://a.example"));
      } catch (VaultProviderUnavailableException expected) {
        assertThat(status).isEqualTo(500);
      }

      assertThat(buffers).hasSize(1);
      byte[] zeros = new byte[buffers.get(0).length];
      assertThat(Arrays.equals(buffers.get(0), zeros))
          .as("buffer erased after %s", status)
          .isTrue();
      assertThat(new String(value)).as("the caller owns its array").isEqualTo(CANARY);
      server.stop(0);
    }
    server = null;
  }

  // ── Metadata list (D7) ──────────────────────────────────────────────────────────────────────

  @Test
  void listsNamesUnderTheTestPrefixSkippingFoldersAndInvalidKeysSorted() throws Exception {
    List<Received> seen = new CopyOnWriteArrayList<>();
    server =
        server(
            exchange -> {
              seen.add(capture(exchange));
              respond(
                  exchange,
                  200,
                  "{\"data\":{\"keys\":[\"ZETA\",\"folder/\",\"has space\",\"..\","
                      + "\"LOGIN_PW\",7,\"api.key-1\"]}}");
            });
    Path token = writeToken();

    List<String> names = provider(token, null).listSecretNames(SCOPE);

    assertThat(names).containsExactly("LOGIN_PW", "ZETA", "api.key-1");
    assertThat(seen).hasSize(1);
    assertThat(seen.get(0).method()).isEqualTo("GET");
    assertThat(seen.get(0).rawPath()).isEqualTo(LIST_PATH);
    assertThat(seen.get(0).rawQuery()).isEqualTo("list=true");
    assertThat(seen.get(0).headers()).containsEntry("X-Vault-Token", "vault-token");
  }

  @Test
  void anAbsentPrefixListsNothingAndARefusalIsUnavailable() throws Exception {
    Path token = writeToken();
    server = server(exchange -> respond(exchange, 404, "{\"errors\":[]}"));
    assertThat(provider(token, null).listSecretNames(SCOPE)).isEmpty();
    server.stop(0);

    server = server(exchange -> respond(exchange, 403, "{\"errors\":[\"denied\"]}"));
    assertThatThrownBy(() -> provider(token, null).listSecretNames(SCOPE))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageNotContaining("denied");
    server.stop(0);

    server = server(exchange -> respond(exchange, 200, "{\"data\":{}}"));
    assertThatThrownBy(() -> provider(token, null).listSecretNames(SCOPE))
        .isInstanceOf(VaultProviderUnavailableException.class);
  }

  @Test
  void anOversizedOrStalledListIsBounded() throws Exception {
    Path token = writeToken();
    String keys = "\"K\",".repeat(3_000);
    server =
        server(exchange -> respond(exchange, 200, "{\"data\":{\"keys\":[" + keys + "\"K\"]}}"));
    assertThatThrownBy(() -> provider(token, null).listSecretNames(SCOPE))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageContaining("oversized");
    server.stop(0);

    server =
        server(
            exchange -> {
              exchange.sendResponseHeaders(200, 100);
              Thread.sleep(5_000);
            });
    long started = System.nanoTime();
    assertThatThrownBy(() -> provider(token, null, Duration.ofMillis(100)).listSecretNames(SCOPE))
        .isInstanceOf(VaultProviderUnavailableException.class)
        .hasMessageContaining("deadline");
    assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
  }

  private Path writeToken() throws IOException {
    Path token = temp.resolve("token");
    Files.writeString(token, "vault-token");
    return token;
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
