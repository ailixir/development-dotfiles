package com.citi.put.checks.studio.secrets;

import com.fasterxml.jackson.core.JsonEncoding;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Minimal HashiCorp Vault KV v2 adapter: a bounded read, a create-only write and a metadata list.
 *
 * <p>Every call is test-scoped: the path template renders {@code {csiId}}, {@code {environment}},
 * {@code {testId}}, {@code {kind}} and {@code {referenceName}} from a {@link VaultScope}, and the
 * list prefix is that same template minus its last segment ({@link
 * StudioVaultConfiguration#listPrefixTemplate}), so save, list and read cannot address different
 * places.
 *
 * <p>Every call shares one bounded transport: the connect and request timeouts, the response-size
 * cap, no redirects, and the token read from the mounted file on each call.
 *
 * <p><b>The write body, and its residual.</b> The value is written as {@code char[]} straight into
 * a buffer this class owns, sent from that buffer without a copy, and the buffer is zero-filled on
 * every exit path. What is not claimed: Jackson's recycled generator buffers and the HTTP client's
 * transient buffers can still hold bytes of the body until they are reused. The same stance as
 * {@code StudioReferenceResolver.Resolved} (AC-15).
 *
 * <p>Nothing here logs a value, a response body, or a URI that could carry one. A name may be
 * logged.
 */
public final class HashicorpStudioVaultProvider implements StudioVaultProvider {

  public static final String NAME = "hashicorp";

  private static final Logger LOGGER = LoggerFactory.getLogger(HashicorpStudioVaultProvider.class);

  private final StudioSecretsProperties.Vault.Hashicorp properties;
  private final ObjectMapper objectMapper;
  private final HttpClient client;

  /**
   * Handed each write buffer's backing array when the buffer is created, so a test can prove the
   * array is zero after {@link #create} returns or throws. {@code null} outside tests.
   */
  private Consumer<byte[]> writeBufferObserver;

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
  public Optional<VaultEntry> read(ReferenceKind kind, VaultScope scope, String referenceName) {
    long deadline = System.nanoTime() + properties.requestTimeoutOrDefault().toNanos();
    try {
      HttpResponse<InputStream> response =
          client.send(
              request(dataUri(kind, scope, referenceName)).GET().build(),
              HttpResponse.BodyHandlers.ofInputStream());
      try (InputStream body = response.body()) {
        if (response.statusCode() == 404) {
          return Optional.empty();
        }
        if (!isSuccess(response.statusCode())) {
          throw new VaultProviderUnavailableException(
              "Vault refused the reference read with status " + response.statusCode());
        }
        VaultEntry entry = parse(readBody(body, deadline));
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

  /**
   * Create-only write: {@code POST {mount}/data/{path}} with {@code options.cas = 0}, so Vault
   * refuses to overwrite an existing entry.
   *
   * <p>A refused write ({@code 400}, or {@code 403} under a policy that grants {@code create} but
   * not {@code update}) is told apart from an outage by reading the entry's metadata: metadata
   * present means the name is taken ({@link SecretAlreadyExistsException}); anything else is {@link
   * VaultProviderUnavailableException}. That the platform Vault answers a duplicate under a
   * create-only policy with {@code 403} is an inference from HashiCorp's documentation, not a
   * verified behaviour.
   *
   * <p>{@code value} belongs to the caller, who erases it. The serialized body is erased here.
   */
  @Override
  public String create(VaultScope scope, String name, char[] value, List<String> origins) {
    long deadline = System.nanoTime() + properties.requestTimeoutOrDefault().toNanos();
    ErasableBuffer buffer = new ErasableBuffer(initialCapacity(value, origins));
    if (writeBufferObserver != null) {
      writeBufferObserver.accept(buffer.backingArray());
    }
    try {
      writeCreateBody(buffer, value, origins);
      HttpResponse<InputStream> response =
          client.send(
              request(dataUri(ReferenceKind.SECRET, scope, name))
                  .header("Content-Type", "application/json")
                  .POST(buffer.publisher())
                  .build(),
              HttpResponse.BodyHandlers.ofInputStream());
      try (InputStream body = response.body()) {
        int status = response.statusCode();
        if (isSuccess(status)) {
          return writtenVersion(readBody(body, deadline));
        }
        if (status == 400 || status == 403) {
          if (metadataExists(scope, name, deadline)) {
            throw new SecretAlreadyExistsException(name);
          }
        }
        throw new VaultProviderUnavailableException(
            "Vault refused the secret write with status " + status);
      }
    } catch (VaultProviderUnavailableException | SecretAlreadyExistsException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new VaultProviderUnavailableException("Vault secret write was interrupted", e);
    } catch (IOException | RuntimeException e) {
      throw new VaultProviderUnavailableException("Vault secret write failed", e);
    } finally {
      buffer.erase();
    }
  }

  /**
   * {@code LIST {mount}/metadata/{prefix}} (sent as {@code GET ?list=true}, the documented
   * equivalent). A {@code 404} is an empty folder. Sub-folders and keys that fail {@link
   * StudioVaultProvider#isValidSecretName} are skipped: no step could reference them.
   */
  @Override
  public List<String> listSecretNames(VaultScope scope) {
    long deadline = System.nanoTime() + properties.requestTimeoutOrDefault().toNanos();
    try {
      HttpResponse<InputStream> response =
          client.send(
              request(listUri(scope)).GET().build(), HttpResponse.BodyHandlers.ofInputStream());
      try (InputStream body = response.body()) {
        if (response.statusCode() == 404) {
          return List.of();
        }
        if (!isSuccess(response.statusCode())) {
          throw new VaultProviderUnavailableException(
              "Vault refused the secret list with status " + response.statusCode());
        }
        JsonNode keys = objectMapper.readTree(readBody(body, deadline)).path("data").path("keys");
        if (!keys.isArray()) {
          throw new VaultProviderUnavailableException("Vault returned a malformed KV v2 list");
        }
        List<String> names = new ArrayList<>();
        for (JsonNode key : keys) {
          String candidate = key.isTextual() ? key.textValue() : null;
          if (candidate != null
              && !candidate.endsWith("/")
              && StudioVaultProvider.isValidSecretName(candidate)) {
            names.add(candidate);
          }
        }
        names.sort(null);
        return List.copyOf(names);
      }
    } catch (VaultProviderUnavailableException e) {
      throw e;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new VaultProviderUnavailableException("Vault secret list was interrupted", e);
    } catch (IOException | RuntimeException e) {
      throw new VaultProviderUnavailableException("Vault secret list failed", e);
    }
  }

  /** Whether the entry's metadata exists: the one question a refused create-only write asks. */
  private boolean metadataExists(VaultScope scope, String name, long deadline)
      throws IOException, InterruptedException {
    HttpResponse<InputStream> response =
        client.send(
            request(metadataUri(scope, name)).GET().build(),
            HttpResponse.BodyHandlers.ofInputStream());
    try (InputStream body = response.body()) {
      if (response.statusCode() != 200) {
        return false;
      }
      readBody(body, deadline);
      return true;
    }
  }

  private void writeCreateBody(ErasableBuffer buffer, char[] value, List<String> origins)
      throws IOException {
    try (JsonGenerator generator =
        objectMapper.getFactory().createGenerator(buffer, JsonEncoding.UTF8)) {
      generator.writeStartObject();
      generator.writeObjectFieldStart("options");
      generator.writeNumberField("cas", 0);
      generator.writeEndObject();
      generator.writeObjectFieldStart("data");
      generator.writeFieldName(properties.valueKeyOrDefault());
      generator.writeString(value, 0, value.length);
      generator.writeStringField(SecretOrigins.VAULT_KEY, String.join(",", origins));
      generator.writeEndObject();
      generator.writeEndObject();
    }
  }

  /**
   * Sized so the buffer never grows: a JSON-escaped character is at most six bytes, and every
   * origin, the value key and the envelope are counted.
   */
  private int initialCapacity(char[] value, List<String> origins) {
    long capacity = 256L + 6L * value.length + 6L * properties.valueKeyOrDefault().length();
    for (String origin : origins) {
      capacity += 6L * (origin.length() + 1);
    }
    return (int) Math.min(capacity, Integer.MAX_VALUE - 8);
  }

  private String writtenVersion(byte[] body) throws IOException {
    JsonNode version = objectMapper.readTree(body).path("data").path("version");
    if (!version.canConvertToInt() || version.asInt() <= 0) {
      throw new VaultProviderUnavailableException(
          "Vault returned a malformed KV v2 write response");
    }
    return Integer.toString(version.asInt());
  }

  private byte[] readBody(InputStream body, long deadline)
      throws IOException, InterruptedException {
    byte[] bytes = readBounded(body, properties.maxResponseBytesOrDefault() + 1, deadline);
    if (bytes.length > properties.maxResponseBytesOrDefault()) {
      throw new VaultProviderUnavailableException("Vault returned an oversized response");
    }
    return bytes;
  }

  private HttpRequest.Builder request(URI uri) throws IOException {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(uri)
            .timeout(properties.requestTimeoutOrDefault())
            .header("Accept", "application/json")
            .header("X-Vault-Request", "true")
            .header("X-Vault-Token", readToken());
    if (properties.namespace() != null && !properties.namespace().isBlank()) {
      request.header("X-Vault-Namespace", properties.namespace().trim());
    }
    return request;
  }

  private static boolean isSuccess(int status) {
    return status >= 200 && status < 300;
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

  private URI dataUri(ReferenceKind kind, VaultScope scope, String referenceName) {
    return vaultUri("data", render(properties.pathTemplateOrDefault(), kind, scope, referenceName));
  }

  private URI metadataUri(VaultScope scope, String name) {
    return vaultUri(
        "metadata", render(properties.pathTemplateOrDefault(), ReferenceKind.SECRET, scope, name));
  }

  private URI listUri(VaultScope scope) {
    String prefix = StudioVaultConfiguration.listPrefixTemplate(properties.pathTemplateOrDefault());
    return URI.create(
        vaultUri("metadata", render(prefix, ReferenceKind.SECRET, scope, null)) + "?list=true");
  }

  private static String render(
      String template, ReferenceKind kind, VaultScope scope, String referenceName) {
    String path =
        template
            .replace("{csiId}", segment(scope.csiId()))
            .replace("{environment}", segment(scope.environment()))
            .replace("{testId}", segment(scope.testId()))
            .replace("{kind}", kind == ReferenceKind.SECRET ? "secrets" : "variables");
    return referenceName == null ? path : path.replace("{referenceName}", segment(referenceName));
  }

  private URI vaultUri(String api, String path) {
    String base = properties.address().replaceAll("/+$", "");
    return URI.create(
        base + "/v1/" + segment(properties.mountOrDefault()) + "/" + api + "/" + path);
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

  /** Test hook: see {@link #writeBufferObserver}. */
  void observeWriteBuffers(Consumer<byte[]> observer) {
    this.writeBufferObserver = observer;
  }

  /**
   * A body buffer that can be erased. It exposes its backing array to the request publisher rather
   * than copying it out, and when it must grow it zero-fills the array it leaves behind, so at no
   * point does an unerased copy of the body exist that this class cannot reach.
   */
  private static final class ErasableBuffer extends ByteArrayOutputStream {

    private ErasableBuffer(int capacity) {
      super(capacity);
    }

    @Override
    public synchronized void write(int b) {
      ensureErasingCapacity(1);
      super.write(b);
    }

    @Override
    public synchronized void write(byte[] bytes, int offset, int length) {
      ensureErasingCapacity(length);
      super.write(bytes, offset, length);
    }

    private void ensureErasingCapacity(int extra) {
      if (count + extra <= buf.length) {
        return;
      }
      byte[] grown = Arrays.copyOf(buf, Math.max(buf.length * 2, count + extra));
      Arrays.fill(buf, (byte) 0);
      buf = grown;
    }

    private synchronized byte[] backingArray() {
      return buf;
    }

    private synchronized HttpRequest.BodyPublisher publisher() {
      return HttpRequest.BodyPublishers.ofByteArray(buf, 0, count);
    }

    private synchronized void erase() {
      Arrays.fill(buf, (byte) 0);
      count = 0;
    }
  }
}
