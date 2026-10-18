package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VaultStreamingReadTest {
  @TempDir Path temporary;

  @Test
  void productionReadUsesParserCharBufferAndNeverBuildsASecretTree() throws Exception {
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    String canary = "STREAM-CANARY-\"\\-\uD83D\uDD11";
    var mapper = spy(new ObjectMapper());
    byte[] response =
        new ObjectMapper()
            .writeValueAsBytes(
                java.util.Map.of(
                    "data",
                    java.util.Map.of(
                        "data",
                        java.util.Map.of(
                            "value", canary, "allowedOrigins", "https://fixture.example"),
                        "metadata",
                        java.util.Map.of("version", 7))));
    server.createContext(
        "/",
        exchange -> {
          exchange.sendResponseHeaders(200, response.length);
          exchange.getResponseBody().write(response);
          exchange.close();
        });
    server.start();
    try {
      Path token = temporary.resolve("token");
      Files.writeString(token, "test-only-token");
      var properties =
          new StudioSecretsProperties.Vault.Hashicorp(
              "http://127.0.0.1:" + server.getAddress().getPort(),
              null,
              "secret",
              null,
              "value",
              token.toString(),
              Duration.ofSeconds(1),
              Duration.ofSeconds(1),
              4096);
      var provider = new HashicorpStudioVaultProvider(properties, mapper);
      var entry =
          provider
              .read(
                  StudioVaultProvider.ReferenceKind.SECRET,
                  VaultScope.of("CSI", "fixture", UUID.randomUUID()),
                  "PASS")
              .orElseThrow();
      assertThat(entry.value()).isEqualTo(canary.toCharArray());
      assertThat(entry.versionIdentifier()).isEqualTo("7");
      assertThat(entry.allowedOrigins()).containsExactly("https://fixture.example");
      verify(mapper, never()).readTree(any(byte[].class));
      verify(mapper, never()).readTree(any(String.class));
      java.util.Arrays.fill(entry.value(), '\0');
    } finally {
      server.stop(0);
      java.util.Arrays.fill(response, (byte) 0);
    }
  }

  @Test
  void actualOversizedSuccessfulVaultBodyErasesOwnedLimitPlusOneBeforeAnyParserOrValueRelease()
      throws Exception {
    var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    byte[] prefix =
        ("{\"data\":{\"data\":{\"value\":\"OVERSIZE-CANARY-" + UUID.randomUUID() + "\"")
            .getBytes(java.nio.charset.StandardCharsets.UTF_8);
    byte[] response =
        (new String(prefix, java.nio.charset.StandardCharsets.UTF_8)
                + ",\"allowedOrigins\":\"https://fixture.example\",\"padding\":\""
                + "x".repeat(2048)
                + "\"},\"metadata\":{\"version\":1}}}")
            .getBytes(java.nio.charset.StandardCharsets.UTF_8);
    var calls = new java.util.concurrent.atomic.AtomicInteger();
    server.createContext(
        "/",
        exchange -> {
          calls.incrementAndGet();
          exchange.sendResponseHeaders(200, response.length);
          exchange.getResponseBody().write(response);
          exchange.close();
        });
    server.start();
    try {
      Path token = temporary.resolve("oversize-token");
      Files.writeString(token, "test-only-token");
      var factory = spy(new com.fasterxml.jackson.core.JsonFactory());
      var mapper = new ObjectMapper(factory);
      var properties =
          new StudioSecretsProperties.Vault.Hashicorp(
              "http://127.0.0.1:" + server.getAddress().getPort(),
              null,
              "secret",
              null,
              "value",
              token.toString(),
              Duration.ofSeconds(1),
              Duration.ofSeconds(1),
              256);
      var provider = new HashicorpStudioVaultProvider(properties, mapper);
      var owned = new java.util.concurrent.atomic.AtomicReference<byte[]>();
      var matched = new java.util.concurrent.atomic.AtomicBoolean();
      provider.observeResponseBytes(
          bytes -> {
            owned.set(bytes);
            matched.set(
                java.util.Arrays.mismatch(bytes, 0, prefix.length, prefix, 0, prefix.length) == -1);
          });
      var resolver =
          new VaultStudioReferenceResolver(provider, (principal, csi, environment, id) -> true);
      assertThatThrownBy(
              () ->
                  resolver.resolve(
                      "CSI",
                      "fixture",
                      UUID.randomUUID(),
                      "user",
                      new com.citi.put.checks.studio.dispatch.ReferenceDeclarations(
                          java.util.List.of(), java.util.List.of("PASS"))))
          .isInstanceOf(VaultProviderUnavailableException.class)
          .hasMessage("Vault returned an oversized response");
      assertThat(calls.get()).isEqualTo(1);
      assertThat(matched.get()).isTrue();
      assertThat(owned.get()).hasSize(257).containsOnly((byte) 0);
      verify(factory, never()).createParser(any(byte[].class));
    } finally {
      server.stop(0);
      java.util.Arrays.fill(prefix, (byte) 0);
      java.util.Arrays.fill(response, (byte) 0);
    }
  }

  @Test
  void namesOnlyAuthorizationAndExistenceDoNotReadSecretAndLongStoredEntriesNeverTruncate() {
    UUID test = UUID.randomUUID();
    VaultScope scope = VaultScope.of("CSI", "fixture", test);
    var vault = new FakeStudioVaultProvider(java.util.Map.of());
    vault.rotate(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS", "x".repeat(5000));
    var allowed = new java.util.concurrent.atomic.AtomicBoolean(false);
    var resolver =
        new VaultStudioReferenceResolver(vault, (principal, csi, env, id) -> allowed.get());
    var declared =
        new com.citi.put.checks.studio.dispatch.ReferenceDeclarations(
            java.util.List.of(), java.util.List.of("PASS"));
    assertThatThrownBy(() -> resolver.preflight("CSI", "fixture", test, "user", declared))
        .isInstanceOf(
            com.citi.put.checks.studio.dispatch.StudioReferenceResolver
                .SecretUseNotAuthorizedException.class);
    assertThat(vault.readCount()).isZero();
    assertThat(vault.listCount()).isZero();
    allowed.set(true);
    resolver.preflight("CSI", "fixture", test, "user", declared);
    assertThat(vault.readCount()).isZero();
    assertThatThrownBy(() -> resolver.resolve("CSI", "fixture", test, "user", declared))
        .isInstanceOf(VaultStudioReferenceResolver.SecretTooLongException.class);
    assertThat(vault.readCount()).isEqualTo(1);
    assertThatThrownBy(() -> resolver.preflight("OTHER-CSI", "fixture", test, "user", declared))
        .isInstanceOf(
            com.citi.put.checks.studio.dispatch.StudioReferenceResolver.UnknownReferenceException
                .class);
    assertThat(vault.readCount()).isEqualTo(1);
  }
}
