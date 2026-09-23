package com.citi.put.checks.studio.secrets;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Minimal, read-only HashiCorp Vault KV v2 adapter. */
public final class HashicorpStudioVaultProvider implements StudioVaultProvider {

  public static final String NAME = "hashicorp";

  private static final Logger LOGGER = LoggerFactory.getLogger(HashicorpStudioVaultProvider.class);

  private final StudioSecretsProperties.Vault.Hashicorp properties;
  private final ObjectMapper objectMapper;
  private final HttpClient client;

  public HashicorpStudioVaultProvider(
      StudioSecretsProperties.Vault.Hashicorp properties, ObjectMapper objectMapper) {
    this.properties = properties;
    this.objectMapper = objectMapper;
    this.client =
        HttpClient.newBuilder()
            .connectTimeout(properties.connectTimeoutOrDefault())
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
  }

  @Override
  public String name() {
    return NAME;
  }

  @Override
  public Optional<VaultEntry> read(
      ReferenceKind kind, String csiId, String environment, String referenceName) {
    long deadline = System.nanoTime() + properties.requestTimeoutOrDefault().toNanos();
    try {
      HttpRequest.Builder request =
          HttpRequest.newBuilder(uri(kind, csiId, environment, referenceName))
              .timeout(properties.requestTimeoutOrDefault())
              .header("Accept", "application/json")
              .header("X-Vault-Request", "true")
              .header("X-Vault-Token", readToken())
              .GET();
      if (properties.namespace() != null && !properties.namespace().isBlank()) {
        request.header("X-Vault-Namespace", properties.namespace().trim());
      }
      HttpResponse<InputStream> response =
          client.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());
      try (InputStream body = response.body()) {
        if (response.statusCode() == 404) {
          return Optional.empty();
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
          throw new VaultProviderUnavailableException(
              "Vault refused the reference read with status " + response.statusCode());
        }
        byte[] bytes = readBounded(body, properties.maxResponseBytesOrDefault() + 1, deadline);
        if (bytes.length > properties.maxResponseBytesOrDefault()) {
          throw new VaultProviderUnavailableException("Vault returned an oversized response");
        }
        VaultEntry entry = parse(bytes);
        if (kind == ReferenceKind.SECRET && entry.allowedOrigins().isEmpty()) {
          // Names the reference only. Origins are not secret, but the list is not echoed either:
          // the entry's owner can read it, and a log line is not where it should be corrected.
          LOGGER.warn(
              "Vault entry for secret '{}' declares no valid {}; it cannot be filled on any origin",
              referenceName,
              SecretOrigins.VAULT_KEY);
        }
        return Optional.of(entry);
      }
    } catch (VaultProviderUnavailableException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new VaultProviderUnavailableException("Vault reference read was interrupted", e);
    } catch (IOException | RuntimeException e) {
      throw new VaultProviderUnavailableException("Vault reference read failed", e);
    }
  }

  private static byte[] readBounded(InputStream body, int limit, long deadline)
      throws IOException, InterruptedException {
    FutureTask<byte[]> read =
        new FutureTask<>(
            () -> {
              try {
                return body.readNBytes(limit);
              } catch (IOException e) {
                throw new VaultBodyReadException(e);
              }
            });
    Thread reader = Thread.ofVirtual().name("studio-vault-body-reader").start(read);
    long remaining = deadline - System.nanoTime();
    if (remaining <= 0) {
      read.cancel(true);
      body.close();
      throw new VaultProviderUnavailableException("Vault response exceeded the request deadline");
    }
    try {
      return read.get(remaining, TimeUnit.NANOSECONDS);
    } catch (TimeoutException e) {
      read.cancel(true);
      body.close();
      throw new VaultProviderUnavailableException(
          "Vault response exceeded the request deadline", e);
    } catch (ExecutionException e) {
      if (e.getCause() instanceof VaultBodyReadException bodyRead) {
        throw bodyRead.ioCause();
      }
      throw new VaultProviderUnavailableException("Vault response could not be read", e);
    } finally {
      if (!read.isDone()) {
        reader.interrupt();
      }
    }
  }

  private static final class VaultBodyReadException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private VaultBodyReadException(IOException cause) {
      super(cause);
    }

    private IOException ioCause() {
      return (IOException) getCause();
    }
  }

  private VaultEntry parse(byte[] body) throws IOException {
    JsonNode root = objectMapper.readTree(body);
    JsonNode value = root.path("data").path("data").path(properties.valueKeyOrDefault());
    JsonNode version = root.path("data").path("metadata").path("version");
    if (!value.isValueNode()
        || value.isNull()
        || !version.canConvertToInt()
        || version.asInt() <= 0) {
      throw new VaultProviderUnavailableException("Vault returned a malformed KV v2 response");
    }
    return new VaultEntry(
        value.asText().toCharArray(),
        Integer.toString(version.asInt()),
        allowedOrigins(root.path("data").path("data").path(SecretOrigins.VAULT_KEY)));
  }

  /**
   * The entry's {@value SecretOrigins#VAULT_KEY}, normalized. Absent, non-text or malformed all
   * mean no origin: the secret then cannot be filled, which is the fail-closed reading. Nothing
   * about a malformed list is thrown or logged here, because nothing here knows which reference it
   * was; {@link #read} says so by name.
   */
  private static List<String> allowedOrigins(JsonNode node) {
    return node.isTextual() ? SecretOrigins.parse(node.textValue()) : List.of();
  }

  private URI uri(ReferenceKind kind, String csiId, String environment, String referenceName) {
    String path =
        properties
            .pathTemplateOrDefault()
            .replace("{csiId}", segment(csiId))
            .replace("{environment}", segment(environment))
            .replace("{kind}", kind == ReferenceKind.SECRET ? "secrets" : "variables")
            .replace("{referenceName}", segment(referenceName));
    String base = properties.address().replaceAll("/+$", "");
    return URI.create(base + "/v1/" + segment(properties.mountOrDefault()) + "/data/" + path);
  }

  private String readToken() throws IOException {
    String token = Files.readString(Path.of(properties.tokenFile())).trim();
    if (token.isEmpty()) {
      throw new IOException("empty Vault token file");
    }
    return token;
  }

  private static String segment(String value) {
    if (value == null || value.isBlank()) {
      throw new VaultProviderUnavailableException("Vault reference coordinates are incomplete");
    }
    if (value.contains("/") || value.contains("\\") || ".".equals(value) || "..".equals(value)) {
      throw new VaultProviderUnavailableException("Vault reference coordinates are not path-safe");
    }
    return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
  }
}
