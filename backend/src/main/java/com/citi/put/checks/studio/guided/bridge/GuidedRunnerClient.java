package com.citi.put.checks.studio.guided.bridge;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.function.Supplier;
import javax.net.ssl.SSLContext;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Single-attempt HTTPS transport. TLS key/trust material and JWT come from deployment identity. */
public final class GuidedRunnerClient {
  private final URI origin;
  private final HttpClient client;
  private final Supplier<String> token;
  private final GuidedContracts contracts;

  public GuidedRunnerClient(
      URI origin, SSLContext tls, Supplier<String> token, GuidedContracts contracts) {
    require(
        origin.getScheme().equals("https")
            && origin.getHost() != null
            && origin.getRawUserInfo() == null
            && (origin.getPath().isEmpty() || origin.getPath().equals("/"))
            && origin.getQuery() == null
            && origin.getFragment() == null,
        "RUNTIME_INCOMPATIBLE",
        409);
    require(
        !Boolean.parseBoolean(System.getProperty("jdk.httpclient.enableAllMethodRetry", "false")),
        "RUNTIME_INCOMPATIBLE",
        409);
    this.origin = origin;
    this.token = token;
    this.contracts = contracts;
    this.client =
        HttpClient.newBuilder()
            .sslContext(tls)
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .version(HttpClient.Version.HTTP_1_1)
            .build();
  }

  public JsonNode send(String operation, JsonNode body) {
    return send(operation, body, UUID.randomUUID().toString());
  }

  public JsonNode send(String operation, JsonNode body, String key) {
    require(key != null && !key.isBlank() && key.length() <= 256, "INVALID_CONTRACT", 422);
    require(
        !TransactionSynchronizationManager.isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    require(
        java.util.Set.of("assign", "context", "prepare", "dispatch", "stop", "observe")
            .contains(operation),
        "INVALID_CONTRACT",
        422);
    boolean assignment =
        operation.equals("assign") || body.path("kind").asText().equals("assignment");
    JsonNode intent = operation.equals("assign") ? body : body.path("assignment");
    String id = assignment ? intent.path("sessionId").asText() : body.path("sessionId").asText();
    require(id.matches("[A-Za-z0-9_-]{1,256}"), "INVALID_CONTRACT", 422);
    String credential = token.get();
    require(credential != null && !credential.isBlank(), "UNAUTHENTICATED", 401);
    var builder =
        HttpRequest.newBuilder(
                origin.resolve("/internal/v2/studio/guided-sessions/" + id + "/" + operation))
            .timeout(Duration.ofSeconds(15))
            .header("Authorization", "Bearer " + credential)
            .header("Content-Type", "application/json")
            .header("Idempotency-Key", key);
    if (!assignment) {
      builder.header("X-Owner-Fence", body.path("ownerFence").asText());
    }
    var request =
        builder
            .POST(
                HttpRequest.BodyPublishers.ofString(
                    GuidedContracts.canonical(body), StandardCharsets.UTF_8))
            .build();
    try {
      var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
      try (var stream = response.body()) {
        byte[] bytes = stream.readNBytes(1048577);
        require(response.statusCode() == 200 && bytes.length <= 1048576, "UNKNOWN_OUTCOME", 409);
        JsonNode result = contracts.parseWire(bytes);
        if (assignment) {
          contracts.validate("v2/assignment-receipt", result);
          require(result.path("assignment").equals(intent), "STALE_FENCE", 409);
          if (!result.path("ownerFence").isNull()) {
            require(
                result.path("ownerFence").asLong() == intent.path("expectedFence").asLong() + 1
                    && !java.time.Instant.parse(result.path("leaseExpiresAt").asText())
                        .isAfter(java.time.Instant.parse(intent.path("expiresAt").asText())),
                "STALE_FENCE",
                409);
          }
          require(
              result
                  .path("status")
                  .asText()
                  .equals(operation.equals("assign") ? "OWNED" : "STOPPED"),
              "RUNTIME_INCOMPATIBLE",
              409);
          return result;
        }
        String schema =
            operation.equals("prepare")
                ? "preparation"
                : operation.equals("dispatch")
                    ? "outcome"
                    : operation.equals("observe") ? "observation" : "identity";
        contracts.validate("v2/bridge#/definitions/" + schema, result);
        for (String field :
            java.util.List.of(
                "sessionId",
                "workerId",
                "ownerFence",
                "scopeHash",
                "contextId",
                "contextRevision",
                "sourceRevision",
                "configurationRevision",
                "versions")) {
          require(result.path(field).equals(body.path(field)), "STALE_FENCE", 409);
        }
        return result;
      }
    } catch (InterruptedException failure) {
      Thread.currentThread().interrupt();
      throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
    } catch (java.io.IOException failure) {
      throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
    }
  }
}
