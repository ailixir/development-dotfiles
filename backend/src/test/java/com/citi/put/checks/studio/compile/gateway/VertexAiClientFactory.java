package com.citi.put.checks.studio.compile.gateway;

import com.google.api.gax.core.CredentialsProvider;
import com.google.api.gax.core.FixedCredentialsProvider;
import com.google.api.gax.core.NoCredentialsProvider;
import com.google.api.gax.retrying.RetrySettings;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.cloud.vertexai.Transport;
import com.google.cloud.vertexai.VertexAI;
import com.google.cloud.vertexai.api.LlmUtilityServiceClient;
import com.google.cloud.vertexai.api.LlmUtilityServiceSettings;
import com.google.cloud.vertexai.api.PredictionServiceClient;
import com.google.cloud.vertexai.api.PredictionServiceSettings;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.Locale;

/**
 * Builds the Vertex AI SDK handle used against the R2D2 proxy (Story 10.5, AC-2, AC-4).
 *
 * <p>The SDK's own {@code setApiEndpoint} appends {@code :443} and cannot express a custom scheme
 * or port, and it gives no hook to switch retries off. Both are requirements here, so the transport
 * clients are constructed explicitly and injected through {@code setPredictionClientSupplier} /
 * {@code setLlmClientSupplier}. This stays inside the SDK contract — the request/response shapes,
 * structured output and deadline handling remain the SDK's — while satisfying &sect;4.1's "point
 * the SDK at R2D2" and AC-4's "SDK-level automatic retries are disabled".
 */
public final class VertexAiClientFactory {

  private VertexAiClientFactory() {}

  /**
   * @param properties validated gateway configuration
   * @return an SDK handle whose {@code close()} releases both transport clients
   * @throws IOException when the transport clients or credentials cannot be created
   */
  public static VertexAI create(StudioGatewayProperties properties) throws IOException {
    return create(properties, credentialsProvider(properties));
  }

  /**
   * @param properties validated gateway configuration
   * @param credentialsProvider credentials for the Studio compile workload
   * @return an SDK handle whose {@code close()} releases both transport clients
   * @throws IOException when the transport clients cannot be created
   */
  public static VertexAI create(
      StudioGatewayProperties properties, CredentialsProvider credentialsProvider)
      throws IOException {
    PredictionServiceSettings.Builder predictionSettings =
        PredictionServiceSettings.newHttpJsonBuilder()
            .setEndpoint(properties.endpoint())
            .setCredentialsProvider(credentialsProvider);
    disableSdkRetries(predictionSettings, properties);

    PredictionServiceClient predictionClient =
        PredictionServiceClient.create(predictionSettings.build());
    LlmUtilityServiceClient llmUtilityClient =
        LlmUtilityServiceClient.create(
            LlmUtilityServiceSettings.newHttpJsonBuilder()
                .setEndpoint(properties.endpoint())
                .setCredentialsProvider(credentialsProvider)
                .build());

    return new VertexAI.Builder()
        .setProjectId(properties.project())
        .setLocation(properties.location())
        .setTransport(Transport.REST)
        .setPredictionClientSupplier(() -> predictionClient)
        .setLlmClientSupplier(() -> llmUtilityClient)
        .build();
  }

  /**
   * Removes every retryable status and caps gax at a single attempt, then sets the request deadline
   * as the logical timeout so a slow gateway fails once rather than being replayed (AC-4).
   */
  private static void disableSdkRetries(
      PredictionServiceSettings.Builder settings, StudioGatewayProperties properties) {
    org.threeten.bp.Duration timeout =
        org.threeten.bp.Duration.ofMillis(properties.requestTimeout().toMillis());
    settings
        .generateContentSettings()
        .setRetryableCodes(Collections.emptySet())
        .setRetrySettings(
            RetrySettings.newBuilder()
                .setMaxAttempts(1)
                .setLogicalTimeout(timeout)
                .setTotalTimeout(timeout)
                .build());
  }

  private static CredentialsProvider credentialsProvider(StudioGatewayProperties properties)
      throws IOException {
    String mode =
        properties.credentials() == null
            ? StudioGatewayProperties.MODE_APPLICATION_DEFAULT
            : properties.credentials().mode().toLowerCase(Locale.ROOT);
    return switch (mode) {
      case StudioGatewayProperties.MODE_NONE -> NoCredentialsProvider.create();
      case StudioGatewayProperties.MODE_SERVICE_ACCOUNT_FILE ->
          FixedCredentialsProvider.create(
              serviceAccountCredentials(properties.credentials().serviceAccountKeyFile()));
      default -> FixedCredentialsProvider.create(GoogleCredentials.getApplicationDefault());
    };
  }

  private static GoogleCredentials serviceAccountCredentials(String keyFile) throws IOException {
    Path path = Path.of(keyFile);
    if (!Files.isReadable(path)) {
      throw new IllegalStateException(
          "studio.compile.gateway.credentials.service-account-key-file is not readable: " + path);
    }
    try (InputStream in = Files.newInputStream(path)) {
      return ServiceAccountCredentials.fromStream(in);
    }
  }
}
